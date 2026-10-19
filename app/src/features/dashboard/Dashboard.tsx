import {
  ArrowRightIcon, BookmarkIcon as BookmarkSolid, BriefcaseIcon, BuildingOffice2Icon,
  ChevronRightIcon, EnvelopeIcon, MagnifyingGlassIcon, SparklesIcon,
  PaperAirplaneIcon, UserIcon, ClockIcon, CalendarDaysIcon, ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon } from '@heroicons/react/24/outline';
import { useStore, todayStr } from '../../store';
import { Card, LogoImg, Ring, appStatusKind, stagger } from '../../components/ui';
import { selectFunnel } from '../../services/demo';
import { sendsToday } from '../../lib/caps';
import { applicationsThisWeek, avgResponseDays } from '../../lib/dates';
import { HeroArt } from './HeroArt';

/* handpicked: kokonut shimmer-text restraint + interior value-flash (static cue, never motion alone) */
function Spark({ points, stroke, id, fluid }: { points: string; stroke: string; id: string; fluid?: boolean }) {
  const area = `M0,34 ${points.split(' ').map(p => 'L' + p).join(' ')} L90,34 Z`;
  return (
    <svg viewBox="0 0 90 36" preserveAspectRatio={fluid ? 'none' : 'xMidYMid meet'} aria-hidden="true"
      width={fluid ? undefined : 90} height={36}
      style={fluid ? { display: 'block', width: '100%', height: 36, marginTop: 6 } : { display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: stroke }} stopOpacity=".28" />
          <stop offset="1" style={{ stopColor: stroke }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <polyline points={points} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke }} vectorEffect={fluid ? 'non-scaling-stroke' : undefined} />
    </svg>
  );
}

const TILE_BG: Record<string, string> = {
  green: 'color-mix(in srgb, var(--success) 10%, transparent)', pine: 'color-mix(in srgb, var(--pine) 12%, transparent)',
  orange: 'color-mix(in srgb, var(--warning) 10%, transparent)', teal: 'color-mix(in srgb, var(--teal) 10%, transparent)',
  gray: 'color-mix(in srgb, var(--muted) 12%, transparent)',
};
const TILE_FG: Record<string, string> = {
  green: 'var(--success)', pine: 'var(--sage-deep)', orange: 'var(--warning)', teal: 'var(--teal)', gray: 'var(--muted)',
};

