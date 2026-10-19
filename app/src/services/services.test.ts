import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Application, Job } from '../types.ts';
import {
  APPLY_CAP,
  OUTREACH_CAP,
  DemoApplicationService,
  DemoJobService,
  DemoOutreachService,
  salaryFloor,
  scoreMatch,
  searchJobs,
  selectFunnel,
} from './demo.ts';
import {
  HttpApplicationService,
  HttpJobService,
  applicationToLocal,
  compensationFromK,
  draftToCompanyLog,
  draftToMail,
  execToDemo,
  extractRequirements,
  normalizeJobType,
  notificationToHotReply,
  postingText,
  replyToLocal,
  resumeToLocal,
  resultToJob,
  salaryText,
  savedToJob,
} from './http.ts';

const DAY = '01-01-99';

function app(jobId: string, date: string = DAY, status: Application['status'] = 'UNDER REVIEW'): Application {
  return {
    id: `app-${jobId}-${date}`, jobId, title: 'T', company: 'C',
    appliedDate: date, updatedAt: date, status,
  };
}

function job(partial: Partial<Job> & { id: string }): Job {
  return {
    title: 'T', company: 'C', location: 'Remote', compensation: '$100k',
    description: 'd', requirements: ['React'], match: 80, url: 'https://x',
    posted: 'now', type: 'Full-time', ...partial,
  };
}

describe('canApply caps + honesty (TASKS T17: exact boundaries)', () => {
  it('allows the first application with honest copy', () => {
    const r = DemoApplicationService.canApply([], 'JW-1', DAY);
    assert.equal(r.ok, true);
    assert.match(r.message, /recorded locally/i);
    assert.match(r.message, /not submitted/i);
  });

  it('rejects duplicates without spending cap', () => {
    const r = DemoApplicationService.canApply([app('JW-1')], 'JW-1', DAY);
    assert.equal(r.ok, false);
    assert.match(r.message, /already/i);
  });

  it(`caps at exactly ${APPLY_CAP}/day (4 ok, 5th ok, 6th refused)`, () => {
    const four = ['a', 'b', 'c', 'd'].map((j) => app(j));
    assert.equal(DemoApplicationService.canApply(four, 'JW-5', DAY).ok, true);
    const five = [...four, app('JW-5')];
    const r = DemoApplicationService.canApply(five, 'JW-6', DAY);
    assert.equal(r.ok, false);
    assert.match(r.message, new RegExp(`${APPLY_CAP}/day`));
  });

  it('counts only today — yesterday never charges the cap', () => {
    const olds = ['a', 'b', 'c', 'd', 'e'].map((j) => app(j, '12-31-98'));
    assert.equal(DemoApplicationService.canApply(olds, 'JW-9', DAY).ok, true);
  });
});

describe('application state machine', () => {
  it('advances UNDER REVIEW -> INTERVIEW SET -> OFFERED -> null', () => {
    assert.equal(DemoApplicationService.nextStatus('UNDER REVIEW'), 'INTERVIEW SET');
    assert.equal(DemoApplicationService.nextStatus('INTERVIEW SET'), 'OFFERED');
    assert.equal(DemoApplicationService.nextStatus('OFFERED'), null);
    assert.equal(DemoApplicationService.nextStatus('REJECTED'), null);
    assert.equal(DemoApplicationService.nextStatus('WITHDRAWN'), null);
  });

  it('advance stamps today and withdraw marks WITHDRAWN', () => {
    const rows = [app('JW-1')];
    const adv = DemoApplicationService.advance(rows, rows[0].id, DAY);
    assert.equal(adv[0].status, 'INTERVIEW SET');
    assert.equal(adv[0].updatedAt, DAY);
    const wd = DemoApplicationService.withdraw(adv, rows[0].id);
    assert.equal(wd[0].status, 'WITHDRAWN');
  });
});

