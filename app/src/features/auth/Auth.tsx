import { useEffect, useState } from 'react';
import {
  ArrowRightIcon, BuildingOffice2Icon, ChartBarIcon, EnvelopeIcon, InboxIcon,
  MagnifyingGlassIcon, PaperAirplaneIcon, UserIcon,
} from '@heroicons/react/24/outline';
import { useStore } from '../../store';
import { authClient, ensureSession } from '../../lib/authClient';
import { backendOn as backendConfigured } from '../../services/api';
import { isValidEmail } from '../../lib/validate';
import { oauthErrorCopy, readQueryError, takeQueryError } from '../../lib/oauthErrors';
import { logger } from '../../lib/logger';
import { PasswordField } from '../../components/ui';
import './auth.css';

function GoogleMark() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

/* Same predicate the store and services read (services/api) — one reading,
 * so demo/backend mode can never fork per file. */
const backendOn: boolean = backendConfigured();

/** Social sign-in row. Social providers only work with a configured backend;
 *  local mode says so instead of silently inventing an account. */
function SocialButtons({ onErr }: { onErr: (msg: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const social = (provider: 'google' | 'github') => {
    if (!backendOn) {
      onErr('Social sign-in needs the backend — use email and password instead.');
      return;
    }
    // Redirects to the provider (full page — no popup by design). Busy
    // state covers the hop; unmount clears it on success. errorCallbackURL
    // brings provider-side failures back to OUR login with ?error=<code>
    // instead of better-auth's dead-end error page.
    setBusy(provider);
    logger.info('auth-social-start', `Social sign-in started: ${provider}`, { provider });
    void authClient.signIn.social(
      // Absolute origins: relative callback URLs resolve against the auth
      // baseURL (SITE_URL), which misroutes when the app is served from a
      // different trusted origin (e.g. a mapped container port).
      { provider, callbackURL: `${window.location.origin}/dashboard`, errorCallbackURL: `${window.location.origin}/login` },
      {
        onError: () => {
          setBusy(null);
          onErr('Social sign-in failed — try again or use email.');
        },
      },
    );
  };
  return (
    <>
      <div className="auth-or" aria-hidden="true">or</div>
      <div className="auth-social">
        <button type="button" className="auth-soc" disabled={busy !== null} onClick={() => social('google')}>
          <span><GoogleMark /></span> {busy === 'google' ? 'Redirecting to Google…' : 'Continue with Google'}
        </button>
        <button type="button" className="auth-soc" disabled={busy !== null} onClick={() => social('github')}>
          <span><GitHubMark /></span> {busy === 'github' ? 'Redirecting to GitHub…' : 'Continue with GitHub'}
        </button>
      </div>
    </>
  );
}

async function ensureBackendUser(): Promise<boolean> {
  // Provisions the app-side user row for this session (lib/authClient,
  // same-origin — Vite and nginx both proxy /api/v1). False when
  // unreachable; the session still works and the next authed action retries.
  if (!backendOn) return false;
  return ensureSession();
}

function validateLogin(email: string, pw: string): string {
  if (!isValidEmail(email)) return 'Enter a valid email address.';
  if (!pw) return 'Enter your password.';
  return '';
}

function validateSignup(name: string, email: string, pw: string, pw2: string): string {
  if (!name.trim()) return 'Enter your full name.';
  if (!isValidEmail(email)) return 'Enter a valid email address.';
  if (!pw) return 'Choose a password.';
  if (pw.length < 8) return 'Password needs at least 8 characters.';
  if (pw !== pw2) return "Passwords don't match — check both fields.";
  return '';
}

function friendlyAuthError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const rec = err as { code?: unknown; message?: unknown };
    const code = typeof rec.code === 'string' ? rec.code : '';
    const msg = typeof rec.message === 'string' ? rec.message : '';
    const hay = `${code} ${msg}`;
    if (/invalid|credentials|password|not[-_ ]?found/i.test(hay)) return 'Wrong email or password.';
    if (/exists|already|taken/i.test(hay)) return 'That email already has an account — log in instead.';
    if (/weak|short/i.test(hay)) return 'Password needs at least 8 characters.';
    if (/rate|too many|throttl/i.test(hay)) return 'Too many tries — wait a minute and retry.';
  }
  if (typeof err === 'string' && err) return err;
  return 'Something went wrong — try again.';
}

