import { useState } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { useStore } from '../../store';
import { Card, Status } from '../../components/ui';
import {
  dossierIsActive,
  dossierStageLabel,
  sourceStatusKind,
  sourceStatusLabel,
} from '../../lib/profileDossier';
import type { ProfileSource } from '../../types';

/* One reusable enrichment surface for onboarding + Settings. It only starts a
 * server run; every status/source shown below comes from the server row, and
 * blocked sources never look like successful scrapes. */

function PasteBox({ source }: { source: ProfileSource }) {
  const { enrichBusy, pasteEnrichmentSource } = useStore();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [pasting, setPasting] = useState(false);

  const submit = async () => {
    if (text.trim().length < 40) {
      setNote('Paste at least a few lines first.');
      return;
    }
    setPasting(true);
    try {
      const message = await pasteEnrichmentSource(source.sourceId, text.trim());
      setNote(message);
      if (message.startsWith('Pasted text saved')) setText('');
    } finally {
      setPasting(false);
    }
  };

  return (
    <details style={{ marginTop: 6 }}>
      <summary className="muted t-caption" style={{ cursor: 'pointer' }}>
        Paste profile text instead
      </summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        <textarea
          rows={4}
          maxLength={12_000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`Paste ${source.label} profile text`}
          placeholder="Copy the visible profile page text here. No login or cookies are used."
        />
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={enrichBusy || pasting} onClick={submit}>
            {pasting ? 'Saving…' : 'Use pasted text'}
          </button>
          <span className="muted t-caption">Stored as a manual source for this run only.</span>
        </div>
        {note !== '' ? <p className="muted t-caption" role="status" style={{ margin: 0 }}>{note}</p> : null}
      </div>
    </details>
  );
}

function SourceList({ sources, terminal }: { sources: ProfileSource[]; terminal: boolean }) {
  if (sources.length === 0) return null;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 0 }}>
      {sources.map((source) => (
        <li key={source.sourceId} className="enrich-source">
          <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Status kind={sourceStatusKind(source.status)}>{sourceStatusLabel(source.status)}</Status>
            {source.url !== '' ? (
              <a className="t-small ell" href={source.url} target="_blank" rel="noreferrer noopener" style={{ maxWidth: '100%' }}>
                {source.label || source.host}
              </a>
            ) : <span className="t-small ell">{source.label || source.host}</span>}
            {source.itemsRead > 0 ? (
              <span className="muted t-caption">{source.itemsRead} page{source.itemsRead === 1 ? '' : 's'} read</span>
            ) : null}
            {source.fetchMode === 'manual_paste' ? <span className="muted t-caption">pasted</span> : null}
          </span>
          {source.title !== '' ? <span className="muted t-caption ell">{source.title}</span> : null}
          {source.error !== '' ? <span className="muted t-caption">{source.error}</span> : null}
          {source.status === 'blocked' && !terminal ? (
            <span className="muted t-caption">Paste fallback unlocks when the run finishes.</span>
          ) : null}
          {source.status === 'blocked' && terminal ? <PasteBox source={source} /> : null}
        </li>
      ))}
    </ul>
  );
}

