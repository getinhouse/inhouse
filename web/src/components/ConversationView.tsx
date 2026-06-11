import { useEffect, useRef } from 'react';
import type { AppStatus, ConversationTurn } from '../types';

interface Props {
  turns: ConversationTurn[];
  status: AppStatus;
  /** Override the empty-state hint (the demo doesn't have a mic to hold). */
  emptyHint?: string;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ConversationView({ turns, status, emptyHint }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, status]);

  return (
    <main className="conversation" aria-live="polite">
      {turns.length === 0 && status !== 'thinking' && (
        <div className="conversation-empty">
          <p>{emptyHint ?? 'Hold the mic and talk, flip on hands-free, or type below.'}</p>
        </div>
      )}
      {turns.map((turn) => (
        <div className="turn" key={turn.id}>
          <div className="bubble bubble-user">{turn.transcript || '(no speech detected)'}</div>
          <div className="bubble bubble-assistant">
            <span>{turn.replyText}</span>
            <span className="timing-badge" title="Total turn time">
              {formatSeconds(turn.totalMs)}
            </span>
          </div>
        </div>
      ))}
      {status === 'thinking' && (
        <div className="turn">
          <div className="bubble bubble-assistant bubble-pending">
            <span className="dots" aria-label="Assistant is thinking">
              <i /> <i /> <i />
            </span>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </main>
  );
}
