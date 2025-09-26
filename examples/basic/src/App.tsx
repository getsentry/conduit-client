import { useState } from 'react';
import './App.css';
import { useStream } from 'conduit-client';

type Message = {
  value: string;
};

function App() {
  const [isEnabled, setIsEnabled] = useState(false);
  const { isConnected, error, messages } = useStream<Message>(
    {
      orgId: 1,
      streamUrl: 'http://localhost:8999/start-stream',
      baseConduitUrl: 'http://localhost:8000',
      onClose: () => {
        setIsEnabled(false);
      },
    },
    isEnabled,
  );

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
