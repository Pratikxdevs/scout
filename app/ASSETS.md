# ASSETS.md – asset system inventory (`app/public/` + fonts)

Rule: no hotlinked images. Every `<img>` carries an onError monogram fallback.

## `public/logos/` – 11 svgl.app brand SVGs (verified 200, real bytes)
| file | bytes | used by |
|---|---|---|
| stripe.svg | 338 | jobs, companies, outreach |
| vercel.svg | 169 | jobs, companies, inbox |
| coinbase.svg | 1255 | jobs, companies |
| cloudflare.svg | 1473 | jobs, companies, inbox |
| microsoft.svg | 356 | jobs, companies, inbox |
| google.svg | 8169 | jobs, companies |
| meta.svg | 2199 | jobs, companies |
| apple.svg | 678 | jobs |
| airbnb.svg | 2149 | jobs, matches (JW-111) |
| notion.svg | 1579 | integrations note |
| figma.svg | 1087 | integrations note |
Missing upstream (404/suspect — monogram fallback covers): tesla, amazon, github, nvidia.
stripe.svg ships Stripe's app-icon composition (brand square + white mark, per
stripe.com's own favicon) instead of the bare glyph. apple.svg and vercel.svg are
dark-on-transparent: `LogoImg` flags them `data-mono` so dark-mode logo tiles invert
them (same treatment as the auth badge mark). Referenced by filename from
`src/data/companies.ts` and the demo scan row in `src/store.tsx`.

## `public/avatars/` – generated initial tiles (local, no dependency)
jc.svg (self, cobalt) · maya.svg (green) · devon.svg (amber) · talent.svg (violet) ·
sam.svg (red) · lee.svg (teal). Sidebar uses `jc.svg`.

## `public/favicon.svg` – brand mark (brand-blue rounded square + orbit).
Wired in `index.html`.

## Fonts (CDN, verified HTTP 200)
Inter Tight 300–600 + Geist Mono 400–500 via Google Fonts. Mono aliases to
`geistMono` fallback chain in CSS.

## Map/globe
No tile dependency — Live Globe uses inline SVG heat placeholder (chart tokens).