export function Login() {
  const { login, go } = useStore();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  // OAuth return leg: ?error=<code> from errorCallbackURL. Read
  // idempotently (StrictMode double-invokes initializers), clear on mount
  // so refresh never re-shows it.
  const [err, setErr] = useState(() => oauthErrorCopy(readQueryError('error')) ?? '');
  useEffect(() => { takeQueryError('error'); }, []);
  const [busy, setBusy] = useState(false);
  const emailBad = email.length > 0 && !isValidEmail(email);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const clean = email.trim();
    const problem = validateLogin(clean, pw);
    if (problem) {
      setErr(problem);
      return;
    }
    if (!backendOn) {
      void login(clean);
      return;
    }
    setBusy(true);
    setErr('');
    authClient.signIn.email(
      { email: clean, password: pw },
      {
        onSuccess: () => {
          void ensureBackendUser().finally(() => {
            void login(clean).finally(() => setBusy(false));
          });
        },
        onError: (ctx) => {
          setBusy(false);
          setErr(friendlyAuthError((ctx as { error?: unknown }).error));
        },
      },
    );
  };
  return (
    <AuthShell title="Welcome back" sub="Log in to pick up your job hunt where you left off." layout="sides" cards={AUTH_CARDS_LOGIN}>
      <form onSubmit={submit} className="auth-form" noValidate>
        <div>
          <label className="lbl" htmlFor="li-em">Email</label>
          <span className="icon-field">
            <span aria-hidden="true" className="icon-field-ic"><EnvelopeIcon width={16} /></span>
            <input id="li-em" type="email" required value={email}
              onChange={e => { setEmail(e.target.value); if (err) setErr(''); }}
              placeholder="you@example.com" autoComplete="email"
              aria-invalid={emailBad || undefined} aria-describedby={emailBad ? 'li-em-hint' : undefined} />
          </span>
        </div>
        <PasswordField id="li-pw" label="Password" value={pw}
          onChange={v => { setPw(v); if (err) setErr(''); }}
          placeholder="••••••••" autoComplete="current-password" />
        <button className="auth-cta" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? 'Logging in…' : (<>Log in <ArrowRightIcon width={16} strokeWidth={2} /></>)}
        </button>
        {emailBad ? <span className="auth-hint" id="li-em-hint">That email doesn&apos;t look right.</span> : null}
        {err ? <span className="auth-err" role="alert">{err}</span> : null}
      </form>
      <p className="auth-swap">
        <span className="muted">New to jobwzrd?</span>{' '}
        <button className="link" onClick={() => go('signup')}>Create account</button>
      </p>
      <SocialButtons onErr={setErr} />
    </AuthShell>
  );
}