describe('canSend caps + honesty', () => {
  it(`caps at exactly ${OUTREACH_CAP}/day`, () => {
    assert.equal(DemoOutreachService.canSend(49, 'r@co.com').ok, true);
    const r = DemoOutreachService.canSend(50, 'r@co.com');
    assert.equal(r.ok, false);
    assert.match(r.message, new RegExp(`${OUTREACH_CAP}/day`));
    assert.match(r.message, /Nothing was emailed/);
  });

  it('rejects malformed recipient with guidance, not silence', () => {
    const r = DemoOutreachService.canSend(0, 'not-an-email');
    assert.equal(r.ok, false);
    assert.match(r.message, /valid.*email/i);
  });

  it('exposes all five reply categories', () => {
    assert.deepEqual(DemoOutreachService.categories(), [
      'Interested', 'Might be Interested', 'Interview Scheduled',
      'Auto-response', 'Not Interested',
    ]);
  });
});

describe('salaryFloor edges', () => {
  it('parses lower bounds, NaN when absent', () => {
    assert.equal(salaryFloor('$150k – $180k'), 150);
    assert.equal(salaryFloor('$130k+'), 130);
    assert.ok(Number.isNaN(salaryFloor('Competitive')));
    assert.ok(Number.isNaN(salaryFloor('')));
    assert.equal(salaryFloor('$0k'), 0);
  });
});

describe('DemoJobService.query + paginate', () => {
  const rows = [
    job({ id: 'JW-1', title: 'Frontend Engineer', company: 'Acme', location: 'Remote', compensation: '$150k', match: 90, isSaved: true, requirements: ['React'] }),
    job({ id: 'JW-2', title: 'Backend Engineer', company: 'Beta', location: 'Berlin', compensation: '$80k', match: 70, requirements: ['Go'] }),
    job({ id: 'JW-3', title: 'Designer', company: 'Gamma', location: 'Paris', compensation: 'Competitive', match: 60, requirements: ['Figma'] }),
  ];

  it('filters savedOnly, keyword, location, remote exclusion', () => {
    const base = { search: '', keyword: '', location: '', includeRemote: true, savedOnly: false, sort: 'match' as const };
    assert.equal(DemoJobService.query(rows, { ...base, savedOnly: true }).length, 1);
    assert.equal(DemoJobService.query(rows, { ...base, keyword: 'backend' })[0].id, 'JW-2');
    assert.equal(DemoJobService.query(rows, { ...base, location: 'berlin' })[0].id, 'JW-2');
    assert.equal(DemoJobService.query(rows, { ...base, includeRemote: false }).length, 2);
  });

  it('salary bounds exclude NaN-floor rows (documented behavior)', () => {
    const base = { search: '', keyword: '', location: '', includeRemote: true, savedOnly: false, sort: 'match' as const };
    const out = DemoJobService.query(rows, { ...base, salaryMin: 50 });
    assert.deepEqual(out.map((j) => j.id), ['JW-1', 'JW-2']);
  });

  it('sorts by match desc or newest id', () => {
    const base = { search: '', keyword: '', location: '', includeRemote: true, savedOnly: false, sort: 'match' as const };
    assert.deepEqual(DemoJobService.query(rows, base).map((j) => j.id), ['JW-1', 'JW-2', 'JW-3']);
    const byNew = DemoJobService.query(rows, { ...base, sort: 'new' as const });
    assert.deepEqual(byNew.map((j) => j.id), ['JW-3', 'JW-2', 'JW-1']);
  });

  it('paginate clamps page 0 and overflow', () => {
    assert.equal(DemoJobService.paginate(rows, 0, 2).rows.length, 2);
    const over = DemoJobService.paginate(rows, 99, 2);
    assert.equal(over.rows.length, 1);
    assert.equal(over.total, 3);
    assert.equal(over.pages, 2);
  });

  it('rank explains matched vs missing skills', () => {
    const ranked = DemoJobService.rank(rows, 'React, Go, Rust');
    assert.equal(ranked[0].job.id, 'JW-1');
    assert.deepEqual(ranked[0].matched, ['react']);
    assert.ok(ranked[0].missing.includes('go'));
  });
});

describe('selectFunnel + searchJobs', () => {
  it('derives the funnel from live state (no magic except documented +13)', () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b' })];
    const apps = [app('a', DAY, 'INTERVIEW SET'), app('b', DAY, 'OFFERED')];
    const f = selectFunnel(jobs, apps);
    assert.deepEqual(f.map((x) => x.name), ['Fetched', 'Filtered', 'Applied', 'Interviews', 'Offers']);
    assert.equal(f[1].value, 2);
    assert.equal(f[2].value, 2);
    assert.equal(f[3].value, 1);
    assert.equal(f[4].value, 1);
  });

  it('searchJobs returns top-N substring matches, 4 on empty query', () => {
    const rows = [job({ id: 'a', title: 'React Dev' }), job({ id: 'b', title: 'Go Dev' })];
    assert.equal(searchJobs(rows, '').length, 2);
    assert.equal(searchJobs(rows, 'react')[0].id, 'a');
    assert.equal(searchJobs(rows, 'react', 1).length, 1);
  });
});

