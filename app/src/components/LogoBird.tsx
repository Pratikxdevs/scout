/** Brand badge (approved mockups 2026-10-12): ink rounded square (icon-tile
 *  12px radius language) with a paper ring-bird mark. Token-driven so the
 *  badge inverts cleanly in dark mode while always contrasting. */
export function LogoBadge({ size = 28 }: { size?: number }) {
  const mark = size * 0.62;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        background: 'var(--ink)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="var(--paper)" strokeWidth="2.1" />
        <path
          d="M7.2 12.6 L12 8.2 L16.8 12.6"
          stroke="var(--paper)"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="14.6" r="1.5" fill="var(--paper)" stroke="none" />
      </svg>
    </span>
  );
}

