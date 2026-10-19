import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightIcon, ArrowUpRightIcon, BuildingOffice2Icon, CalendarDaysIcon,
  ChevronRightIcon, EnvelopeIcon, GlobeAltIcon, MagnifyingGlassIcon, MapPinIcon,
} from '@heroicons/react/24/outline';
import { useStore } from '../../store';
import type { CompanyLog } from '../../types';
import { Empty, LogoImg, stagger } from '../../components/ui';
import { buildCompanyCatalog } from '../../data/companies';
import { HttpCompanyService } from '../../services/http';
import { nextId } from '../../services/demo';

const httpCo = new HttpCompanyService();

type HubTab = 'overview' | 'roles' | 'contacts' | 'log' | 'insights';

export function Companies() {
  const { setSearch, go, jobs, apps, replies, sent, select, backend } = useStore();
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('All');
  const [sel, setSel] = useState<string | null>(null);
  const [hubTab, setHubTab] = useState<HubTab>('overview');
  // Live activity only: user-authored notes start empty; backend rows merge
  // in per selected company (effect below). No seed logs, ever.
  const [logs, setLogs] = useState<Record<string, CompanyLog[]>>({});
  const [logOpen, setLogOpen] = useState(false);
  const [logTarget, setLogTarget] = useState('');
  const [logStatus, setLogStatus] = useState<'APPROVED' | 'PENDING'>('APPROVED');
  const chipsRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => buildCompanyCatalog(jobs), [jobs]);
  const sectors = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of all) m.set(c.sector, (m.get(c.sector) ?? 0) + 1);
    return [...m.entries()];
  }, [all]);
  const list = all.filter(c =>
    (sector === 'All' || c.sector === sector) &&
    (c.name + ' ' + c.sector + ' ' + c.segment).toLowerCase().includes(q.toLowerCase()));
  const cur = (sel && all.some(c => c.name === sel) ? sel : list[0]?.name) ?? null;
  const co = cur ? all.find(x => x.name === cur)! : null;

  const roles = useMemo(() => {
    if (!cur) return [];
    const low = cur.toLowerCase();
    return jobs.filter(j => j.company.toLowerCase() === low);
  }, [jobs, cur]);
  const contacts = useMemo(() => {
    if (!cur) return [];
    const low = cur.toLowerCase();
    const fromReplies = replies
      .filter(r => r.from.toLowerCase().includes(low))
      .map(r => ({ id: r.id, name: r.from, context: r.subject, meta: r.at, kind: 'reply' as const }));
    const fromSent = sent
      .filter(s => (s.company ?? '').toLowerCase().includes(low))
      .map(s => ({ id: s.id, name: s.to || 'Recruiter', context: s.subject, meta: s.sentAt, kind: 'email' as const }));
    return [...fromReplies, ...fromSent];
  }, [replies, sent, cur]);
  const entries = cur ? logs[cur] ?? [] : [];

  // Live activity per selected company (server draft rows only; no seeds).
  useEffect(() => {
    if (!backend || cur === null) return;
    let live = true;
    void httpCo.logsRemote(cur).then((rows) => {
      if (!live || rows.length === 0) return;
      setLogs((p) => ({ ...p, [cur]: [...(p[cur] ?? []), ...rows] }));
    });
    return () => { live = false; };
  }, [backend, cur]);

  const viewRoles = (name: string) => { setSearch(name); go('jobs'); };
  const pick = (name: string) => { setSel(name); setHubTab('overview'); setLogOpen(false); };
  // Entries are user-authored: the form collects what actually happened
  // before anything is added (no fabricated rows).
  const submitLog = () => {
    if (!cur || logTarget.trim() === '') return;
    setLogs(p => ({
      ...p,
      [cur]: [{ id: nextId('LOG'), actor: 'You', target: logTarget.trim(), status: logStatus, when: 'just now' }, ...(p[cur] ?? [])],
    }));
    setLogTarget('');
    setLogStatus('APPROVED');
    setLogOpen(false);
  };
  const openLogForm = () => { setHubTab('log'); setLogOpen(true); };

  const hubTabs: { id: HubTab; label: string }[] = co ? [
    { id: 'overview', label: 'Overview' },
    { id: 'roles', label: `Open roles (${roles.length})` },
    { id: 'contacts', label: `Contacts (${contacts.length})` },
    { id: 'log', label: `Outreach log (${entries.length})` },
    { id: 'insights', label: 'Insights' },
  ] : [];
  const coApps = co ? apps.filter(a => a.company === co.name).length : 0;
  const coReplies = contacts.filter(c => c.kind === 'reply').length;
  const avgMatch = roles.length ? Math.round(roles.reduce((s, j) => s + j.match, 0) / roles.length) : 0;

  const roleCard = (limit?: number) => (limit ? roles.slice(0, limit) : roles).map(j => (
    <div key={j.id} className="role-card">
      <LogoImg file={j.logo} name={j.company} size={40} />
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <strong className="t-small ell">{j.title}</strong>
        <span className="muted t-caption ell">{j.location} · {j.type} · {j.compensation}</span>
      </div>
      <span className="row" style={{ gap: 8, flexShrink: 0 }}>
        <span className="chip ok num">{j.match}% match</span>
        <button className="btn btn-ghost btn-sm" onClick={() => select(j)}>View <ArrowRightIcon width={14} /></button>
      </span>
    </div>
  ));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* banner — shared art system */}
      <section className="card rise apps-banner">
        <div className="card-pad hero-body">
          <p className="sec-label" style={{ margin: '0 0 6px' }}>Companies</p>
          <h1 className="t-display">Explore companies</h1>
          <p className="muted t-small" style={{ margin: '8px 0 0' }}>Every employer in your current feed, with live role counts and your outreach history.</p>
        </div>
      </section>

      <div className="co-layout">
        {/* company list panel */}
        <section className="card"><div className="card-pad co-panel">
          <div className="row" style={{ gap: 10 }}>
            <span className="icon-field" style={{ flex: 1 }}>
              <span aria-hidden="true" className="icon-field-ic"><MagnifyingGlassIcon width={16} /></span>
              <input aria-label="Search companies" placeholder="Search companies, e.g. Stripe, Microsoft..." value={q} onChange={e => setQ(e.target.value)} />
            </span>
            <span className="muted t-caption" style={{ whiteSpace: 'nowrap' }}>{list.length} companies</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div ref={chipsRef} className="chip-scroll" role="group" aria-label="Filter by sector">
              <button className="ftab" data-on={sector === 'All'} onClick={() => setSector('All')}>All ({all.length})</button>
              {sectors.map(([s, n]) => (
                <button key={s} className="ftab ftab-soft" data-on={sector === s} onClick={() => setSector(s)}>{s} ({n})</button>
              ))}
            </div>
            <button className="icon-btn" title="More sectors" aria-label="Scroll sectors"
              onClick={() => chipsRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}>
              <ChevronRightIcon width={16} />
            </button>
          </div>
          {list.length === 0 ? <Empty title="No matching companies." action="Clear" onAction={() => { setQ(''); setSector('All'); }} /> :
            list.map((c, i) => (
              <button key={c.name} className="co-row" data-on={cur === c.name} style={stagger(i)}
                onClick={() => pick(c.name)} aria-pressed={cur === c.name}>
                <span className="mono muted t-micro">{String(i + 1).padStart(2, '0')}</span>
                <LogoImg file={c.logo} name={c.name} />
                <span style={{ flex: '1 1 auto', minWidth: 0, textAlign: 'left' }}>
                  <strong className="t-small ell">{c.name}</strong>
                  <span className="muted t-caption ell">{c.segment}{c.staff ? ` · ${c.staff} employees` : ''}</span>
                </span>
                <span className="muted t-caption co-open" style={{ whiteSpace: 'nowrap' }}>
                  {c.openRoles === 0 ? 'No roles in feed' : `${c.openRoles} open role${c.openRoles === 1 ? '' : 's'}`}
                </span>
                <span className="btn btn-ghost btn-sm">View <ArrowRightIcon width={14} /></span>
              </button>
            ))}
        </div></section>

        {/* company hub */}
        {!co ? <div className="card"><Empty title="Select a company." action="Clear filters" onAction={() => { setQ(''); setSector('All'); }} /></div> : (
          <section className="card rise"><div className="card-pad">
            <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                <LogoImg file={co.logo} name={co.name} size={56} />
                <div style={{ minWidth: 0 }}>
                  <h2 className="t-h1">{co.name}</h2>
                  <p className="muted t-small" style={{ margin: '4px 0 8px', maxWidth: 460 }}>{co.blurb ?? `${co.name} is hiring from your current feed.`}</p>
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <span className="pill">{co.sector}</span>
                    <span className="pill">{co.segment}</span>
                    {co.staff ? <span className="pill num">{co.staff} employees</span> : null}
                  </div>
                </div>
              </div>
              <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-sm" onClick={() => viewRoles(co.name)}>View open roles <ArrowRightIcon width={14} /></button>
                <button className="btn btn-ghost btn-sm" onClick={openLogForm}>+ Log entry</button>
              </span>
            </div>
            <div className="htab-row" role="tablist" aria-label="Company sections">
              {hubTabs.map(t => (
                <button key={t.id} role="tab" aria-selected={hubTab === t.id} className="htab" data-on={hubTab === t.id} onClick={() => setHubTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {hubTab === 'overview' ? (<>
              <div className="co-overview">
                <div style={{ minWidth: 0 }}>
                  <h3 className="t-h3">About</h3>
                  <p className="t-small" style={{ margin: '6px 0 10px' }}>{co.about ?? `${co.name} is hiring for roles in your current feed.`}</p>
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    {(co.tags ?? []).map(t => <span key={t} className="meta-pill">{t}</span>)}
                  </div>
                </div>
                <div className="card-inner co-facts">
                  {co.hq ? <p className="t-small" style={{ margin: 0 }}><MapPinIcon width={14} /> <span className="muted">Headquarters</span><br />{co.hq}</p> : null}
                  {co.website ? <p className="t-small" style={{ margin: 0 }}><GlobeAltIcon width={14} /> <span className="muted">Website</span><br />
                    <a className="link" href={co.website} target="_blank" rel="noreferrer">{co.website.replace('https://', '')} <ArrowUpRightIcon width={12} style={{ display: 'inline' }} /></a></p> : null}
                  {co.staff ? <p className="t-small" style={{ margin: 0 }}><BuildingOffice2Icon width={14} /> <span className="muted">Company size</span><br />{co.staff} employees</p> : null}
                  {co.founded ? <p className="t-small" style={{ margin: 0 }}><CalendarDaysIcon width={14} /> <span className="muted">Founded</span><br />{co.founded}</p> : null}
                  {!co.hq && !co.website && !co.staff && !co.founded ? <p className="muted t-small" style={{ margin: 0 }}>Company research is not available for this employer yet.</p> : null}
                </div>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
                <h3 className="t-h3" style={{ margin: 0 }}>Recent roles ({roles.length})</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setHubTab('roles')}>View all <ArrowRightIcon width={14} /></button>
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {roles.length === 0 ? <p className="muted t-small">No open roles in range right now.</p> : roleCard(4)}
              </div>
            </>) : hubTab === 'roles' ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                {roles.length === 0 ? <p className="muted t-small">No open roles in range right now.</p> : roleCard()}
              </div>
            ) : hubTab === 'contacts' ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                {contacts.length === 0 ? <p className="muted t-small">No contacts yet — send outreach or wait for replies.</p> :
                  contacts.map(c => (
                    <div key={c.kind + c.id} className="list-row">
                      <span className="side-ic"><EnvelopeIcon width={17} /></span>
                      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <strong className="t-small ell">{c.name}</strong>
                        <span className="muted t-caption ell">{c.context} · {c.meta}</span>
                      </div>
                      <span className="pill">{c.kind === 'reply' ? 'Reply' : 'Outreach'}</span>
                    </div>
                  ))}
              </div>
            ) : hubTab === 'log' ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span className="muted t-caption">{entries.length} entries</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setLogOpen(o => !o)}>+ Log entry</button>
                </div>
                {logOpen ? (
                  <div className="card-inner" style={{ display: 'grid', gap: 10 }}>
                    <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
                      <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                        <label className="lbl" htmlFor="co-log-what">Entry</label>
                        <input id="co-log-what" value={logTarget} placeholder="e.g. Intro email to their recruiter"
                          onChange={e => setLogTarget(e.target.value)} />
                      </span>
                      <span>
                        <label className="lbl" htmlFor="co-log-status">State</label>
                        <select id="co-log-status" value={logStatus} onChange={e => setLogStatus(e.target.value === 'PENDING' ? 'PENDING' : 'APPROVED')}>
                          <option value="APPROVED">Sent</option>
                          <option value="PENDING">Draft</option>
                        </select>
                      </span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <span className="muted t-caption">Notes are saved on this device.</span>
                      <span className="row" style={{ gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setLogOpen(false); setLogTarget(''); }}>Cancel</button>
                        <button className="btn btn-sm" disabled={logTarget.trim() === ''} onClick={submitLog}>Add entry</button>
                      </span>
                    </div>
                  </div>
                ) : null}
                {entries.length === 0 ? <p className="muted t-small">No outreach logged for {co.name} yet.</p> :
                  entries.map(l => (
                    <div key={l.id} className="list-row">
                      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <strong className="t-small ell">{l.actor} — {l.target}</strong>
                        <span className="muted t-caption ell">{l.id} · {l.when}</span>
                      </div>
                      <span className={`chip ${l.status === 'APPROVED' ? 'ok' : l.status === 'PENDING' ? 'warn' : 'bad'}`}>{l.status}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <>
                <div className="ov-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  {[
                    { v: String(roles.length), l: 'Open roles' },
                    { v: avgMatch ? `${avgMatch}%` : '—', l: 'Avg match' },
                    { v: String(coApps), l: 'Applications' },
                    { v: String(coReplies), l: 'Replies' },
                  ].map(s => (
                    <div key={s.l} className="card-inner ov-tile">
                      <strong className="num t-h2">{s.v}</strong>
                      <span className="muted t-caption">{s.l}</span>
                    </div>
                  ))}
                </div>
                <p className="muted t-caption">Computed live from your feed, applications and inbox.</p>
              </>
            )}
          </div></section>
        )}
      </div>
    </div>
  );
}
