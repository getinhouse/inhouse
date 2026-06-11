import { useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface Props {
  disabled: boolean;
  recording: boolean;
  recordingSince: number | null;
  onPressStart: () => void;
  onPressEnd: () => void;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function MicButton({ disabled, recording, recordingSince, onPressStart, onPressEnd }: Props) {
  const [, setTick] = useState(0);

  // Re-render while recording so the elapsed time updates.
  useEffect(() => {
    if (recordingSince === null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 200);
    return () => window.clearInterval(id);
  }, [recordingSince]);

  const handleDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onPressStart();
  };

  const handleUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    onPressEnd();
  };

  return (
    <div className="mic-area">
      <button
        type="button"
        className={`mic-button${recording ? ' is-recording' : ''}`}
        disabled={disabled}
        aria-label={recording ? 'Release to send' : 'Hold to talk'}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5.3-3a.75.75 0 0 1 1.5.1A6.75 6.75 0 0 1 12.75 17.7v2.55h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5V17.7A6.75 6.75 0 0 1 5.2 11.1a.75.75 0 0 1 1.5-.1 5.25 5.25 0 0 0 10.6 0Z"
          />
        </svg>
      </button>
      <span className="mic-hint">
        {recording && recordingSince !== null
          ? `Recording ${formatElapsed(Date.now() - recordingSince)} — release to send`
          : disabled
            ? 'Mic busy'
            : 'Hold to talk'}
      </span>
    </div>
  );
}
