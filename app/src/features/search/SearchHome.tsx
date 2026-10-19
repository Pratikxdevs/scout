import { useEffect, useRef, useState } from 'react';
import { ArrowUpIcon } from '@heroicons/react/24/outline';
import { useStore } from '../../store';
import { CHIP_DOT, SEARCH_CHIPS, toggleChipToken } from '../../lib/searchChips';

function DocMark() {
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex' }}>
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
        <rect x="9" y="4" width="16" height="22" rx="3" style={{ fill: 'var(--info)' }} />
        <rect x="9" y="4" width="16" height="22" rx="3" fill="white" fillOpacity=".18" />
        <rect x="12.5" y="9" width="9" height="2.4" rx="1.2" fill="white" />
        <rect x="12.5" y="13" width="9" height="1.6" rx=".8" fill="white" fillOpacity=".75" />
        <rect x="12.5" y="16.2" width="6" height="1.6" rx=".8" fill="white" fillOpacity=".55" />
        <rect x="7" y="8" width="4" height="18" rx="2" style={{ fill: 'var(--info)' }} fillOpacity=".35" />
      </svg>
    </span>
  );
}

/**
 * Behaviours (kept exactly):
 * - autofocus on mount
 * - Enter (no shift) submits, Shift+Enter newline
 * - Esc returns to dashboard
 * - chips toggle space-separated tokens, aria-pressed reflects state
 * - submit disabled when empty; maps query to feed filters via setSearch + go('jobs')
 */
export function SearchHome() {
  const { setSearch, go } = useStore();
  const [q, setQ] = useState('');
  const toggle = (label: string) => setQ(toggleChipToken(q, label));
  const submit = () => {
    if (!q.trim()) return;
    setSearch(q.trim());
    go('jobs');
  };
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') go('dashboard');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  const ready = q.trim().length > 0;
  return (
    <div className="search-hero">
      <div className="search-hero-inner">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <DocMark />
      </div>
      <h1 className="search-title">What are you looking for?</h1>
      <div className="search-card">
        <label className="sr-only" htmlFor="hero-search">Describe the role you want</label>
        <textarea
          ref={input}
          id="hero-search"
          rows={4}
          value={q}
          maxLength={2000}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Title, company, location, seniority, tech..."
          className="search-input"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={submit}
            disabled={!ready}
            aria-label="Search roles"
            title="Search roles"
            className="search-go"
            data-ready={ready}
          >
            <ArrowUpIcon width={18} />
          </button>
        </div>
      </div>
      <div className="search-chips" role="group" aria-label="Suggested searches">
        {SEARCH_CHIPS.map(c => {
          const on = q.split(/\s+/).includes(c.label);
          return (
            <button
              key={c.label}
              onClick={() => toggle(c.label)}
              aria-pressed={on}
              className="search-chip"
              data-on={on}
            >
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: CHIP_DOT[c.kind], display: 'inline-block', flexShrink: 0 }} />
              {c.label}
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
