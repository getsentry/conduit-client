const MAX_SEEN_TRACKING = 2048;

/**
 * Response from the stream initialization endpoint containing
 * authentication and connection details.
 */
export type StartStreamResponse = {
  /** Authentication token for the stream connection */
  token: string;
  /** UUID4 for the stream session */
  channel_id: string;
  /** JWT signing algorithm */
  algorithm: 'RS256';
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
 * - PHASE_ERROR: Error occurred in stream
 *
 * Matches rust enums in conduit.
 */
export type StreamPhase = 'PHASE_START' | 'PHASE_DELTA' | 'PHASE_END' | 'PHASE_ERROR';

/**
 * Message envelope for streaming data events.
 * @template T The type of payload data
 */
export type StreamEnvelope<T> = BaseEnvelope & {
  /** Identifies this as a data stream event */
  event_type: 'stream';
  /** Sequential message counter for ordering */
  sequence: number;
  /** Current state of the stream lifecycle */
  phase: StreamPhase;
  /** Data payload (present for PHASE_DELTA events) */
  payload?: T;
};

/**
 * Control message for stream management operations.
 */
export type ControlEnvelope = BaseEnvelope & {
  /** Identifies this as a control event */
  event_type: 'control';
  /** Type of control operation */
  control_type: 'server_draining';
};

/**
 * Configuration options for the Conduit client.
 * @template T The type of messages received from the stream
 */
export type ConduitClientConfig<T> = {
  /** Organization identifier */
  orgId: number;
  /** URL endpoint to POST for initiating a new stream */
  startStreamUrl: string;
  /** Base URL for the stream connection */
  baseConduitUrl: string;
  /** Additional data to include in the POST body when starting the stream */
  startStreamData?: Record<string, unknown>;
  /** Callback fired when a new message is received */
  onMessage?: (message: T) => void;
  /** Callback fired when stream connection opens */
  onOpen?: () => void;
  /** Callback fired when stream connection closes */
  onClose?: () => void;
  /** Callback fired when errors occur within a stream */
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
    const url = new URL(`events/${this.config.orgId}`, this.config.baseConduitUrl);
    url.searchParams.set('token', token);
    url.searchParams.set('channel_id', channelId);
    if (this.lastEventId) {
      url.searchParams.set('last_event_id', this.lastEventId);
    }
    return url.toString();
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
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      this.config.onOpen?.();
    };

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

  private getTokenExpiry(token: string): number | undefined {
    const split = token.split('.')[1];
    if (split === undefined) {
      return undefined;
    }
    try {
      const payload = JSON.parse(atob(split));
      return payload.exp ? payload.exp * 1000 : undefined;
    } catch {
      return undefined;
    }
  }

  async connect(): Promise<void> {
    if (this.connecting || this.eventSource) return;
    this.connecting = true;
    try {
      const { token, channel_id } = await this.startStream();

      this.tokenExpiresAt = this.getTokenExpiry(token);

      if (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt) {
        this.config.onError?.(new Error('Token expired at reconnect'));
        return;
      }

      if (channel_id !== this.currentChannelId) {
        this.currentChannelId = channel_id;
        this.lastSeq = undefined;
        this.seenIds.clear();
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

  get isConnecting(): boolean {
    return this.connecting;
  }
}
