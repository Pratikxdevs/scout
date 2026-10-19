import { useEffect, useState } from 'react';
import { useConvexAuth, useQuery, useAction } from 'convex/react';
import { api as convexApi } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';import {
  ArrowRightIcon,
  BookmarkIcon as BookmarkOutline,
  LinkIcon,
  MapPinIcon,
  BriefcaseIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  XMarkIcon,
  PrinterIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  HashtagIcon,
  ShieldCheckIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolid } from '@heroicons/react/24/solid';
import { useStore, todayStr } from '../../store';
import type { Job } from '../../types';
import { CopyButton, FormNote, LogoImg } from '../../components/ui';
import { isSafeHttpUrl } from '../../lib/urls';
import { appliesToday } from '../../lib/caps';
import { ApplyConfirmDialog } from './ApplyConfirm';

const TABS = ['Overview', 'Requirements', 'About the company', 'Tech stack'] as const;
type Tab = (typeof TABS)[number];

const KNOWN_TECH = ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'MongoDB', 'Microservices', 'CI/CD', 'Python', 'Go', 'Kafka', 'Spark', 'Kubernetes', 'AWS', 'GraphQL', 'Docker', 'Redis', 'Next.js', 'Swift', 'Kotlin', 'PyTorch', 'TensorFlow'];

function techStackFor(requirements: string[], description: string): string[] {
  const hay = (requirements.join(' ') + ' ' + description).toLowerCase();
  const found = KNOWN_TECH.filter(t => hay.includes(t.toLowerCase()));
  return found.length ? found.slice(0, 8) : requirements.slice(0, 4).map(r => r.split(' ').slice(0, 2).join(' '));
}

function postedLong(posted: string): string {
  const m = posted.match(/(\d+)\s*h/);
  if (m) return `${m[1]} hours ago`;
  const d = posted.match(/(\d+)\s*d/);
  if (d) return `${d[1]} days ago`;
  return posted;
}

export function JobDetail() {
  const { selected: j } = useStore();
  if (!j) return null;
  return <DetailBody j={j} />;
}

