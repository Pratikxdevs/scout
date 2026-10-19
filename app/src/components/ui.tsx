import React, { memo, useEffect, useRef, useState, type CSSProperties } from 'react';

/** Stagger index for .rise entrance (pure-CSS, delay = 80ms * i). */
export const stagger = (i: number): CSSProperties => ({ '--i': i } as CSSProperties);
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, LockClosedIcon, PencilSquareIcon, Square2StackIcon, UserIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

export function Card({ children, label, action, className }: { children: React.ReactNode; label?: string; action?: React.ReactNode; className?: string }) {
  return (
    <section className={'card rise' + (className ? ' ' + className : '')}>
      <div className="card-pad" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
        {(label || action) ? (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            {label ? <span className="sec-label">{label}</span> : <span />}
            {action}
          </div>
        ) : null}
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </section>
  );
}

const statusIcon = {
  ok: <CheckCircleIcon width={13} />, warn: <ExclamationTriangleIcon width={13} />,
  bad: <XCircleIcon width={13} />, info: <InformationCircleIcon width={13} />,
};

export type ChipKind = 'ok' | 'warn' | 'bad' | 'info';
/** Single status→kind mapping (was copy-pasted in 4 features). */
export function appStatusKind(s: string): ChipKind {
  return s === 'INTERVIEW SET' || s === 'OFFERED' ? 'ok' : s === 'REJECTED' ? 'bad' : s === 'WITHDRAWN' ? 'warn' : s === 'UNDER REVIEW' ? 'info' : 'info';
}
export function Status({ kind, children }: { kind: 'ok' | 'warn' | 'bad' | 'info'; children: React.ReactNode }) {
  return <span className={`chip ${kind}`}>{statusIcon[kind]}{children}</span>;
}

export function Empty({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  // Flex column + gap (not bare stacked blocks): title and button can never
  // overlap, however long the title wraps. Position/z-index isolate the card
  // from sticky bars above it in scroll panes. Action is optional — only
  // render a button when it can actually change the outcome (rule: never a
  // control that can't work).
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center', padding: '30px 16px', position: 'relative', zIndex: 0 }}>
      <p className="muted t-small" style={{ margin: 0, maxWidth: '52ch' }}>{title}</p>
      {action && onAction ? <button className="btn" onClick={onAction}>{action}</button> : null}
    </div>
  );
}

/** Brand glyphs that ship dark-on-transparent (no tile color of their own):
 *  inverted on dark tiles so they never vanish — same treatment as the
 *  auth badge mark. Colored and square marks are left untouched. */
const DARK_INVERT = new Set(['apple.svg', 'vercel.svg']);

export const LogoImg = memo(function LogoImg({ file, name, size = 40 }: { file?: string; name: string; size?: number }) {
  const [err, setErr] = React.useState(false);
  if (!file || err) {
    return (
      <span className="logo-tile" style={{ width: size, height: size }} aria-hidden="true">
        <span style={{ fontSize: size * 0.36, color: 'var(--ink)' }}>{name.slice(0, 2).toUpperCase()}</span>
      </span>
    );
  }
  return (
    <span className="logo-tile" style={{ width: size, height: size }}>
      <img src={`/logos/${file}`} alt="" loading="lazy" decoding="async"
        data-mono={DARK_INVERT.has(file) ? '' : undefined} onError={() => setErr(true)} />
    </span>
  );
});

export function Pager({ page, pages, range, onPage }: {
  page: number; pages: number; range: string; onPage: (p: number) => void;
}) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className="muted mono t-caption">{range}</span>
      <span className="row">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹ Prev</button>
        <span className="mono t-caption" aria-live="polite">{page} / {pages}</span>
        <button className="btn btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">Next ›</button>
      </span>
    </div>
  );
}

/** Two-step inline confirm — replaces window.confirm() with honest in-flow UI. */
export function ConfirmButton({ label, confirmLabel, onConfirm }: {
  label: string; confirmLabel: string; onConfirm: () => void;
}) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!armed) return <button className="btn btn-ghost" onClick={() => setArmed(true)}>{label}</button>;
  return (
    <span className="row">
      <span className="t-small">{confirmLabel}</span>
      <button className="btn btn-ghost" onClick={() => { setArmed(false); onConfirm(); }}>Confirm</button>
      <button className="btn btn-ghost" onClick={() => setArmed(false)}>Keep</button>
    </span>
  );
}

/** Modal confirm for destructive actions — same pattern as app modals:
 *  backdrop click-to-close, Escape with cleanup, labelled dialog. */
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose }: {
  title: string; body: React.ReactNode; confirmLabel: string;
  onConfirm: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label={title}
        onClick={e => e.stopPropagation()} style={{ display: 'grid', gap: 12 }}>
        <h2 className="t-h2">{title}</h2>
        <div className="muted t-small" style={{ margin: 0 }}>{body}</div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Keep</button>
          <button type="button" className="btn" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** Form result note — success and error share one shape; kind picks
 *  color + icon + live-region role, never motion or color alone. */
export function FormNote({ kind, children }: { kind: 'ok' | 'err'; children: React.ReactNode }) {
  const Icon = kind === 'ok' ? CheckCircleIcon : XCircleIcon;
  return (
    <p className="form-note" data-kind={kind} role={kind === 'ok' ? 'status' : 'alert'} style={{ margin: 0 }}>
      <Icon aria-hidden="true" /> <span>{children}</span>
    </p>
  );
}

/** Password field with inside reveal toggle (auth markup, shared). */
export function PasswordField({ id, label, value, onChange, autoComplete, placeholder, minLength, describedBy, invalid }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  autoComplete: string; placeholder?: string; minLength?: number;
  describedBy?: string; invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="lbl" htmlFor={id}>{label}</label>
      <div className="auth-pwrow">
        <span className="icon-field">
          <span aria-hidden="true" className="icon-field-ic"><LockClosedIcon width={16} /></span>
          <input id={id} type={show ? 'text' : 'password'} required value={value}
            minLength={minLength} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} autoComplete={autoComplete}
            aria-invalid={invalid || undefined} aria-describedby={describedBy} />
        </span>
        <button type="button" className="auth-show" onClick={() => setShow(s => !s)}
          aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
      </div>
    </div>
  );
}

