import { useEffect, useState } from 'react';
import {
  ArrowPathIcon, BriefcaseIcon, CalendarDaysIcon, CheckCircleIcon, ClockIcon, EllipsisHorizontalIcon,
  EnvelopeIcon, LightBulbIcon, MagnifyingGlassIcon, MapPinIcon, XCircleIcon,
} from '@heroicons/react/24/outline';
import { useStore } from '../../store';
import { Card, Empty, LogoImg, stagger } from '../../components/ui';
import { REPLY_CATEGORIES, type DraftMail, type Job, type Reply, type ReplyCategory } from '../../types';
import { saveDraft } from '../../lib/outreachDraft';

type MainTab = 'replies' | 'sent' | 'status';
type Cat = 'All' | ReplyCategory;

const CATS: Cat[] = ['All', ...REPLY_CATEGORIES];
const DOT: Record<ReplyCategory, 'green' | 'red' | 'blue' | 'amber'> = {
  Interested: 'green',
  'Not Interested': 'red',
  'Might be Interested': 'blue',
  'Interview Scheduled': 'amber',
  'Auto-response': 'blue',
};

/* Join a reply to a known job by company name for logo/role/location pills. */
function jobFor(r: Reply, jobs: Job[]): Job | undefined {
  const from = r.from.toLowerCase();
  return jobs.find(j => from.includes(j.company.toLowerCase()));
}
function logoFor(r: Reply, jobs: Job[]): string | undefined {
  return jobFor(r, jobs)?.logo;
}
function atMinutes(at: string): number {
  const t = at.trim();
  // Server rows arrive as MM/DD/YY (see HttpOutreachService.replyToLocal);
  // legacy demo rows used HH:MM. Both parse; unknown formats sort last.
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t);
  if (mdy) {
    const y = +mdy[3] < 100 ? 2000 + +mdy[3] : +mdy[3];
    return Math.round(new Date(y, +mdy[1] - 1, +mdy[2]).getTime() / 60000);
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? +m[1] * 60 + +m[2] : -1;
}

