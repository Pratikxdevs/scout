import { SignIn, SignUp } from '@clerk/react';
import { useStore } from '../../store';
import { backendOn as backendConfigured } from '../../services/api';
import {
  ChartBarIcon, EnvelopeIcon, MagnifyingGlassIcon, PaperAirplaneIcon, ShieldCheckIcon, UserGroupIcon,
} from '@heroicons/react/24/outline';
import './auth.css';

/* Scout auth pages: Clerk-powered sign-in/up mounted in the brand shell.
 * The store's AuthBridge (main.tsx) syncs session changes into app state. */

/* Same predicate the store and services read (services/api) — one reading,
 * so demo/backend mode can never fork per file. */
const backendOn: boolean = backendConfigured();


export function Login() {
  const { go } = useStore();
  return (
    <AuthShell title="Welcome back" sub="Log in to pick up your lead hunt where you left off." layout="sides" cards={AUTH_CARDS_LOGIN}>
      <div className="clerk-frame">
        <SignIn
          routing="hash"
          signUpUrl="/signup"
          forceRedirectUrl="/dashboard"
          fallbackRedirectUrl="/dashboard"
        />
      </div>
      <p className="auth-swap">
        <span className="muted">Not by form?</span>{' '}
        <span className="muted t-caption">Google and GitHub sign-in live in the panel above.</span>
      </p>
      <p className="auth-swap">
        <span className="muted">New to Scout?</span>{' '}
        <button className="link" onClick={() => go('signup')}>Create account</button>
      </p>
    </AuthShell>
  );
}

export function Signup() {
  const { go } = useStore();
  return (
    <AuthShell title="Create your account" sub="Start hunting freelance leads with Scout." layout="stack" cards={AUTH_CARDS_SIGNUP}>
      <div className="clerk-frame">
        <SignUp
          routing="hash"
          signInUrl="/login"
          forceRedirectUrl="/onboarding"
          fallbackRedirectUrl="/onboarding"
        />
      </div>
      <p className="auth-swap">
        <span className="muted">Already have an account?</span>{' '}
        <button className="link" onClick={() => go('login')}>Log in</button>
      </p>
    </AuthShell>
  );
}

type AuthCardIcon = 'hunt' | 'rank' | 'draft' | 'evidence' | 'pipeline' | 'icp';
type AuthCard = { icon: AuthCardIcon; label: string; title: string; tags: readonly string[] };

const AUTH_CARDS_SIGNUP: readonly AuthCard[] = [
  { icon: 'hunt', label: 'Hunt', title: 'Live freelance leads', tags: ['TinyFish search', 'Fresh pages'] },
  { icon: 'rank', label: 'Rank', title: 'Evidence-backed scores', tags: ['Claims, not vibes', 'Clear reasons'] },
  { icon: 'draft', label: 'Draft', title: 'Outreach, one click', tags: ['Drafts only', 'You send it'] },
];

const AUTH_CARDS_LOGIN: readonly AuthCard[] = [
  { icon: 'evidence', label: 'Evidence', title: 'Every claim has a source', tags: ['Page excerpts', 'No invented links'] },
  { icon: 'pipeline', label: 'Pipeline', title: 'From lead to client', tags: ['Your CRM', 'Always yours'] },
  { icon: 'icp', label: 'ICP', title: 'Tune who you sell to', tags: ['Services + budget', 'Drives scoring'] },
];

function CardIcon({ icon }: { icon: AuthCardIcon }) {
  const props = { width: 18, height: 18, 'aria-hidden': true } as const;
  switch (icon) {
    case 'hunt': return <MagnifyingGlassIcon {...props} />;
    case 'rank': return <ChartBarIcon {...props} />;
    case 'draft': return <PaperAirplaneIcon {...props} />;
    case 'evidence': return <ShieldCheckIcon {...props} />;
    case 'pipeline': return <EnvelopeIcon {...props} />;
    case 'icp': return <UserGroupIcon {...props} />;
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
      <p className="t-brand" style={{ margin: 0 }}>scout</p>
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
