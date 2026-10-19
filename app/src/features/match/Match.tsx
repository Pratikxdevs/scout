import { useMemo, useState } from 'react';
import {
  ArrowRightIcon, ArrowsUpDownIcon, BookmarkIcon, BriefcaseIcon,
  ClockIcon, Cog6ToothIcon, ComputerDesktopIcon, MagnifyingGlassIcon, MapPinIcon,
} from '@heroicons/react/24/outline';
import { useStore } from '../../store';
import { Empty, LogoImg, stagger } from '../../components/ui';
import { SALARY_FLOORS, salaryPlus } from '../../lib/salary';
import type { Job } from '../../types';

type Mode = 'All' | 'Remote' | 'Hybrid' | 'On-site';
const MODES: { id: Mode; icon?: React.ReactNode }[] = [
  { id: 'All' },
  { id: 'Remote', icon: <ComputerDesktopIcon width={15} /> },
  { id: 'On-site', icon: <BriefcaseIcon width={15} /> },
  { id: 'Hybrid', icon: <ClockIcon width={15} /> },
];
const FAMILIES: { label: string; test: (t: string) => boolean }[] = [
  { label: 'Engineering', test: t => t.includes('engineer') },
  { label: 'Data', test: t => t.includes('data') },
  { label: 'Design', test: t => t.includes('design') },
  { label: 'Product', test: t => t.includes('product') },
  { label: 'Security', test: t => t.includes('secur') || t.includes('cyber') },
  { label: 'Mobile', test: t => t.includes('mobile') || t.includes('ios') || t.includes('android') },
  { label: 'Management', test: t => t.includes('manager') },
];

