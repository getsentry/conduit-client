import { ConduitClient } from '../src/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  _readyState = 2;
  get readyState() {
    return this._readyState;
  }
  set readyState(value: number) {
    this._readyState = value;
  }

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.EventSource = MockEventSource as any;

beforeEach(() => {
  vi.clearAllMocks();
});

const mockSuccessfulFetch = (serverUrl = 'https://conduit.example.com/events', overrides = {}) => {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        conduit: {
          token: 'token1',
          channel_id: 'channel1',
          url: serverUrl,
          ...overrides,
        },
      }),
  });
};

const createClient = (overrides = {}) => {
  return new ConduitClient({
    orgId: 123,
    startStreamUrl: 'https://api.example.com/start',
    ...overrides,
  });
};

describe('buildUrl', () => {
  it('returns url without lastEventId when undefined', () => {
    const client = createClient();

    const result = client['buildUrl']('https://conduit.example.com/events', 'token1', 'channel1');
    expect(result).toBe('https://conduit.example.com/events?token=token1&channel_id=channel1');
  });

  it('appends last_event_id when present', () => {
    const client = createClient();

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

    const client = createClient();

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

    const client = createClient();

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

    const client = createClient();

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

    const client = createClient();

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

    const client = createClient({
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

    const client = createClient();

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

    const client = createClient({
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

    const client = createClient();

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

    const client = createClient();

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

    mockSuccessfulFetch(serverUrl);

    const client = createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buildUrlSpy = vi.spyOn(client as any, 'buildUrl');

    await client.connect();

    expect(buildUrlSpy).toHaveBeenCalledWith(serverUrl, 'token1', 'channel1');
  });
});

describe('connection callbacks', () => {
  it('fires onConnect on first open', async () => {
    mockSuccessfulFetch();

    const onConnect = vi.fn();
    const onReconnect = vi.fn();
    const client = createClient({
      onConnect,
      onReconnect,
    });

    await client.connect();
    client['eventSource']?.onopen?.({} as Event);

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('fires onReconnect on subsequent opens', async () => {
    mockSuccessfulFetch();

    const onConnect = vi.fn();
    const onReconnect = vi.fn();
    const client = createClient({
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

describe('disconnect', () => {
  it('calls close() on EventSource', async () => {
    mockSuccessfulFetch();

    const client = createClient();
    await client.connect();

    const mockEventSource = client['eventSource'];

    client.disconnect();

    expect(mockEventSource?.close).toHaveBeenCalledOnce();
  });

  it('sets eventSource to null', async () => {
    mockSuccessfulFetch();

    const client = createClient();
    await client.connect();

    client.disconnect();

    expect(client['eventSource']).toBeNull();
  });

  it('calls onClose callback', async () => {
    mockSuccessfulFetch();

    const onClose = vi.fn();

    const client = createClient({
      onClose,
    });
    await client.connect();

    client.disconnect();

    expect(onClose).toHaveBeenCalled();
  });

  it('does nothing when not connected', () => {
    const onClose = vi.fn();

    const client = createClient({
      onClose,
    });

    client.disconnect();

    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes event listeners', async () => {
    mockSuccessfulFetch();

    const client = createClient();
    await client.connect();

    const mockEventSource = client['eventSource'];

    client.disconnect();

    expect(mockEventSource?.removeEventListener).toHaveBeenCalledTimes(2); // for stream and control
  });
});

describe('isConnected', () => {
  it('returns false when eventSource is null', () => {
    const client = createClient();

    expect(client.isConnected()).toBe(false);
  });

  it('returns true when readyState is OPEN', async () => {
    mockSuccessfulFetch();

    const client = createClient();
    await client.connect();

    const mockEventSource = client['eventSource'] as unknown as MockEventSource;
    mockEventSource._readyState = MockEventSource.OPEN;

    expect(client.isConnected()).toBe(true);
  });

  it('returns false when readyState is CONNECTING', async () => {
    mockSuccessfulFetch();

    const client = createClient();
    await client.connect();

    const mockEventSource = client['eventSource'] as unknown as MockEventSource;
    mockEventSource._readyState = MockEventSource.CONNECTING;

    expect(client.isConnected()).toBe(false);
  });

  it('returns false when readyState is CLOSED', async () => {
    mockSuccessfulFetch();

    const client = createClient();
    await client.connect();

    const mockEventSource = client['eventSource'] as unknown as MockEventSource;
    mockEventSource._readyState = MockEventSource.CLOSED;

    expect(client.isConnected()).toBe(false);
  });
});

describe('isConnecting', () => {
  it('returns false before connect', () => {
    const client = createClient();

    expect(client.isConnecting).toBe(false);
  });

  it('returns true during connecting', async () => {
    let resolveFetch: (value: unknown) => void;

    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const client = createClient();

    const connectPromise = client.connect();

    expect(client.isConnecting).toBe(true);

    resolveFetch!({
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

    await connectPromise;
    expect(client.isConnecting).toBe(false);
  });

  it('returns false after connect', async () => {
    mockSuccessfulFetch();

    const client = createClient();
    await client.connect();

    expect(client.isConnecting).toBe(false);
  });
});

describe('getTokenExpiry', () => {
  const createTestJwt = (payload: object): string => {
    const header = btoa('{}'); // Empty header, doesn't matter
    const body = btoa(JSON.stringify(payload));
    return `${header}.${body}.x`;
  };

  const client = createClient();

  it('returns expiry in milliseconds for valid JWT with exp claim', () => {
    const exp = 1700000000;
    const token = createTestJwt({ exp });
    const result = client['getTokenExpiry'](token);

    expect(result).toBe(exp * 1000);
  });

  it('returns undefined for JWT without exp claim', () => {
    const token = createTestJwt({ sub: 'user123', iat: 1699999999 });
    const result = client['getTokenExpiry'](token);

    expect(result).toBeUndefined();
  });

  it('returns undefined for malformed JWT (missing parts)', () => {
    const result = client['getTokenExpiry']('not-a-jwt');

    expect(result).toBeUndefined();
  });

  it('returns undefined for invalid base64 in payload', () => {
    const result = client['getTokenExpiry']('header.!!!invalid-base64!!!.sig');

    expect(result).toBeUndefined();
  });

  it('returns undefined for non-JSON payload', () => {
    const header = btoa('header');
    const body = btoa('not json');
    const token = `${header}.${body}.sig`;
    const result = client['getTokenExpiry'](token);

    expect(result).toBeUndefined();
  });
});

describe('handleStream', () => {
  it('calls onMessage with payload for PHASE_DELTA', async () => {
    mockSuccessfulFetch();

    const onMessage = vi.fn();
    const client = createClient({ onMessage });
    await client.connect();

    const addEventListenerMock = client['eventSource']?.addEventListener as ReturnType<
      typeof vi.fn
    >;

    const streamHandler = addEventListenerMock.mock.calls.find((call) => call[0] === 'stream')?.[1];

    streamHandler({
      lastEventId: 'evt-1',
      data: JSON.stringify({
        event_type: 'stream',
        message_id: 'msg-1',
        sequence: 1,
        phase: 'PHASE_DELTA',
        payload: { foo: 'bar' },
      }),
    } as MessageEvent);

    expect(onMessage).toHaveBeenCalledWith({ foo: 'bar' });
  });

  it('calls onError for PHASE_ERROR', async () => {
    mockSuccessfulFetch();

    const onMessage = vi.fn();
    const onError = vi.fn();
    const client = createClient({ onMessage, onError });
    await client.connect();

    const addEventListenerMock = client['eventSource']?.addEventListener as ReturnType<
      typeof vi.fn
    >;

    const streamHandler = addEventListenerMock.mock.calls.find((call) => call[0] === 'stream')?.[1];

    streamHandler({
      lastEventId: 'evt-1',
      data: JSON.stringify({
        event_type: 'stream',
        message_id: 'msg-1',
        sequence: 1,
        phase: 'PHASE_ERROR',
      }),
    } as MessageEvent);

    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(Error('Stream error'));
  });

  it('calls disconnect for PHASE_END', async () => {
    mockSuccessfulFetch();

    const onMessage = vi.fn();
    const client = createClient({ onMessage });
    await client.connect();

    const disconnectSpy = vi.spyOn(client, 'disconnect');

    const addEventListenerMock = client['eventSource']?.addEventListener as ReturnType<
      typeof vi.fn
    >;

    const streamHandler = addEventListenerMock.mock.calls.find((call) => call[0] === 'stream')?.[1];

    streamHandler({
      lastEventId: 'evt-1',
      data: JSON.stringify({
        event_type: 'stream',
        message_id: 'msg-1',
        sequence: 1,
        phase: 'PHASE_END',
      }),
    } as MessageEvent);

    expect(onMessage).not.toHaveBeenCalled();
    expect(disconnectSpy).toHaveBeenCalledOnce();
  });

  it('ignores duplicate message_id', async () => {
    mockSuccessfulFetch();

    const onMessage = vi.fn();
    const client = createClient({ onMessage });
    await client.connect();

    const addEventListenerMock = client['eventSource']?.addEventListener as ReturnType<
      typeof vi.fn
    >;

    const streamHandler = addEventListenerMock.mock.calls.find((call) => call[0] === 'stream')?.[1];

    streamHandler({
      lastEventId: 'evt-1',
      data: JSON.stringify({
        event_type: 'stream',
        message_id: 'msg-1',
        sequence: 1,
        phase: 'PHASE_DELTA',
        payload: { foo: 'bar' },
      }),
    } as MessageEvent);

    streamHandler({
      lastEventId: 'evt-1',
      data: JSON.stringify({
        event_type: 'stream',
        message_id: 'msg-1',
        sequence: 1,
        phase: 'PHASE_DELTA',
        payload: { foo: 'bar' },
      }),
    } as MessageEvent);

    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ foo: 'bar' });
  });

  it('ignores messages with sequence <= lastSeq', async () => {
    mockSuccessfulFetch();

    const onMessage = vi.fn();
    const client = createClient({ onMessage });
    await client.connect();

    const addEventListenerMock = client['eventSource']?.addEventListener as ReturnType<
      typeof vi.fn
    >;

    const streamHandler = addEventListenerMock.mock.calls.find((call) => call[0] === 'stream')?.[1];

    streamHandler({
      lastEventId: 'evt-1',
      data: JSON.stringify({
        event_type: 'stream',
        message_id: 'msg-2',
        sequence: 2,
        phase: 'PHASE_DELTA',
        payload: { value: 'two' },
      }),
    } as MessageEvent);

    streamHandler({
      lastEventId: 'evt-1',
      data: JSON.stringify({
        event_type: 'stream',
        message_id: 'msg-1',
        sequence: 1,
        phase: 'PHASE_DELTA',
        payload: { value: 'one' },
      }),
    } as MessageEvent);

    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ value: 'two' });
  });

  it('calls onError when JSON parsing fails', async () => {
    mockSuccessfulFetch();

    const onMessage = vi.fn();
    const onError = vi.fn();
    const client = createClient({ onMessage, onError });
    await client.connect();

    const addEventListenerMock = client['eventSource']?.addEventListener as ReturnType<
      typeof vi.fn
    >;

    const streamHandler = addEventListenerMock.mock.calls.find((call) => call[0] === 'stream')?.[1];

    streamHandler({
      lastEventId: 'evt-1',
      data: '',
    } as MessageEvent);

    expect(onMessage).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledExactlyOnceWith(Error('Failed to parse'));
  });
});

describe('handleControl', () => {
  it('server_draining triggers reconnect', async () => {
    mockSuccessfulFetch();

    const client = createClient();
    await client.connect();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reconnectSpy = vi.spyOn(client as any, 'reconnect').mockImplementation(() => {});

    const addEventListenerMock = client['eventSource']?.addEventListener as ReturnType<
      typeof vi.fn
    >;

    const controlHandler = addEventListenerMock.mock.calls.find(
      (call) => call[0] === 'control',
    )?.[1];

    controlHandler({
      lastEventId: 'evt-1',
      data: JSON.stringify({
        event_type: 'control',
        message_id: 'msg-1',
        control_type: 'server_draining',
      }),
    } as MessageEvent);

    expect(reconnectSpy).toHaveBeenCalledOnce();
  });
});
