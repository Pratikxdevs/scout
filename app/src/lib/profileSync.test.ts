import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initialsFor, mergeServerProfile, profilePatch, salaryFromMin, salaryToMin } from './profileSync.ts';
import { initialDraft, applyExtracted, stageLabel } from './onboardingDraft.ts';
import type { ExtractedProfile, Profile } from '../types.ts';

const PROFILE: Profile = {
  name: 'Flow Tester', email: 'flow@example.com', initials: 'FT', status: 'ACTIVE',
  skills: 'React, TypeScript', roles: ['Frontend Engineer', 'Fullstack Engineer'], location: 'Hybrid',
  salary: '$180k+', remote: true, resume: 'cv.pdf', signature: 'Best regards',
  summary: 'Ten years of web apps.', city: 'Bangalore', country: 'India',
};

const SEED: Profile = {
  name: 'J. Carter', initials: 'JC', status: 'ACTIVE',
  skills: 'React, TypeScript, Node', roles: ['Fullstack Engineer'], location: 'Remote',
  salary: '$130k+', remote: true, resume: '', summary: '', city: '', country: '',
  signature: '', email: '',
};

describe('salaryToMin', () => {
  it('parses the wizard + Settings salary formats', () => {
    assert.equal(salaryToMin('$130k+'), 130000);
    assert.equal(salaryToMin('$130,000'), 130000);
    assert.equal(salaryToMin('130k'), 130000);
    assert.equal(salaryToMin('$200000'), 200000);
  });
  it('refuses non-money strings instead of guessing', () => {
    assert.equal(salaryToMin(''), undefined);
    assert.equal(salaryToMin('competitive'), undefined);
    assert.equal(salaryToMin('$100k – $150k'), undefined);
    assert.equal(salaryToMin('$0'), undefined);
  });
  it('round-trips with salaryFromMin', () => {
    assert.equal(salaryFromMin(130000), '$130k+');
    assert.equal(salaryToMin(salaryFromMin(150000)), 150000);
  });
});

describe('initialsFor', () => {
  it('derives initials from names', () => {
    assert.equal(initialsFor('Flow Tester', 'JC'), 'FT');
    assert.equal(initialsFor('J. Carter', 'JC'), 'JC');
    assert.equal(initialsFor('Priya', 'JC'), 'P');
  });
  it('falls back on blank names', () => {
    assert.equal(initialsFor('   ', 'JC'), 'JC');
  });
});

describe('profilePatch', () => {
  it('maps every wizard field to the server contract', () => {
    const patch = profilePatch(PROFILE);
    assert.deepEqual(patch, {
      fullName: 'Flow Tester',
      email: 'flow@example.com',
      headline: 'Ten years of web apps.',
      country: 'India',
      location: 'Bangalore',
      preferredRoles: ['Frontend Engineer', 'Fullstack Engineer'],
      remotePreference: 'hybrid',
      salaryMin: 180000,
      skills: ['React', 'TypeScript'],
    });
  });
  it('sends only the keys the caller supplied (surgical updates)', () => {
    assert.deepEqual(profilePatch({ name: 'New Name' }), { fullName: 'New Name' });
    assert.deepEqual(profilePatch({ skills: 'Go, Rust' }), { skills: ['Go', 'Rust'] });
    assert.deepEqual(profilePatch({ city: 'Berlin' }), { location: 'Berlin' });
  });
  it('omits keys with no server field (signature stays local-only)', () => {
    assert.deepEqual(profilePatch({ signature: 'Cheers' }), {});
    assert.deepEqual(profilePatch({ initials: 'XX' }), {});
  });
  it('prefers the explicit work type over the remote flag', () => {
    assert.equal(profilePatch({ location: 'On-site', remote: true }).remotePreference, 'onsite');
    assert.equal(profilePatch({ remote: true }).remotePreference, 'remote');
  });
  it('omits blank lists and unusable salary (never clears server-side fills)', () => {
    assert.deepEqual(profilePatch({ skills: '' }), {});
    assert.deepEqual(profilePatch({ roles: [] }), {});
    assert.deepEqual(profilePatch({ country: '  ' }), {});
    assert.equal('salaryMin' in profilePatch({ salary: 'competitive' }), false);
  });
});

