import { useState } from 'react';
import {
  ArrowRightIcon, ArrowUpRightIcon, BriefcaseIcon, CheckIcon,
  CurrencyDollarIcon, EllipsisHorizontalIcon, MagnifyingGlassIcon, MapPinIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolid } from '@heroicons/react/24/solid';
import { useStore, todayStr } from '../../store';
import { Card, Empty, LogoImg, Ring, Status, appStatusKind, stagger } from '../../components/ui';
import { DemoApplicationService } from '../../services/demo';
import { appliesToday } from '../../lib/caps';
import type { Application, AppStatus } from '../../types';

type Tab = 'all' | 'progress' | 'offered' | 'withdrawn' | 'archived';

/* ---------- date helpers (appliedDate/savedAt are MM/DD/YY) ---------- */
function parseMDY(s: string): number {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s.trim());
  if (!m) return NaN;
  const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
  return new Date(y, +m[1] - 1, +m[2]).getTime();
}
const fmtLong = (s: string) => {
  const t = parseMDY(s);
  return isNaN(t) ? s : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtShort = (s: string) => {
  const t = parseMDY(s);
  return isNaN(t) ? '' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
function ago(s?: string): string {
  if (!s) return '';
  const t = parseMDY(s);
  if (isNaN(t)) return '';
  const d = Math.floor((Date.now() - t) / 864e5);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return fmtLong(s);
}

/* ---------- pipeline stepper: Applied → Screening → Interview → Offer ---------- */
const STAGES = ['Applied', 'Screening', 'Interview', 'Offer'];
function doneCount(s: AppStatus): number {
  return s === 'UNDER REVIEW' ? 1 : s === 'INTERVIEW SET' ? 2 : s === 'OFFERED' ? 4 : 0;
}
function Stepper({ app }: { app: Application }) {
  const done = doneCount(app.status);
  return (
    <div className="steps" role="img" aria-label={`Progress: ${done} of 4 stages complete`}>
      {STAGES.map((name, i) => (
        <div key={name} className="step" data-state={i < done ? 'done' : i === done && done < 4 ? 'current' : 'todo'}>
          <span className="step-line" aria-hidden="true" />
          <span className="step-dot" aria-hidden="true">{i < done ? <CheckIcon width={12} /> : null}</span>
          <span className="step-name">{name}</span>
          <span className="step-date">
            {i === 0 ? fmtShort(app.appliedDate) : i === done - 1 && app.updatedAt ? fmtShort(app.updatedAt) : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Applications() {
  const { apps, jobs, select, go, save, advanceApp, withdrawApp, archiveApp, usage, backend } = useStore();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'oldest'>('recent');
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [advanceId, setAdvanceId] = useState<string | null>(null);

  const live = apps.filter(a => !a.archived);
  const counts: Record<Tab, number> = {
    all: live.length,
    progress: live.filter(a => a.status === 'UNDER REVIEW' || a.status === 'INTERVIEW SET').length,
    offered: live.filter(a => a.status === 'OFFERED').length,
    withdrawn: live.filter(a => a.status === 'WITHDRAWN' || a.status === 'REJECTED').length,
    archived: apps.filter(a => a.archived).length,
  };
  const visible = apps
    .filter(a => (tab === 'archived' ? a.archived : !a.archived))
    .filter(a => {
      if (tab === 'progress') return a.status === 'UNDER REVIEW' || a.status === 'INTERVIEW SET';
      if (tab === 'offered') return a.status === 'OFFERED';
      if (tab === 'withdrawn') return a.status === 'WITHDRAWN' || a.status === 'REJECTED';
      return true;
    })
    .filter(a => (a.title + ' ' + a.company + ' ' + a.jobId).toLowerCase().includes(q.toLowerCase()))
    .sort((x, y) => {
      const dx = parseMDY(x.appliedDate) || 0, dy = parseMDY(y.appliedDate) || 0;
      return sort === 'recent' ? dy - dx : dx - dy;
    });

  const saved = jobs.filter(j => j.isSaved);
  // Server usage wins when configured (single source of truth for caps).
  const { used: capUsed, cap: capTotal } = appliesToday(backend, usage, apps, todayStr());
  const openJob = (a: Application) => {
    const j = jobs.find(x => x.id === a.jobId);
    if (j) select(j);
    setOpenId(null);
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: `All applications (${counts.all})` },
    { id: 'progress', label: `In progress (${counts.progress})` },
    { id: 'offered', label: `Offered (${counts.offered})` },
    { id: 'withdrawn', label: `Withdrawn (${counts.withdrawn})` },
    { id: 'archived', label: `Archived (${counts.archived})` },
  ];

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* banner — same sizing system as dashboard hero + jobs banner */}
      <section className="card rise apps-banner">
        <div className="card-pad hero-body apps-banner-body">
          <div>
            <p className="sec-label" style={{ margin: '0 0 6px' }}>Applications</p>
            <h1 className="t-display">My applications</h1>
            <p className="muted t-small" style={{ margin: '8px 0 0' }}>Track your job applications and manage your progress.</p>
          </div>
          <div className="apps-today">
            <div><p className="muted t-caption" style={{ margin: 0 }}>Today</p>
              <p className="num" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{Math.min(capUsed, capTotal)} / {capTotal}</p></div>
            <Ring used={capUsed} total={capTotal} size={48} />
          </div>
        </div>
      </section>

      {/* filter tabs + search + sort */}
      <div className="apps-toolbar">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }} role="tablist" aria-label="Application status">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className="ftab" data-on={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <span className="apps-search icon-field">
          <span aria-hidden="true" className="icon-field-ic"><MagnifyingGlassIcon width={16} /></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search applications..." aria-label="Search applications" />
        </span>
        <label className="row t-caption muted" style={{ gap: 8 }}>Sort by
          <select aria-label="Sort applications" value={sort} onChange={e => setSort(e.target.value as 'recent' | 'oldest')} className="select-sm">
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>

      <div className="apps-layout">
        {/* application cards */}
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          {visible.length === 0 ? (
            <div className="card">
              {apps.length === 0
                ? <Empty title="Nothing applied yet." action="Find roles" onAction={() => go('jobs')} />
                : <Empty title="No applications in this view." action="Clear filters" onAction={() => { setQ(''); setTab('all'); }} />}
            </div>
          ) : visible.map((a, i) => {
            const j = jobs.find(x => x.id === a.jobId);
            const next = DemoApplicationService.nextStatus(a.status);
            const updated = ago(a.updatedAt ?? a.appliedDate);
            return (
              <article key={a.id} className="card rise" style={stagger(i)}>
                <div className="card-pad app-grid">
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                      <LogoImg file={a.logo} name={a.company} size={52} />
                      <div style={{ minWidth: 0 }}>
                        <strong className="t-h3 ell">{a.title}</strong>
                        <div className="muted t-caption ell">{a.company} <ArrowUpRightIcon width={12} style={{ display: 'inline' }} /> · {a.jobId} · Applied on {fmtLong(a.appliedDate)}</div>
                      </div>
                    </div>
                    <div className="app-meta">
                      <span className="meta-pill"><MapPinIcon width={14} />{j?.location ?? '—'}</span>
                      <span className="meta-pill"><BriefcaseIcon width={14} />{j?.type ?? '—'}</span>
                      <span className="meta-pill"><CurrencyDollarIcon width={14} />{j?.compensation ?? '—'}</span>
                    </div>
                    {j?.description ? <p className="muted t-small clamp2" style={{ margin: '10px 0 0' }}>{j.description}</p> : null}
                  </div>
                  <div className="app-side">
                    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <span className="row" style={{ gap: 8 }}>
                        <Status kind={appStatusKind(a.status)}>{a.status}</Status>
                        {updated ? <span className="muted t-caption">Updated {updated}</span> : null}
                      </span>
                      <span className="row" style={{ gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openJob(a)}>View details</button>
                        <span className="app-menu-wrap">
                          <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label={`More actions for ${a.title}`}
                            aria-expanded={openId === a.id} onClick={() => { setOpenId(openId === a.id ? null : a.id); setConfirmId(null); setAdvanceId(null); }}>
                            <EllipsisHorizontalIcon width={18} />
                          </button>
                          {openId === a.id ? (
                            <div className="app-menu" role="menu">
                              <button onClick={() => openJob(a)}>View details</button>
                              {next ? advanceId === a.id ? (
                                <button onClick={() => { void advanceApp(a.id); setOpenId(null); setAdvanceId(null); }}>Confirm → {next}?</button>
                              ) : (
                                <button onClick={() => { setAdvanceId(a.id); setConfirmId(null); }}>Advance to {next}</button>
                              ) : null}
                              <button onClick={() => { void archiveApp(a.id, !a.archived); setOpenId(null); }}>{a.archived ? 'Unarchive' : 'Archive'}</button>
                              {a.status === 'WITHDRAWN' ? null : confirmId === a.id ? (
                                <button className="danger" onClick={() => { void withdrawApp(a.id); setOpenId(null); setConfirmId(null); }}>Confirm withdraw?</button>
                              ) : (
                                <button className="danger" onClick={() => { setConfirmId(a.id); setAdvanceId(null); }}>Withdraw…</button>
                              )}
                            </div>
                          ) : null}
                        </span>
                      </span>
                    </div>
                    <Stepper app={a} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* saved jobs panel */}
        <Card label={`Saved jobs (${saved.length})`} action={
          <button className="btn btn-ghost btn-sm" onClick={() => go('jobs')}>View all <ArrowRightIcon width={14} /></button>
        }>
          {saved.length === 0 ? <p className="muted t-small" style={{ margin: 0 }}>No saved roles yet — bookmark roles in the feed.</p> :
            saved.map(j => (
              <div key={j.id} className="saved-row">
                <LogoImg file={j.logo} name={j.company} size={40} />
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <strong className="t-small ell">{j.title}</strong>
                  <span className="muted t-caption ell">{j.company}</span>
                  <span className="muted t-caption ell">{j.location} · {j.type}</span>
                  <span className="muted t-caption ell">{j.compensation}</span>
                </div>
                <div className="saved-side">
                  <span className="row" style={{ gap: 6 }}>
                    <span className="chip ok num">{j.match}%</span>
                    <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label={`Unsave ${j.title}`} aria-pressed
                      onClick={() => save(j.id)}>
                      <BookmarkSolid width={15} />
                    </button>
                  </span>
                  <span className="muted t-caption">{j.savedAt ? `Saved ${ago(j.savedAt)}` : 'Saved'}</span>
                </div>
              </div>
            ))}
        </Card>
      </div>
    </div>
  );
}
