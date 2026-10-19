import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownTrayIcon, ArrowPathIcon, ComputerDesktopIcon,
  CircleStackIcon, EnvelopeIcon, MoonIcon, ShieldCheckIcon,
  SwatchIcon, TrashIcon, UserIcon,
} from '@heroicons/react/24/outline';
import { useStore } from '../../store';
import { authClient } from '../../lib/authClient';
import { oauthErrorCopy, readQueryError, takeQueryError } from '../../lib/oauthErrors';
import { COLORWAYS } from '../../theme/palettes';
import { ChipInput, ConfirmButton, ConfirmDialog, EditableAvatar } from '../../components/ui';
import { ProfileEnrichment } from '../profile/ProfileEnrichment';
import { COUNTRIES } from '../../lib/countries';
import { isValidEmail } from '../../lib/validate';
import { SALARY_FLOORS, salaryPlus } from '../../lib/salary';
import { clearDraft } from '../../lib/outreachDraft';

const WORK_TYPES = ['Remote', 'Hybrid', 'On-site'];
const SALARIES = SALARY_FLOORS.map(salaryPlus);

function withCustom(list: string[], cur: string) {
  return cur === '' || list.includes(cur) ? list : [cur, ...list];
}

export function Settings() {
  const { profile, update, setAvatarPhoto, dark, toggleDark, apps, jobs, sent, clearSent, clearApps, colorway, setColorway } = useStore();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const skills = profile.skills.split(',').map(s => s.trim()).filter(Boolean);
  const countryNames = withCustom(COUNTRIES.map(c => c.name), profile.country);
  const pickAvatar = async (file: File) => {
    setAvatarBusy(true);
    try {
      setPhotoNote(await setAvatarPhoto(file));
    } finally {
      setAvatarBusy(false);
    }
  };

  const clearData = () => {
    clearSent(); clearApps(); clearDraft();
  };
  const reboot = () => {
    // Keep only the current profile key (jw3). The old jw2 key held the demo
    // seed and is intentionally not restored.
    const keep = localStorage.getItem('jw4:jw3_profile');
    localStorage.clear();
    if (keep) localStorage.setItem('jw4:jw3_profile', keep);
    location.reload();
  };
  const exportData = () => {
    // Includes saved roles — the row copy promises them, so the payload
    // must actually carry them.
    const savedJobs = jobs.filter(j => j.isSaved).map(j => ({ id: j.id, title: j.title, company: j.company, url: j.url }));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile, apps, sent, savedJobs }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jobwzrd-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* banner — shared art system */}
      <section className="card rise apps-banner">
        <div className="card-pad hero-body">
          <p className="sec-label" style={{ margin: '0 0 6px' }}>Settings</p>
          <h1 className="t-display">Preferences &amp; profile</h1>
          <p className="muted t-small" style={{ margin: '8px 0 0' }}>Manage your account, personalize outreach, and configure the app to your workflow.</p>
        </div>
      </section>

      <ProfileEnrichment />

      <div className="grid-2">
        {/* account & profile */}
        <section className="card"><div className="card-pad" style={{ display: 'grid', gap: 12 }}>
          <div className="set-head">
            <span className="set-ic"><UserIcon width={20} /></span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <strong className="t-h3">Account &amp; Profile</strong>
              <span className="muted t-small">This information is used to personalize outreach and applications.</span>
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => nameRef.current?.focus()}>Edit profile</button>
          </div>
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <EditableAvatar url={profile.avatarUrl} initials={profile.initials} size={56} busy={avatarBusy} onPick={pickAvatar} />
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <strong className="t-small">Profile photo</strong>
              <span className="muted t-caption" style={{ display: 'block' }}>Click the pencil to upload a new one.</span>
            </span>
            {photoNote !== '' ? <span className="muted t-caption" role="status">{photoNote}</span> : null}
          </div>
          <div className="row" style={{ gap: 12, alignItems: 'end' }}>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <label className="lbl" htmlFor="set-name">Name</label>
              <input id="set-name" ref={nameRef} value={profile.name} onChange={e => update({ name: e.target.value })} />
            </span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <label className="lbl" htmlFor="set-email">Email</label>
              <input id="set-email" type="email" value={profile.email} placeholder="you@example.com"
                onChange={e => update({ email: e.target.value })}
                aria-invalid={profile.email.trim() !== '' && !isValidEmail(profile.email) || undefined}
                aria-describedby={profile.email.trim() !== '' && !isValidEmail(profile.email) ? 'set-email-hint' : undefined} />
              {profile.email.trim() !== '' && !isValidEmail(profile.email) ? (
                <p className="field-hint" id="set-email-hint">That email doesn&apos;t look right — it&apos;s used for outreach.</p>
              ) : null}
            </span>
          </div>
          <div className="row" style={{ gap: 12, alignItems: 'end' }}>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <label className="lbl" htmlFor="set-country">Country</label>
              <select id="set-country" value={profile.country} onChange={e => update({ country: e.target.value })}>
                <option value="">Select a country…</option>
                {countryNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <label className="lbl" htmlFor="set-city">City</label>
              <input id="set-city" value={profile.city} placeholder="City" onChange={e => update({ city: e.target.value })} />
            </span>
          </div>
          <div>
            <label className="lbl" htmlFor="set-skills">Skills</label>
            <ChipInput id="set-skills" values={skills} onChange={v => update({ skills: v.join(', ') })} placeholder="Add a skill..." />
          </div>
          <div>
            <label className="lbl" htmlFor="set-roles">Target roles</label>
            <ChipInput id="set-roles" values={profile.roles} max={10} onChange={roles => update({ roles })} placeholder="Type a role, press Enter..." />
          </div>
          <div className="row" style={{ gap: 12, alignItems: 'end' }}>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <label className="lbl" htmlFor="set-work">Work type</label>
              <select id="set-work" value={profile.location} onChange={e => update({ location: e.target.value })}>
                {withCustom(WORK_TYPES, profile.location).map(r => <option key={r}>{r}</option>)}
              </select>
            </span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <label className="lbl" htmlFor="set-salary">Target salary</label>
              <select id="set-salary" value={profile.salary} onChange={e => update({ salary: e.target.value })}>
                {withCustom(SALARIES, profile.salary).map(r => <option key={r}>{r}</option>)}
              </select>
            </span>
          </div>
        </div></section>

        <ConnectedLogins />

        {/* email & outreach */}
        <section className="card"><div className="card-pad" style={{ display: 'grid', gap: 12 }}>
          <div className="set-head">
            <span className="set-ic"><EnvelopeIcon width={20} /></span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <strong className="t-h3">Email &amp; Outreach</strong>
              <span className="muted t-small">Configure how jobwzrd composes and sends outreach emails.</span>
            </span>
          </div>
          <div className="set-line">
            <span className="grow"><strong className="t-small">Sending as</strong>
              <span className="muted t-caption ell">
                {profile.name}{profile.email !== '' ? ` · ${profile.email}` : ''}
                {profile.email === '' ? ' — add a work email in Account & Profile first.' : ' — change it in Account & Profile.'}
              </span></span>
          </div>
          <div>
            <label className="lbl" htmlFor="set-sig">Email signature</label>
            <textarea id="set-sig" rows={4} value={profile.signature} onChange={e => update({ signature: e.target.value })} />
          </div>
          <p className="muted t-caption" style={{ margin: 0 }}>The signature is added to all cold outreach emails. Changes save automatically.</p>
        </div></section>

        {/* display & privacy */}
        <section className="card"><div className="card-pad" style={{ display: 'grid', gap: 4 }}>
          <div className="set-head" style={{ marginBottom: 6 }}>
            <span className="set-ic"><ComputerDesktopIcon width={20} /></span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <strong className="t-h3">Display &amp; Privacy</strong>
              <span className="muted t-small ell">Customize how the app looks and handles data.</span>
            </span>
          </div>
          <div className="set-line">
            <MoonIcon width={19} className="muted" />
            <span className="grow"><strong className="t-small">Dark mode</strong>
              <span className="muted t-caption ell">Switch between light and dark theme.</span></span>
            <button className="switch" role="switch" aria-checked={dark} data-on={dark} aria-label="Dark mode" onClick={toggleDark} />
          </div>
          <div className="set-line">
            <SwatchIcon width={19} className="muted" />
            <span className="grow"><strong className="t-small">Colorway</strong>
              <span className="muted t-caption ell">Swap the site palette — buttons, links, accents.</span></span>
            <span className="way-row" role="group" aria-label="Colorway">
              {COLORWAYS.map(c => (
                <button key={c.id} className="way-btn" data-on={colorway === c.id} title={c.label}
                  aria-label={`${c.label} colorway`} aria-pressed={colorway === c.id} onClick={() => setColorway(c.id)}>
                  <span className="way-dot" style={{ background: c.swatch }} />
                  <span className="t-caption">{c.label}</span>
                </button>
              ))}
            </span>
          </div>
        </div></section>

        {/* data & account */}
        <section className="card"><div className="card-pad" style={{ display: 'grid', gap: 4 }}>
          <div className="set-head" style={{ marginBottom: 6 }}>
            <span className="set-ic"><CircleStackIcon width={20} /></span>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <strong className="t-h3">Data &amp; Account</strong>
              <span className="muted t-small ell">Manage your data and account actions.</span>
            </span>
          </div>
          <div className="set-line">
            <TrashIcon width={19} className="muted" />
            <span className="grow"><strong className="t-small">Clear local application data</strong>
              <span className="muted t-caption ell">Clear cached applications and outreach history in this browser. Server records are kept.</span></span>
            <ConfirmButton label="Clear cache" confirmLabel={`Delete ${apps.length} apps + ${sent.length} sent from this browser?`} onConfirm={clearData} />
          </div>
          <div className="set-line">
            <ArrowDownTrayIcon width={19} className="muted" />
            <span className="grow"><strong className="t-small">Export data</strong>
              <span className="muted t-caption ell">Download your profile, applications, sent mail and saved roles.</span></span>
            <button className="btn btn-ghost" onClick={exportData}>Export</button>
          </div>
          <div className="set-line">
            <ArrowPathIcon width={19} className="muted" />
            <span className="grow"><strong className="t-small">Reset local cache</strong>
              <span className="muted t-caption ell">Clear cached data in this browser and reload. Server records and your profile are kept.</span></span>
            <button className="btn btn-ghost" onClick={() => setConfirmReset(true)}>Reset cache</button>
          </div>
        </div></section>
      </div>
      {confirmReset ? (
        <ConfirmDialog title="Reset local cache?"
          body="This clears cached applications, outreach and saved roles in this browser, then reloads. Your profile and server records are kept."
          confirmLabel="Reset cache" onConfirm={reboot} onClose={() => setConfirmReset(false)} />
      ) : null}
    </div>
  );
}

