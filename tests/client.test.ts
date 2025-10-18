import { ConduitClient } from '../src/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.EventSource = MockEventSource as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildUrl', () => {
  it('returns url unchanged when lastEventId is undefined', () => {
    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    const result = client['buildUrl']('https://conduit.example.com');
    expect(result).toBe('https://conduit.example.com');
  });

  it('appends last_event_id when present', () => {
    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    client['lastEventId'] = 'event-123';
    const result = client['buildUrl']('https://conduit.example.com');
    expect(result).toBe('https://conduit.example.com/?last_event_id=event-123');
  });

  it('preserves existing query params', () => {
    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    client['lastEventId'] = 'event-123';
    const result = client['buildUrl']('https://conduit.example.com?token=abc');
    expect(result).toContain('token=abc');
    expect(result).toContain('last_event_id=event-123');
  });
});

describe('channel management', () => {
  it('preserves lastEventId when reconnecting to the same channel', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: 'token1',
            channel_id: 'channel-1',
            url: 'https://conduit.example.com',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: 'token2',
            channel_id: 'channel-1', // Same channel
            url: 'https://conduit.example.com',
          }),
      });

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    await client.connect();
    client['lastEventId'] = 'event-123';

    expect(client['lastEventId'], 'lastEventId should be set').toBe('event-123');

    // Reconnect to the same channel
    client.disconnect();
    await client.connect();

    expect(client['lastEventId'], 'lastEventId should be preserved').toBe('event-123');
  });

  it('clears lastEventId when channel changes', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: 'token1',
            channel_id: 'channel-1',
            url: 'https://conduit.example.com',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: 'token2',
            channel_id: 'channel-2', // Different channel
            url: 'https://conduit.example.com',
          }),
      });

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    await client.connect();
    client['lastEventId'] = 'event-123';

    expect(client['lastEventId'], 'lastEventId should be set initially').toBe('event-123');

    // Force reconnect with a new channel
    client.disconnect();
    client['currentChannelId'] = undefined; // Simulate reconnect
    await client.connect();

    expect(
      client['lastEventId'],
      'lastEventId should be cleared after channel change',
    ).toBeUndefined();
  });

  it('uses url from startStream response', async () => {
    const serverUrl = 'https://conduit.us.example.com/events?token=xyz&channel_id=abc';

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'token1',
          channel_id: 'channel-1',
          url: serverUrl,
        }),
    });

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buildUrlSpy = vi.spyOn(client as any, 'buildUrl');

    await client.connect();

    expect(buildUrlSpy).toHaveBeenCalledWith(serverUrl);
  });
});
