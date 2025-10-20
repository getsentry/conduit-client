import { useState } from 'react';
import './App.css';
import { useStream } from 'conduit-client';

type Message = {
  value: string;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const { isConnected, error } = useStream<Message>({
    orgId: 1,
    startStreamUrl: 'http://localhost:8999/start-stream',
    onMessage: (message: Message) => {
      setMessages((prev) => [...prev, message]);
    },
    onOpen: () => {
      setMessages([]);
    },
    onClose: () => {
      setIsEnabled(false);
    },
    enabled: isEnabled,
  });

  const fullMessage = messages.map((msg) => msg.value).join('');

  return (
    <>
      <div>
        <button onClick={() => setIsEnabled((prev) => !prev)}>
          {isEnabled ? 'Disable' : 'Enable'}
        </button>
        <p>{isConnected ? 'Connected' : 'Disconnected'}</p>
        {error && <p>Error: {error.message}</p>}
        <p>{fullMessage}</p>
      </div>
    </>
  );
}

export default App;