function lowerBound(comp: string): number {
  const m = comp.match(/\$(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function Match() {
  const { jobs, profile, select, save, go } = useStore();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<Mode>('All');
  const [family, setFamily] = useState('All roles');
  const [floor, setFloor] = useState(0);
  const [company, setCompany] = useState('All companies');
  const [sort, setSort] = useState('Match score');

  const topSkills = profile.skills.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
  const companies = useMemo(() => [...new Set(jobs.map(j => j.company))].sort(), [jobs]);
  // Only offer role families that actually occur in the current job list —
  // a filter that can only return nothing is never shown.
  const families = useMemo(() => FAMILIES.filter(f => jobs.some(j => f.test(j.title.toLowerCase()))), [jobs]);

  const list = useMemo(() => {
    const f = q.toLowerCase();
    const rows = jobs.filter(j => {
      if (f && !(j.title + ' ' + j.company + ' ' + j.location).toLowerCase().includes(f)) return false;
      if (mode === 'Remote' && !j.location.startsWith('Remote')) return false;
      if (mode === 'Hybrid' && !j.location.includes('Hybrid')) return false;
      if (mode === 'On-site' && !j.location.includes('On-site')) return false;
      if (family !== 'All roles' && !(FAMILIES.find(x => x.label === family)?.test(j.title.toLowerCase()) ?? true)) return false;
      if (floor > 0 && lowerBound(j.compensation) < floor) return false;
      if (company !== 'All companies' && j.company !== company) return false;
      return true;
    });
    const sorted = [...rows];
    if (sort === 'Salary') sorted.sort((a, b) => lowerBound(b.compensation) - lowerBound(a.compensation));
    else if (sort !== 'Newest') sorted.sort((a, b) => b.match - a.match);
    return sorted;
  }, [jobs, q, mode, family, floor, company, sort]);

  const whyFor = (j: Job): string => {
    if (topSkills.length === 0) return 'Add skills in Settings to sharpen this ranking';
    const hay = `${j.title} ${j.requirements.join(' ')} ${j.description}`.toLowerCase();
    const overlap = topSkills.filter(s => hay.includes(s.toLowerCase()));
    if (overlap.length === 0) return 'No top-skill overlap found — review the requirements';
    return `Covers your ${overlap.join(', ')} skill${overlap.length === 1 ? '' : 's'}`;
  };

  const clear = () => { setQ(''); setMode('All'); setFamily('All roles'); setFloor(0); setCompany('All companies'); };
  const filtersActive = q !== '' || mode !== 'All' || family !== 'All roles' || floor > 0 || company !== 'All companies';

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* banner */}
      <section className="card rise"><div className="card-pad row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="sec-label" style={{ margin: '0 0 6px' }}>Match ranking</p>
          <h1 className="t-display">Jobs ranked for you</h1>
          <p className="muted t-small" style={{ margin: '8px 0 0' }}>Ranked from your current feed by skill overlap with your profile. Refine the filters here anytime.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => go('settings')}><Cog6ToothIcon width={15} /> Edit preferences</button>
      </div></section>

      {/* filters */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="icon-field" style={{ flex: '1 1 220px', minWidth: 0 }}>
          <span aria-hidden="true" className="icon-field-ic"><MagnifyingGlassIcon width={16} /></span>
          <input aria-label="Search roles, companies or keywords" placeholder="Search roles, companies or keywords..."
            value={q} onChange={e => setQ(e.target.value)} />
        </span>
        {MODES.map(m => (
          <button key={m.id} className={mode === m.id ? 'btn btn-dark btn-sm' : 'btn btn-ghost btn-sm'}
            aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.icon}{m.id}
          </button>
        ))}
        <select aria-label="Role" value={family} onChange={e => setFamily(e.target.value)} style={{ width: 'auto' }}>
          <option>All roles</option>
          {families.map(f => <option key={f.label}>{f.label}</option>)}
        </select>
        <select aria-label="Minimum salary" value={floor} onChange={e => setFloor(Number(e.target.value))} style={{ width: 'auto' }}>
          <option value={0}>Any salary</option>
          {SALARY_FLOORS.map(f => <option key={f} value={f}>{salaryPlus(f)}</option>)}
        </select>
        <select aria-label="Company" value={company} onChange={e => setCompany(e.target.value)} style={{ width: 'auto', maxWidth: 170 }}>
          <option>All companies</option>
          {companies.map(c => <option key={c}>{c}</option>)}
        </select>
        <span className="row" style={{ marginLeft: 'auto', gap: 6 }}>
          {filtersActive ? <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button> : null}
          <ArrowsUpDownIcon width={15} className="muted" />
          <select aria-label="Sort by" value={sort} onChange={e => setSort(e.target.value)} style={{ width: 'auto' }}>
            <option>Match score</option><option>Newest</option><option>Salary</option>
          </select>
        </span>
      </div>

      {/* ranked roles */}
      {list.length === 0 ? <div className="card"><Empty title="No roles match those filters." action="Clear filters" onAction={clear} /></div> :
        list.map((j, i) => (
          <article key={j.id} className="card rise match-card" style={stagger(i)}>
            <LogoImg file={j.logo} name={j.company} size={64} />
            <div style={{ minWidth: 0 }}>
              <strong className="t-h3 ell">{j.title}</strong>
              <span className="row t-small" style={{ gap: 5 }}>{j.company}</span>
              <span className="muted t-caption ell"><MapPinIcon width={13} style={{ display: 'inline', verticalAlign: -2 }} /> {j.location} · {j.type}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <span className="row" style={{ gap: 10 }}>
                <span className="chip ok num">{j.match}% match</span>
                <span className="match-bar"><span style={{ width: `${j.match}%` }} /></span>
              </span>
              <ul className="match-why">
                <li>{whyFor(j)}</li>
                <li>{j.requirements[0] ? `Top requirement: ${j.requirements[0]}` : 'No requirements listed for this role'}</li>
              </ul>
            </div>
            <div className="match-side">
              <div><strong className="t-small num">{j.compensation}</strong>
                <span className="muted t-caption">{j.posted}</span></div>
              <span className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost btn-icon" title={j.isSaved ? 'Saved' : 'Save role'}
                  aria-label={j.isSaved ? 'Unsave role' : 'Save role'} aria-pressed={!!j.isSaved} onClick={() => save(j.id)}>
                  <BookmarkIcon width={18} fill={j.isSaved ? 'currentColor' : 'none'} />
                </button>
                <button className="btn btn-dark btn-sm" onClick={() => select(j)}>View job <ArrowRightIcon width={14} /></button>
              </span>
            </div>
          </article>
        ))}
    </div>
  );
}
