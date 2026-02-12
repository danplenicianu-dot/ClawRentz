"use client";

type GameRoomProps = {
  roomId: string;
  playerName: string;
};

export default function GameRoom({ roomId, playerName }: GameRoomProps) {
  return (
    <div className="p-4">
      <h2 className="text-xl mb-2">Camera de joc</h2>
      <p className="text-sm text-gray-600">Room: {roomId}</p>
      <p className="text-sm text-gray-600">Player: {playerName || "(guest)"}</p>
      <p className="mt-4">Componentele jocului vor fi implementate aici.</p>
    </div>
  );
}
