"use client";

import { useState } from 'react';

interface LobbyProps {
  roomId: string;
  playerName: string;
  players: string[];
  addPlayer: (name: string) => void;
}

export default function Lobby({ roomId, playerName, players, addPlayer }: LobbyProps) {
  const [newPlayer, setNewPlayer] = useState('');

  const handleAddPlayer = () => {
    const name = newPlayer.trim();
    if (name) {
      addPlayer(name);
      setNewPlayer('');
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl mb-2">Camera: {roomId}</h2>
      <h3 className="text-lg mb-2">Jucători:</h3>
      <ul className="list-disc pl-5 mb-4">
        {players.map((player) => (
          <li key={player}>{player}</li>
        ))}
      </ul>
      <div className="flex space-x-2">
        <input
          type="text"
          placeholder="Adaugă jucător"
          value={newPlayer}
          onChange={(e) => setNewPlayer(e.target.value)}
          className="p-2 border rounded"
        />
        <button
          onClick={handleAddPlayer}
          className="px-4 py-2 bg-gray-800 text-white rounded"
        >
          Adaugă
        </button>
      </div>
    </div>
  );
}