export function Inbox() {
  const { replies, sent, jobs, go, clearNotif, dismissHotReply } = useStore();
  const [tab, setTab] = useState<MainTab>('replies');
  const [cat, setCat] = useState<Cat>('All');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'oldest'>('recent');
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErr, setCopyErr] = useState(false);
  const [tip, setTip] = useState(() => {
    try { return localStorage.getItem('jw2_protip') !== '0'; } catch { return true; }
  });

  // The topbar bell points here: reaching Inbox is "seeing" the activity, so
  // the badge clears on visit (mount only — visiting later activity re-arms it).
  // The same visit acknowledges the server reply notification behind the
  // dashboard banner; mark-all is idempotent and safe when nothing is unread.
  useEffect(() => {
    clearNotif();
    dismissHotReply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const countOf = (c: Cat) => (c === 'All' ? replies.length : replies.filter(r => r.category === c).length);
  const visible = replies
    .filter(r => cat === 'All' || r.category === cat)
    .filter(r => (r.subject + ' ' + r.from + ' ' + r.body + ' ' + r.category).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'recent' ? atMinutes(b.at) - atMinutes(a.at) : atMinutes(a.at) - atMinutes(b.at)));

  const dismissTip = () => {
    setTip(false);
    try { localStorage.setItem('jw2_protip', '0'); } catch { /* private mode */ }
  };
  const replyInCompose = (r: Reply) => {
    const j = jobFor(r, jobs);
    const email = /[\w.+-]+@[\w.-]+\.\w+/.exec(r.from)?.[0] ?? '';
    const draft: DraftMail = {
      ...(j ? { jobId: j.id, jobTitle: j.title, company: j.company } : {}),
      to: email,
      subject: `Re: ${r.subject}`,
      body: `\n\n— — —\nOn ${r.at}, ${r.from} wrote:\n${r.body}`,
    };
    saveDraft(draft);
    setOpenId(null);
    go('outreach');
  };
  const copyText = async (r: Reply) => {
    let ok = true;
    try { await navigator.clipboard.writeText(`${r.subject}\n${r.from} · ${r.at}\n\n${r.body}`); } catch { ok = false; }
    setCopyErr(!ok);
    setCopiedId(r.id);
    setOpenId(null);
    window.setTimeout(() => setCopiedId(cur => (cur === r.id ? null : cur)), 2000);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* banner — shared art/size system */}
      <section className="card rise apps-banner">
        <div className="card-pad hero-body">
          <p className="sec-label" style={{ margin: '0 0 6px' }}>Inbox</p>
          <h1 className="t-display">Recruiter replies</h1>
          <p className="muted t-small" style={{ margin: '8px 0 0', maxWidth: 520 }}>Track and respond to messages from hiring managers and recruiters.</p>
        </div>
      </section>

      {/* main tabs */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }} role="tablist" aria-label="Inbox views">
        {(['replies', 'sent', 'status'] as const).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} className="ftab" data-on={tab === t}
            onClick={() => setTab(t)}>
            {t === 'replies' ? `Replies (${replies.length})` : t === 'sent' ? `Sent${sent.length ? ` (${sent.length})` : ''}` : 'Status'}
          </button>
        ))}
      </div>

      {tab === 'replies' ? (<>
        <div className="apps-toolbar">
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Filter by classification">
            {CATS.map(c => (
              <button key={c} className={'ftab' + (c === 'All' ? '' : ' ftab-soft')} data-on={cat === c}
                onClick={() => setCat(c)}>
                {c === 'All' ? `All (${countOf(c)})` : `${c} (${countOf(c)})`}
              </button>
            ))}
          </div>
          <span className="apps-search icon-field">
            <span aria-hidden="true" className="icon-field-ic"><MagnifyingGlassIcon width={16} /></span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search messages..." aria-label="Search messages" />
          </span>
          <label className="row t-caption muted" style={{ gap: 8 }}>Sort by
            <select aria-label="Sort messages" value={sort} onChange={e => setSort(e.target.value as 'recent' | 'oldest')} className="select-sm">
              <option value="recent">Most recent</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>

        <div className="inbox-layout">
          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            {visible.length === 0 ? (
              <div className="card">
                {replies.length === 0
                  ? <Empty title="No replies yet — replies to your outreach land here." action="Find roles" onAction={() => go('jobs')} />
                  : <Empty title="No replies in this view." action="Clear filters" onAction={() => { setQ(''); setCat('All'); }} />}
              </div>
            ) : visible.map((r, i) => {
              const j = jobFor(r, jobs);
              return (
                <article key={r.id} className="card rise" style={stagger(i)}>
                  <div className="card-pad inbox-card">
                    <LogoImg file={logoFor(r, jobs)} name={r.from} size={56} />
                    <div style={{ minWidth: 0 }}>
                      <strong className="t-h3 ell">{r.subject}</strong>
                      <div className="muted t-caption ell">{r.from} · {r.at}</div>
                      <p className="t-small clamp2" style={{ margin: '6px 0 0' }}>{r.body}</p>
                      <div className="app-meta">
                        <span className="meta-pill"><EnvelopeIcon width={14} />Recruiter reply</span>
                        {j ? <span className="meta-pill"><BriefcaseIcon width={14} />{j.title}</span> : null}
                        {j ? <span className="meta-pill"><MapPinIcon width={14} />{j.location}</span> : null}
                      </div>
                    </div>
                    <div className="inbox-actions">
                      <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <span className="dot-chip" data-kind={DOT[r.category] ?? 'amber'}>
                          <span className="dot" aria-hidden="true" />{r.category}
                        </span>
                        <span className="muted t-caption">{r.at}</span>
                      </span>
                      <span className="row" style={{ gap: 8 }}>
                        <button className="btn btn-sm" onClick={() => replyInCompose(r)}>Reply</button>
                        <span className="app-menu-wrap">
                          <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label={`More actions for ${r.subject}`}
                            aria-expanded={openId === r.id} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                            <EllipsisHorizontalIcon width={18} />
                          </button>
                          {openId === r.id ? (
                            <div className="app-menu" role="menu">
                              <button onClick={() => replyInCompose(r)}>Reply in Compose</button>
                              <button onClick={() => { void copyText(r); }}>Copy message</button>
                            </div>
                          ) : null}
                        </span>
                        {copiedId === r.id ? (
                          <span className={copyErr ? 'field-hint' : 'muted t-caption'} role="status" style={{ margin: 0 }}>
                            {copyErr ? 'Copy blocked by the browser — select the text instead.' : 'Copied!'}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* right rail */}
          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            <Card label="Inbox overview">
              <div className="ov-grid">
                <div className="card-inner ov-tile">
                  <span className="side-ic"><EnvelopeIcon width={17} /></span>
                  <strong className="num t-h2">{replies.length}</strong>
                  <span className="muted t-caption">Total replies</span>
                </div>
                {REPLY_CATEGORIES.map(c => (
                  <div key={c} className="card-inner ov-tile">
                    <span className="dot-chip" data-kind={DOT[c]}><span className="dot" aria-hidden="true" />{countOf(c)}</span>
                    <span className="muted t-caption">{c === 'Might be Interested' ? 'Might be interested' : c}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card label="Quick filters">
              <div className="stack" style={{ gap: 2 }}>
                {[{ c: 'All' as Cat, icon: <EnvelopeIcon width={16} /> },
                  ...REPLY_CATEGORIES.map((c) => ({
                    c: c as Cat,
                    icon: c === 'Interested' ? <CheckCircleIcon width={16} />
                      : c === 'Might be Interested' ? <ClockIcon width={16} />
                      : c === 'Interview Scheduled' ? <CalendarDaysIcon width={16} />
                      : c === 'Auto-response' ? <ArrowPathIcon width={16} />
                      : <XCircleIcon width={16} />,
                  }))].map(({ c, icon }) => (
                  <button key={c} className="qf-row" data-on={cat === c} onClick={() => setCat(c)}>
                    <span className="muted" style={{ display: 'inline-flex' }}>{icon}</span>
                    <span className="dot" data-kind={c === 'All' ? 'blue' : DOT[c]} aria-hidden="true" />
                    <span style={{ flex: 1 }}>{c === 'All' ? 'All messages' : c}</span>
                    <span className="qf-count num">{countOf(c)}</span>
                  </button>
                ))}
              </div>
            </Card>
            {tip ? (
              <div className="card tip-card"><div className="card-pad">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="side-ic"><LightBulbIcon width={18} /></span>
                    <strong className="t-small">Pro tip</strong>
                  </span>
                  <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Dismiss tip" onClick={dismissTip}>✕</button>
                </div>
                <p className="muted t-small" style={{ margin: '8px 0 0' }}>Respond within 24 hours for the best results. Replies open in the composer with the company and thread kept.</p>
              </div></div>
            ) : null}
          </div>
        </div>
      </>) : tab === 'sent' ? (
        <Card label={`Sent log (${sent.length})`}>
          {sent.length === 0 ? <p className="muted t-small" style={{ margin: 0 }}>No emails sent yet — compose one in Outreach.</p> : (<>
            {sent.slice(0, 20).map(s => (
              <div key={s.id} className="list-row list-row-block t-small">
                <strong>{s.subject}</strong><div className="muted">{s.to} · {s.sentAt}</div>
              </div>
            ))}
            {sent.length > 20 ? (
              <p className="muted t-caption" style={{ margin: '8px 0 0' }} role="status">Showing the 20 most recent of {sent.length} sent emails.</p>
            ) : null}
          </>)}
        </Card>
      ) : (
        <Card label="Reply classification">
          {REPLY_CATEGORIES.map(c => (
            <div key={c} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="dot-chip" data-kind={DOT[c]}><span className="dot" aria-hidden="true" />{c}</span>
              <strong className="num">{countOf(c)}</strong>
            </div>
          ))}
          <p className="muted t-caption" style={{ marginBottom: 0 }}>Classifier output — counts update as live replies arrive.</p>
        </Card>
      )}
    </div>
  );
}