export function Signup() {
  const { signup, go } = useStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const emailBad = email.length > 0 && !isValidEmail(email);
  const pwBad = pw.length > 0 && pw.length < 8;
  const pw2Bad = pw2.length > 0 && pw !== pw2;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cleanName = name.trim();
    const clean = email.trim();
    const problem = validateSignup(cleanName, clean, pw, pw2);
    if (problem) {
      setErr(problem);
      return;
    }
    if (!backendOn) {
      signup(cleanName, clean);
      return;
    }
    setBusy(true);
    setErr('');
    authClient.signUp.email(
      { email: clean, password: pw, name: cleanName },
      {
        onSuccess: () => {
          void ensureBackendUser().finally(() => {
            setBusy(false);
            signup(cleanName, clean);
          });
        },
        onError: (ctx) => {
          setBusy(false);
          setErr(friendlyAuthError((ctx as { error?: unknown }).error));
        },
      },
    );
  };
  return (
    <AuthShell title="Create your account" sub="Start organizing your next opportunity." layout="stack" cards={AUTH_CARDS_SIGNUP}>
      <form onSubmit={submit} className="auth-form" noValidate>
        <div>
          <label className="lbl" htmlFor="su-name">Full name</label>
          <span className="icon-field">
            <span aria-hidden="true" className="icon-field-ic"><UserIcon width={16} /></span>
            <input id="su-name" required value={name} onChange={e => { setName(e.target.value); if (err) setErr(''); }} placeholder="John Doe" autoComplete="name" />
          </span>
        </div>
        <div>
          <label className="lbl" htmlFor="su-em">Email</label>
          <span className="icon-field">
            <span aria-hidden="true" className="icon-field-ic"><EnvelopeIcon width={16} /></span>
            <input id="su-em" type="email" required value={email}
              onChange={e => { setEmail(e.target.value); if (err) setErr(''); }}
              placeholder="you@company.com" autoComplete="email"
              aria-invalid={emailBad || undefined} aria-describedby={emailBad ? 'su-em-hint' : undefined} />
          </span>
        </div>
        <PasswordField id="su-pw" label="Password" value={pw} minLength={8}
          onChange={v => { setPw(v); if (err) setErr(''); }}
          placeholder="••••••••" autoComplete="new-password"
          describedBy={pwBad ? 'su-pw-hint' : undefined} invalid={pwBad} />
        <PasswordField id="su-pw2" label="Confirm password" value={pw2}
          onChange={v => { setPw2(v); if (err) setErr(''); }}
          placeholder="••••••••" autoComplete="new-password"
          describedBy={pw2Bad ? 'su-pw2-hint' : undefined} invalid={pw2Bad} />
        <button className="auth-cta" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? 'Creating…' : (<>Create account <ArrowRightIcon width={16} strokeWidth={2} /></>)}
        </button>
        {emailBad ? <span className="auth-hint" id="su-em-hint">That email doesn&apos;t look right.</span> : null}
        {pwBad && !err ? <span className="auth-hint" id="su-pw-hint">Use at least 8 characters.</span> : null}
        {pw2Bad ? <span className="auth-hint" id="su-pw2-hint">Passwords don&apos;t match yet.</span> : null}
        {err ? <span className="auth-err" role="alert">{err}</span> : null}
      </form>
      <SocialButtons onErr={setErr} />
      <p className="auth-swap">
        <span className="muted">Already have an account?</span>{' '}
        <button className="link" onClick={() => go('login')}>Log in</button>
      </p>
    </AuthShell>
  );
}

type AuthCardIcon = 'search' | 'rank' | 'apply' | 'outreach' | 'inbox' | 'companies';
type AuthCard = { icon: AuthCardIcon; label: string; title: string; tags: readonly string[] };

const AUTH_CARDS_SIGNUP: readonly AuthCard[] = [
  { icon: 'search', label: 'Search', title: 'Find live roles', tags: ['Live boards', 'Fresh roles'] },
  { icon: 'rank', label: 'Rank', title: 'Skill-fit, explained', tags: ['Your skills', 'Clear reasons'] },
  { icon: 'apply', label: 'Apply', title: 'Review, then submit', tags: ['5/day cap', 'You review first'] },
];

const AUTH_CARDS_LOGIN: readonly AuthCard[] = [
  { icon: 'outreach', label: 'Outreach', title: 'Draft, review, send', tags: ['50/day cap', 'Draft first'] },
  { icon: 'inbox', label: 'Inbox', title: 'Replies triaged', tags: ['Five categories', 'Hot replies'] },
  { icon: 'companies', label: 'Companies', title: 'Research from the feed', tags: ['Open roles', 'Activity log'] },
];

function CardIcon({ icon }: { icon: AuthCardIcon }) {
  const props = { width: 18, height: 18, 'aria-hidden': true } as const;
  switch (icon) {
    case 'search': return <MagnifyingGlassIcon {...props} />;
    case 'rank': return <ChartBarIcon {...props} />;
    case 'apply': return <PaperAirplaneIcon {...props} />;
    case 'outreach': return <EnvelopeIcon {...props} />;
    case 'inbox': return <InboxIcon {...props} />;
    case 'companies': return <BuildingOffice2Icon {...props} />;
  }
}

