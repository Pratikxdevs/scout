import { useEffect, useState } from 'react';
import {
  HomeIcon, UsersIcon, Cog6ToothIcon,
  EllipsisHorizontalIcon,
  SparklesIcon, BriefcaseIcon,
  BuildingOffice2Icon, PaperAirplaneIcon, InboxIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { useStore, todayStr } from '../store';
import { Avatar, ConfirmDialog } from './ui';
import { UniversalTopbar } from './UniversalTopbar';
import { appliesToday, sendsToday } from '../lib/caps';
import type { Route } from '../types';

/** Single nav truth — drives Sidebar (desktop) + Dock (mobile). */
export interface NavItem { id: string; label: string; icon: React.ReactNode; route: Route | null; badge?: () => string | number | null }
export interface NavGroup { name: string; items: NavItem[] }

/** Flat master in sidebar order. useNav/useSidebarNav/useDock are views over this.
 *  `search` is intentionally absent: chromeless hero is the landing page,
 *  reachable via URL and the search actions (topbar, dock, jobs button).
 *  only (App.tsx) — not a sidebar/dock/more-sheet item. Route union keeps it. */
function useNavItems(): NavItem[] {
  const { apps, replies } = useStore();
  return [
    { id: 'dashboard', label: 'Dashboard', icon: <HomeIcon />, route: 'dashboard' },
    { id: 'jobs', label: 'Find jobs', icon: <BriefcaseIcon />, route: 'jobs' },
    { id: 'applications', label: 'Applications', icon: <UsersIcon />, route: 'applications', badge: () => apps.length || null },
    { id: 'outreach', label: 'Cold outreach', icon: <PaperAirplaneIcon />, route: 'outreach' },
    { id: 'inbox', label: 'Inbox', icon: <InboxIcon />, route: 'inbox', badge: () => replies.length },
    { id: 'settings', label: 'Settings', icon: <Cog6ToothIcon />, route: 'settings' },
    { id: 'companies', label: 'Companies', icon: <BuildingOffice2Icon />, route: 'companies' },
    { id: 'match', label: 'Match rank', icon: <SparklesIcon />, route: 'match' },
  ];
}

export function useNav(): NavGroup[] {
  const items = useNavItems();
  const byId = (id: string): NavItem => items.find(i => i.id === id) as NavItem;
  return [
    { name: 'Search', items: [byId('jobs'), byId('match'), byId('companies')] },
    { name: 'Track', items: [byId('dashboard'), byId('applications')] },
    { name: 'Outreach', items: [byId('outreach'), byId('inbox')] },
    { name: 'Account', items: [byId('settings')] },
  ];
}

/** Flat sidebar order: dashboard first, no funnel, no groups. */
export function useSidebarNav(): NavItem[] {
  return useNavItems();
}

const DOCK_DEF: { id: string; label: string; icon: React.ReactNode; navId?: string; action?: 'more' }[] = [
  { id: 'overview', label: 'Overview', icon: <HomeIcon />, navId: 'dashboard' },
  { id: 'jobs', label: 'Jobs', icon: <BriefcaseIcon />, navId: 'jobs' },
  { id: 'settings', label: 'Settings', icon: <Cog6ToothIcon />, navId: 'settings' },
  { id: 'search', label: 'Search', icon: <SparklesIcon />, navId: 'search' },
  { id: 'more', label: 'More pages', icon: <EllipsisHorizontalIcon />, action: 'more' },
];

/** Dock route targets resolve from the master — rename-proof by construction. */
function useDock(): { id: string; label: string; icon: React.ReactNode; route: Route | null; action?: 'more' }[] {
  const items = useNavItems();
  return DOCK_DEF.map(d => ({
    ...d,
    route: d.navId ? (items.find(i => i.id === d.navId)?.route ?? null) : null,
  }));
}

export function MoreSheet({ onClose }: { onClose: () => void }) {
  const { go } = useStore();
  const dockIds = new Set(useDock().filter(d => d.route).map(d => d.route as Route));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const groups = useNav().map(g => ({ ...g, items: g.items.filter(it => it.route && !dockIds.has(it.route as Route)) })).filter(g => g.items.length);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label="More pages" onClick={e => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 className="t-h2">More pages</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {groups.map(g => (
          <div key={g.name} style={{ marginBottom: 12 }}>
            <p className="sec-label" style={{ margin: '0 0 6px' }}>{g.name}</p>
            {g.items.map(it => (
              <button key={it.id} className="cmd-k" style={{ marginBottom: 6 }} onClick={() => { onClose(); go(it.route as Route); }}>
                <span style={{ display: 'inline-flex', width: 20 }}>{it.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
                <ArrowRightIcon width={15} className="muted" />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fixed universal Topbar — spec lives in UniversalTopbar.tsx. */
export function TopBar() {
  return <UniversalTopbar />;
}

export function Sidebar() {
  const { route, go, apps, sent, profile, logout, usage, backend } = useStore();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const items = useSidebarNav();
  // W8: server usage (today's counts) wins when configured — this also kills
  // the lifetime-count bug (T7). Shared caps helper keeps this meter in
  // step with Applications/Dashboard/Outreach.
  const todayKey = todayStr();
  const { used: usedApps, cap: applyCap } = appliesToday(backend, usage, apps, todayKey);
  const { used: usedSent, cap: outreachCap } = sendsToday(backend, usage, sent, todayKey);
  return (
    <aside className="sidebar" aria-label="Site">
      <nav style={{ display: 'grid', gap: 2 }} aria-label="Pages">
        {items.map(it => {
          const b = it.badge?.() ?? null;
          const on = route === it.route;
          return (
            <a key={it.id} href={`/${it.route}`} aria-current={on ? 'page' : undefined}
              className={'side-item' + (on ? ' on' : '')}
              onClick={e => { e.preventDefault(); go(it.route as Route); }}>
                <span style={{ display: 'inline-flex', width: 20 }}>{it.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
                {b != null ? <span className="mono t-micro" style={{ background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 999, padding: '0 8px' }}>{b}</span> : null}
            </a>
          );
        })}
      </nav>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        <div className="card-inner">
          <p className="sec-label" style={{ margin: '0 0 8px' }}>Daily caps</p>
          <div className="row t-caption" style={{ justifyContent: 'space-between' }}><span>Applies</span><strong className="num">{Math.min(usedApps, applyCap)} / {applyCap}</strong></div>
          <div className="scorebar" style={{ margin: '4px 0 8px' }}><span style={{ width: `${Math.min(100, (usedApps / applyCap) * 100)}%` }} /></div>
          <div className="row t-caption" style={{ justifyContent: 'space-between' }}><span>Outreach</span><strong className="num">{usedSent} / {outreachCap}</strong></div>
          <div className="scorebar" style={{ marginTop: 4 }}><span style={{ width: `${Math.min(100, (usedSent / outreachCap) * 100)}%` }} /></div>
        </div>
        <div className="row" style={{ padding: '0 4px' }}>
          <Avatar url={profile.avatarUrl} initials={profile.initials} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}><strong className="t-small">{profile.name || 'Your account'}</strong>
            <div className="muted t-micro">{profile.status}</div></div>
        </div>
        <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => setConfirmLogout(true)}>Log out</button>
      </div>
      {confirmLogout ? (
        <ConfirmDialog title="Log out?"
          body="You'll return to the login screen. The local copy of your profile and resume on this device is cleared — your account data stays."
          confirmLabel="Log out" onConfirm={logout} onClose={() => setConfirmLogout(false)} />
      ) : null}
    </aside>
  );
}

export function Dock() {
  const { route, go } = useStore();
  const [more, setMore] = useState(false);
  const dock = useDock();
  // The search dock item navigates to the hero page (no master nav entry —
  // the sidebar stays as designed; the hero is the landing, not a section).
  const hrefFor = (d: { id: string; route: Route | null }) =>
    d.route ? `/${d.route}` : d.id === 'search' ? '/search' : '/match';
  const active = (d: { id: string; route: Route | null }) =>
    (d.route && route === d.route) || (d.id === 'search' && route === 'search') ? 'active' : '';
  return (
    <>
      <nav aria-label="Primary" className="dock">
        <div className="dock-inner">
          {dock.map(d => (
            <a key={d.id} href={hrefFor(d)} aria-label={d.label} title={d.label}
              aria-current={active(d) ? 'page' : undefined} className={active(d)}
              onClick={e => {
                e.preventDefault();
                if (d.route) go(d.route);
                else if (d.id === 'search') go('search');
                else if (d.action === 'more') setMore(true);
              }}>
              {d.icon}
            </a>
          ))}
        </div>
      </nav>
      {more ? <MoreSheet onClose={() => setMore(false)} /> : null}
    </>
  );
}