/**
 * Connected logins — the durable account-linking path. Signing in with
 * Google while an email account exists (or vice versa) links automatically
 * only for provider-verified emails; connecting here while signed in always
 * works and survives the upstream deprecation of implicit linking. Full
 * page redirect; success lands back on Settings, errors stay inline.
 */
function ConnectedLogins() {
  const { backend } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState(() => oauthErrorCopy(readQueryError('error')) ?? '');
  useEffect(() => { takeQueryError('error'); }, []);
  if (!backend) return null;
  const connect = (provider: 'google' | 'github') => {
    setBusy(provider);
    setMsg('');
    void (authClient.linkSocial(
      // Absolute origin: relative targets resolve against the auth baseURL
      // (SITE_URL), not the page origin — same rationale as Auth.tsx.
      { provider, callbackURL: `${window.location.origin}/settings`, errorCallbackURL: `${window.location.origin}/settings` },
      {
        onError: (ctx: unknown) => {
          setBusy(null);
          const err = (ctx as { error?: { message?: unknown } })?.error;
          setMsg(typeof err?.message === 'string' && err.message !== ''
            ? err.message
            : 'Could not start the connection — try again.');
        },
      },
    ) as unknown as Promise<unknown>).catch(() => {
      setBusy(null);
      setMsg('Could not start the connection — try again.');
    });
  };
  return (
    <section className="card"><div className="card-pad" style={{ display: 'grid', gap: 12 }}>
      <div className="set-head">
        <span className="set-ic"><ShieldCheckIcon width={20} /></span>
        <span style={{ flex: '1 1 auto', minWidth: 0 }}>
          <strong className="t-h3">Connected logins</strong>
          <span className="muted t-small">Link Google or GitHub so every login method reaches this same account.</span>
        </span>
      </div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {(['google', 'github'] as const).map(p => (
          <button key={p} className="btn btn-ghost btn-sm" disabled={busy !== null}
            onClick={() => connect(p)} aria-busy={busy === p}>
            {busy === p ? `Connecting ${p}…` : `Connect ${p === 'google' ? 'Google' : 'GitHub'}`}
          </button>
        ))}
      </div>
      {msg !== '' ? <p className="muted t-small" role="status" style={{ margin: 0 }}>{msg}</p> : null}
    </div></section>
  );
}