describe('mergeServerProfile', () => {
  it('maps a full server row back to local shape', () => {
    const merged = mergeServerProfile({
      fullName: 'Flow Tester', email: 'flow@example.com', headline: 'Ten years of web apps.',
      country: 'India', location: 'Bangalore', skills: ['React', 'TypeScript'],
      preferredRoles: ['Frontend Engineer'], remotePreference: 'hybrid',
      salaryMin: 180000, avatarUrl: 'https://cdn.test/photo.jpg', onboardingCompleted: true,
    });
    assert.deepEqual(merged, {
      name: 'Flow Tester', email: 'flow@example.com', summary: 'Ten years of web apps.',
      country: 'India', city: 'Bangalore', skills: 'React, TypeScript',
      roles: ['Frontend Engineer'], location: 'Hybrid', remote: false, salary: '$180k+',
      avatarUrl: 'https://cdn.test/photo.jpg',
    });
  });
  it('normalizes aliased country text to the canonical name', () => {
    assert.equal(mergeServerProfile({ country: 'USA' }).country, 'United States');
    assert.equal(mergeServerProfile({ country: 'uk' }).country, 'United Kingdom');
    assert.equal(mergeServerProfile({ country: 'Atlantis' }).country, 'Atlantis');
  });
  it('never blanks local state from an empty or malformed row', () => {
    assert.deepEqual(mergeServerProfile({}), {});
    assert.deepEqual(mergeServerProfile(null), {});
    assert.deepEqual(mergeServerProfile({ fullName: 7, skills: 'React', salaryMin: -5 }), {});
  });
});

describe('initialDraft', () => {
  it('blanks demo seed values for a fresh (not yet onboarded) account', () => {
    const d = initialDraft(SEED, false, SEED);
    assert.equal(d.name, '');
    assert.equal(d.workType, '');
    assert.equal(d.salary, '');
    assert.equal(d.remote, false);
    assert.deepEqual(d.roles, []);
    assert.deepEqual(d.skills, []);
  });
  it('keeps real values a fresh account already has (signup name/email)', () => {
    const signup: Profile = { ...SEED, name: 'Priya Nair', email: 'priya@example.com' };
    const d = initialDraft(signup, false, SEED);
    assert.equal(d.name, 'Priya Nair');
    assert.equal(d.email, 'priya@example.com');
  });
  it('keeps everything for an onboarded account', () => {
    const d = initialDraft(PROFILE, true, SEED);
    assert.equal(d.name, 'Flow Tester');
    assert.equal(d.country, 'India');
    assert.deepEqual(d.roles, ['Frontend Engineer', 'Fullstack Engineer']);
    assert.deepEqual(d.skills, ['React', 'TypeScript']);
    assert.equal(d.workType, 'Hybrid');
  });
});

describe('applyExtracted', () => {
  const EX: ExtractedProfile = {
    fullName: 'Grace Hopper', summary: 'COBOL pioneer.', country: 'USA', city: 'New York',
    skills: ['COBOL', 'Compilers'], roles: ['Systems Engineer'],
    links: [], experience: [], education: [],
  };
  it('fills empty draft fields and normalizes the country name', () => {
    const d = applyExtracted(initialDraft(SEED, false, SEED), EX);
    assert.equal(d.name, 'Grace Hopper');
    assert.equal(d.country, 'United States');
    assert.equal(d.city, 'New York');
    assert.deepEqual(d.skills, ['COBOL', 'Compilers']);
    assert.deepEqual(d.roles, ['Systems Engineer']);
  });
  it('never clobbers what the user already entered', () => {
    const base = { ...initialDraft(SEED, false, SEED), name: 'Priya', skills: ['Go'] };
    const d = applyExtracted(base, EX);
    assert.equal(d.name, 'Priya');
    assert.deepEqual(d.skills, ['Go']);
    assert.equal(d.summary, 'COBOL pioneer.');
  });
});

describe('stageLabel', () => {
  it('labels every pipeline stage and degrades safely', () => {
    assert.equal(stageLabel('reading'), 'reading your resume');
    assert.equal(stageLabel('ai_running'), 'AI is reading it');
    assert.equal(stageLabel('ready'), 'done');
    assert.equal(stageLabel(null), 'working');
    assert.equal(stageLabel('mystery'), 'working');
  });
});