function AuthArt() {
  return (
    <div className="auth-bg" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        {/* orbit rings — ink at low opacity */}
        <g fill="none" stroke="var(--primary)" strokeOpacity=".22" strokeWidth="1.5">
          <circle cx="210" cy="290" r="150" />
          <circle cx="210" cy="290" r="105" />
          <circle cx="130" cy="690" r="170" />
          <circle cx="430" cy="470" r="230" />
          <circle cx="430" cy="470" r="300" strokeDasharray="4 8" />
        </g>
        <g fill="none" stroke="var(--primary)" strokeWidth="1.5">
          <path d="M60 320 C 140 260, 220 200, 330 150 S 560 120, 700 200" strokeDasharray="5 7" strokeOpacity=".4" />
          <path d="M40 480 C 160 560, 280 620, 420 700 S 640 830, 780 880" strokeOpacity=".28" />
          <path d="M880 120 C 960 220, 1040 320, 1120 420" strokeDasharray="5 7" strokeOpacity=".3" />
        </g>
        {/* ink nodes on the orbits */}
        <g fill="var(--primary)">
          <circle cx="210" cy="290" r="15" />
          <circle cx="62" cy="420" r="8" />
          <circle cx="310" cy="680" r="10" />
          <circle cx="300" cy="862" r="5" />
          <circle cx="132" cy="462" r="4.5" />
          <circle cx="1010" cy="330" r="7" />
        </g>
        {/* lime accents */}
        <g fill="#a3d900">
          <circle cx="282" cy="514" r="6" />
          <circle cx="90" cy="650" r="7" />
          <circle cx="382" cy="868" r="9" />
          <circle cx="912" cy="208" r="5" />
        </g>
        {/* lime dot grids */}
        <g fill="#a3d900" opacity=".8">
          {Array.from({ length: 20 }).map((_, i) => (
            <circle key={`g1-${i}`} cx={742 + (i % 5) * 14} cy={110 + Math.floor(i / 5) * 14} r="2.4" />
          ))}
          {Array.from({ length: 24 }).map((_, i) => (
            <circle key={`g2-${i}`} cx={80 + (i % 6) * 15} cy={710 + Math.floor(i / 6) * 15} r="2.4" />
          ))}
        </g>
        {/* ink dot grid */}
        <g fill="var(--primary)" opacity=".5">
          {Array.from({ length: 40 }).map((_, i) => (
            <circle key={`b-${i}`} cx={418 + (i % 8) * 13} cy={390 + Math.floor(i / 8) * 13} r="2.2" />
          ))}
        </g>
        {/* bold diagonal bars (right edge) — ink default, not bright blue */}
        <g fill="var(--primary)">
          <rect x="1110" y="-120" width="110" height="1150" transform="rotate(28 1165 450)" />
          <rect x="1262" y="-120" width="110" height="1150" transform="rotate(28 1317 450)" />
        </g>
      </svg>
    </div>
  );
}

/** Brand lockup: wizard-hat mark from `assets/logo.svg` (served as
 *  `/logo.svg`) on an ink tile + wordmark. */
function AuthBrand() {
  return (
    <div className="auth-brand">
      <span className="auth-badge" aria-hidden="true">
        <img src="/logo.svg" alt="" width={24} height={24} />
      </span>
      <p className="t-brand" style={{ margin: 0 }}>jobwzrd</p>
    </div>
  );
}

type AuthLayout = 'stack' | 'sides';

function AuthShell({ title, sub, layout, cards, children }: {
  title: string; sub: string; layout: AuthLayout;
  cards: readonly AuthCard[];
  children: React.ReactNode;
}) {
  return (
    <div className="auth-page">
      <AuthArt />
      <div className="auth-stage" data-layout={layout}>
        <div className="auth-cards" aria-hidden="true">
          {cards.map((c, i) => (
            <article key={c.label} className="auth-float" data-i={i}>
              <div className="auth-float-top">
                <span className="auth-tile"><CardIcon icon={c.icon} /></span>
                <span className="auth-float-co">{c.label}</span>
              </div>
              <h3 className="auth-float-title">{c.title}</h3>
              <div className="auth-float-tags">
                {c.tags.map(t => <span key={t} className="auth-float-tag">{t}</span>)}
              </div>
            </article>
          ))}
        </div>
        <div className="auth-card">
          <div className="auth-card-pad">
            <AuthBrand />
            <div>
              <h1 className="auth-title">{title}</h1>
              <p className="auth-sub">{sub}</p>
            </div>
            {children}
            <p className="auth-foot">{backendOn ? 'Private by default · Your data stays in your account' : 'Local build · Nothing leaves your machine'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