describe('HTTP mappers (04-04 display contracts)', () => {
  it('execToDemo maps all 7 exec states, holds stay UNDER REVIEW', () => {
    assert.equal(execToDemo('queued'), 'UNDER REVIEW');
    assert.equal(execToDemo('running'), 'UNDER REVIEW');
    assert.equal(execToDemo('submitted'), 'UNDER REVIEW');
    assert.equal(execToDemo('needs_user_action'), 'UNDER REVIEW');
    assert.equal(execToDemo('needs_review'), 'UNDER REVIEW');
    assert.equal(execToDemo('failed'), 'REJECTED');
    assert.equal(execToDemo('cancelled'), 'WITHDRAWN');
  });

  it('applicationToLocal falls back honestly on thin snapshots', () => {
    const row = applicationToLocal({
      _id: 'abc', canonicalUrl: 'https://x/j', jobSnapshot: {},
      status: 'queued', createdAt: Date.now(),
    });
    assert.equal(row.id, 'abc');
    assert.equal(row.serverId, 'abc');
    assert.equal(row.title, 'https://x/j');
    assert.equal(row.company, '');
    assert.equal(row.status, 'UNDER REVIEW');
  });

  it('salaryText handles string/objects/absent without throwing', () => {
    assert.equal(salaryText('$120k'), '$120k');
    assert.equal(salaryText({ min: 100, max: 150 }), '$100k – $150k');
    assert.equal(salaryText({ min: 100 }), '$100k+');
    assert.equal(salaryText(undefined), '');
    assert.equal(salaryText(42), '');
  });

  it('savedToJob marks saved rows and tolerates thin rows', () => {
    const j = savedToJob({
      _id: 's1', title: 'T', canonicalUrl: 'https://x', savedAt: Date.now(),
    });
    assert.equal(j.isSaved, true);
    assert.equal(j.company, '(unknown)');
    assert.equal(j.compensation, '');
    assert.equal(j.requirements.length, 0);
  });

  it('draftToMail tolerates empty recipients', () => {
    const m = draftToMail({ _id: 'd1', to: [], subject: 'S', updatedAt: Date.now() });
    assert.equal(m.to, '');
    assert.equal(m.jobTitle, '');
  });

  it('replyToLocal maps all server categories, unknowns fall back', () => {
    const mk = (category?: string) => replyToLocal({
      event: { _id: 'e', occurredAt: Date.now() },
      classification: category === undefined ? null : { category },
    });
    assert.equal(mk('interested').category, 'Interested');
    assert.equal(mk('might_be_interested').category, 'Might be Interested');
    assert.equal(mk('interview_scheduled').category, 'Interview Scheduled');
    assert.equal(mk('generic_auto_response').category, 'Auto-response');
    assert.equal(mk('not_interested').category, 'Not Interested');
    assert.equal(mk('other').category, 'Might be Interested');
    assert.equal(mk(undefined).category, 'Might be Interested');
    assert.equal(mk('nope').category, 'Might be Interested');
    assert.equal(mk('interested').body, '');
    assert.equal(mk('interested').from, '(unknown)');
  });

  it('draftToCompanyLog maps draft lifecycle to log statuses', () => {
    const mk = (status: string) => draftToCompanyLog('Acme', {
      _id: 'x', status, updatedAt: Date.now(),
    });
    assert.equal(mk('queued').status, 'APPROVED');
    assert.equal(mk('draft').status, 'PENDING');
    assert.equal(mk('failed').status, 'FAILED');
  });

  it('notificationToHotReply keeps recruiter replies and maps the category', () => {
    const hot = notificationToHotReply({
      _id: 'n1',
      type: 'recruiter_reply',
      title: 'Recruiter reply',
      message: 'Let us talk',
      createdAt: 123,
      event: { from: 'recruiter@acme.com', subject: 'Let us talk' },
      classification: { category: 'interview_scheduled' },
    });
    assert.deepEqual(hot, {
      id: 'n1',
      title: 'Recruiter reply',
      message: 'Let us talk',
      from: 'recruiter@acme.com',
      subject: 'Let us talk',
      category: 'Interview Scheduled',
      createdAt: 123,
    });
    assert.equal(notificationToHotReply({
      _id: 'n2', type: 'search_complete', title: 'Search done',
    }), null);
    assert.equal(notificationToHotReply({
      _id: 'n3', type: 'recruiter_reply',
    })?.category, 'Recruiter reply');
  });

  it('HttpJobService delegates filter/rank to the pure demo fns', () => {
    const svc = new HttpJobService();
    assert.deepEqual(svc.all(), []);
    const rows = [job({ id: 'a', title: 'React Dev' })];
    assert.equal(svc.query(rows, {
      search: '', keyword: '', location: '', includeRemote: true,
      savedOnly: false, sort: 'match',
    }).length, 1);
  });
});

