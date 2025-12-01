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
  it('returns url without lastEventId when undefined', () => {
    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    const result = client['buildUrl']('https://conduit.example.com/events', 'token1', 'channel1');
    expect(result).toBe('https://conduit.example.com/events?token=token1&channel_id=channel1');
  });

  it('appends last_event_id when present', () => {
    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    client['lastEventId'] = 'event-123';
    const result = client['buildUrl']('https://conduit.example.com/events', 'token1', 'channel1');
    expect(result).toBe(
      'https://conduit.example.com/events?token=token1&channel_id=channel1&last_event_id=event-123',
    );
  });
});

describe('startStream validation', () => {
  it('throws error when conduit object is missing', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    await expect(client.connect()).rejects.toThrow('Invalid response from startStream endpoint');
  });

  it('throws error when token is missing', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conduit: {
            channel_id: 'channel1',
            url: 'https://conduit.example.com/events',
          },
        }),
    });

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    await expect(client.connect()).rejects.toThrow('Invalid response from startStream endpoint');
  });

  it('throws error when channel_id is missing', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conduit: {
            token: 'token1',
            url: 'https://conduit.example.com/events',
          },
        }),
    });

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    await expect(client.connect()).rejects.toThrow('Invalid response from startStream endpoint');
  });

  it('throws error when url is missing', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conduit: {
            token: 'token1',
            channel_id: 'channel1',
          },
        }),
    });

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    await expect(client.connect()).rejects.toThrow('Invalid response from startStream endpoint');
  });
});

describe('startStream headers', () => {
  it('includes custom headers in startStream request', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conduit: {
            token: 'token1',
            channel_id: 'channel1',
            url: 'https://conduit.example.com/events',
          },
        }),
    });
    global.fetch = fetchSpy;

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
      startStreamHeaders: {
        'X-CSRF-TOKEN': 'csrf-token-123',
        Authorization: 'Bearer user-token',
      },
    });

    await client.connect();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.com/start',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': 'csrf-token-123',
          Authorization: 'Bearer user-token',
        },
      }),
    );
  });

  it('works without custom headers', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conduit: {
            token: 'token1',
            channel_id: 'channel1',
            url: 'https://conduit.example.com/events',
          },
        }),
    });
    global.fetch = fetchSpy;

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    await client.connect();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.com/start',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('allows overriding Content-Type header', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conduit: {
            token: 'token1',
            channel_id: 'channel1',
            url: 'https://conduit.example.com/events',
          },
        }),
    });
    global.fetch = fetchSpy;

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
      startStreamHeaders: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    await client.connect();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.com/start',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    );
  });

  it('handles empty headers object', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conduit: {
            token: 'token1',
            channel_id: 'channel1',
            url: 'https://conduit.example.com/events',
          },
        }),
    });
    global.fetch = fetchSpy;

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
      startStreamHeaders: {},
    });

    await client.connect();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.com/start',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
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
            conduit: {
              token: 'token1',
              channel_id: 'channel1',
              url: 'https://conduit.example.com/events',
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            conduit: {
              token: 'token2',
              channel_id: 'channel1', // Same channel
              url: 'https://conduit.example.com/events',
            },
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
            conduit: {
              token: 'token1',
              channel_id: 'channel1',
              url: 'https://conduit.example.com/events',
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            conduit: {
              token: 'token2',
              channel_id: 'channel2', // Different channel
              url: 'https://conduit.example.com/events',
            },
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
    const serverUrl = 'https://conduit.us.example.com/events';

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conduit: {
            token: 'token1',
            channel_id: 'channel1',
            url: serverUrl,
          },
        }),
    });

    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buildUrlSpy = vi.spyOn(client as any, 'buildUrl');

    await client.connect();

    expect(buildUrlSpy).toHaveBeenCalledWith(serverUrl, 'token1', 'channel1');
  });
});

describe('connection callbacks', () => {
  it('fires onConnect on first open', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conduit: { token: 'token1', channel_id: 'channel1', url: 'https://example.com' },
        }),
    });

    const onConnect = vi.fn();
    const onReconnect = vi.fn();
    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
      onConnect,
      onReconnect,
    });

    await client.connect();
    client['eventSource']?.onopen?.({} as Event);

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('fires onReconnect on subsequent opens', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conduit: { token: 'token1', channel_id: 'channel1', url: 'https://example.com' },
        }),
    });

    const onConnect = vi.fn();
    const onReconnect = vi.fn();
    const client = new ConduitClient({
      orgId: 123,
      startStreamUrl: 'https://api.example.com/start',
      onConnect,
      onReconnect,
    });

    await client.connect();
    client['eventSource']?.onopen?.({} as Event);
    client['eventSource']?.onopen?.({} as Event);

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onReconnect).toHaveBeenCalledOnce();

    // Firing onopen again calls onReconnect a second time
    client['eventSource']?.onopen?.({} as Event);
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });
});
