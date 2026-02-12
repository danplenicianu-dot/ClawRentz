"use client";

import { useState } from 'react';
import Lobby from '../components/Lobby';
import GameRoom from '../components/GameRoom';

export default function HomePage() {
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');

  const handleCreateGame = () => {
    const id = Math.random().toString(36).substring(2, 9);
    setRoomId(id);
  };

  const handleJoinGame = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // This would normally join an existing game room
  };

  if (roomId) {
    return <GameRoom roomId={roomId} playerName={playerName} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-3xl font-bold mb-4">Rentz Multiplayer</h1>
      <div className="flex flex-col items-center space-y-4">
        <input
          type="text"
          placeholder="Numele tău"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="p-2 border rounded"
        />
        <button
          onClick={handleCreateGame}
          className="px-4 py-2 bg-black text-white rounded"
        >
          Creează cameră
        </button>
        <form onSubmit={handleJoinGame} className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Cod cameră"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="p-2 border rounded"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-gray-800 text-white rounded"
          >
            Intră
          </button>
        </form>
      </div>
    </div>
  );
}
