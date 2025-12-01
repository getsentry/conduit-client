import { useEffect, useRef, useState } from 'react';
import { ConduitClient, type ConduitClientConfig } from './client';

/**
 * The options for configuring the stream
 * @template T The type of messages received from the stream
 */
export interface UseStreamOptions<T> extends ConduitClientConfig<T> {
  /** Whether the stream is enabled */
  enabled: boolean;
}

/**
 * React hook for managing streaming via Conduit with automatic lifecycle handling.
 * @template T The type of message received from the stream
 * @param options Options for the stream
 * @returns Connection state: isConnected and error
 */
export function useStream<T>(options: UseStreamOptions<T>) {
  const clientRef = useRef<ConduitClient<T> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Store options in a ref to always have the latest callbacks
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // Disconnect old client when deps change
    clientRef.current?.disconnect();
    // Also reset the state
    setIsConnected(false);
    setError(null);

    // Create a new client with the current options
    const client = new ConduitClient<T>({
      orgId: options.orgId,
      startStreamUrl: options.startStreamUrl,
      onMessage: (msg: T) => {
        optionsRef.current.onMessage?.(msg);
      },
      onConnect: () => {
        setIsConnected(true);
        optionsRef.current.onConnect?.();
      },
      onReconnect: () => {
        setError(null);
        optionsRef.current.onReconnect?.();
      },
      onClose: () => {
        setIsConnected(false);
        optionsRef.current.onClose?.();
      },
      onError: (err: Error) => {
        setError(err);
        optionsRef.current.onError?.(err);
      },
      ...(options.startStreamData !== undefined && { startStreamData: options.startStreamData }),
      ...(options.startStreamHeaders !== undefined && { startStreamHeaders: options.startStreamHeaders }),
    });
    clientRef.current = client;

    // Connect if enabled
    (async () => {
      if (options.enabled) {
        if (!client.isConnecting && !client.isConnected()) {
          try {
            await client.connect();
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            setError(err);
            optionsRef.current.onError?.(err);
          }
        }
      } else {
        client.disconnect();
      }
    })();

    return () => {
      client.disconnect();
    };
  }, [options.enabled, options.orgId, options.startStreamUrl, options.startStreamData, options.startStreamHeaders]);

  return { isConnected, error };
}
