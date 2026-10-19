import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfileMessages, isEmptyProfile, MAX_RESUME_CHARS, parseExtractedProfile,
  SYSTEM_PROMPT, trimResumeText,
} from './aiProfile.ts';

describe('trimResumeText', () => {
  it('normalizes whitespace on short resumes without cutting', () => {
    const text = trimResumeText('Jane Doe\r\n\r\n\r\nReact   dev\t\t\t   \nEXPERIENCE  ');
    assert.ok(text.includes('Jane Doe'));
    assert.ok(text.includes('EXPERIENCE'));
    assert.ok(!text.includes('\r'));
    assert.ok(text.length <= MAX_RESUME_CHARS);
  });

  it('cuts long resumes head-heavy with an explicit marker', () => {
    const raw = 'HEAD'.repeat(2000) + 'TAIL' + 'x'.repeat(80_000);
    const text = trimResumeText(raw);
    assert.ok(text.length <= MAX_RESUME_CHARS);
    assert.ok(text.includes('[...middle of the resume omitted for length...]'));
    assert.ok(text.startsWith('HEAD'));
    assert.ok(text.includes('TAIL'));
  });
});

describe('SYSTEM_PROMPT', () => {
  it('demands facts only and a single JSON object', () => {
    assert.ok(SYSTEM_PROMPT.includes('Use ONLY facts present in the resume text'));
    assert.ok(SYSTEM_PROMPT.includes('Never invent'));
    assert.ok(SYSTEM_PROMPT.includes('Output valid JSON only'));
  });
});

describe('buildProfileMessages', () => {
  it('wraps the trimmed text in the user turn', () => {
    const { system, user } = buildProfileMessages('A'.repeat(MAX_RESUME_CHARS + 500));
    assert.equal(system, SYSTEM_PROMPT);
    assert.ok(user.includes('RESUME TEXT:'));
    assert.ok(user.length <= MAX_RESUME_CHARS + 200);
  });
});

describe('parseExtractedProfile', () => {
  it('extracts a well-formed profile', () => {
    const p = parseExtractedProfile(JSON.stringify({
      fullName: 'Maya Lane', summary: 'Freelance React dev.', country: 'India', city: 'Pune',
      skills: ['React', 'TypeScript'], roles: ['Frontend developer'],
      links: [{ label: 'Portfolio', url: 'https://maya.dev' }],
      experience: [{ title: 'Dev', company: 'Acme', period: '2024 – present', description: 'Shipped UI.' }],
      education: [{ school: 'MIT', degree: 'BSc', period: '2020' }],
    }));
    assert.ok(p !== null);
    assert.equal(p?.fullName, 'Maya Lane');
    assert.equal(p?.skills.length, 2);
    assert.equal(p?.links[0]?.url, 'https://maya.dev');
  });

  it('tolerates fences and stray prose around the object', () => {
    const p = parseExtractedProfile('```json\n{"fullName":"Ana"}\n```');
    assert.equal(p?.fullName, 'Ana');
  });

  it('drops non-http links and clamps list sizes', () => {
    const p = parseExtractedProfile(JSON.stringify({
      fullName: 'Ana',
      skills: Array.from({ length: 60 }, (_, i) => `skill${i}`),
      links: [{ label: 'bad', url: 'javascript:alert(1)' }, { label: 'ok', url: 'https://ok.dev' }],
    }));
    assert.equal(p?.skills.length, 40);
    assert.equal(p?.links.length, 1);
    assert.equal(p?.links[0]?.url, 'https://ok.dev');
  });

  it('returns null for unusable answers', () => {
    assert.equal(parseExtractedProfile('not json at all'), null);
    assert.equal(parseExtractedProfile(''), null);
  });
});

describe('isEmptyProfile', () => {
  it('detects a model answer with nothing usable', () => {
    const empty = parseExtractedProfile('{}');
    assert.ok(empty !== null);
    assert.equal(isEmptyProfile(empty!), true);
  });

  it('keeps a profile with skills', () => {
    const p = parseExtractedProfile('{"skills":["react"]}');
    assert.equal(isEmptyProfile(p!), false);
  });
});