describe('live search-result mapping (scraper schema -> Job)', () => {
  it('scoreMatch spans 60..100 on skill overlap', () => {
    assert.equal(scoreMatch('T', [], 'd', ''), 60);
    assert.equal(scoreMatch('React Dev', ['React'], 'x', 'react,go'), 80);
    assert.equal(scoreMatch('React Go Dev', ['React', 'Go'], 'x', 'react,go'), 100);
    assert.equal(scoreMatch('Java Dev', ['Spring'], 'x', 'react,go'), 60);
  });

  it('postingText strips escaped HTML without inventing text', () => {
    assert.equal(postingText('&lt;h2&gt;About&lt;/h2&gt;&lt;p&gt;Build &amp; scale.&lt;/p&gt;'), 'About Build & scale.');
    assert.equal(postingText('plain text'), 'plain text');
    assert.equal(postingText(''), '');
    assert.equal(postingText(undefined), '');
  });

  it('compensationFromK renders $k ranges', () => {
    assert.equal(compensationFromK(180, 220), '$180k – $220k');
    assert.equal(compensationFromK(150, 150), '$150k');
    assert.equal(compensationFromK(100, undefined), '$100k+');
    assert.equal(compensationFromK(undefined, 200), 'up to $200k');
    assert.equal(compensationFromK(undefined, undefined), '');
  });

  it('normalizeJobType maps raw employment strings', () => {
    assert.equal(normalizeJobType('Part-time'), 'Part-time');
    assert.equal(normalizeJobType('Contract'), 'Contract');
    assert.equal(normalizeJobType('Full-time'), 'Full-time');
    assert.equal(normalizeJobType(undefined), 'Full-time');
  });

  it('extractRequirements pulls bullets under headings, [] when none', () => {
    const desc = 'About the role\nBuild things.\nRequirements\n- 5+ years of engineering\n- Strong React skills\nBenefits\n- Free lunch';
    assert.deepEqual(extractRequirements(desc), ['5+ years of engineering', 'Strong React skills']);
    assert.deepEqual(extractRequirements('Just a paragraph, no lists here.'), []);
  });

  it('resultToJob maps a snapshot and keeps gaps as gaps', () => {
    const j = resultToJob({
      _id: 'sr1',
      matchScore: 84.6,
      jobSnapshot: {
        title: 'Software Engineer', company: 'Stripe', location: 'SF, CA',
        description: 'Requirements\n- Ship code', url: 'https://x/j/1',
        salaryMinK: 180, salaryMaxK: 220,
      },
    });
    assert.equal(j.id, 'sr1');
    assert.equal(j.compensation, '$180k – $220k');
    assert.equal(j.match, 85);
    assert.deepEqual(j.requirements, ['Ship code']);
    assert.equal(j.isSaved, false);
    const gappy = resultToJob({ _id: 'sr2', jobSnapshot: {} });
    assert.equal(gappy.title, 'Untitled role');
    assert.equal(gappy.compensation, '');
    assert.deepEqual(gappy.requirements, []);
  });
});