export function Dashboard() {
  const { profile, apps, jobs, sent, go, scan, scanning, save, select, usage, backend, hotReply, dismissHotReply } = useStore();
  const interviews = apps.filter(a => a.status === 'INTERVIEW SET').length;
  const offers = apps.filter(a => a.status === 'OFFERED').length;
  const weekApps = applicationsThisWeek(apps);
  const avgDays = avgResponseDays(apps);
  const firstName = profile.name.trim().split(/\s+/)[0] ?? '';
  const funnel = selectFunnel(jobs, apps);
  const fmax = Math.max(1, ...funnel.map(f => f.value));
  const BAR = ['var(--pine)', 'var(--sage)', 'var(--mist)', 'var(--tan)', 'var(--fog)'];
  const success = apps.length ? Math.round((offers / apps.length) * 100) : null;
  const { used: sendsUsed, cap: sendsCap } = sendsToday(backend, usage, sent, todayStr());
  const matches = [...jobs].sort((a, b) => b.match - a.match).slice(0, 5);
  const activity = [
    ...apps.slice(0, 2).map(a => ({ key: a.id, title: a.title, sub: `${a.company} · ${a.appliedDate}`, chip: a.status, kind: appStatusKind(a.status) as 'ok' | 'warn' | 'bad' | 'info', logo: a.logo, company: a.company, jobId: a.jobId })),
    ...jobs.filter(j => !apps.some(a => a.jobId === j.id)).slice(0, 3).map(j => ({ key: j.id, title: j.title, sub: `${j.company} · ${j.posted}`, chip: j.isSaved ? 'Saved' : 'In feed', kind: 'info' as const, logo: j.logo, company: j.company, jobId: j.id })),
  ];
  const tileIcon = (k: string) =>
    k === 'clock' ? <ClockIcon width={17} /> : k === 'cal' ? <CalendarDaysIcon width={17} /> :
    k === 'badge' ? <ShieldCheckIcon width={17} /> : <BriefcaseIcon width={17} />;
  const metrics = [
    { label: 'Active applications', value: apps.length, delta: weekApps > 0 ? `+${weekApps} in the last 7 days` : 'No new applications yet', tone: 'green', tile: 'briefcase', spark: '0,30 12,28 24,29 36,24 48,25 60,20 72,21 90,14', id: 'sp1' },
    { label: 'Roles in feed', value: jobs.length, delta: jobs.length > 0 ? 'From your latest search' : 'Run a live search to fill it', tone: 'pine', tile: 'clock', spark: '0,26 15,24 30,25 45,18 60,20 75,12 90,10', id: 'sp2' },
    { label: 'Interviews', value: interviews, delta: interviews > 0 ? `${interviews} in progress` : 'None yet', tone: 'orange', tile: 'cal', spark: '0,22 15,18 30,20 45,14 60,16 75,22 90,20', id: 'sp3' },
    { label: 'Offers', value: offers, delta: offers > 0 ? `${offers} received` : 'None yet', tone: 'teal', tile: 'badge', spark: '0,28 15,26 30,27 45,22 60,24 75,18 90,16', id: 'sp4' },
  ];
  const quick: { title: string; sub: string; icon: React.ReactNode; route: Parameters<typeof go>[0] }[] = [
    { title: 'Run a hunt', sub: 'Fresh freelance leads, live from the web', icon: <MagnifyingGlassIcon width={18} />, route: 'search' },
    { title: 'Your leads', sub: 'Every lead Scout scored for you', icon: <SparklesIcon width={18} />, route: 'jobs' },
    { title: 'Outreach pipeline', sub: 'Track pings and replies', icon: <UserIcon width={18} />, route: 'applications' },
    { title: 'Tune your ICP', sub: 'Who you sell to, and for how much', icon: <BuildingOffice2Icon width={18} />, route: 'settings' },
  ];
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* hero — command deck over misty-ridge art, white scrim left (user image 2) */}
      <section className="card rise hero">
        <HeroArt />
        <div className="card-pad hero-body row" style={{ justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <p className="sec-label" style={{ margin: '0 0 6px' }}>Command deck</p>
            <h1 className="t-display">Good hunting{firstName ? `, ${firstName}` : ''}.</h1>
            <p className="muted t-small" style={{ margin: '8px 0 0' }}>
              <button className="link" onClick={() => go('applications')}>{apps.length} active applications</button>
              {' · '}{jobs.length} fresh roles in range.
            </p>
          </div>
          <button className="btn-dark" onClick={() => { scan(); go('jobs'); }} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Find matched jobs'} <ArrowRightIcon width={16} />
          </button>
        </div>
      </section>

      {/* recruiter reply flag — server notification, cleared by opening Inbox */}
      {hotReply !== null && (
        <section className="card rise" aria-live="polite">
          <div className="card-pad row" style={{ justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <span className="metric-tile" style={{ background: TILE_BG.green, color: TILE_FG.green }}>
                <EnvelopeIcon width={17} />
              </span>
              <div>
                <p className="sec-label" style={{ margin: 0 }}>New recruiter reply</p>
                <p className="t-small" style={{ margin: '4px 0 0', fontWeight: 600 }}>
                  {hotReply.from !== '' ? hotReply.from : 'A recruiter'}
                  {hotReply.subject !== '' ? ` · ${hotReply.subject}` : ''}
                </p>
                <p className="muted t-caption" style={{ margin: '4px 0 0' }}>
                  {hotReply.category}
                  {hotReply.message !== '' && hotReply.message !== hotReply.subject
                    ? ` · ${hotReply.message}`
                    : ''}
                </p>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={() => go('applications')}>
                Open pipeline <ArrowRightIcon width={15} />
              </button>
              <button className="btn btn-ghost" onClick={dismissHotReply}>Dismiss</button>
            </div>
          </div>
        </section>
      )}

      {/* metric cards with icon tile + delta + sparkline */}
      <div className="grid-metrics">
        {metrics.map((m, i) => (
          <div key={m.label} className="card rise" style={stagger(i)}>
            <div className="card-pad">
              <div className="row" style={{ gap: 10 }}>
                <span className="metric-tile" style={{ background: TILE_BG[m.tone], color: TILE_FG[m.tone] }}>
                  {tileIcon(m.tile)}
                </span>
                <span className="t-small" style={{ fontWeight: 500 }}>{m.label}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}>
                <div>
                  <p className="num t-metric" style={{ margin: 0 }}>{m.value}</p>
                  <p className="t-caption" style={{ margin: '4px 0 0', color: m.tone === 'green' || m.tone === 'pine' ? 'var(--success)' : 'var(--muted)' }}>{m.delta}</p>
                </div>
                <Spark points={m.spark} stroke={m.tone === 'green' ? 'var(--success)' : m.tone === 'pine' ? 'var(--pine)' : m.tone === 'orange' ? 'var(--warning)' : 'var(--teal)'} id={m.id} />
              </div>
            </div>
          </div>
        ))}
        <div className="card rise">
          <div className="card-pad">
            <div className="row" style={{ gap: 10 }}>
              <span className="metric-tile" style={{ background: TILE_BG.gray, color: TILE_FG.gray }}>
                <PaperAirplaneIcon width={17} />
              </span>
              <span className="t-small" style={{ fontWeight: 500 }}>Outreach left</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <div>
                <p className="num t-metric" style={{ margin: 0 }}>{Math.max(0, sendsCap - sendsUsed)}</p>
                <p className="t-caption muted" style={{ margin: '4px 0 0' }}>of {sendsCap} today</p>
              </div>
              <Ring used={sendsUsed} total={sendsCap} />
            </div>
          </div>
        </div>
      </div>

      <div className="dash-3col">
        {/* recent activity */}
        <Card label="Recent activity">
          <p className="muted t-caption" style={{ margin: '-4px 0 8px' }}>Your latest applications, updates and matches.</p>
          {activity.map((a) => (
            <button key={a.key} className="activity-row"
              onClick={() => { const j = jobs.find(x => x.id === a.jobId); if (j) select(j); else go('applications'); }}>
              <LogoImg file={a.logo} name={a.company} size={38} />
              <span style={{ flex: '1 1 auto', minWidth: 0, textAlign: 'left' }}>
                <strong className="t-small ell">{a.title}</strong>
                <span className="muted t-caption ell">{a.sub}</span>
              </span>
              <span className={`chip ${a.kind}`}>{a.chip}</span>
              <ChevronRightIcon width={16} className="muted" />
            </button>
          ))}
          {activity.length === 0 ? <p className="activity-ghost">Apply to a role or run a live search to start your activity.</p> : null}
        </Card>

        {/* pipeline */}
        <Card label="Application pipeline" className="pipe-card">
          <div className="pipe-body">
          <div className="pipe-row">
            {funnel.map((f, i) => (
              <div key={f.name} className="pipe-col">
                <span className="t-micro muted">{f.name}</span>
                <span className="pipe-track"><span className="pipe-bar"
                  style={{ height: `${f.value ? Math.max(24, (f.value / fmax) * 100) : 6}%`, background: BAR[i % BAR.length] }} /></span>
                <strong className="num t-small">{f.value}</strong>
              </div>
            ))}
          </div>
          <div className="grid-2" style={{ marginTop: 10, gap: 10 }}>
            <div className="card-inner">
              <p className="t-caption muted" style={{ margin: '0 0 4px' }}>Success rate</p>
              <p className="num" style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{success === null ? '—' : `${success}%`} <span className="t-caption muted">{success === null ? 'No applications yet' : `${offers} of ${apps.length}`}</span></p>
              <Spark fluid points="0,26 15,24 30,25 45,20 60,21 75,14 90,10" stroke="var(--success)" id="sp-ok" />
            </div>
            <div className="card-inner">
              <p className="t-caption muted" style={{ margin: '0 0 4px' }}>Avg. response time</p>
              <p className="num" style={{ fontSize: 22, fontWeight: 600, margin: 0, whiteSpace: 'nowrap' }}>{avgDays === null ? '—' : `${avgDays} day${avgDays === 1 ? '' : 's'}`}</p>
              <p className="t-caption muted" style={{ margin: '4px 0 0' }}>{avgDays === null ? 'No responses yet' : 'Application to first response'}</p>
            </div>
          </div>
          </div>
        </Card>

        {/* today's matches */}
        <Card label="Top matches" action={<button className="btn btn-ghost" onClick={() => go('jobs')}>View all <ArrowRightIcon width={14} /></button>}>
          {matches.length === 0 ? <p className="muted t-small" style={{ margin: 0 }}>No roles yet — run a live search to fill your feed.</p> : null}
          {matches.map((j) => (
            <div key={j.id} className="list-row" style={{ gap: 10, padding: '9px 0' }}>
              <LogoImg file={j.logo} name={j.company} size={36} />
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <strong className="t-small ell">{j.title}</strong>
                <span className="muted t-caption ell">{j.company} · {j.location} · {j.type}</span>
                <span className="muted t-caption ell" style={{ display: 'block' }}>{j.compensation}</span>
              </div>
              <span className="chip ok num">{j.match}%</span>
              <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label={j.isSaved ? `Unsave ${j.title}` : `Save ${j.title}`} onClick={() => save(j.id)}>
                {j.isSaved ? <BookmarkSolid width={16} /> : <BookmarkIcon width={16} />}
              </button>
            </div>
          ))}
        </Card>
      </div>

      {/* quick actions */}
      <Card label="Quick actions">
        <p className="muted t-caption" style={{ margin: '-4px 0 10px' }}>Common tasks to keep your job hunt moving.</p>
        <div className="quick-grid">
          {quick.map((q, i) => (
            <button key={q.title} className="quick-tile" onClick={() => go(q.route)}>
              <span className={'quick-ic ' + ['tint-pine', 'tint-sage', 'tint-tan', 'tint-pine', 'tint-sage'][i % 5]}>{q.icon}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <strong className="t-small" style={{ display: 'block' }}>{q.title}</strong>
                <span className="muted t-caption">{q.sub}</span>
              </span>
              <ArrowRightIcon width={15} className="muted" />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
