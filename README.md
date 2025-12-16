# conduit-client

The official TypeScript client library for [Conduit](https://github.com/getsentry/conduit).

## How It Works

The client handles connection management, message deduplication, and sequencing internally. Your `onMessage` callback receives deduplicated, ordered payloads.

## Installation

```bash
npm install conduit-client
```

## Usage

See the [examples](./examples/basic) directory for complete working examples.

## API

### ConduitClient

| Method        | Description                          |
| ------------- | ------------------------------------ |
| connect()     | Connect to the stream                |
| disconnect()  | Disconnect from the stream           |
| isConnected() | Check if currently connected         |
| isConnecting  | Check if a connection is in progress |

### Configuration

| Option             | Type                    | Required | Description                                                             |
| ------------------ | ----------------------- | -------- | ----------------------------------------------------------------------- |
| orgId              | number                  | Yes      | Organization identifier                                                 |
| startStreamUrl     | string                  | Yes      | URL endpoint for initializing a stream                                  |
| startStreamData    | Record<string, unknown> | No       | Additional POST body data to send with the start stream request         |
| startStreamHeaders | Record<string, string>  | No       | Custom headers to send with the start stream request                    |
| onMessage          | (message: T) => void    | No       | Called when a stream message is received                                |
| onConnect          | () => void              | No       | Called when the stream first connects                                   |
| onReconnect        | () => void              | No       | Called when the stream automatically reconnects after a connection drop |
| onClose            | () => void              | No       | Called when explicitly closed (disconnected)                            |
| onError            | (error: Error) => void  | No       | Called when a stream or connection error occurs                         |

The `startStreamUrl` endpoint must include `{ conduit: { token, channel_id, url } }` in its response.

### useStream (React)

Returns `{ isConnected, error }` and manages connection lifecycle automatically.

Accepts all configuration options above, plus `enabled` (boolean, default `true`) to control whether to connect.

### TypeScript

Both `ConduitClient` and `useStream` accept a generic type parameter for typed message payloads:

```typescript
type MyPayload = {
  id: string;
  value: number;
};

const client = new ConduitClient<MyPayload>({ ... });
// onMessage payload is typed as MyPayload
```

### Error Handling

The `onError` callback is called for:

- Network/connection failures
- Stream errors (server-sent `PHASE_ERROR`)
- Malformed message parsing failures

### Reconnection

The client automatically reconnects when the underlying connection drops (e.g., network interruption). `onReconnect` fires on successful reconnection. Calling `disconnect()` stops the stream permanently until `connect()` is called again.
