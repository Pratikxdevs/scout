import type { Job } from '../../types';
import { ConfirmDialog } from '../../components/ui';
import { useStore, todayStr } from '../../store';
import { appliesToday } from '../../lib/caps';

/**
 * Apply pre-flight — the review step both apply CTAs share (Jobs side panel
 * and the job detail modal). Shows the role, the resume on file, and today's
 * cap BEFORE anything happens; the submit only fires on Confirm. Callers
 * gate the button itself (cap reached / already applied) so this dialog
 * never opens as a dead end.
 */
export function ApplyConfirmDialog({ job, onClose, onDone }: {
  job: Job; onClose: () => void; onDone: (msg: string) => void;
}) {
  const { apply, profile, apps, usage, backend } = useStore();
  const { used, cap } = appliesToday(backend, usage, apps, todayStr());
  const resume = profile.resume !== '' ? profile.resume : 'No resume on file — add one in Settings first.';
  return (
    <ConfirmDialog
      title={backend ? 'Queue this application?' : 'Record this application?'}
      confirmLabel={backend ? 'Queue application' : 'Record locally'}
      onClose={onClose}
      onConfirm={() => { void apply(job.id).then(onDone); }}
      body={
        <>
          <p style={{ margin: '0 0 8px' }}><strong>{job.title}</strong> at {job.company} — {job.location}.</p>
          <p style={{ margin: '0 0 8px' }}>Resume on file: {resume}</p>
          <p style={{ margin: 0 }}>
            This is apply {used + 1} of {cap} today.
            {backend ? ' It is queued for the apply worker.' : ' Recorded in this browser only — nothing is submitted or emailed.'}
          </p>
        </>
      }
    />
  );
}
