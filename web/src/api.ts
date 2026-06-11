export interface Timings {
  stt_ms: number;
  llm_ms: number;
  total_ms: number;
}

export interface TurnResponse {
  turn_id: string;
  transcript: string;
  reply_text: string;
  audio_url: string;
  timings: Timings;
}

export interface SessionResponse {
  session_id: string;
  state: string;
}

export interface HealthResponse {
  status: string;
  [key: string]: unknown;
}

/** Error carrying the server-provided code/message from the API error envelope. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface ApiClientOptions {
  /** Base URL of the Inhouse server. Empty string means same-origin. */
  baseUrl?: string;
  /** Optional bearer token sent as `Authorization: Bearer <token>`. */
  token?: string;
}

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown };
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').trim().replace(/\/+$/, '');
    this.token = (options.token ?? '').trim();
  }

  /** Resolve a server-relative path (e.g. a turn's audio_url) against the base URL. */
  resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${p}`;
  }

  authHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  async createSession(): Promise<SessionResponse> {
    return this.request<SessionResponse>('/api/sessions', { method: 'POST' });
  }

  async sendAudioTurn(sessionId: string, audio: Blob, filename: string): Promise<TurnResponse> {
    const form = new FormData();
    form.append('audio', audio, filename);
    return this.request<TurnResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/turns`, {
      method: 'POST',
      body: form,
    });
  }

  async sendTextTurn(sessionId: string, text: string): Promise<TurnResponse> {
    return this.request<TurnResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/turns/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  }

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/api/health', { method: 'GET' });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);

    let res: Response;
    try {
      res = await fetch(this.resolveUrl(path), { ...init, headers });
    } catch {
      throw new ApiError('network_error', 'Cannot reach the Inhouse server.', 0);
    }

    if (!res.ok) {
      throw await this.toApiError(res);
    }
    return (await res.json()) as T;
  }

  private async toApiError(res: Response): Promise<ApiError> {
    let code = 'http_error';
    let message = `Request failed (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as ErrorEnvelope;
      if (typeof body.error?.message === 'string' && body.error.message) {
        message = body.error.message;
      }
      if (typeof body.error?.code === 'string' && body.error.code) {
        code = body.error.code;
      }
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    return new ApiError(code, message, res.status);
  }
}
