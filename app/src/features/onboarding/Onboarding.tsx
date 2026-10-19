import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { useStore } from '../../store';
import { COUNTRIES } from '../../lib/countries';
import { isValidEmail } from '../../lib/validate';
import { ChipInput } from '../../components/ui';

/* Onboarding (3 steps): Scout's ICP wizard. A freelancer tells Scout what
 * they sell, who they sell to, and what a good engagement looks like. That
 * profile drives query planning (backend SPEC §4) and lead scoring
 * (SPEC §8). No resume, no enrichment — every field is typed directly and
 * everything stays editable in Settings. */

const WIZ_STEPS = ['You', 'Services', 'Targeting'];
const WIZ_WORK = ['Remote', 'Hybrid', 'On-site'];
/** Per-engagement deal sizes the user targets (USD, client-side presets). */
const WIZ_BUDGET = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const fmtMoney = (n: number) => (n >= 1000 ? `$${n / 1000 >= 1 ? (n / 1000).toString().replace(/\.0$/, '') + 'k' : n}` : `$${n}`);

export function Onboarding() {
  const { profile, onboarded, update, onboard } = useStore();
  const [n, setN] = useState(0);
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
  const budgetLabel = (v: number) => fmtMoney(v);

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

  return (
    <div className="auth-back">
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <p className="t-h2" style={{ margin: 0 }}>Build your ICP</p>
          <p className="muted t-small">Scout uses this to plan searches and score freelance leads. All fields stay editable.</p>
        </div>
        <section className="card" style={{ padding: 24 }}>
          <div className="row t-micro mono" style={{ justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            {WIZ_STEPS.map((label, i) => (
              <span key={label} className={i === n ? 'on' : ''}
                style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border)', background: i === n ? 'var(--ink)' : 'transparent', color: i === n ? 'var(--paper)' : 'inherit' }}>
                {i + 1}. {label}
              </span>
            ))}
          </div>

          {n === 0 ? (<>
            <div className="row" style={{ gap: 12 }}>
              <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 10 }}>
                <label className="lbl" htmlFor="wiz-name">Your name</label>
                <input id="wiz-name" placeholder="e.g. Maya Lane" value={d.name} onChange={e => patch({ name: e.target.value })} />
              </span>
              <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 10 }}>
                <label className="lbl" htmlFor="wiz-email">Email</label>
                <input id="wiz-email" placeholder="you@studio.com" value={d.email} onChange={e => patch({ email: e.target.value })} />
              </span>
            </div>
            <div className="row" style={{ gap: 12, marginBottom: 2 }}>
              <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 10 }}>
                <label className="lbl" htmlFor="wiz-city">City</label>
                <input id="wiz-city" placeholder="City" value={d.city} onChange={e => patch({ city: e.target.value })} />
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
                placeholder="Add a skill..." />
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
                <select id="wiz-budget-min" value={d.minBudget ?? ''} onChange={e => patch({ minBudget: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">Any</option>
                  {WIZ_BUDGET.map(b => <option key={b} value={b}>{budgetLabel(b)}</option>)}
                </select>
              </span>
              <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 10 }}>
                <label className="lbl" htmlFor="wiz-budget-max">Budget up to</label>
                <select id="wiz-budget-max" value={d.maxBudget ?? ''} onChange={e => patch({ maxBudget: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">Any</option>
                  {WIZ_BUDGET.map(b => <option key={b} value={b}>{budgetLabel(b)}</option>)}
                </select>
              </span>
              <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 10 }}>
                <label className="lbl" htmlFor="wiz-work">Work setup</label>
                <select id="wiz-work" value={d.workType} onChange={e => patch({ workType: e.target.value })}>
                  {withCurrent(WIZ_WORK, d.workType).map(r => <option key={r}>{r}</option>)}
                </select>
              </span>
            </div>
            {!minOk ? <p className="field-err">Minimum budget must be at most the maximum.</p> : null}
          </>) : null}

          {!canAdvance ? (
            <p className="field-hint" role="status" style={{ margin: 0 }}>
              {n < WIZ_STEPS.length - 1
                ? `To continue, add ${missing.join(' and ')}.`
                : `To finish, add ${missing.join(' and ')}.`}
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
        </section>
      </div>
    </div>
  );
}

function withCurrent(list: string[], cur: string) {
  return cur && !list.includes(cur) ? [cur, ...list] : list;
}
