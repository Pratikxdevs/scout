import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dossierIsActive,
  dossierStageLabel,
  parseDossierEnvelope,
  parseDossierResult,
  sourceStatusKind,
} from './profileDossier.ts';

const dossier = {
  dossierId: 'd1',
  resumeId: 'r1',
  resumeVersion: 2,
  status: 'ready',
  stage: 'ready',
  failureReason: null,
  sourceCount: 1,
  model: 'openai/gpt-oss-20b',
  createdAt: 1,
  updatedAt: 2,
  result: {
    profile: {
      fullName: 'Jane Doe',
      headline: 'Product engineer',
      summary: 'Jane builds accessible products.',
      location: 'Berlin',
      email: 'jane@example.com',
      links: [
        { label: 'GitHub', url: 'https://github.com/jane', source: 'resume' },
        { label: 'bad', url: 'javascript:alert(1)', source: 'resume' },
      ],
      experience: [{ title: 'Engineer', company: 'Acme', start: '2021', end: 'present', description: 'Built things.', highlights: [], skills: ['TypeScript'], source: 'resume' }],
      education: [],
      projects: [],
      skills: [{ name: 'TypeScript', category: 'language', evidence: ['Acme'], confidence: 5 }],
      certifications: [],
      languages: ['English'],
    },
    analysis: {
      seniority: 'senior',
      domains: ['design systems'],
      strengths: ['accessible UI'],
      gaps: [],
      preferredRoles: [{ title: 'Staff Engineer', fit: 91, reason: 'Depth.', evidence: ['Acme'] }],
      confidence: 84,
    },
    sourceCoverage: [{ kind: 'github', url: 'https://github.com/jane', status: 'ready', itemsRead: 4 }],
  },
  sources: [
    {
      sourceId: 's1', kind: 'github', url: 'https://github.com/jane',
      canonicalUrl: 'https://github.com/jane', host: 'github.com', label: 'GitHub · jane',
      status: 'ready', fetchMode: 'api', title: 'Jane Doe', digestChars: 1234,
      itemsRead: 4, error: '', fetchedAt: 2,
    },
  ],
};

describe('parseDossierEnvelope', () => {
  it('maps the server envelope into a typed dossier', () => {
    const parsed = parseDossierEnvelope({ dossier, sources: dossier.sources });
    assert.notEqual(parsed, null);
    assert.equal(parsed?.status, 'ready');
    assert.equal(parsed?.result?.profile.fullName, 'Jane Doe');
    assert.equal(parsed?.result?.profile.links.length, 1);
    assert.equal(parsed?.result?.analysis.preferredRoles[0]?.fit, 91);
    assert.equal(parsed?.sources[0]?.status, 'ready');
  });

  it('returns null when no run exists', () => {
    assert.equal(parseDossierEnvelope({ dossier: null, sources: [] }), null);
  });

  it('rejects a malformed result instead of rendering partial data', () => {
    assert.equal(parseDossierResult({ profile: null, analysis: null }), null);
  });

  it('clamps hostile values from the wire', () => {
    const parsed = parseDossierResult({
      profile: { fullName: 'X', skills: [{ name: 'Go', confidence: 99 }] },
      analysis: { preferredRoles: [{ title: 'Eng', fit: 999 }], confidence: -5 },
      sourceCoverage: [{ kind: 'github', url: 'ftp://bad', status: 'ready', itemsRead: 2 }],
    });
    assert.equal(parsed?.profile.skills[0]?.confidence, 5);
    assert.equal(parsed?.analysis.preferredRoles[0]?.fit, 100);
    assert.equal(parsed?.analysis.confidence, 0);
    assert.equal(parsed?.sourceCoverage[0]?.url, '');
  });
});

describe('dossier labels', () => {
  it('treats only live statuses as active', () => {
    assert.equal(dossierIsActive('queued'), true);
    assert.equal(dossierIsActive('ai_running'), true);
    assert.equal(dossierIsActive('ready'), false);
    assert.equal(dossierIsActive('failed'), false);
  });

  it('gives every stage a readable label', () => {
    assert.equal(dossierStageLabel('fetching_sources'), 'Reading public profiles');
    assert.equal(dossierStageLabel('custom_stage'), 'custom stage');
  });

  it('maps source status to the shared Status kinds', () => {
    assert.equal(sourceStatusKind('ready'), 'ok');
    assert.equal(sourceStatusKind('blocked'), 'warn');
    assert.equal(sourceStatusKind('failed'), 'bad');
    assert.equal(sourceStatusKind('fetching'), 'info');
  });
});
