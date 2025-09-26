const MAX_SEEN_TRACKING = 2048;

/**
 * Response from the stream initialization endpoint containing
 * authentication and connection details.
 */
export type StartStreamResponse = {
  token: string;
  channel_id: string;
  algorithm: string;
  expires_in: number;
};

type BaseEnvelope = {
  event_type: 'stream' | 'control';
  message_id: string;
};

/**
 * Indicates the current state of a streaming message.
 * - PHASE_START: Stream initialization
 * - PHASE_DELTA: Incremental data update
 * - PHASE_END: Stream termination
 * - PHASE_ERROR: Error occured in stream
 *
 * Matches rust enums in conduit.
 */
export type StreamPhase = 'PHASE_START' | 'PHASE_DELTA' | 'PHASE_END' | 'PHASE_ERROR';

/**
 * Message envelope for streaming data events.
 * @template T The type of payload data
 */
export type StreamEnvelope<T> = BaseEnvelope & {
  event_type: 'stream';
  sequence: number;
  phase: StreamPhase;
  payload?: T;
};

/**
 * Control message for stream management operations.
 */
export type ControlEnvelope = BaseEnvelope & {
  event_type: 'control';
  control_type: 'server_draining';
};

/**
 * Configuration options for the Conduit client.
 * @template T The type of messages received from the stream
 */
export type ConduitClientConfig<T> = {
  orgId: number;
  startStreamUrl: string;
  baseConduitUrl: string;
  startStreamData?: Record<string, unknown>;
  onMessage?: (message: T) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Error) => void;
};

/**
 * Client for managing streaming data via Conduit with automatic
 * reconnection, deduplication, and token management.
 * @template T The type of messages received from the stream
 *
 * @example
 * ```typescript
 * const client = new ConduitClient<MyMessage>({
 *   orgId: 123,
 *   startStreamUrl: 'https://api.example.com/stream/start',
 *   baseConduitUrl: 'https://conduit.example.com',
 *   onMessage: (msg) => console.log(msg),
 *   onError: (err) => console.error(err),
 * });
 * ```
 */
export class ConduitClient<T> {
  private config: ConduitClientConfig<T>;
  private eventSource: EventSource | null = null;
  private connecting = false;

  private lastEventId: string | undefined;
  private lastSeq: number | undefined;
  private seenIds = new Set<string>();

  private tokenExpiresAt: number | undefined;
  private currentChannelId: string | undefined;

  constructor(config: ConduitClientConfig<T>) {
    this.config = config;
  }

  private async startStream(): Promise<StartStreamResponse> {
    const response = await fetch(this.config.startStreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        org_id: this.config.orgId,
        ...this.config.startStreamData,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start stream ${response.statusText}`);
    }

    return response.json();
  }

  private buildUrl(token: string, channelId: string): string {
    const queryParams = new URLSearchParams({
      token,
      channel_id: channelId,
    });
    if (this.lastEventId) queryParams.set('last_event_id', this.lastEventId);
    return `${this.config.baseConduitUrl.replace(/\/$/, '')}/events/${this.config.orgId}?${queryParams.toString()}`;
  }

  private handleStream = (event: MessageEvent): void => {
    this.lastEventId = event.lastEventId;

    let streamEnvelope: StreamEnvelope<T> | null = null;
    try {
      streamEnvelope = JSON.parse(event.data) as StreamEnvelope<T>;
    } catch {
      this.config.onError?.(new Error('Failed to parse'));
      return;
    }

    // Prioritize end over dedupe and sequence checking
    if (streamEnvelope.phase === 'PHASE_END') {
      this.disconnect();
      return;
    }

    if (this.seenIds.has(streamEnvelope.message_id)) return;
    if (this.seenIds.size > MAX_SEEN_TRACKING) this.seenIds.clear();
    this.seenIds.add(streamEnvelope.message_id);

    if (this.lastSeq !== undefined && streamEnvelope.sequence <= this.lastSeq) return;
    this.lastSeq = streamEnvelope.sequence;

    const payload = streamEnvelope.payload;
    if (streamEnvelope.phase === 'PHASE_DELTA' && payload !== undefined) {
      this.config.onMessage?.(payload);
    }

    if (streamEnvelope.phase === 'PHASE_ERROR') {
      this.config.onError?.(new Error('Stream error'));
    }
  };

  private handleControl = (event: MessageEvent): void => {
    this.lastEventId = event.lastEventId;

    let controlEnvelope: ControlEnvelope | null = null;
    try {
      controlEnvelope = JSON.parse(event.data) as ControlEnvelope;
    } catch {
      this.config.onError?.(new Error('Failed to parse'));
      return;
    }

    if (controlEnvelope.control_type === 'server_draining') {
      this.disconnect();
      this.reconnect();
    }
  };

  private attach(url: string) {
    if (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt) {
      return;
    }

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      this.config.onOpen?.();
    };

    if (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt) {
      const e: Error & { code?: string } = new Error('Token expired at reconnect');
      e.code = 'TOKEN_EXPIRED';
      this.config.onError?.(e);
      this.disconnect();
      return;
    }

    this.eventSource.onerror = () => {
      if (this.eventSource === null) return;
      this.config.onError?.(new Error('SSE connection error'));
    };

    this.eventSource.addEventListener('stream', this.handleStream);
    this.eventSource.addEventListener('control', this.handleControl);
  }

  private async reconnect(): Promise<void> {
    if (!this.currentChannelId) {
      this.connect();
      return;
    }

    // TODO: Add token refresh logic when available
    // For now, fall back to creating a new connection
    this.connect();
  }

  async connect(): Promise<void> {
    if (this.connecting || this.eventSource) return;
    this.connecting = true;
    try {
      const { token, channel_id, expires_in } = await this.startStream();

      if (channel_id !== this.currentChannelId) {
        this.currentChannelId = channel_id;
        this.lastSeq = undefined;
        this.seenIds.clear();
      }

      if (Number.isFinite(expires_in) && expires_in > 0) {
        this.tokenExpiresAt = Date.now() + expires_in * 1000;
      } else {
        this.tokenExpiresAt = undefined;
      }

      const url = this.buildUrl(token, channel_id);
      this.attach(url);
    } finally {
      this.connecting = false;
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.onopen = null;
      this.eventSource.onerror = null;
      this.eventSource.removeEventListener('stream', this.handleStream);
      this.eventSource.removeEventListener('control', this.handleControl);
      this.eventSource.close();
      this.eventSource = null;
      this.config.onClose?.();
    }
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}
