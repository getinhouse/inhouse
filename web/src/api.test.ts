import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './api';

const TURN_BODY = {
  turn_id: 't1',
  transcript: 'hello there',
  reply_text: 'hi!',
  audio_url: '/api/audio/t1.wav',
  timings: { stt_ms: 120, llm_ms: 800, total_ms: 3200 },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClient', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('creates a session and returns the parsed body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ session_id: 's1', state: 'ready' }, 201));
    const client = new ApiClient({ baseUrl: 'http://server:8770' });

    const session = await client.createSession();

    expect(session).toEqual({ session_id: 's1', state: 'ready' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://server:8770/api/sessions');
    expect(init?.method).toBe('POST');
  });

  it('sends the bearer token when configured, and omits it when not', async () => {
    // A Response body is single-use, so build a fresh one per call.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ status: 'ok' })));

    await new ApiClient({ token: 'secret-token' }).health();
    let headers = new Headers(fetchMock.mock.calls[0]![1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer secret-token');

    await new ApiClient({}).health();
    headers = new Headers(fetchMock.mock.calls[1]![1]?.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('sends a text turn as JSON and returns the turn response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(TURN_BODY));
    const client = new ApiClient({ baseUrl: 'http://server:8770', token: 'tok' });

    const turn = await client.sendTextTurn('s1', 'hello there');

    expect(turn).toEqual(TURN_BODY);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://server:8770/api/sessions/s1/turns/text');
    expect(JSON.parse(init?.body as string)).toEqual({ text: 'hello there' });
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });

  it('sends an audio turn as multipart form data with an "audio" field', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(TURN_BODY));
    const client = new ApiClient({});
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

    const turn = await client.sendAudioTurn('s1', blob, 'turn.webm');

    expect(turn).toEqual(TURN_BODY);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/sessions/s1/turns');
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    const file = form.get('audio');
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('turn.webm');
    // Content-Type must be left to the browser so the multipart boundary is set.
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBeNull();
  });

  it('surfaces the server error message from the error envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'stt_failed', message: 'Speech recognition failed.' } }, 500)
    );
    const client = new ApiClient({});

    const err = await client.createSession().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('Speech recognition failed.');
    expect((err as ApiError).code).toBe('stt_failed');
    expect((err as ApiError).status).toBe(500);
  });

  it('falls back to a generic message for non-JSON error bodies', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));
    const client = new ApiClient({});

    const err = await client.health().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toContain('502');
  });

  it('wraps network failures in an ApiError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const client = new ApiClient({});

    const err = await client.health().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('network_error');
  });

  it('resolves server-relative audio URLs against the base URL', () => {
    expect(new ApiClient({ baseUrl: 'http://server:8770/' }).resolveUrl('/api/audio/t1.wav')).toBe(
      'http://server:8770/api/audio/t1.wav'
    );
    expect(new ApiClient({}).resolveUrl('/api/audio/t1.wav')).toBe('/api/audio/t1.wav');
    expect(new ApiClient({ baseUrl: 'http://x' }).resolveUrl('https://cdn/a.wav')).toBe('https://cdn/a.wav');
  });
});
