import { useEffect, useRef, useState } from 'react';
import {
  ArrowRightIcon, BriefcaseIcon, CheckIcon, EnvelopeIcon, MagnifyingGlassIcon, MapPinIcon, UserIcon,
} from '@heroicons/react/24/outline';
import { useStore } from '../../store';
import { COUNTRIES } from '../../lib/countries';
import { initialsFor } from '../../lib/profileSync';
import { isValidEmail } from '../../lib/validate';
import { ChipInput, EditableAvatar, stagger } from '../../components/ui';

/* Onboarding (3 steps): Scout's ICP wizard. A freelancer tells Scout what
 * they sell, who they sell to, and what a good engagement looks like. That
 * profile drives query planning (backend SPEC §4) and lead scoring
 * (SPEC §8). No resume, no enrichment — every field is typed directly and
 * everything stays editable in Settings. A live preview mirrors each step
 * so the ICP being built is never abstract. */

const WIZ_STEPS = ['You', 'Services', 'Targeting'];
const WIZ_WORK = ['Remote', 'Hybrid', 'On-site'];
/** Per-engagement deal sizes the user targets (USD, client-side presets). */
const WIZ_BUDGET = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const fmtMoney = (n: number): string => (n >= 1000 ? '$' + (n / 1000).toString().replace(/\.0$/, '') + 'k' : '$' + n);

const STEP_HEAD = [
  { title: 'Your basics', sub: 'Who you are and where you work — used to prefill outreach drafts.' },
  { title: 'What you sell', sub: 'Services and tools; these seed the hunt query planning.' },
  { title: 'Who you target', sub: 'Client types, search phrases and the deal sizes worth hunting.' },
] as const;

const STEP_ICON = [UserIcon, BriefcaseIcon, MagnifyingGlassIcon];

function withCurrent(list: string[], cur: string) {
  return cur && !list.includes(cur) ? [cur, ...list] : list;
}

function budgetLabel(lo: number | null, hi: number | null): string {
  if (lo !== null && hi !== null) return fmtMoney(lo) + '–' + fmtMoney(hi) + ' per project';
  if (lo !== null) return fmtMoney(lo) + '+ per project';
  if (hi !== null) return 'Up to ' + fmtMoney(hi) + ' per project';
  return 'Budgets open — any deal size counts';
}

