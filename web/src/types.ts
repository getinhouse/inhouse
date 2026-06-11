export type AppStatus = 'idle' | 'listening' | 'recording' | 'thinking' | 'speaking';

export interface ConversationTurn {
  id: string;
  transcript: string;
  replyText: string;
  totalMs: number;
}