function DetailBody({ j }: { j: Job }) {
  const { select, save, apps, usage, backend, authed } = useStore();
  const [tab, setTab] = useState<Tab>('Overview');
  const [applyMsg, setApplyMsg] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftMsg, setDraftMsg] = useState('');

  const { isAuthenticated } = useConvexAuth();
  const live = backend && authed && isAuthenticated;
  // Evidence + draft are backend-only surfaces; skip cleanly otherwise.
  const detail = useQuery(
    convexApi.leads.getWithEvidence,
    live && j.leadId !== undefined ? { leadId: j.leadId as Id<'leads'> } : 'skip',
  );
  const draft = useQuery(
    convexApi.outreachDrafts.getForLead,
    live && j.leadId !== undefined ? { leadId: j.leadId as Id<'leads'>, channel: 'email' as const } : 'skip',
  );
  const genDraft = useAction(convexApi.actions.generateOutreachDraft.draftForMe);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !confirming) select(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select, confirming]);

  const applied = apps.some(a => a.jobId === j.id);
  const { used, cap } = appliesToday(backend, usage, apps, todayStr());
  const capReached = !applied && used >= cap;
  const requirements = j.requirements;
  const stack = techStackFor(j.requirements, j.description);
  const safeUrl = isSafeHttpUrl(j.url) ? j.url : null;
  const evidence = detail?.evidence ?? [];
  const scoreExplanation = detail?.lead.scoreExplanation ?? '';

  const requestDraft = async (): Promise<void> => {
    if (j.leadId === undefined || draftBusy) return;
    setDraftBusy(true);
    setDraftMsg('');
    try {
      await genDraft({ leadId: j.leadId as Id<'leads'> });
      setDraftMsg('Draft ready below — edit, copy, send it yourself.');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const m = /Error: [A-Z_]+: ([^]+)/.exec(raw);
      setDraftMsg(m?.[1]?.trim() ?? (raw.slice(0, 160) || 'Draft failed — try again.'));
    } finally {
      setDraftBusy(false);
    }
  };

  return (
    <div className="modal-back jobcard-back" onClick={() => select(null)}>
      <div className="jobcard" role="dialog" aria-modal="true" aria-label={j.title} onClick={e => e.stopPropagation()}>
        <button className="jobcard-x" onClick={() => select(null)} aria-label="Close job details">
          <XMarkIcon width={22} />
        </button>
        <div className="jobcard-grid">
          {/* ------- main column ------- */}
          <div className="jobcard-main">
            <span className="jobcard-status">
              <span className="jobcard-dot" />
              <span className="jobcard-status-active">Active lead</span>
              <span className="jobcard-status-sep">·</span>
              <span className="jobcard-status-posted">Posted {j.posted || 'date not listed'}</span>
            </span>

            <div className="jobcard-head">
              <div className="jobcard-titleblock">
                <LogoImg file={j.logo} name={j.company} size={64} />
                <div>
                  <h1 className="jobcard-title">{j.title}</h1>
                  <p className="jobcard-company">
                    {j.company}
                    {safeUrl ? (
                      <a href={safeUrl} target="_blank" rel="noopener noreferrer" aria-label={`${j.company} website`} onClick={e => e.stopPropagation()}>
                        <ArrowTopRightOnSquareIcon width={17} />
                      </a>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="jobcard-actions">
                <button className="jobcard-submit" disabled={applied || capReached}
                  title={capReached ? 'Daily cap reached — resets tomorrow' : undefined}
                  onClick={() => setConfirming(true)}>
                  {applied ? 'In pipeline ✓' : capReached ? `Daily cap reached (${cap}/day)` : <>Move to pipeline <ArrowRightIcon width={17} strokeWidth={2} /></>}
                </button>
                <div className="jobcard-actions-row">
                  <button className="jobcard-secondary" onClick={() => save(j.id)} aria-pressed={!!j.isSaved}>
                    {j.isSaved ? <BookmarkSolid width={17} /> : <BookmarkOutline width={17} strokeWidth={2} />} Save
                  </button>
                  <button className="jobcard-secondary" onClick={() => select(null)}>
                    <LinkIcon width={17} strokeWidth={2} /> Back to list
                  </button>
                </div>
                <p className="muted t-caption" style={{ margin: 0 }}>{used} of {cap} contacts used today</p>
                {applyMsg ? <FormNote kind={/cap|already|not found/i.test(applyMsg) ? 'err' : 'ok'}>{applyMsg}</FormNote> : null}
              </div>
            </div>

            <div className="jobcard-meta">
              <span className="jobcard-meta-plain"><MapPinIcon width={16} strokeWidth={1.5} /> {j.location}</span>
              <span className="jobcard-meta-pill"><BriefcaseIcon width={15} strokeWidth={1.5} /> {j.type}</span>
              <span className="jobcard-meta-plain"><CurrencyDollarIcon width={16} strokeWidth={1.5} /> {j.compensation || 'no stated budget'}</span>
              <span className="jobcard-meta-match"><ChartBarIcon width={15} strokeWidth={2} /> {j.match}% match</span>
            </div>

            <div
              className="jobcard-tabs"
              role="tablist"
              aria-label="Job details sections"
              onKeyDown={e => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = TABS.indexOf(tab);
                const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : (i - 1 + TABS.length) % TABS.length;
                setTab(TABS[next]);
              }}
            >
              {TABS.map(t => (
                <button key={t} role="tab" aria-selected={tab === t}
                  className={'jobcard-tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </div>

            {(tab === 'Overview' || tab === 'Requirements') && (
              <>
                {(tab === 'Overview') && (
                  <>
                    <section className="jobcard-sec">
                      <h2>Why Scout flagged this</h2>
                      <p>{j.description || 'The source page did not yield a summary — open the original link below.'}</p>
                    </section>
                    <hr className="jobcard-hr" />
                    <section className="jobcard-sec">
                      <h2>Scoring notes</h2>
                      {scoreExplanation !== '' ? (
                        <p className="muted">{scoreExplanation}</p>
                      ) : (
                        <p className="muted t-small">Sentiment, skill fit, freshness and source reliability are weighed in code — see the match ring.</p>
                      )}
                    </section>
                    <hr className="jobcard-hr" />
                  </>
                )}
                <section className="jobcard-sec">
                  <h2>Requirements</h2>
                  {requirements.length > 0 ? (
                    <ul>{requirements.map(r => <li key={r}>{r}</li>)}</ul>
                  ) : (
                    <p className="muted t-small">No requirements were listed — the source page holds the details.</p>
                  )}
                </section>
              </>
            )}
            {tab === 'About the company' && (
              <section className="jobcard-sec">
                <h2>About {j.company}</h2>
                <p>{j.company} is the source behind this lead — open the original page for full details.</p>
              </section>
            )}
            {tab === 'Tech stack' && (
              <section className="jobcard-sec">
                <h2>Tech stack</h2>
                {stack.length > 0 ? (
                  <div className="jobcard-chips">{stack.map(s => <span key={s} className="jobcard-chip">{s}</span>)}</div>
                ) : (
                  <p className="muted t-small">No tech stack detected for this lead.</p>
                )}
              </section>
            )}

            <div className="jobcard-foot">
              <span className="jobcard-foot-btns">
                <button className="jobcard-util" onClick={() => window.print()}><PrinterIcon width={17} strokeWidth={2} /> Print</button>
                <CopyButton className="jobcard-util" idleLabel="Copy link" getText={() => location.origin + '/jobs#' + j.id} />
              </span>
              <span className="jobcard-ref">REF&nbsp;&nbsp;{j.id}&nbsp;&nbsp;·&nbsp;&nbsp;01&nbsp;&nbsp;/&nbsp;&nbsp;01</span>
            </div>
          </div>

          {/* ------- side column ------- */}
          <aside className="jobcard-side">
            <div className="jobcard-card jobcard-match">
              <div>
                <h3>Match score</h3>
                <p>Intent, skill fit, freshness, budget presence and source reliability — weighted in code.</p>
              </div>
              <div className="jobcard-ring" role="img" aria-label={`${j.match}% match`}>
                <svg width="76" height="76" viewBox="0 0 76 76">
                  <circle cx="38" cy="38" r="32" fill="none" stroke="var(--border)" strokeWidth="6" />
                  <circle cx="38" cy="38" r="32" fill="none" stroke="var(--success)" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 32 * (j.match / 100)} ${2 * Math.PI * 32}`} transform="rotate(-90 38 38)" />
                </svg>
                <strong>{j.match}%</strong>
              </div>
            </div>

            <div className="jobcard-card">
              <h3><ShieldCheckIcon width={16} strokeWidth={2} style={{ verticalAlign: '-2px' }} /> Evidence</h3>
              {live && j.leadId !== undefined ? (
                detail === undefined ? (
                  <p className="muted t-small">Loading evidence…</p>
                ) : evidence.length > 0 ? (
                  <ul style={{ margin: '8px 0 0', paddingLeft: '1.1em' }}>
                    {evidence.map((e: { _id: string; claimKey: string; value: string; evidenceExcerpt: string }) => (
                      <li key={e._id} style={{ marginBottom: 8 }}>
                        <span className="jobcard-chip" style={{ fontSize: '0.72em', textTransform: 'uppercase' }}>{e.claimKey}</span>
                        {' '}
                        <strong style={{ fontSize: '0.85em' }}>{e.value}</strong>
                        <blockquote className="muted t-small" style={{ margin: '4px 0 0', fontStyle: 'italic' }}>“{e.evidenceExcerpt}”</blockquote>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted t-small">Only claims backed by a verbatim page excerpt are stored — this lead carried none.</p>
                )
              ) : (
                <p className="muted t-small">Evidence comes from the live hunt — run a search and open a lead.</p>
              )}
            </div>

            <div className="jobcard-card">
              <h3><PaperAirplaneIcon width={16} strokeWidth={2} style={{ verticalAlign: '-2px' }} /> Outreach draft</h3>
              {live && j.leadId !== undefined ? (
                <>
                  <p className="muted t-small" style={{ margin: '6px 0' }}>A first-pass email in your voice — records only, Scout never sends.</p>
                  <button className="jobcard-secondary" disabled={draftBusy}
                    onClick={() => { void requestDraft().catch(() => undefined); }}>
                    {draftBusy ? 'Writing…' : draft !== null && draft !== undefined ? 'Regenerate draft' : 'Generate draft'}
                  </button>
                  {draftMsg ? <FormNote kind={/fail|empty|again|KEY/i.test(draftMsg) ? 'err' : 'ok'}>{draftMsg}</FormNote> : null}
                  {draft !== null && draft !== undefined ? (
                    <div style={{ marginTop: 10 }}>
                      <div className="jobcard-qrow"><span className="jobcard-qlabel">Subject</span><strong style={{ fontSize: '0.82em', wordBreak: 'break-word' }}>{draft.subject}</strong></div>
                      <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: '0.85em', lineHeight: 1.45 }}>{draft.body}</div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="muted t-small">Drafts turn in after a live hunt produces this lead.</p>
              )}
            </div>

            <div className="jobcard-card">
              <h3>Tech stack</h3>
              {stack.length > 0 ? (
                <div className="jobcard-chips">{stack.map(s => <span key={s} className="jobcard-chip">{s}</span>)}</div>
              ) : (
                <p className="muted t-small" style={{ margin: 0 }}>No tech stack detected for this lead.</p>
              )}
            </div>

            <div className="jobcard-card">
              <h3>Lead meta</h3>
              <div className="jobcard-qrow"><span className="jobcard-qic"><ClockIcon width={16} strokeWidth={1.5} /></span><span className="jobcard-qlabel">Posted</span><strong>{postedLong(j.posted) || 'date not listed'}</strong></div>
              <div className="jobcard-qrow"><span className="jobcard-qic"><HashtagIcon width={16} strokeWidth={1.5} /></span><span className="jobcard-qlabel">Lead ID</span><strong className="mono">{j.id}</strong></div>
              <div className="jobcard-qrow last"><span className="jobcard-qic"><LinkIcon width={16} strokeWidth={1.5} /></span><span className="jobcard-qlabel">Original link</span>
                {safeUrl ? (
                  <a className="jobcard-link" href={safeUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{safeUrl.replace(/^https?:\/\//, '')} <ArrowTopRightOnSquareIcon width={14} /></a>
                ) : (
                  <span className="muted t-small">Unavailable</span>
                )}
              </div>
            </div>
          </aside>
        </div>
        {confirming ? <ApplyConfirmDialog job={j} onClose={() => setConfirming(false)} onDone={setApplyMsg} /> : null}
      </div>
    </div>
  );
}
