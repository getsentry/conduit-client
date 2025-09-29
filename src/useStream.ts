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
  const isConnectingRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Store options in a ref to always have the latest callbacks
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (clientRef.current === null) {
      const client = new ConduitClient<T>({
        orgId: options.orgId,
        startStreamUrl: options.startStreamUrl,
        baseConduitUrl: options.baseConduitUrl,
        onMessage: (msg: T) => {
          optionsRef.current.onMessage?.(msg);
        },
        onOpen: () => {
          setIsConnected(true);
          optionsRef.current.onOpen?.();
        },
        onClose: () => {
          setIsConnected(false);
          optionsRef.current.onClose?.();
        },
        onError: (err: Error) => {
          setError(err);
          optionsRef.current.onError?.(err);
        },
        ...(options.startStreamData !== undefined && {startStreamData: options.startStreamData}),
      });
      clientRef.current = client;
    }
  }, [options.orgId, options.startStreamUrl, options.baseConduitUrl, options.startStreamData]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (options.enabled) {
      if (!isConnectingRef.current && !clientRef.current?.isConnected()) {
        isConnectingRef.current = true;
        clientRef.current
          ?.connect()
          .catch((error) => {
            setError(error);
            optionsRef.current.onError?.(error);
          })
          .finally(() => {
            isConnectingRef.current = false;
          });
      }
    } else {
      clientRef.current?.disconnect();
      isConnectingRef.current = false;
    }
  }, [options.enabled]);

  return { isConnected, error };
}
