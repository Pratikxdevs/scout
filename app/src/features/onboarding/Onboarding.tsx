import { useEffect, useRef, useState } from 'react';
import {
  ArrowRightIcon, CheckIcon, CloudArrowUpIcon, EnvelopeIcon, MapPinIcon, UserIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { DEFAULT_PROFILE, useStore } from '../../store';
import { COUNTRIES } from '../../lib/countries';
import { initialsFor } from '../../lib/profileSync';
import { isValidEmail } from '../../lib/validate';
import { SALARY_FLOORS, salaryPlus } from '../../lib/salary';
import { applyExtracted, initialDraft, stageLabel, type OnboardingDraft } from '../../lib/onboardingDraft';
import { RESUME_ACCEPT, resumeMimeForFile } from '../../lib/resume';
import { ChipInput, EditableAvatar, Status } from '../../components/ui';
import type { ExtractedProfile } from '../../types';

/* Onboarding (4 steps) — the dev wizard restored exactly, with the ICP as
 * the fourth step. Personal / Experience / Skills seed the profile the dev
 * build had; ICP (industries, search phrases, budget range) is Scout's
 * operating brief that drives query planning (backend SPEC §4) and lead
 * scoring (SPEC §8). Everything stays editable in Settings. */

const WIZ_STEPS = ['Personal', 'Experience', 'Skills', 'ICP'];
const WIZ_WORK = ['Remote', 'Hybrid', 'On-site'];
const WIZ_PAY = SALARY_FLOORS.map(salaryPlus);
/** Per-engagement deal sizes the user targets (USD, client-side presets). */
const WIZ_BUDGET = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const fmtMoney = (n: number): string => (n >= 1000 ? '$' + (n / 1000).toString().replace(/\.0$/, '') + 'k' : '$' + n);
/** Client mirror of server resume limits — fail fast, same limit. */
const MAX_RESUME_BYTES = 10 * 1024 * 1024;

/** The SCOUT wizard draft: the tested OnboardingDraft seed plus the ICP
 * fields the fourth step owns. */
type WizDraft = OnboardingDraft & {
  industries: string[];
  keywords: string[];
  minBudget: number | null;
  maxBudget: number | null;
};

function withCurrent(list: string[], cur: string) {
  return cur && !list.includes(cur) ? [cur, ...list] : list;
}

function Dropzone({ file, busy, ai, onFile, onClear }: {
  file: { name: string } | null;
  busy: boolean;
  ai: boolean;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  /* Container is not a button (avoids a button nested in role=button);
   * a real Browse button opens the picker; the container handles drop. */
  return (
    <div className="dropzone" data-drag={drag} data-on={!!file}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
      <input ref={ref} type="file" accept={RESUME_ACCEPT} hidden
        aria-label="Resume file"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
      {file ? (
        <span className="row" style={{ justifyContent: 'center' }}>
          <strong className="t-small ell" style={{ maxWidth: 280 }}>{file.name}</strong>
          <button type="button" className="icon-btn" aria-label="Remove resume" disabled={busy} onClick={onClear}>
            <XMarkIcon width={15} />
          </button>
        </span>
      ) : (<>
        <CloudArrowUpIcon width={30} aria-hidden="true" />
        <strong className="t-small">{busy ? 'Uploading…' : 'Upload your resume'}</strong>
        <span className="muted t-caption">{ai ? 'PDF or DOCX · up to 10 MB — the AI drafts your profile from it' : 'PDF or DOCX · up to 10 MB — kept in this browser; no server upload in local mode'}</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => ref.current?.click()}>
          Browse files
        </button>
      </>)}
    </div>
  );
}

export function Onboarding() {
  const { profile, onboarded, update, onboard, setAvatarPhoto, resume, uploadResume, backend } = useStore();
  const [n, setN] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [aiDraft, setAiDraft] = useState<ExtractedProfile | null>(null);
  const [d, setD] = useState<WizDraft>(() => ({
    ...initialDraft(profile, onboarded, DEFAULT_PROFILE),
    industries: profile.industries ?? [], keywords: profile.keywords ?? [],
    minBudget: profile.minBudget ?? null, maxBudget: profile.maxBudget ?? null,
  }));
  // `touched` tracks typing in the text fields only — resume/photo picks
  // must not block anything else. Anything typed is never clobbered.
  const touched = useRef(false);
  // `applied` guards the one-shot AI-draft application per resume row.
  const applied = useRef(false);

  // Late hydration (the server profile lands a round trip after login)
  // refills the draft, but only while the user hasn't typed anything.
  useEffect(() => {
    if (touched.current) return;
    setD({
      ...initialDraft(profile, onboarded, DEFAULT_PROFILE),
      industries: profile.industries ?? [], keywords: profile.keywords ?? [],
      minBudget: profile.minBudget ?? null, maxBudget: profile.maxBudget ?? null,
    });
  }, [profile, onboarded]);

  // A resume may already exist server-side (fresh device / reload): show it.
  useEffect(() => {
    if (resume === null || touched.current) return;
    setD(prev => (prev.resumeName === '' ? { ...prev, resumeName: resume.fileName } : prev));
  }, [resume]);

  // AI finished reading: fill the draft when the user hasn't typed; when
  // they have, keep it behind one explicit "Apply AI draft" click.
  useEffect(() => {
    if (applied.current || resume === null || resume.extractionStatus !== 'completed' || resume.extractedProfile === null) return;
    applied.current = true;
    const ex = resume.extractedProfile;
    if (touched.current) {
      setAiDraft(ex);
      setMessage('AI read your resume — apply its draft to fill empty fields?');
    } else {
      setD(prev => ({ ...prev, ...applyExtracted(prev, ex) }));
      setMessage('AI read your resume — the form is filled in. Edit anything.');
    }
  }, [resume]);

  const patch = (p: Partial<WizDraft>) => { touched.current = true; setD(prev => ({ ...prev, ...p })); };
  const skills = d.skills;
  const countryNames = withCurrent(COUNTRIES.map(c => c.name), d.country);
  const minOk = d.minBudget === null || d.maxBudget === null || d.minBudget <= d.maxBudget;

  const toProfile = () => ({
    name: d.name, email: d.email, country: d.country, city: d.city, summary: d.summary,
    roles: d.roles, services: d.roles, industries: d.industries, keywords: d.keywords,
    location: d.workType, salary: d.salary, remote: d.remote,
    minBudget: d.minBudget, maxBudget: d.maxBudget,
    skills: d.skills.join(', '), resume: d.resumeName,
  });

  // Autosave progress (debounced) once the user has actually typed: the
  // draft persists through the profile store, so a reload keeps the wizard
  // where it was. The untouched seed draft is never written.
  useEffect(() => {
    if (!touched.current) return;
    const t = window.setTimeout(() => update(toProfile()), 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const emailOk = d.email.trim() !== '' && isValidEmail(d.email);
  // What still blocks this step — the Continue/Finish button is disabled
  // and the exact gap is named, never a silent dead button.
  const missing = n === 0
    ? [d.name.trim() === '' ? 'your name' : '', !emailOk ? 'a valid work email' : ''].filter(Boolean)
    : n === 1
      ? [d.roles.length === 0 ? 'at least one target role' : ''].filter(Boolean)
      : n === 2
        ? [skills.length === 0 ? 'at least one skill' : ''].filter(Boolean)
        : [d.industries.length === 0 ? 'at least one target industry' : '', !minOk ? 'a valid budget range' : ''].filter(Boolean);
  const canAdvance = missing.length === 0;

  const pickResume = async (file: File) => {
    if (resumeMimeForFile(file) === null) {
      setMessage(`"${file.name}" isn't a PDF or DOCX — export your resume in one of those formats and try again.`);
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setMessage(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — resumes must be 10 MB or smaller.`);
      return;
    }
    patch({ resumeName: file.name });
    setMessage(await uploadResume(file));
  };

  return (
    <div className="wiz-wrap">
      <h1 className="t-display">Onboarding wizard</h1>
      <ol className="wiz-steps">
        {WIZ_STEPS.map((s, i) => (
          <li key={s} className="wiz-step" data-state={i < n ? 'done' : i === n ? 'now' : 'todo'}>
            <span className="wiz-dot">{i < n ? <CheckIcon width={15} /> : i + 1}</span>
            <span className="wiz-name">{s}</span>
            {i < WIZ_STEPS.length - 1 ? (
              <span className="wiz-bar"><span style={{ width: i < n ? '100%' : i === n ? '35%' : '0%' }} /></span>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="wiz-grid">
        {/* live preview */}
        <section className="card"><div className="card-pad" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <p className="sec-label" style={{ margin: 0 }}>Profile preview</p>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 8, textAlign: 'center' }}>
            <EditableAvatar url={profile.avatarUrl} initials={initialsFor(d.name, '')}
              size={96} busy={avatarBusy} onPick={async f => { setAvatarBusy(true); try { await setAvatarPhoto(f); } finally { setAvatarBusy(false); } }} />
            <h2 className="t-h1" style={{ margin: 0 }}>{d.name || 'Your Name'}</h2>
            <p className="muted t-small" style={{ margin: 0 }}>
              {d.roles.length > 0 ? d.roles.join(' · ') : 'Add the roles you want in step 2'}
            </p>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <h3 className="t-h3">Professional summary</h3>
            <p className="muted t-small" style={{ margin: '6px 0 0' }}>
              {d.summary || 'Write a short summary of your background and goals.'}
            </p>
          </div>
          <div>
            <h3 className="t-h3">Skills</h3>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              {skills.length > 0
                ? skills.map(s => <span key={s} className="prev-pill">{s}</span>)
                : <span className="muted t-caption">No skills yet — add them in step 3.</span>}
            </div>
          </div>
          <div>
            <h3 className="t-h3">Your ICP</h3>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              {d.industries.length > 0
                ? d.industries.map(s => <span key={s} className="prev-pill">{s}</span>)
                : <span className="muted t-caption">No target client types yet — add them in step 4.</span>}
            </div>
            {d.keywords.length > 0 ? (
              <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
                {d.keywords.map(k => <span key={k} className="prev-pill mono t-micro">{k}</span>)}
              </div>
            ) : null}
          </div>
          <p className="muted t-caption" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, margin: 0 }}>
            {[d.city, d.country].filter(Boolean).join(', ') || 'Set your location in step 1'}
            {' · '}{budgetLine(d.minBudget, d.maxBudget)} · Live preview updates as you edit.
          </p>
        </div></section>

        {/* step panel */}
        <section className="card"><div className="card-pad" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          {n === 0 ? (<>
            <div>
              <h2 className="t-h1">Build your profile</h2>
              <p className="muted t-small" style={{ margin: '4px 0 0' }}>Tell us about yourself — and set up the brain that plans your hunts.</p>
            </div>
          </>) : null}
          {n === 1 ? (<>
            <div>
              <h2 className="t-h1">Your experience</h2>
              <p className="muted t-small" style={{ margin: '4px 0 0' }}>What roles are you hunting for?</p>
            </div>
          </>) : null}
          {n === 2 ? (<>
            <div>
              <h2 className="t-h1">Your skills</h2>
              <p className="muted t-small" style={{ margin: '4px 0 0' }}>Add the tools you want to be matched on. Press Enter to add — as many as you like.</p>
            </div>
          </>) : null}
          {n === 3 ? (<>
            <div>
              <h2 className="t-h1">Your ICP</h2>
              <p className="muted t-small" style={{ margin: '4px 0 0' }}>Ideal customer profile — the client types, search phrases and deal sizes Scout hunts and scores against.</p>
            </div>
          </>) : null}

          {message !== '' ? (
            <p className="card-inner t-small" role="status" style={{ margin: 0, display: 'grid', gap: 8 }}>
              <span>{message}</span>
              {aiDraft !== null ? (
                <span>
                  <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => { setD(prev => ({ ...prev, ...applyExtracted(prev, aiDraft) })); setAiDraft(null); setMessage('AI draft applied to the empty fields.'); }}>
                    Apply AI draft
                  </button>
                </span>
              ) : null}
            </p>
          ) : null}

          {n === 0 ? (<>
            <div>
              <label className="lbl" htmlFor="wiz-name">Full name</label>
              <span className="icon-field">
                <span aria-hidden="true" className="icon-field-ic"><UserIcon width={16} /></span>
                <input id="wiz-name" placeholder="Enter your name" value={d.name} onChange={e => patch({ name: e.target.value })} />
              </span>
            </div>
            <div>
              <label className="lbl" htmlFor="wiz-email">Work email</label>
              <span className="icon-field">
                <span aria-hidden="true" className="icon-field-ic"><EnvelopeIcon width={16} /></span>
                <input id="wiz-email" type="email" placeholder="you@example.com" value={d.email} onChange={e => patch({ email: e.target.value })}
                  aria-invalid={d.email.trim() !== '' && !isValidEmail(d.email) || undefined} />
              </span>
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'end' }}>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <label className="lbl" htmlFor="wiz-country">Country</label>
                <select id="wiz-country" value={d.country} onChange={e => patch({ country: e.target.value })}>
                  <option value="">Select a country…</option>
                  {countryNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </span>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <label className="lbl" htmlFor="wiz-city">City</label>
                <span className="icon-field">
                  <span aria-hidden="true" className="icon-field-ic"><MapPinIcon width={16} /></span>
                  <input id="wiz-city" placeholder="City" value={d.city} onChange={e => patch({ city: e.target.value })} />
                </span>
              </span>
            </div>
            <div>
              <label className="lbl" htmlFor="wiz-summary">Professional summary</label>
              <textarea id="wiz-summary" rows={3} placeholder="Describe your background and goals..."
                value={d.summary} onChange={e => patch({ summary: e.target.value })} />
            </div>
            <div>
              <span className="lbl">Resume</span>
              <Dropzone file={d.resumeName ? { name: d.resumeName } : null} busy={false} ai={backend}
                onFile={pickResume} onClear={() => patch({ resumeName: '' })} />
              {resume !== null ? (
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {resume.extractionStatus === 'failed' ? (<>
                    <Status kind="bad">Resume reading failed</Status>
                    <p className="muted t-caption" style={{ margin: 0 }}>{resume.failureReason ?? 'Try a text-based PDF or DOCX export and re-upload.'}</p>
                  </>) : resume.extractionStatus === 'completed' ? (
                    <Status kind="ok">AI finished reading v{resume.version} of this resume</Status>
                  ) : (
                    <Status kind="info">Reading your resume: {stageLabel(resume.stage)}…</Status>
                  )}
                </div>
              ) : null}
            </div>
          </>) : null}

          {n === 1 ? (<>
            <div>
              <label className="lbl" htmlFor="wiz-roles">Roles you're targeting</label>
              <ChipInput id="wiz-roles" values={d.roles} max={10} onChange={roles => patch({ roles })}
                placeholder="Type a role, press Enter (up to 10)" />
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'end' }}>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <label className="lbl" htmlFor="wiz-work">Work type</label>
                <select id="wiz-work" value={d.workType} onChange={e => patch({ workType: e.target.value })}>
                  {d.workType === '' ? <option value="" disabled>Choose…</option> : null}
                  {withCurrent(WIZ_WORK, d.workType).map(r => <option key={r}>{r}</option>)}
                </select>
              </span>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <label className="lbl" htmlFor="wiz-pay">Target salary</label>
                <select id="wiz-pay" value={d.salary} onChange={e => patch({ salary: e.target.value })}>
                  {d.salary === '' ? <option value="" disabled>Choose…</option> : null}
                  {withCurrent(WIZ_PAY, d.salary).map(r => <option key={r}>{r}</option>)}
                </select>
              </span>
            </div>
            <label className="row t-small" style={{ gap: 8 }}>
              <input type="checkbox" checked={d.remote} onChange={e => patch({ remote: e.target.checked })} /> Remote OK
            </label>
          </>) : null}

          {n === 2 ? (<>
            <div>
              <label className="lbl" htmlFor="wiz-skills">Skills</label>
              <ChipInput id="wiz-skills" values={skills} onChange={v => patch({ skills: v })} placeholder="Add a skill..." />
            </div>
          </>) : null}

          {n === 3 ? (<>
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
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <label className="lbl" htmlFor="wiz-budget-min">Budget from</label>
                <select id="wiz-budget-min" className="num" value={d.minBudget ?? ''} onChange={e => patch({ minBudget: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">Any</option>
                  {WIZ_BUDGET.map(b => <option key={b} value={b}>{fmtMoney(b)}</option>)}
                </select>
              </span>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <label className="lbl" htmlFor="wiz-budget-max">Budget up to</label>
                <select id="wiz-budget-max" className="num" value={d.maxBudget ?? ''} onChange={e => patch({ maxBudget: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">Any</option>
                  {WIZ_BUDGET.map(b => <option key={b} value={b}>{fmtMoney(b)}</option>)}
                </select>
              </span>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <label className="lbl" htmlFor="wiz-freelance-remote">Remote work</label>
                <select id="wiz-freelance-remote" value={d.workType} onChange={e => patch({ workType: e.target.value })}>
                  {withCurrent(WIZ_WORK, d.workType).map(r => <option key={r}>{r}</option>)}
                </select>
              </span>
            </div>
            {!minOk ? <p className="field-err" style={{ margin: 0 }}>Minimum budget must be at most the maximum.</p> : null}
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
        </div></section>
      </div>
    </div>
  );
}

function budgetLine(lo: number | null, hi: number | null): string {
  if (lo !== null && hi !== null) return fmtMoney(lo) + '–' + fmtMoney(hi) + ' per project';
  if (lo !== null) return fmtMoney(lo) + '+ per project';
  if (hi !== null) return 'Up to ' + fmtMoney(hi) + ' per project';
  return 'Budgets open';
}
