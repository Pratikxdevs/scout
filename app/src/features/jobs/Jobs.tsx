import { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkIcon as BookmarkSolid } from '@heroicons/react/24/solid';
import {
  BookmarkIcon, ArrowRightIcon, MapPinIcon, BriefcaseIcon,
  CurrencyDollarIcon, ChartBarIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { useStore, todayStr } from '../../store';
import { Card, Empty, FormNote, LastUpdated, LogoImg, Pager, Status, stagger } from '../../components/ui';
import { DemoJobService } from '../../services/demo';
import { appliesToday } from '../../lib/caps';
import { EMPTY_FILTERS, Filters, type FilterState } from './Filters';
import { ApplyConfirmDialog } from './ApplyConfirm';

/** Refresh/share-safe filters: read once from ?kw=&loc=&… on mount. */
function readFiltersFromUrl(): FilterState {
  try {
    const p = new URLSearchParams(location.search);
    const num = (v: string | null) => {
      if (v == null || v === '') return null;
      const n = Number.parseInt(v, 10);
      return Number.isNaN(n) ? null : n;
    };
    return {
      ...EMPTY_FILTERS,
      kw: p.get('kw') ?? '',
      loc: p.get('loc') ?? '',
      remote: p.get('remote') !== '0',
      savedOnly: p.get('saved') === '1',
      sort: p.get('sort') === 'new' ? 'new' : 'match',
      salaryMin: num(p.get('smin')),
      salaryMax: (() => {
        const min = num(p.get('smin'));
        const max = num(p.get('smax'));
        // Repair an inverted pair from a hand-edited URL — the UI can't
        // produce one, and the query must never receive one.
        return min !== null && max !== null && min > max ? null : max;
      })(),
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

export function Jobs() {
  const { jobs, apps, search, save, select, selected, profile, scannedAt, backend, go, liveSearch, runLiveSearch, cancelLiveSearch, authed, setSearch } = useStore();
  const [f, setF] = useState<FilterState>(readFiltersFromUrl);
  const [page, setPage] = useState(1);
  // Inner feed scroller keeps its own scrollTop across filters/pages —
  // window.scrollTo in go() never touches it, so stale positions clip the
  // first card under the filter bar. Reset on every result-set change.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);
  const patch = (p: Partial<FilterState>, resetPage = true) => {
    setF(prev => ({ ...prev, ...p }));
    if (resetPage) setPage(1);
  };
  const clear = () => { setF(EMPTY_FILTERS); setPage(1); setSearch(''); };
  const startSearch = () => {
    const q = search.trim() || `${profile.roles.join(' ')} ${profile.skills}`.trim() || 'software engineer';
    void runLiveSearch(q, f.loc.trim());
  };
  // First open with a backend and no rows: run the scraper pipeline once
  // for the hero-search query (or the profile default). The ref survives
  // StrictMode double-mount so only one search is ever queued.
  const started = useRef(false);
  useEffect(() => {
    if (!backend || !authed || jobs.length > 0 || liveSearch.state !== 'idle' || started.current) return;
    if (liveSearch.message !== '') return;
    started.current = true;
    startSearch();
    // Mount-time values only — later filter typing never re-triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, authed, jobs.length, liveSearch.state]);
  const filtered = useMemo(
    () => DemoJobService.query(jobs, {
      search, keyword: f.kw, location: f.loc, includeRemote: f.remote,
      savedOnly: f.savedOnly, sort: f.sort, salaryMin: f.salaryMin, salaryMax: f.salaryMax,
    }),
    [jobs, search, f]);
  const per = 25;
  const { rows: cur, pages: total } = DemoJobService.paginate(filtered, page, per);
  useEffect(() => {
    if (page > total) setPage(total);
  }, [page, total]);
  useEffect(() => {
    try {
      const p = new URLSearchParams();
      if (f.kw) p.set('kw', f.kw);
      if (f.loc) p.set('loc', f.loc);
      if (!f.remote) p.set('remote', '0');
      if (f.savedOnly) p.set('saved', '1');
      if (f.sort !== 'match') p.set('sort', f.sort);
      if (f.salaryMin != null) p.set('smin', String(f.salaryMin));
      if (f.salaryMax != null) p.set('smax', String(f.salaryMax));
      const qs = p.toString();
      window.history.replaceState({}, '', location.pathname + (qs ? `?${qs}` : location.hash));
    } catch {
      /* private mode — filters still work in memory */
    }
  }, [f]);
  useEffect(() => {
    setFlash(true);
    scrollRef.current?.scrollTo({ top: 0 });
    const t = setTimeout(() => setFlash(false), 400);
    return () => clearTimeout(t);
  }, [f, search, page]);
  return (
    <div className="jobs-page">
      <section className="card rise jobs-banner">
        <div className="card-pad hero-body" style={{ position: 'relative' }}>
          <p className="sec-label" style={{ margin: '0 0 6px' }}>Search</p>
          <h1 className="t-display">Find jobs</h1>
          <p className="muted t-small" style={{ margin: '8px 0 0' }}>Discover roles that match your skills and career goals.</p>
        </div>
      </section>
      <div className="layout-3col">
        <div className="jobs-filters">
          <Filters value={f} onChange={patch} onClear={clear} />
        </div>
        <div className="jobs-feed">
          <div className="jobs-feed-bar row" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" aria-pressed={f.savedOnly} onClick={() => patch({ savedOnly: !f.savedOnly })}>
              {f.savedOnly ? <BookmarkSolid width={15} /> : <BookmarkIcon width={15} />} Saved ({jobs.filter(j => j.isSaved).length})</button>
            <button className="btn btn-ghost" onClick={() => go('search')}>✦ New search</button>
            {backend && liveSearch.state === 'running' ? (
              <span className="row" style={{ gap: 6 }}>
                <span className="muted t-caption" role="status" aria-live="polite">{liveSearch.message}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => { void cancelLiveSearch(); }}>Cancel</button>
              </span>
            ) : null}
            <span className="muted t-caption" style={{ marginLeft: 'auto' }} aria-live="polite">{filtered.length} roles</span>
            <LastUpdated at={scannedAt} prefix="Scanned" />
          </div>
          <div className="jobs-feed-scroll" ref={scrollRef}>
          {flash ? (
            <div className="card" aria-busy="true" aria-label="Updating results"><div className="card-pad" style={{ display: 'grid', gap: 8 }}>
              {[0, 1, 2].map(i => <div key={i} className="animate-pulse" style={{ height: 76, borderRadius: 12, background: 'var(--paper)', border: '1px solid var(--border)' }} />)}
            </div></div>
          ) : filtered.length === 0 ? (
            !backend
              ? <div className="card"><Empty title="Backend not configured — connect the backend to load live roles." /></div>
              : liveSearch.state === 'running'
                ? <div className="card"><div className="card-pad" role="status" aria-live="polite">
                    <p className="t-small" style={{ margin: 0 }}>{liveSearch.message}</p>
                    <p className="muted t-small" style={{ margin: '8px 0 0' }}>Real scrapers are running — this can take a couple of minutes.</p>
                  </div></div>
                : liveSearch.state === 'error'
                  ? <div className="card"><Empty
                      title={liveSearch.message}
                      action={liveSearch.code === 'SEARCH_ACTIVE' ? 'Cancel stuck search' : 'Retry search'}
                      onAction={liveSearch.code === 'SEARCH_ACTIVE'
                        ? () => { void cancelLiveSearch().then(() => startSearch()); }
                        : startSearch}
                    /></div>
                  : jobs.length === 0
                    ? <div className="card"><Empty title="No live roles found for that search — try different keywords." action="New search" onAction={() => go('search')} /></div>
                    : <div className="card"><Empty title="No roles match those filters." action="Clear filters" onAction={clear} /></div>
          ) : cur.map((j, i) => {
            const applied = apps.some(a => a.jobId === j.id);
            const active = selected?.id === j.id;
            return (
              <article key={j.id} className={'card rise card-clickable' + (active ? ' card-active' : '')} onClick={() => select(j)}
                style={stagger(i)}>
                <div className="card-pad row" style={{ gap: 14 }}>
                  <LogoImg file={j.logo} name={j.company} size={46} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <strong className="t-h3">{j.title}</strong>
                      <Status kind={j.match >= 85 ? 'ok' : j.match >= 75 ? 'info' : 'warn'}>{j.match}% match</Status>
                    </div>
                    <div className="muted t-small" style={{ marginTop: 3 }}>{j.company} · {j.location} · {j.type} · {j.compensation}</div>
                  </div>
                  <span className="row">
                    {applied ? <Status kind="ok">Applied</Status> : null}
                    <button className="icon-btn" title={j.isSaved ? 'Unsave' : 'Save'} aria-label={j.isSaved ? 'Unsave' : 'Save'}
                      aria-pressed={!!j.isSaved} onClick={e => { e.stopPropagation(); save(j.id); }}>
                      {j.isSaved ? <BookmarkSolid width={18} /> : <BookmarkIcon width={18} />}</button>
                    <button className="icon-btn" title="Open role details" aria-label={`Open ${j.title}`} onClick={e => { e.stopPropagation(); select(j); }}><ArrowRightIcon width={18} /></button>
                  </span>
                </div>
              </article>
            );
          })}
          </div>
          <div className="jobs-pager">
            <Pager page={page} pages={total}
              range={filtered.length ? `${(page - 1) * per + 1}–${Math.min(page * per, filtered.length)} of ${filtered.length}` : '0 roles'}
              onPage={setPage} />
          </div>
        </div>
        <div className="jobs-spot">
          <JobSidePanel />
        </div>
      </div>
    </div>
  );
}

function JobSidePanel() {
  const { jobs, apps, selected, save, usage, backend } = useStore();
  const [msg, setMsg] = useState('');
  const [confirming, setConfirming] = useState(false);
  const j = selected ?? jobs[0];
  if (!j) return null;
  const applied = apps.some(a => a.jobId === j.id);
  const { used, cap } = appliesToday(backend, usage, apps, todayStr());
  const capReached = !applied && used >= cap;
  const err = /cap|already|not found/i.test(msg);
  const details = [
    { label: 'Location', value: j.location, icon: <MapPinIcon width={16} />, tint: 'spot2-tint-grey' },
    { label: 'Employment type', value: j.type, icon: <BriefcaseIcon width={16} />, tint: 'spot2-tint-green' },
    { label: 'Compensation', value: j.compensation, icon: <CurrencyDollarIcon width={16} />, tint: 'spot2-tint-tan' },
    { label: 'Match score', value: `${j.match}%`, icon: <ChartBarIcon width={16} />, tint: 'spot2-tint-dark' },
  ];
  return (
    <Card className="spot2">
      <div className="spot2-head">
        <LogoImg file={j.logo} name={j.company} size={56} />
        <div className="spot2-title">
          <h3 className="spot2-name">{j.title}</h3>
          <p className="spot2-co">{j.company}</p>
        </div>
        <button className="spot2-saveicon" title={j.isSaved ? 'Unsave' : 'Save'} aria-label={j.isSaved ? `Unsave ${j.title}` : `Save ${j.title}`}
          aria-pressed={!!j.isSaved} onClick={() => save(j.id)}>
          {j.isSaved ? <BookmarkSolid width={18} /> : <BookmarkIcon width={18} />}
        </button>
      </div>
      <div className="spot2-cta">
        <button className="spot2-apply" disabled={applied || capReached}
          title={capReached ? 'Daily cap reached — resets tomorrow' : undefined}
          onClick={() => setConfirming(true)}>
          {applied ? 'Submitted ✓' : capReached ? `Daily cap reached (${cap}/day)` : <>Review &amp; apply <ArrowRightIcon width={17} /></>}
        </button>
      </div>
      <p className="muted t-caption" style={{ margin: '8px 0 0', textAlign: 'center' }}>{used} of {cap} applies used today</p>
      {msg ? <FormNote kind={err ? 'err' : 'ok'}>{msg}</FormNote> : null}
      {confirming ? <ApplyConfirmDialog job={j} onClose={() => setConfirming(false)} onDone={setMsg} /> : null}
      <div className="spot2-sec-quick">
        <p className="sec-label" style={{ margin: '0 0 6px' }}>Quick details</p>
        <div>
          {details.map(d => (
            <div key={d.label} className="spot2-row">
              <span className={`spot2-ic ${d.tint}`}>{d.icon}</span>
              <span className="muted t-small spot2-rowlabel">{d.label}</span>
              <strong className="t-small">{d.value}</strong>
              <ChevronRightIcon width={16} className="muted" aria-hidden="true" style={{ flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="spot2-sec-about">
        <p className="sec-label" style={{ margin: '0 0 8px' }}>About the role</p>
        <p className="spot2-about">{j.description || 'No description was provided for this role.'}</p>
      </div>
      <div className="spot2-sec-stack">
        <p className="sec-label" style={{ margin: '0 0 8px' }}>Tech stack</p>
        <div className="spot2-stack">
          {j.requirements.map(r => <span key={r} className="spot2-chip">{r}</span>)}
        </div>
      </div>
    </Card>
  );
}
