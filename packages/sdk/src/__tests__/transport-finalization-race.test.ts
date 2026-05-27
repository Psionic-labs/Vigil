import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSDKState } from '../client/state';
import {
  abortInflightRequests,
  sendBatch,
  sendFinalBatch,
} from '../flush/transport';
import type { IngestPayload } from '../types';

class MockBlob {
  parts: string[];
  constructor(parts: string[]) {
    this.parts = parts;
  }
}

function makePayload(isFinal = false): IngestPayload {
  return {
    sessionId: 'session-1',
    projectKey: 'pk',
    events: [{ type: 'event' }],
    summary: [],
    metadata: {
      url: 'https://example.com',
      userAgent: 'test',
      startedAt: 1,
      screenWidth: 1,
      screenHeight: 1,
    },
    isFinal,
    sdkVersion: '1',
  };
}

describe('transport finalization races', () => {
  beforeEach(() => {
    vi.stubGlobal('Blob', MockBlob);
    vi.stubGlobal('navigator', {
      sendBeacon: vi.fn().mockReturnValue(true),
    });
  });

  afterEach(() => {
    abortInflightRequests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('serializes non-final sends so only one fetch is active', async () => {
    const state = createSDKState();
    let resolveFirst: ((value: unknown) => void) | undefined;
    const fetchSpy = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchSpy);

    const first = sendBatch('/ingest', makePayload(), false, state);
    const second = sendBatch('/ingest', makePayload(), false, state);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    resolveFirst!({ ok: true, text: async () => '' });
    await first;
    await second;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('aborts an in-flight non-final request during finalization', async () => {
    const state = createSDKState();
    let aborted = false;
    vi.stubGlobal('fetch', vi.fn((_endpoint, options: RequestInit) => (
      new Promise((_resolve, reject) => {
        options.signal!.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      })
    )));

    const pending = sendBatch('/ingest', makePayload(), false, state);
    state.lifecycle = 'finalizing';
    abortInflightRequests();

    await expect(pending).resolves.toBe(false);
    expect(aborted).toBe(true);
  });

  it('rejects a queued non-final batch once finalization begins', async () => {
    const state = createSDKState();
    let resolveFirst: ((value: unknown) => void) | undefined;
    const fetchSpy = vi.fn().mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve;
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const first = sendBatch('/ingest', makePayload(), false, state);
    const queued = sendBatch('/ingest', makePayload(), false, state);
    state.lifecycle = 'finalizing';
    resolveFirst!({ ok: true, text: async () => '' });

    await first;
    await expect(queued).resolves.toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('allows exactly one final payload only while finalizing', () => {
    const state = createSDKState();
    const beaconSpy = vi.mocked(navigator.sendBeacon);

    expect(sendFinalBatch('/ingest', makePayload(true), false, state)).toBe(false);
    state.lifecycle = 'finalizing';
    expect(sendFinalBatch('/ingest', makePayload(true), false, state)).toBe(true);
    expect(sendFinalBatch('/ingest', makePayload(true), false, state)).toBe(false);
    state.lifecycle = 'finalized';
    expect(sendFinalBatch('/ingest', makePayload(true), false, state)).toBe(false);

    expect(beaconSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects already-buffered non-final payloads after finalization', async () => {
    const state = createSDKState();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    state.lifecycle = 'finalized';

    await expect(sendBatch('/ingest', makePayload(), false, state)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
