import { useEffect, useState } from 'react';
import { ArrowUpIcon } from '@heroicons/react/24/outline';

/** Skip link — first tab stop, jumps to the main column. */
export function SkipLink() {
  return (
    <a className="skip-link" href="#main">
      Skip to content
    </a>
  );
}

/** Thin reading-progress bar pinned to the viewport top. Decorative. */
export function ScrollProgress() {
  const [frac, setFrac] = useState(0);
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setFrac(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  if (frac <= 0) return null;
  return (
    <div className="scroll-progress" aria-hidden="true">
      <span style={{ transform: `scaleX(${frac})` }} />
    </div>
  );
}

const TOP_AFTER = 600;

/** Back-to-top — appears after scrolling past one viewport-ish chunk. */
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > TOP_AFTER);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  const top = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };
  return (
    <button type="button" className="back-top" aria-label="Back to top" title="Back to top" onClick={top}>
      <ArrowUpIcon width={18} strokeWidth={2} />
    </button>
  );
}
