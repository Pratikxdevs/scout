import { BellIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useStore } from '../store';
import { LogoBadge } from './LogoBird';

/**
 * Fixed universal Topbar / Nav bezel.
 * Minimal: jobwzrd brand left, search + notifications right.
 * Flat off-white silhouette with white edges, no frost, no links.
 */

/** Narrow bezel silhouette (~75% width) — flat top bleeds off viewport at y=0,
 *  ~56deg straight diagonal chamfers, tangent-smooth bottom joins. */
const UNI_BEZEL_D =
  'M210,62 H990 C1004,62 1018,60 1026,48 L1058,0 H142 L174,48 C182,60 196,62 210,62 Z';

export function UniversalTopbar() {
  const { go, notif } = useStore();
  return (
    <header className="uni-wrap fixed inset-x-0 top-0 z-50 px-[7px] md:px-3 pt-[env(safe-area-inset-top)] pointer-events-none">
      <nav className="uni-nav pointer-events-auto relative w-full h-12 md:h-14" aria-label="Primary">
        {/* SHAPE */}
        <svg
          aria-hidden
          className="uni-shape absolute inset-0 w-full h-full"
          viewBox="0 0 1200 72"
          preserveAspectRatio="none"
        >
          <path d={UNI_BEZEL_D} strokeWidth={1} style={{ fill: 'var(--card)', stroke: 'var(--border)' }} />
        </svg>
        {/* INNER */}
        <div className="uni-inner relative z-10 flex items-center justify-between h-full">
          <a
            className="uni-brand"
            href="/dashboard"
            aria-label="jobwzrd home"
            onClick={e => {
              e.preventDefault();
              go('dashboard');
            }}
          >
            <span className="uni-brand-bird">
              <LogoBadge size={28} />
            </span>
            <span className="uni-word">jobwzrd</span>
          </a>
          <div className="uni-actions">
            <button
              type="button"
              className="uni-icon"
              aria-label="Search"
              title="Search"
              onClick={() => go('search')}
            >
              <MagnifyingGlassIcon />
            </button>
            <button
              type="button"
              className="uni-icon"
              aria-label={`Notifications${notif ? `, ${notif} unread` : ''}`}
              title="Notifications"
              onClick={() => go('inbox')}
            >
              <BellIcon />
              {notif > 0 ? <span className="uni-badge">{notif}</span> : null}
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
}
