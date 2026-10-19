import { useState } from 'react';

/**
 * Hero background. Prefers a real photo at /hero-mountains.jpg (drop the file
 * into app/public/ and it is used automatically); falls back to a faithful
 * SVG recreation of the reference frame: warm cream sky, sun glow right of
 * center, layered blue-gray ridges, thick mid fog bank, dark pines bottom-right.
 */
function Artwork() {
  const ridge = (d: string, fill: string, o: number) => (
    <path d={`${d} L1200,360 L0,360 Z`} fill={fill} opacity={o} />
  );
  const pine = (x: number, base: number, h: number, w: number, o: number, key: number) => (
    <g key={key} opacity={o}>
      <polygon points={`${x},${base - h} ${x - w},${base} ${x + w},${base}`} fill="#2c463f" />
      <polygon points={`${x},${base - h - 13} ${x - w * 0.7},${base - 9} ${x + w * 0.7},${base - 9}`} fill="#38574e" />
      <polygon points={`${x},${base - h - 24} ${x - w * 0.44},${base - 18} ${x + w * 0.44},${base - 18}`} fill="#46665c" />
      <rect x={x - 2} y={base} width={4} height={10} fill="#2c463f" />
    </g>
  );
  const cluster = (x0: number, base: number, n: number, seed: number) =>
    Array.from({ length: n }, (_, i) => {
      const x = x0 + ((i * 47 + seed * 31) % 300);
      const h = 40 + ((i * 43 + seed * 19) % 56);
      const w = 14 + ((i * 29 + seed * 11) % 10);
      const o = 0.6 + ((i * 17 + seed * 7) % 40) / 100;
      return pine(x, base + ((i * 37) % 12), h, w, o, seed * 100 + i);
    });
  return (
    <svg viewBox="0 0 1200 360" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="jw-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8f4ec" />
          <stop offset=".45" stopColor="#f6efe2" />
          <stop offset=".72" stopColor="#ece9e0" />
          <stop offset="1" stopColor="#dfe5e0" />
        </linearGradient>
        <radialGradient id="jw-sun" cx=".68" cy=".42" r=".34">
          <stop offset="0" stopColor="#fbeed3" stopOpacity=".95" />
          <stop offset=".55" stopColor="#f7e8d2" stopOpacity=".45" />
          <stop offset="1" stopColor="#f7e8d2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="jw-scrim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".36" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset=".6" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="jw-fog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#f4f5f1" stopOpacity=".9" />
        </linearGradient>
        <filter id="jw-grain">
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width="1200" height="360" fill="url(#jw-sky)" />
      <rect width="1200" height="360" fill="url(#jw-sun)" />
      {ridge('M0,204 L150,172 L300,198 L470,158 L640,196 L820,168 L1000,200 L1200,170', '#ccd5d0', 0.7)}
      {ridge('M0,232 L180,196 L360,226 L560,190 L760,224 L960,196 L1200,226', '#b4c2b9', 0.8)}
      <path d="M600,202 L752,124 L904,202 Z" fill="#9dada5" />
      <path d="M752,124 L818,158 L752,144 L688,162 Z" fill="#eef0ea" opacity=".95" />
      <path d="M920,192 L1040,140 L1160,192 Z" fill="#a7b6ad" opacity=".9" />
      {ridge('M0,258 L220,228 L440,256 L660,226 L900,256 L1200,230', '#93a79d', 0.85)}
      <rect width="1200" height="130" y="196" fill="url(#jw-fog)" />
      {ridge('M0,290 L260,260 L500,288 L780,258 L1040,290 L1200,270', '#7f9389', 0.92)}
      {ridge('M0,322 L340,292 L660,320 L980,296 L1200,318', '#6d837a', 0.95)}
      {cluster(880, 344, 26, 3)}
      {cluster(660, 334, 10, 11)}
      {cluster(1090, 350, 12, 23)}
      <rect width="1200" height="110" y="250" fill="#ffffff" opacity=".32" />
      <rect width="1200" height="360" fill="url(#jw-scrim)" />
      <rect width="1200" height="360" filter="url(#jw-grain)" opacity=".05" />
    </svg>
  );
}

export function HeroArt() {
  const [photo, setPhoto] = useState(true);
  return (
    <div className="hero-art" aria-hidden="true">
      {photo ? (
        <img
          src="/hero-mountains.svg"
          alt=""
          onError={() => setPhoto(false)}
        />
      ) : (
        <Artwork />
      )}
      <div className="hero-scrim" aria-hidden="true" />
    </div>
  );
}
