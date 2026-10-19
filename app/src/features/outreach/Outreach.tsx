import { useEffect, useRef, useState } from 'react';
import {
  ClockIcon, CodeBracketIcon, DocumentDuplicateIcon,
  EnvelopeIcon, EyeIcon, PaperAirplaneIcon, PaperClipIcon, SparklesIcon,
} from '@heroicons/react/24/outline';
import { useStore, todayStr } from '../../store';
import { FormNote, Ring } from '../../components/ui';
import { isValidEmail } from '../../lib/validate';
import { sendsToday } from '../../lib/caps';
import type { DraftMail } from '../../types';
import { appendSignature, loadDraft, saveDraft } from '../../lib/outreachDraft';

const TEMPLATES: { name: string; body: (p: { name: string; skills: string }) => string }[] = [
  {
    name: 'Cold intro',
    body: p => `Hi,\n\nYour posting stood out and ${p.skills.trim() ? `my background (${p.skills})` : 'my background'} looks like a strong fit. Resume available on request.\n\nOpen to a 15-minute intro call?\n\nThanks,\n${p.name}`,
  },
  {
    name: 'Follow-up',
    body: p => `Hi,\n\nCircling back on my note below — still excited about this role and happy to share availability for a quick intro.\n\nThanks,\n${p.name}`,
  },
];
const SUBJECT_SPINS = ['Quick intro', '15-min intro?', 'Strong fit for'];
const QUICK_PROMPTS = ['Remote senior roles', 'Fintech roles', 'AI / ML roles'];
const LOCAL_SENT = 'Message recorded locally — not emailed.';

interface ChatMsg { id: string; from: 'ai' | 'user'; text: string }
let chatSeq = 0;
const nextChatId = () => `chat-${++chatSeq}`;

