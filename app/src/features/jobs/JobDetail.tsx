import { useEffect, useState } from 'react';
import {
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
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolid } from '@heroicons/react/24/solid';
import { useStore, todayStr } from '../../store';
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
  const { selected: j, select, save, apps, usage, backend } = useStore();
  const [tab, setTab] = useState<Tab>('Overview');
  const [applyMsg, setApplyMsg] = useState('');
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !confirming) select(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select, confirming]);
  if (!j) return null;
  const applied = apps.some(a => a.jobId === j.id);  const { used, cap } = appliesToday(backend, usage, apps, todayStr());
  const capReached = !applied && used >= cap;
  const responsibilities = j.requirements.slice(0, 4);
  const requirements = j.requirements;
  const stack = techStackFor(j.requirements, j.description);
  const safeUrl = isSafeHttpUrl(j.url) ? j.url : null;

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
              <span className="jobcard-status-active">Active role</span>
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
                  {applied ? 'Application submitted ✓' : capReached ? `Daily cap reached (${cap}/day)` : <>Submit application <ArrowRightIcon width={17} strokeWidth={2} /></>}
                </button>
                <div className="jobcard-actions-row">
                  <button className="jobcard-secondary" onClick={() => save(j.id)} aria-pressed={!!j.isSaved}>
                    {j.isSaved ? <BookmarkSolid width={17} /> : <BookmarkOutline width={17} strokeWidth={2} />} Save
                  </button>
                  <button className="jobcard-secondary" onClick={() => select(null)}>
                    <LinkIcon width={17} strokeWidth={2} /> Back to list
                  </button>
                </div>
                <p className="muted t-caption" style={{ margin: 0 }}>{used} of {cap} applies used today</p>
                {applyMsg ? <FormNote kind={/cap|already|not found/i.test(applyMsg) ? 'err' : 'ok'}>{applyMsg}</FormNote> : null}
              </div>
            </div>

            <div className="jobcard-meta">
              <span className="jobcard-meta-plain"><MapPinIcon width={16} strokeWidth={1.5} /> {j.location}</span>
              <span className="jobcard-meta-pill"><BriefcaseIcon width={15} strokeWidth={1.5} /> {j.type}</span>
              <span className="jobcard-meta-plain"><CurrencyDollarIcon width={16} strokeWidth={1.5} /> {j.compensation}</span>
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
                      <h2>Job description</h2>
                      <p>{j.description || 'No description was provided for this role — see the original link below.'}</p>
                    </section>
                    <hr className="jobcard-hr" />
                    <section className="jobcard-sec">
                      <h2>Key responsibilities</h2>
                      {responsibilities.length > 0 ? (
                        <ul>{responsibilities.map(r => <li key={r}>{r}</li>)}</ul>
                      ) : (
                        <p className="muted t-small">No responsibilities were listed — see the original link below.</p>
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
                    <p className="muted t-small">No requirements were listed — see the original link below.</p>
                  )}
                </section>
              </>
            )}
            {tab === 'About the company' && (
              <section className="jobcard-sec">
                <h2>About {j.company}</h2>
              <p>{j.company} is the hiring source for this lead — open the original posting for full details.</p>
              </section>
            )}
            {tab === 'Tech stack' && (
              <section className="jobcard-sec">
                <h2>Tech stack</h2>
                {stack.length > 0 ? (
                  <div className="jobcard-chips">{stack.map(s => <span key={s} className="jobcard-chip">{s}</span>)}</div>
                ) : (
                  <p className="muted t-small">No tech stack detected in this posting.</p>
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
                <p>This role is a great match for your profile based on your skills, experience and preferences.</p>
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
              <h3>Quick details</h3>
              <div className="jobcard-qrow"><span className="jobcard-qic"><MapPinIcon width={16} strokeWidth={1.5} /></span><span className="jobcard-qlabel">Location</span><strong>{j.location}</strong></div>
              <div className="jobcard-qrow"><span className="jobcard-qic"><BriefcaseIcon width={16} strokeWidth={1.5} /></span><span className="jobcard-qlabel">Employment type</span><strong>{j.type}</strong></div>
              <div className="jobcard-qrow"><span className="jobcard-qic"><CurrencyDollarIcon width={16} strokeWidth={1.5} /></span><span className="jobcard-qlabel">Compensation</span><strong>{j.compensation}</strong></div>
              <div className="jobcard-qrow last"><span className="jobcard-qic"><ChartBarIcon width={16} strokeWidth={1.5} /></span><span className="jobcard-qlabel">Match score</span><strong>{j.match}%</strong></div>
            </div>

            <div className="jobcard-card">
              <h3>Tech stack</h3>
              {stack.length > 0 ? (
                <div className="jobcard-chips">{stack.map(s => <span key={s} className="jobcard-chip">{s}</span>)}</div>
              ) : (
                <p className="muted t-small" style={{ margin: 0 }}>No tech stack detected in this posting.</p>
              )}
            </div>

            <div className="jobcard-card">
              <h3>Job meta</h3>
              <div className="jobcard-qrow"><span className="jobcard-qic"><ClockIcon width={16} strokeWidth={1.5} /></span><span className="jobcard-qlabel">Posted</span><strong>{postedLong(j.posted) || 'date not listed'}</strong></div>
              <div className="jobcard-qrow"><span className="jobcard-qic"><HashtagIcon width={16} strokeWidth={1.5} /></span><span className="jobcard-qlabel">Job ID</span><strong className="mono">{j.id}</strong></div>
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