function DossierPreview() {
  const { enrichment } = useStore();
  const result = enrichment?.result;
  if (result === null || result === undefined) return null;
  const p = result.profile;
  const a = result.analysis;
  const skills = p.skills.slice(0, 16);
  const roles = a.preferredRoles.slice(0, 5);
  return (
    <div className="enrich-dossier">
      <div>
        <p className="sec-label" style={{ margin: '0 0 4px' }}>Your dossier</p>
        <strong className="t-small">{p.fullName || 'Profile ready'}</strong>
        {p.headline !== '' ? <span className="muted t-caption" style={{ display: 'block' }}>{p.headline}</span> : null}
      </div>
      {p.summary !== '' ? <p className="t-small" style={{ margin: 0 }}>{p.summary}</p> : null}
      {roles.length > 0 ? (
        <div>
          <p className="sec-label" style={{ margin: '0 0 6px' }}>Best-fit roles</p>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {roles.map((role) => (
              <span key={`${role.title}-${role.fit}`} className="chip info" title={role.reason}>
                {role.title} · {role.fit}%
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {skills.length > 0 ? (
        <div>
          <p className="sec-label" style={{ margin: '0 0 6px' }}>Skills</p>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {skills.map((skill) => <span key={skill.name} className="prev-pill">{skill.name}</span>)}
          </div>
        </div>
      ) : null}
      {a.strengths.length > 0 ? (
        <div>
          <p className="sec-label" style={{ margin: '0 0 4px' }}>Strengths</p>
          <ul className="muted t-small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }}>
            {a.strengths.slice(0, 5).map((strength) => <li key={strength}>{strength}</li>)}
          </ul>
        </div>
      ) : null}
      {p.links.length > 0 ? (
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          {p.links.slice(0, 8).map((link) => (
            <a key={link.url} className="t-caption" href={link.url} target="_blank" rel="noreferrer noopener">
              {link.label || link.url}
            </a>
          ))}
        </div>
      ) : null}
      <p className="muted t-caption" style={{ margin: 0 }}>
        Dossier confidence {a.confidence}% · {a.seniority || 'seniority not stated'}.
        Only empty profile fields were filled — your edits win.
      </p>
    </div>
  );
}

export function ProfileEnrichment({ variant = 'card' }: { variant?: 'card' | 'inline' }) {
  const { backend, resume, enrichment, enrichBusy, startEnrichment } = useStore();
  const [note, setNote] = useState('');
  const live = enrichment !== null && dossierIsActive(enrichment.status);
  const terminal = enrichment !== null && (enrichment.status === 'ready' || enrichment.status === 'failed');
  const resumeReady = resume !== null && resume.extractionStatus === 'completed';
  const resumeFailed = resume !== null && resume.extractionStatus === 'failed';
  const canStart = backend && resumeReady && !live && !enrichBusy;
  const readCount = enrichment === null
    ? 0
    : enrichment.sources.filter((s) => s.status === 'ready').length;
  const blockedCount = enrichment === null
    ? 0
    : enrichment.sources.filter((s) => s.status === 'blocked').length;
  const failedCount = enrichment === null
    ? 0
    : enrichment.sources.filter((s) => s.status === 'failed').length;
  const skippedCount = enrichment === null
    ? 0
    : enrichment.sources.filter((s) => s.status === 'skipped').length;

  let hint: string;
  if (!backend) {
    hint = 'Enrichment needs the backend — it fetches public links and runs the AI server-side.';
  } else if (resume === null) {
    hint = 'Upload a resume in onboarding first — enrichment reads the links inside it.';
  } else if (resumeFailed) {
    hint = 'Resume reading stopped — re-upload a text-based PDF or DOCX, then enrich.';
  } else if (!resumeReady) {
    hint = 'AI is still reading your resume. Enrichment unlocks when that finishes.';
  } else if (live) {
    hint = 'Usually under a minute. You can leave this page; the run continues on the server.';
  } else {
    hint = 'Finds GitHub, LinkedIn, portfolio, and other links in your resume, reads public pages, then builds one structured dossier.';
  }

  const run = async () => {
    setNote(await startEnrichment());
  };

  const button = (
    <button
      type="button"
      className="btn btn-sm"
      disabled={!canStart}
      aria-busy={enrichBusy || live}
      onClick={run}
    >
      {live ? 'Enriching…' : enrichBusy ? 'Working…' : enrichment?.status === 'ready' ? 'Rebuild profile' : enrichment?.status === 'failed' ? 'Try again' : 'Enrich my profile'}
      {live ? null : <SparklesIcon width={14} />}
    </button>
  );

  const body = (
    <div style={{ display: 'grid', gap: 10 }}>
      <p className="muted t-small" style={{ margin: 0 }}>{hint}</p>
      {note !== '' ? <p className="card-inner t-small" role="status" style={{ margin: 0 }}>{note}</p> : null}
      {enrichment !== null ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="row" role="status" aria-live="polite" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Status kind={enrichment.status === 'failed' ? 'bad' : enrichment.status === 'ready' ? 'ok' : 'info'}>
              {enrichment.status === 'failed'
                ? 'Enrichment stopped'
                : enrichment.status === 'ready'
                  ? 'Dossier ready'
                  : dossierStageLabel(enrichment.stage)}
            </Status>
            {enrichment.sourceCount > 0 ? (
              <span className="muted t-caption">
                {readCount}/{enrichment.sourceCount} public source{enrichment.sourceCount === 1 ? '' : 's'} read
                {blockedCount > 0 ? ` · ${blockedCount} blocked` : ''}
                {failedCount > 0 ? ` · ${failedCount} failed` : ''}
                {skippedCount > 0 ? ` · ${skippedCount} not fetched` : ''}
              </span>
            ) : null}
          </div>
          {live && enrichment.stage !== 'ready' ? (
            <span className="muted t-caption">{dossierStageLabel(enrichment.stage)}…</span>
          ) : null}
          {enrichment.failureReason !== null && enrichment.failureReason !== '' ? (
            <p className="muted t-small" style={{ margin: 0 }}>{enrichment.failureReason}</p>
          ) : null}
          <SourceList sources={enrichment.sources} terminal={terminal} />
          {enrichment.status === 'ready' ? <DossierPreview /> : null}
        </div>
      ) : null}
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className="card-inner" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ minWidth: 0 }}>
            <strong className="t-small">Enrich my profile</strong>
            <span className="muted t-caption" style={{ display: 'block' }}>One structured dossier from every public link on your resume.</span>
          </span>
          {button}
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card label="AI profile dossier" action={button}>
      {body}
    </Card>
  );
}
