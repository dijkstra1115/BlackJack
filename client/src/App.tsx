import { useEffect } from 'react';
import { Lobby } from './components/Lobby.js';
import { Table } from './components/Table.js';
import { useRoom } from './state/useRoom.js';

export function App() {
  const room = useRoom();

  // Auto-clear transient error toasts after 4s so they don't pile up.
  useEffect(() => {
    if (!room.errorMessage) return;
    const t = window.setTimeout(room.clearError, 4000);
    return () => window.clearTimeout(t);
  }, [room.errorMessage, room.clearError]);

  return (
    <div className="min-h-full bg-felt-900 text-white">
      {room.errorMessage && (
        <div
          className="fixed top-3 left-1/2 -translate-x-1/2 z-30 bg-red-900/90 border border-red-700
            text-white px-4 py-2 rounded-md shadow-lg text-sm font-mono"
          role="alert"
        >
          {room.errorMessage}
        </div>
      )}

      {room.roomState ? (
        <Table room={room} roomState={room.roomState} />
      ) : (
        <Lobby room={room} />
      )}
    </div>
  );
}