const STOP = new Set(['the', 'a', 'an', 'and', 'for', 'with', 'role', 'roles', 'job', 'jobs', 'want', 'looking', 'like', 'need', 'send', 'email', 'remote', 'hybrid', 'onsite', 'senior', 'junior', 'lead']);
function scoreJob(input: string, title: string, company: string, location: string): number {
  const words = input.toLowerCase().split(/[^a-z0-9+#/]+/).filter(w => w && !STOP.has(w));
  const hay = `${title} ${company} ${location}`.toLowerCase();
  let s = 0;
  for (const w of words) {
    if (title.toLowerCase().includes(w)) s += 3;
    else if (company.toLowerCase().includes(w)) s += 2;
    else if (hay.includes(w)) s += 1;
  }
  if (/remote/.test(input.toLowerCase()) && /remote/i.test(location)) s += 2;
  return s;
}

export function Outreach() {
  const { jobs, sent, send, profile, usage, backend } = useStore();
  const [initialDraft] = useState<DraftMail | null>(loadDraft);
  const [jobId, setJobId] = useState<string>(initialDraft?.jobId ?? jobs[0]?.id ?? '');
  const job = jobs.find(j => j.id === jobId);
  const targetTitle = job?.title ?? initialDraft?.jobTitle ?? '';
  const targetCompany = job?.company ?? initialDraft?.company ?? '';
  const [to, setTo] = useState(initialDraft?.to ?? '');
  const [subject, setSubject] = useState(initialDraft?.subject ?? `Quick intro — ${profile.roles[0] ?? 'Software Engineer'}`);
  const [body, setBody] = useState(initialDraft?.body ?? TEMPLATES[0].body(profile));
  const [spin, setSpin] = useState(0);
  const [view, setView] = useState<'email' | 'raw'>('email');
  const [showTemplates, setShowTemplates] = useState(false);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [undoBody, setUndoBody] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chat, setChat] = useState<ChatMsg[]>(() => {
    const first = profile.name.trim().split(/\s+/)[0] ?? '';
    return [{ id: nextChatId(), from: 'ai', text: `Hi${first ? ` ${first}` : ''} — tell me what kind of role you want. I'll match it against your current feed and prep a draft you can edit.` }];
  });
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);

  // Autosave the draft while typing — closing the tab no longer loses it.
  // 600ms debounce keeps localStorage writes off the keystroke path.
  useEffect(() => {
    const t = window.setTimeout(() => {
      saveDraft({
        jobId: job?.id ?? (jobId || undefined),
        jobTitle: job?.title ?? initialDraft?.jobTitle,
        company: job?.company ?? initialDraft?.company,
        to, subject, body,
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [job?.id, job?.title, job?.company, initialDraft, jobId, to, subject, body]);

  const { used, cap } = sendsToday(backend, usage, sent, todayStr());
  const toBad = to.length > 0 && !isValidEmail(to);
  const subjectBad = subject.trim() === '';
  const bodyBad = body.trim() === '';
  const capReached = used >= cap;
  const ready = isValidEmail(to) && !subjectBad && !bodyBad && !sending && !capReached;
  const sendLabel = backend ? 'Send email' : 'Record draft locally';

  const previewItem = previewId ? sent.find(s => s.id === previewId) ?? null : null;
  const toLine = (previewItem?.to || to).trim() || (previewItem ? 'No recipient recorded' : 'No recipient set yet');
  const subjectLine = previewItem?.subject ?? subject;
  const bodyLine = previewItem?.body ?? appendSignature(body, profile.signature);
  const err = msg !== '' && msg !== LOCAL_SENT && msg !== 'Message queued for sending.';

  const applyJob = (id: string, why: string) => {
    const j = jobs.find(x => x.id === id);
    if (!j) return;
    setJobId(id);
    setSubject(`Quick intro — ${j.title}`);
    const background = profile.skills.trim() ? `my background (${profile.skills})` : 'my background';
    setBody(`Hi,\n\nYour ${j.title} posting at ${j.company} stood out and ${background} looks like a strong fit.\n\nOpen to a 15-minute intro call?\n\nThanks,\n${profile.name}`.slice(0, 3000));
    setPreviewId(null);
    setUndoBody(null);
    setChat(prev => [...prev, { id: nextChatId(), from: 'ai', text: why }]);
  };

  const askAi = (raw: string) => {
    const input = raw.trim();
    if (!input) return;
    setChat(prev => [...prev, { id: nextChatId(), from: 'user', text: input }]);
    setChatInput('');
    const ranked = jobs
      .map(j => ({ j, s: scoreJob(input, j.title, j.company, j.location) }))
      .sort((a, b) => b.s - a.s);
    if (ranked[0] && ranked[0].s > 0) {
      const top = ranked[0].j;
      applyJob(top.id, `Found ${top.title} at ${top.company} (${top.location}, ${top.compensation}). I've drafted your email — edit it on the right, then send when ready.`);
    } else {
      const picks = ranked.slice(0, 3).map(r => `${r.j.title} — ${r.j.company}`).join(' · ');
      setChat(prev => [...prev, { id: nextChatId(), from: 'ai', text: `No close match for that. Closest open roles: ${picks}. Try naming a stack, company, or location.` }]);
    }
  };

  const insertAtCursor = (text: string) => {
    const el = bodyRef.current;
    if (!el) { setBody(b => b + text); return; }
    const s = el.selectionStart ?? body.length, e = el.selectionEnd ?? body.length;
    const next = body.slice(0, s) + text + body.slice(e);
    setBody(next.slice(0, 3000));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = Math.min(s + text.length, 3000); });
  };
  const rewriteSubject = () => {
    const role = job?.title ?? profile.roles[0] ?? 'Software Engineer';
    const next = SUBJECT_SPINS[(spin + 1) % SUBJECT_SPINS.length];
    setSpin(spin + 1);
    setSubject(`${next} — ${role}`);
    setNote('Rewrite applied — pick again to cycle variants.');
  };
  const rewriteBody = () => {
    let next = body.replace(/\n{3,}/g, '\n\n').trim();
    if (!next.includes(profile.name)) next += `\n\nThanks,\n${profile.name}`;
    if (next === body) { setNote('Nothing to tighten — the draft is already tidy.'); return; }
    setUndoBody(body);
    setBody(next.slice(0, 3000));
    setNote('Rewrite applied — tightened whitespace and sign-off.');
  };
  const undoRewrite = () => {
    if (undoBody === null) return;
    setBody(undoBody);
    setUndoBody(null);
    setNote('Restored your previous text.');
  };
  const doSend = () => {
    if (!ready) return;
    setSending(true);
    setMsg('');
    void send({
      ...(job ? { jobId: job.id } : {}),
      jobTitle: targetTitle,
      company: targetCompany,
      to, subject, body: appendSignature(body, profile.signature),
    }).then((m) => {
      setMsg(m);
      if (m === LOCAL_SENT || m === 'Message queued for sending.') { setPreviewId(null); setUndoBody(null); }
    }).finally(() => setSending(false));
  };

  return (
    <div className="cold-page">
      {/* compact banner */}
      <section className="card rise apps-banner cold-banner">
        <div className="card-pad hero-body row cold-banner-row">
          <div>
            <p className="sec-label" style={{ margin: '0 0 4px' }}>Draft · review · send</p>
            <h1 className="t-display">Cold outreach</h1>
            <p className="muted t-small" style={{ margin: '6px 0 0' }}>Tell the assistant what you want, review the draft, send.</p>
          </div>
          <div className="apps-today">
            <span className="metric-tile"><EnvelopeIcon width={17} /></span>
            <div><p className="num" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{used} / {cap}</p>
              <p className="muted t-caption" style={{ margin: 0 }}>emails today</p></div>
            <Ring used={used} total={cap} size={44} />
          </div>
        </div>
      </section>

      <div className="cold-grid">
        {/* assistant chat — replaces the old target-role section */}
        <section className="card rise" aria-label="Draft assistant">
          <div className="cold-pad">
            <div className="row" style={{ gap: 10 }}>
              <span className="side-ic"><SparklesIcon width={18} /></span>
              <div><h2 className="t-h3" style={{ margin: 0 }}>Draft assistant</h2>
                <p className="muted t-caption" style={{ margin: 0 }}>
                  {profile.resume ? `Resume on file: ${profile.resume}` : 'No resume on file yet — add one in onboarding.'}
                </p></div>
            </div>
            <div className="cold-chatlog" ref={logRef} role="log" aria-label="Assistant conversation" aria-live="polite">
              {chat.map(m => (
                <div key={m.id} className={'cold-bubble ' + (m.from === 'ai' ? 'cold-bubble-ai' : 'cold-bubble-user')}>
                  {m.text}
                </div>
              ))}
            </div>
            <div className="cold-quick" aria-label="Suggested prompts">
              {QUICK_PROMPTS.map(q => (
                <button key={q} className="ftab" onClick={() => askAi(q)}>{q}</button>
              ))}
            </div>
            <form className="row" style={{ gap: 8 }}
              onSubmit={e => { e.preventDefault(); askAi(chatInput); }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                placeholder="e.g. remote senior React roles in fintech…" aria-label="Ask the assistant for roles" />
              <button className="btn" type="submit" disabled={!chatInput.trim()} aria-label="Send message">
                <PaperAirplaneIcon width={16} />
              </button>
            </form>
          </div>
        </section>

        {/* email details */}
        <section className="card rise" aria-label="Email details">
          <div className="cold-pad">
            <div className="row" style={{ gap: 10 }}>
              <span className="side-ic"><EnvelopeIcon width={18} /></span>
              <div><h2 className="t-h3" style={{ margin: 0 }}>Email details</h2>
                <p className="muted t-caption" style={{ margin: 0 }}>
                  {targetTitle ? `Target: ${targetTitle}${targetCompany ? ` — ${targetCompany}` : ''} · chosen from your feed, editable below` : 'No role selected yet — pick one from your feed.'}
                </p></div>
            </div>
            <div className="cold-mailfields">
              <div className="grid-2" style={{ gap: 10 }}>
                <div><label className="lbl" htmlFor="oc-role">Role (from your feed — override anytime)</label>
                  <select id="oc-role" value={job?.id ?? ''} onChange={e => {
                    const j = jobs.find(x => x.id === e.target.value);
                    if (j) applyJob(j.id, `Switched target to ${j.title} at ${j.company}. Draft updated — review and send when ready.`);
                  }}>
                    {!job ? <option value="">{targetTitle ? `${targetTitle}${targetCompany ? ` — ${targetCompany}` : ''} (not in current feed)` : 'No role selected'}</option> : null}
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.title} — {j.company}</option>)}
                  </select></div>
                <div><label className="lbl" htmlFor="oc-to">Recipient email</label>
                  <span className="icon-field">
                    <span aria-hidden="true" className="icon-field-ic"><EnvelopeIcon width={16} /></span>
                    <input id="oc-to" value={to} onChange={e => { setTo(e.target.value); if (msg) setMsg(''); }} placeholder="recruiter@company.com"
                      aria-invalid={toBad || undefined} aria-describedby={toBad ? 'oc-to-hint' : undefined} />
                  </span>
                  {toBad ? <p className="field-hint" id="oc-to-hint">That email doesn&apos;t look right — check for typos.</p> : null}
                </div>
              </div>
              <div><label className="lbl" htmlFor="oc-subject">Subject</label>
                <span className="rewrite-wrap">
                  <input id="oc-subject" value={subject} onChange={e => setSubject(e.target.value)} style={{ paddingRight: 108 }}
                    aria-invalid={subjectBad || undefined} aria-describedby={subjectBad ? 'oc-subject-hint' : undefined} />
                  <button className="rewrite-btn" onClick={rewriteSubject}><SparklesIcon width={14} /> Rewrite</button>
                </span>
                {subjectBad ? <p className="field-hint" id="oc-subject-hint">Add a subject line before sending.</p> : null}</div>
              <div className="cold-bodywrap"><label className="lbl" htmlFor="oc-body">Email body</label>
                <span className="rewrite-wrap cold-bodybox">
                  <textarea id="oc-body" ref={bodyRef} rows={6} value={body} maxLength={3000}
                    onChange={e => setBody(e.target.value)} style={{ paddingTop: 40 }}
                    aria-invalid={bodyBad || undefined} aria-describedby={bodyBad ? 'oc-body-hint' : undefined} />
                  <button className="rewrite-btn" onClick={rewriteBody}><SparklesIcon width={14} /> Rewrite</button>
                  <span className="char-count mono muted" aria-live="polite">{body.length}/3000</span>
                </span>
                {bodyBad ? <p className="field-hint" id="oc-body-hint">Write a message before sending.</p> : null}</div>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="row t-small" style={{ gap: 8 }}>
                <PaperClipIcon width={15} className="muted" /> {profile.resume ? `Resume: ${profile.resume}` : 'No resume added yet'}
              </span>
              <span className="app-menu-wrap">
                <button className="btn btn-ghost btn-sm" aria-expanded={showTemplates}
                  onClick={() => setShowTemplates(v => !v)}>
                  <DocumentDuplicateIcon width={15} /> Insert template</button>
                {showTemplates ? (
                  <div className="app-menu" role="menu" style={{ left: 0, right: 'auto' }}>
                    {TEMPLATES.map(t => (
                      <button key={t.name} onClick={() => { insertAtCursor((body && !body.endsWith('\n') ? '\n\n' : '') + t.body(profile)); setShowTemplates(false); }}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button className="btn" disabled={!ready} aria-busy={sending} onClick={doSend}>
                <PaperAirplaneIcon width={16} /> {sending ? 'Sending…' : capReached ? `Daily cap reached (${cap}/day)` : sendLabel}</button>
              <span className="muted t-caption">Draft autosaves on this device · signature appended on send.</span>
            </div>
            {msg ? <FormNote kind={err ? 'err' : 'ok'}>{msg}</FormNote> : null}
            {note && !msg ? (
              <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <p className="muted t-caption" role="status" style={{ margin: 0 }}>{note}</p>
                {undoBody !== null ? <button className="btn btn-ghost btn-sm" onClick={undoRewrite}>Undo rewrite</button> : null}
              </span>
            ) : null}
          </div>
        </section>

        {/* preview — click any history email to inspect it here */}
        <section className="card rise" aria-label="Preview">
          <div className="cold-pad">
            <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
              <div className="row" style={{ gap: 10 }}>
                <span className="side-ic"><EyeIcon width={18} /></span>
                <div><h2 className="t-h3" style={{ margin: 0 }}>Preview</h2>
                  <p className="muted t-caption" style={{ margin: 0 }}>
                    {previewItem ? 'Viewing sent email.' : 'Live draft — updates as you type.'}</p></div>
              </div>
              <div className="seg" role="group" aria-label="Preview mode">
                <button data-on={view === 'email'} onClick={() => setView('email')}><EnvelopeIcon width={14} /> Email</button>
                <button data-on={view === 'raw'} onClick={() => setView('raw')}><CodeBracketIcon width={14} /> Raw</button>
              </div>
            </div>
            {previewItem ? (
              <button className="link" onClick={() => setPreviewId(null)}>← Back to live draft</button>
            ) : null}
            <div className="card-inner cold-previewbox">
              {view === 'email' ? (
                <>
                  <p className="t-small" style={{ margin: 0 }}><span className="muted">To:</span> {toLine}</p>
                  <p className="t-small" style={{ margin: '6px 0 0' }}><span className="muted">Subject:</span> {subjectLine || '—'}</p>
                  <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '12px 0' }} />
                  {bodyLine.split('\n').map((line, i) => <p key={i} className="t-small" style={{ margin: '0 0 10px', minHeight: line ? 0 : 12 }}>{line}</p>)}
                </>
              ) : (
                <pre className="mono t-caption" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>To: {toLine}{'\n'}Subject: {subjectLine || '—'}{'\n\n'}{bodyLine}</pre>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* history strip — click an email to preview it */}
      <section className="card rise" aria-label="History">
        <div className="cold-pad cold-historypad">
          <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="side-ic"><ClockIcon width={18} /></span>
              <div><h2 className="t-h3" style={{ margin: 0 }}>History ({sent.length})</h2>
                <p className="muted t-caption" style={{ margin: 0 }}>Click an email to preview it above.</p></div>
            </div>
          </div>
          {sent.length === 0 ? (
            <p className="muted t-small" style={{ margin: 0 }}>No emails yet — messages you send will appear here.</p>
          ) : (
            <div className="cold-historyrow" role="list">
              {sent.slice(0, 12).map(s => (
                <button key={s.id} role="listitem" className="cold-historyitem" data-on={previewId === s.id}
                  onClick={() => setPreviewId(cur => (cur === s.id ? null : s.id))}
                  aria-pressed={previewId === s.id} title="Preview this email">
                  <strong className="t-small ell">{s.subject}</strong>
                  <span className="muted t-caption ell">{s.to} · {s.sentAt}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