describe('listSearchResults pagination', () => {
  it('walks every result page (API caps at 100 rows)', async () => {
    const svc = new HttpJobService();
    const row = (id: string) => ({
      _id: id,
      jobSnapshot: { title: `T${id}`, company: 'C', location: 'R', url: `https://x/${id}` },
    });
    const realFetch = globalThis.fetch;
    const seen: string[] = [];
    // @ts-expect-error stub fetch for this test only
    globalThis.fetch = async (url: string) => {
      seen.push(String(url));
      const page = Number(new URL(String(url), 'https://t').searchParams.get('page') ?? '1');
      const rows = page === 1 ? [row('a'), row('b')] : [row('c')];
      return { ok: true, json: async () => ({ ok: true, rows, total: 3, pages: 2 }) };
    };
    try {
      const jobs = await svc.listSearchResults('s1');
      assert.deepEqual(jobs.map(j => j.id), ['a', 'b', 'c']);
      assert.ok(seen.filter(u => u.includes('/api/v1/jobs')).length === 2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('resumeToLocal', () => {
  it('maps the whitelisted GET shape and guards the AI blob', () => {
    const r = resumeToLocal({
      resumeId: 'r1', fileName: 'cv.pdf', mimeType: 'application/pdf', sizeBytes: 1234,
      version: 2, extractionStatus: 'completed', stage: 'ready', failureReason: null,
      extractedProfile: {
        fullName: 'Grace Hopper', summary: 'Pioneer.', country: 'USA', city: 'New York',
        skills: ['COBOL', 'Compilers', 7], roles: ['Systems Engineer'],
        links: [{ label: 'GitHub', url: 'https://gh.test' }, null],
        experience: [{ title: 'Dev', company: 'Navy', period: '1943-1986', description: 'Led teams.' }],
        education: [{ school: 'Yale', degree: 'PhD', period: '' }],
      },
      createdAt: 1, updatedAt: 2,
    });
    assert.ok(r !== null);
    assert.equal(r.resumeId, 'r1');
    assert.equal(r.extractionStatus, 'completed');
    assert.equal(r.stage, 'ready');
    assert.equal(r.failureReason, null);
    assert.deepEqual(r.extractedProfile?.skills, ['COBOL', 'Compilers']);
    assert.deepEqual(r.extractedProfile?.links, [{ label: 'GitHub', url: 'https://gh.test' }]);
    assert.equal(r.extractedProfile?.experience[0]?.company, 'Navy');
  });
  it('maps the raw attach row (_id) and degrades unknown enums to safe values', () => {
    const r = resumeToLocal({ _id: 'abc', fileName: 'me.pdf', extractionStatus: 'weird', stage: 'mystery' });
    assert.ok(r !== null);
    assert.equal(r.resumeId, 'abc');
    assert.equal(r.extractionStatus, 'pending');
    assert.equal(r.stage, null);
    assert.equal(r.extractedProfile, null);
    assert.equal(r.failureReason, null);
  });
  it('rejects shapes without an id or file name', () => {
    assert.equal(resumeToLocal(null), null);
    assert.equal(resumeToLocal({}), null);
    assert.equal(resumeToLocal({ _id: 'x' }), null);
    assert.equal(resumeToLocal('nope'), null);
  });
});

describe('HttpApplicationService idempotency key', () => {
  it('distinguishes roles within a session but dedupes retries of one role', async () => {
    const svc = new HttpApplicationService();
    const realFetch = globalThis.fetch;
    const keys: string[] = [];
    // @ts-expect-error stub fetch for this test only
    globalThis.fetch = async (_url: string, init?: { body?: string }) => {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as { idempotencyKey?: string };
      keys.push(String(parsed.idempotencyKey));
      return {
        ok: true,
        json: async () => ({
          ok: true,
          duplicate: false,
          application: {
            _id: `a${keys.length}`,
            canonicalUrl: 'https://x/role',
            jobSnapshot: { title: 'T', company: 'C', logo: '' },
            status: 'queued',
            createdAt: 1,
          },
        }),
      };
    };
    try {
      await svc.createRemote('https://x/role-1', {}, 'sess-1');
      await svc.createRemote('https://x/role-2', {}, 'sess-1');
      await svc.createRemote('https://x/role-1', {}, 'sess-1');
      assert.notEqual(keys[0], keys[1], 'distinct roles must not share a key');
      assert.equal(keys[0], keys[2], 'a retried submit of one role must dedupe');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
