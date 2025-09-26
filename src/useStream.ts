import { useEffect, useRef, useState } from 'react';
import { ConduitClient, type ConduitClientConfig } from './client';

export function useStream<T>(config: ConduitClientConfig<T>, enabled: boolean) {
  const clientRef = useRef<ConduitClient<T> | null>(null);
  const isConnectingRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<T[]>([]);

  // Store config in a ref to always have the latest callbacks
  const configRef = useRef(config);
  configRef.current = config;

  const clearMessages = () => setMessages([]);

  useEffect(() => {
    if (clientRef.current === null) {
      const client = new ConduitClient<T>({
        ...config,
        onMessage: (msg: T) => {
          setMessages((prev) => [...prev, msg]);
          configRef.current.onMessage?.(msg);
        },
        onOpen: () => {
          setIsConnected(true);
          configRef.current.onOpen?.();
        },
        onClose: () => {
          setIsConnected(false);
          configRef.current.onClose?.();
        },
        onError: (err: Error) => {
          setError(err);
          configRef.current.onError?.(err);
        },
      });
      clientRef.current = client;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.orgId, config.streamUrl, config.baseConduitUrl]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (enabled) {
      if (!isConnectingRef.current && !clientRef.current?.isConnected()) {
        isConnectingRef.current = true;
        setMessages([]);
        clientRef.current
          ?.connect()
          .catch((error) => {
            setError(error);
            configRef.current.onError?.(error);
          })
          .finally(() => {
            isConnectingRef.current = false;
          });
      }
    } else {
      clientRef.current?.disconnect();
      isConnectingRef.current = false;
    }
  }, [enabled]);

  return { isConnected, error, messages, clearMessages };
}