/** Copy-to-clipboard button with honest transient feedback. */
export function CopyButton({ getText, className, idleLabel, doneLabel = 'Copied!', onDone }: {
  getText: string | (() => string); className?: string;
  idleLabel: string; doneLabel?: string; onDone?: () => void;
}) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(t);
  }, [done]);
  const copy = async () => {
    const text = typeof getText === 'function' ? getText() : getText;
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
    setDone(true);
    onDone?.();
  };
  return (
    <button type="button" className={'copy-btn ' + (className ?? '')} onClick={copy}>
      <Square2StackIcon aria-hidden="true" /> {done ? doneLabel : idleLabel}
      <span className="sr-only" role="status">{done ? doneLabel : ''}</span>
    </button>
  );
}

/** Skeleton loading block — shimmer-free pulse rows for pending panes. */
export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skel skel-pulse" />
      ))}
    </div>
  );
}

/** Last-updated stamp — tabular numerals, honest empty state. */
export function LastUpdated({ at, prefix = 'Updated' }: { at: string | number | null; prefix?: string }) {
  if (at == null) return <span className="muted t-caption">Not updated yet</span>;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return <span className="muted t-caption">Not updated yet</span>;
  const s = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return <span className="muted t-caption num">{prefix} {s}</span>;
}

export function Ring({ used, total, size = 56 }: { used: number; total: number; size?: number }) {
  const r = (size / 2 - 6), c = 2 * Math.PI * r, frac = total ? Math.min(1, used / total) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${used} of ${total} used`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="6" style={{ stroke: 'var(--border)' }} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="6" strokeLinecap="round" style={{ stroke: 'var(--success)' }}
        strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, color: 'var(--primary-ink)' }} aria-hidden="true">
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
        <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

/** Read-only avatar: photo when available, initials otherwise. A failed
 *  image load (expired signed URL) falls back to initials, never a broken icon. */
export function Avatar({ url, initials, size = 32, className }: {
  url?: string; initials: string; size?: number; className?: string;
}) {
  const [err, setErr] = useState(false);
  const cls = 'avatar' + (className ? ' ' + className : '');
  const label = initials.trim();
  if (url !== undefined && url !== '' && !err) {
    return <img src={url} alt="" width={size} height={size} className={cls} style={{ width: size, height: size }} onError={() => setErr(true)} />;
  }
  return (
    <span className={cls} aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {label === '' ? <UserIcon width={Math.round(size * 0.48)} height={Math.round(size * 0.48)} /> : label}
    </span>
  );
}

/** Avatar with a pencil-edit overlay — onPick receives the chosen image. */
export function EditableAvatar({ url, initials, size = 96, busy, onPick }: {
  url?: string; initials: string; size?: number; busy?: boolean; onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="ava-edit" style={{ width: size, height: size }}>
      <Avatar url={url} initials={initials} size={size} />
      <input ref={ref} type="file" accept="image/*" hidden aria-label="Choose profile photo"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
      <button type="button" className="ava-edit-btn" aria-label="Change profile photo" disabled={busy}
        onClick={() => ref.current?.click()}>
        <PencilSquareIcon width={14} />
      </button>
    </span>
  );
}

/** Tag entry for multi-value fields (skills, target roles): Enter or comma
 *  commits; blanks and duplicates are dropped; capped at `max`. Pair with a
 *  <label htmlFor={id}> as usual. */
export function ChipInput({ id, values, onChange, placeholder, max = 40 }: {
  id: string; values: string[]; onChange: (v: string[]) => void;
  placeholder?: string; max?: number;
}) {
  const [input, setInput] = useState('');
  const atMax = values.length >= max;
  const add = () => {
    const v = input.trim().replace(/,+$/, '').trim();
    if (v === '' || values.includes(v) || atMax) {
      setInput('');
      return;
    }
    onChange([...values, v]);
    setInput('');
  };
  return (
    <div>
      <div className="skills-box">
        {values.map(s => (
          <span key={s} className="skill-tag">{s}
            <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(values.filter(x => x !== s))}>
              <XMarkIcon width={13} />
            </button>
          </span>
        ))}
        <input id={id} placeholder={atMax ? 'Limit reached' : placeholder} value={input}
          onChange={e => setInput(e.target.value)} disabled={atMax}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          onBlur={add} />
      </div>
      {atMax ? (
        <p className="muted t-caption" role="status" style={{ margin: '6px 0 0' }}>
          Limit reached ({max}) — remove one to add another.
        </p>
      ) : null}
    </div>
  );
}
