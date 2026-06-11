import type { AppStatus } from '../types';

interface Props {
  status: AppStatus;
  healthy: boolean | null;
  onStopPlayback: () => void;
}

const LABELS: Record<AppStatus, string> = {
  idle: 'Idle',
  listening: 'Listening',
  recording: 'Recording',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

export function StatusStrip({ status, healthy, onStopPlayback }: Props) {
  const healthClass = healthy === null ? 'unknown' : healthy ? 'ok' : 'down';
  const healthLabel = healthy === null ? 'Checking server…' : healthy ? 'Server online' : 'Server unreachable';
  return (
    <div className="status-strip">
      <span className={`status-pill status-${status}`}>
        <span className="status-dot" aria-hidden="true" />
        {LABELS[status]}
      </span>
      {status === 'speaking' && (
        <button type="button" className="btn-subtle" onClick={onStopPlayback}>
          Stop
        </button>
      )}
      <span className="status-health" title={healthLabel}>
        <span className={`health-dot health-${healthClass}`} aria-hidden="true" />
        <span className="visually-hidden">{healthLabel}</span>
      </span>
    </div>
  );
}
