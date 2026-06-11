/** MediaRecorder wrapper with mimeType negotiation. */

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/ogg', 'audio/wav'] as const;

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

export function extensionFor(mimeType: string | undefined): string {
  if (!mimeType) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

export class Recorder {
  readonly mimeType: string | undefined;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(private readonly stream: MediaStream) {
    this.mimeType = pickMimeType();
  }

  get active(): boolean {
    return this.rec !== null && this.rec.state !== 'inactive';
  }

  get filename(): string {
    return `turn.${extensionFor(this.mimeType)}`;
  }

  start(): void {
    if (this.active) return;
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.rec.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start(250); // timeslice so data is flushed periodically
  }

  /** Stop recording and resolve with the full recorded blob. */
  stop(): Promise<Blob> {
    const rec = this.rec;
    if (!rec || rec.state === 'inactive') {
      return Promise.resolve(new Blob(this.chunks, { type: this.mimeType ?? 'audio/webm' }));
    }
    return new Promise<Blob>((resolve) => {
      rec.onstop = () => {
        this.rec = null;
        resolve(new Blob(this.chunks, { type: this.mimeType ?? 'audio/webm' }));
      };
      rec.stop();
    });
  }

  /** Stop and discard any recorded data. */
  cancel(): void {
    const rec = this.rec;
    this.rec = null;
    this.chunks = [];
    if (rec && rec.state !== 'inactive') {
      rec.ondataavailable = null;
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        // Already stopped.
      }
    }
  }
}
