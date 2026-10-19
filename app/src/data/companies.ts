/**
 * Editorial company research profiles (copy, not data). They power the
 * Companies hub's static tabs; every count comes from the live job feed and
 * every contact/log row from the user's own activity. Rows do NOT carry a
 * role count — a hardcoded total is always stale and often false.
 */
import type { Job } from '../types';

export interface CompanyProfile {
  name: string; logo?: string; sector: string; segment: string;
  staff?: string; blurb?: string; hq?: string;
  website?: string; founded?: string; tags?: string[]; about?: string;
}
export interface CompanyEntry extends CompanyProfile {
  /** Open roles in the current feed, case-insensitive company match. */
  openRoles: number;
}

export const COMPANY_PROFILES: CompanyProfile[] = [
  { name: 'Stripe', logo: 'stripe.svg', sector: 'Fintech', segment: 'Fintech', staff: '8,000+', blurb: 'Financial infrastructure for the internet. Millions of businesses run on Stripe.',
    hq: 'San Francisco, CA, USA', website: 'https://stripe.com', founded: '2010',
    tags: ['Payments', 'Fintech', 'APIs', 'Developer tools', 'Global'],
    about: 'Stripe builds financial infrastructure for the internet. Millions of businesses — from the world\u2019s largest enterprises to the most ambitious startups — use Stripe to accept payments, grow revenue, and automate financial processes.' },
  { name: 'Vercel', logo: 'vercel.svg', sector: 'DevTools', segment: 'DevTools', staff: '800+', blurb: 'Frontend cloud. Build, deploy and scale fast web apps.',
    hq: 'San Francisco, CA, USA', website: 'https://vercel.com', founded: '2015',
    tags: ['Frontend', 'DevTools', 'Edge', 'Next.js', 'Global'],
    about: 'Vercel provides the frontend cloud: instant deploys, edge rendering and analytics for modern web teams shipping at startup speed.' },
  { name: 'Coinbase', logo: 'coinbase.svg', sector: 'Web3', segment: 'Web3', staff: '3,400+', blurb: 'Building the cryptoeconomy — open financial rails for everyone.',
    hq: 'Remote-first, USA', website: 'https://coinbase.com', founded: '2012',
    tags: ['Crypto', 'Web3', 'Exchange', 'Custody', 'Global'],
    about: 'Coinbase is building the cryptoeconomy: a fairer, more open financial system with exchange, custody and developer rails.' },
  { name: 'Cloudflare', logo: 'cloudflare.svg', sector: 'Cloud', segment: 'Infrastructure', staff: '3,200+', blurb: 'Edge security, DDoS mitigation and CDN for millions of sites.',
    hq: 'San Francisco, CA, USA', website: 'https://cloudflare.com', founded: '2009',
    tags: ['Edge', 'Security', 'CDN', 'Zero Trust', 'Global'],
    about: 'Cloudflare runs a global edge network delivering security, performance and reliability for millions of internet properties.' },
  { name: 'Microsoft', logo: 'microsoft.svg', sector: 'Cloud', segment: 'Cloud', staff: '220,000+', blurb: 'Intelligent cloud and intelligent edge, planet scale.',
    hq: 'Redmond, WA, USA', website: 'https://microsoft.com', founded: '1975',
    tags: ['Cloud', 'AI', 'Enterprise', 'Security', 'Global'],
    about: 'Microsoft builds intelligent cloud and edge platforms, developer tools and AI systems used by organizations worldwide.' },
  { name: 'Google', logo: 'google.svg', sector: 'Cloud', segment: 'Search / Cloud', staff: '180,000+', blurb: 'Search, ads, cloud and hardware at global scale.',
    hq: 'Mountain View, CA, USA', website: 'https://google.com', founded: '1998',
    tags: ['Search', 'Cloud', 'AI', 'Ads', 'Global'],
    about: 'Google organizes the world\u2019s information across search, cloud, ads and hardware, with AI research at planetary scale.' },
  { name: 'Meta', logo: 'meta.svg', sector: 'Social', segment: 'Social / AR', staff: '70,000+', blurb: 'Connection tech: social, communities, AR/VR.',
    hq: 'Menlo Park, CA, USA', website: 'https://meta.com', founded: '2004',
    tags: ['Social', 'AR/VR', 'Mobile', 'AI', 'Global'],
    about: 'Meta builds connection technology across social apps, communities and AR/VR hardware for billions of people.' },
  { name: 'Apple', logo: 'apple.svg', sector: 'Hardware', segment: 'Hardware', staff: '160,000+', blurb: 'Consumer electronics, software and services.',
    hq: 'Cupertino, CA, USA', website: 'https://apple.com', founded: '1976',
    tags: ['Hardware', 'Software', 'Services', 'Design', 'Global'],
    about: 'Apple designs consumer electronics, operating systems and services known for hardware-software integration.' },
];

const slug = (s: string): string => s.trim().toLowerCase();

/**
 * Editorial profiles + any employer that appears only in the live feed.
 * `openRoles` is counted from that feed, never stored. Sorting puts the
 * companies with current roles first, then alphabetical.
 */
export function buildCompanyCatalog(jobs: Job[]): CompanyEntry[] {
  const counts = new Map<string, number>();
  const firstJob = new Map<string, Job>();
  for (const job of jobs) {
    const key = slug(job.company);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!firstJob.has(key)) firstJob.set(key, job);
  }
  const out: CompanyEntry[] = COMPANY_PROFILES.map((p) => ({
    ...p,
    openRoles: counts.get(slug(p.name)) ?? 0,
  }));
  const known = new Set(COMPANY_PROFILES.map((p) => slug(p.name)));
  for (const [key, openRoles] of counts) {
    if (known.has(key)) continue;
    const job = firstJob.get(key);
    if (!job) continue;
    const name = job.company.trim();
    out.push({
      name,
      ...(job.logo !== undefined ? { logo: job.logo } : {}),
      sector: 'Other',
      segment: 'From your feed',
      openRoles,
      blurb: `${name} appears in your current job feed.`,
      about: `${name} is hiring for roles in your current feed. Company research for this employer is not available yet.`,
      tags: [],
    });
  }
  return out.sort((a, b) => b.openRoles - a.openRoles || a.name.localeCompare(b.name));
}