export function Onboarding() {
  const { profile, onboarded, update, onboard, setAvatarPhoto } = useStore();
  const [n, setN] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [d, setD] = useState(() => ({
    name: profile.name, email: profile.email, country: profile.country, city: profile.city, summary: profile.summary,
    services: profile.services ?? [], skills: profile.skills ? profile.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
    industries: profile.industries ?? [], keywords: profile.keywords ?? [],
    workType: profile.location || 'Remote', remote: profile.remote,
    minBudget: profile.minBudget ?? null, maxBudget: profile.maxBudget ?? null,
  }));
  const touched = useRef(false);

  // Late hydration (the server profile lands a round trip after login)
  // refills the draft, but only while the user hasn't typed anything.
  useEffect(() => {
    if (touched.current || onboarded) return;
    setD(prev => ({
      ...prev,
      name: profile.name || prev.name, email: profile.email || prev.email,
      country: profile.country || prev.country, city: profile.city || prev.city,
    }));
  }, [profile, onboarded]);

  const patch = (p: Partial<typeof d>) => { touched.current = true; setD(prev => ({ ...prev, ...p })); };
  const countryNames = COUNTRIES.map(c => c.name);

  const toProfile = () => ({
    name: d.name, email: d.email, country: d.country, city: d.city, summary: d.summary,
    roles: d.services, services: d.services, industries: d.industries, keywords: d.keywords,
    location: d.workType, remote: d.remote, minBudget: d.minBudget, maxBudget: d.maxBudget,
    skills: d.skills.join(', '), resume: '',
  });

  // Autosave progress (debounced) once the user has actually typed: the
  // draft persists through the profile store, so a reload keeps the wizard
  // where it was.
  useEffect(() => {
    if (!touched.current) return;
    const t = window.setTimeout(() => update(toProfile()), 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const emailOk = d.email.trim() !== '' && isValidEmail(d.email);
  const minOk = d.minBudget === null || d.maxBudget === null || d.minBudget <= d.maxBudget;
  const missing = n === 0
    ? [!d.name.trim() && 'your name', !emailOk && 'a valid email'].filter(Boolean)
    : n === 1
      ? [d.services.length === 0 && 'at least one service'].filter(Boolean)
      : [d.industries.length === 0 && 'at least one target industry', !minOk && 'a valid budget range'].filter(Boolean);
  const canAdvance = missing.length === 0;

  const pickAvatar = async (file: File) => {
    setAvatarBusy(true);
    try { await setAvatarPhoto(file); } finally { setAvatarBusy(false); }
  };

  return (
    <div className="wiz-wrap">
      <header style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
        <h1 className="t-display" style={{ margin: 0 }}>Build your ICP</h1>
        <p className="muted t-small" style={{ margin: 0 }}>
          Scout's operating brief — how hunts get planned and how every lead gets scored. Everything stays editable in Settings.
        </p>
      </header>

      <ol className="wiz-steps" aria-label="Wizard progress">
        {WIZ_STEPS.map((s, i) => (
          <li key={s} className="wiz-step" data-state={i < n ? 'done' : i === n ? 'now' : 'todo'}>
            <span className="wiz-dot">{i < n ? <CheckIcon width={15} /> : i + 1}</span>
            <span className="wiz-name">{s}</span>
            {i < WIZ_STEPS.length - 1 ? (
              <span className="wiz-bar" aria-hidden="true"><span style={{ width: i < n ? '100%' : i === n ? '35%' : '0%' }} /></span>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="wiz-grid">
        {/* live preview — one surface that mirrors every step's edits */}
        <section className="card rise" style={stagger(0)} aria-live="polite"><div className="card-pad" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <p className="sec-label" style={{ margin: 0 }}>Live ICP preview</p>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 8, textAlign: 'center' }}>
            <EditableAvatar url={profile.avatarUrl} initials={initialsFor(d.name, '')}
              size={96} busy={avatarBusy} onPick={pickAvatar} />
            <h2 className="t-h1" style={{ margin: 0 }}>{d.name.trim() || 'Your name'}</h2>
            <p className="muted t-small" style={{ margin: 0 }}>
              {d.services.length > 0 ? d.services.join(' · ') : 'Add the services you sell in step 2'}
            </p>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <h3 className="t-h3">Intro</h3>
            <p className="muted t-small" style={{ margin: '6px 0 0' }}>
              {d.summary.trim() || 'A one-line intro of what you do and who you do it for.'}
            </p>
          </div>
          <div>
            <h3 className="t-h3">Clients you're hunting</h3>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              {d.industries.length > 0
                ? d.industries.map(s => <span key={s} className="prev-pill">{s}</span>)
                : <span className="muted t-caption">No target client types yet — add them in step 3.</span>}
            </div>
            {d.keywords.length > 0 ? (
              <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
                {d.keywords.map(k => <span key={k} className="prev-pill mono t-micro">{k}</span>)}
              </div>
            ) : null}
          </div>
          <div>
            <h3 className="t-h3">Skills</h3>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              {d.skills.length > 0
                ? d.skills.map(s => <span key={s} className="prev-pill">{s}</span>)
                : <span className="muted t-caption">No skills yet — add them in step 2.</span>}
            </div>
          </div>
          <p className="muted t-caption" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, margin: 0 }}>
            {[d.city, d.country].filter(Boolean).join(', ') || 'Set your location in step 1'}
            {' · '}{d.workType}
            {' · '}{budgetLabel(d.minBudget, d.maxBudget)}
          </p>
        </div></section>

        {/* step panel */}
        <section className="card rise" style={stagger(1)}><div className="card-pad" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <div key={n} className="wiz-step-in" style={{ display: 'grid', gap: 4 }}>
            <h2 className="t-h1" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
              <span style={{ display: 'inline-flex', width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--ink) 7%, transparent)' }} aria-hidden="true">
                {(() => { const I = STEP_ICON[n]; return <I width={17} />; })()}
              </span>
              {STEP_HEAD[n].title}
            </h2>
            <p className="muted t-small" style={{ margin: 0 }}>{STEP_HEAD[n].sub}</p>
          </div>

          <div key={'body-' + n} className="wiz-step-in" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            {n === 0 ? (<>
              <div className="row" style={{ gap: 12 }}>
                <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 10 }}>
                  <label className="lbl" htmlFor="wiz-name">Your name</label>
                  <span className="icon-field">
                    <span aria-hidden="true" className="icon-field-ic"><UserIcon width={16} /></span>
                    <input id="wiz-name" placeholder="e.g. Maya Lane" value={d.name} onChange={e => patch({ name: e.target.value })} />
                  </span>
                </span>
                <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 10 }}>
                  <label className="lbl" htmlFor="wiz-email">Email</label>
                  <span className="icon-field">
                    <span aria-hidden="true" className="icon-field-ic"><EnvelopeIcon width={16} /></span>
                    <input id="wiz-email" type="email" placeholder="you@studio.com" value={d.email}
                      onChange={e => patch({ email: e.target.value })}
                      aria-invalid={d.email.trim() !== '' && !emailOk || undefined} />
                  </span>
                </span>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 10 }}>
                  <label className="lbl" htmlFor="wiz-city">City</label>
                  <span className="icon-field">
                    <span aria-hidden="true" className="icon-field-ic"><MapPinIcon width={16} /></span>
                    <input id="wiz-city" placeholder="City" value={d.city} onChange={e => patch({ city: e.target.value })} />
                  </span>
                </span>
                <span style={{ flex: '2 1 60%', minWidth: 0, display: 'grid', gap: 10 }}>
                  <label className="lbl" htmlFor="wiz-country">Country</label>
                  <input id="wiz-country" list="wiz-countries" placeholder="Country" value={d.country}
                    onChange={e => patch({ country: e.target.value })} />
                  <datalist id="wiz-countries">
                    {countryNames.map(c => <option key={c} value={c} />)}
                  </datalist>
                </span>
              </div>
              <div>
                <label className="lbl" htmlFor="wiz-summary">One-line intro</label>
                <textarea id="wiz-summary" rows={3} placeholder="What do you do, and who do you do it for?"
                  value={d.summary} onChange={e => patch({ summary: e.target.value })} />
              </div>
            </>) : null}

            {n === 1 ? (<>
              <div>
                <label className="lbl" htmlFor="wiz-services">Services you sell</label>
                <ChipInput id="wiz-services" values={d.services} max={10} onChange={services => patch({ services })}
                  placeholder="Type a service, press Enter (up to 10)" />
              </div>
              <div>
                <label className="lbl" htmlFor="wiz-skills">Skills / tools</label>
                <ChipInput id="wiz-skills" values={d.skills} max={12} onChange={v => patch({ skills: v })}
                  placeholder="python, figma, next.js..." />
              </div>
            </>) : null}

            {n === 2 ? (<>
              <div>
                <label className="lbl" htmlFor="wiz-industries">Target industries / client types</label>
                <ChipInput id="wiz-industries" values={d.industries} max={10}
                  onChange={industries => patch({ industries })} placeholder="e.g. SaaS, ecommerce..." />
              </div>
              <div>
                <label className="lbl" htmlFor="wiz-keywords">Search phrases to look for</label>
                <ChipInput id="wiz-keywords" values={d.keywords} max={6} onChange={keywords => patch({ keywords })}
                  placeholder='e.g. "webflow developer wanted"' />
              </div>
              <div className="row" style={{ gap: 12, alignItems: 'end' }}>
                <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 10 }}>
                  <label className="lbl" htmlFor="wiz-budget-min">Budget from</label>
                  <select id="wiz-budget-min" className="num" value={d.minBudget ?? ''} onChange={e => patch({ minBudget: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">Any</option>
                    {WIZ_BUDGET.map(b => <option key={b} value={b}>{fmtMoney(b)}</option>)}
                  </select>
                </span>
                <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 10 }}>
                  <label className="lbl" htmlFor="wiz-budget-max">Budget up to</label>
                  <select id="wiz-budget-max" className="num" value={d.maxBudget ?? ''} onChange={e => patch({ maxBudget: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">Any</option>
                    {WIZ_BUDGET.map(b => <option key={b} value={b}>{fmtMoney(b)}</option>)}
                  </select>
                </span>
                <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 10 }}>
                  <label className="lbl" htmlFor="wiz-work">Work setup</label>
                  <select id="wiz-work" value={d.workType} onChange={e => patch({ workType: e.target.value })}>
                    {withCurrent(WIZ_WORK, d.workType).map(r => <option key={r}>{r}</option>)}
                  </select>
                </span>
              </div>
              {!minOk ? <p className="field-err" style={{ margin: 0 }}>Minimum budget must be at most the maximum.</p> : null}
            </>) : null}
          </div>

          {!canAdvance ? (
            <p className="field-hint" role="status" style={{ margin: 0 }}>
              {n < WIZ_STEPS.length - 1
                ? 'To continue, add ' + missing.join(' and ') + '.'
                : 'To finish, add ' + missing.join(' and ') + '.'}
            </p>
          ) : null}

          <div className="row" style={{ justifyContent: n > 0 ? 'space-between' : 'flex-end', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            {n > 0 ? <button className="btn btn-ghost" onClick={() => setN(n - 1)}>Back</button> : null}
            <span className="row" style={{ gap: 10 }}>
              {n < WIZ_STEPS.length - 1 ? (<>
                <span className="muted t-caption">Progress autosaves</span>
                <button className="btn" disabled={!canAdvance} onClick={() => setN(n + 1)}>Continue <ArrowRightIcon width={15} /></button>
              </>) : (
                <button className="btn" disabled={!canAdvance} onClick={() => onboard(toProfile())}>Finish → Dashboard</button>
              )}
            </span>
          </div>
        </div></section>
      </div>
    </div>
  );
}
