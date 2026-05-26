import { useState } from 'react';
import type { UseRoom } from '../state/useRoom.js';

interface Props {
  room: UseRoom;
}

export function Lobby({ room }: Props) {
  const [name, setName] = useState('');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [startingChips, setStartingChips] = useState('1000');

  const canSubmit = name.trim().length >= 1 && room.status === 'connected';

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="bg-felt-800/70 rounded-xl shadow-xl p-8 w-full max-w-md border border-emerald-700">
        <h1 className="text-3xl font-bold mb-1 tracking-wide">21點 算牌訓練</h1>
        <p className="text-emerald-300 text-sm mb-6">
          8 副牌 · S17 · DAS · 3:2 Blackjack · 75% Penetration
        </p>

        <label className="block mb-4">
          <span className="text-sm font-semibold text-emerald-200">玩家暱稱</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="輸入暱稱"
            className="mt-1 w-full bg-felt-900 border border-emerald-700 rounded px-3 py-2
              text-white placeholder-emerald-700/60 focus:outline-none focus:border-chip-gold"
          />
        </label>

        <div className="border-t border-emerald-800 my-6" />

        <label className="block mb-3">
          <span className="text-sm font-semibold text-emerald-200">起始籌碼</span>
          <input
            type="number"
            value={startingChips}
            onChange={(e) => setStartingChips(e.target.value)}
            min={50}
            step={50}
            className="mt-1 w-full bg-felt-900 border border-emerald-700 rounded px-3 py-2
              text-white focus:outline-none focus:border-chip-gold"
          />
        </label>

        <button
          className="btn-primary w-full mb-6"
          disabled={!canSubmit}
          onClick={() => room.createRoom(name.trim(), Number(startingChips) || 1000)}
        >
          建立新房間
        </button>

        <div className="border-t border-emerald-800 my-6" />

        <label className="block mb-3">
          <span className="text-sm font-semibold text-emerald-200">加入既有房間 (Room ID)</span>
          <input
            type="text"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder="例如 A3B7CD"
            className="mt-1 w-full bg-felt-900 border border-emerald-700 rounded px-3 py-2
              text-white placeholder-emerald-700/60 font-mono tracking-widest
              focus:outline-none focus:border-chip-gold"
          />
        </label>
        <button
          className="btn-secondary w-full"
          disabled={!canSubmit || roomIdInput.trim().length < 4}
          onClick={() => room.joinRoom(roomIdInput.trim(), name.trim())}
        >
          加入房間
        </button>

        <div className="mt-6 text-xs text-emerald-400">
          狀態：
          {room.status === 'connected' && <span className="text-emerald-300">已連線</span>}
          {room.status === 'connecting' && <span className="text-amber-300">連線中…</span>}
          {room.status === 'disconnected' && <span className="text-red-400">已斷線</span>}
          {room.status === 'idle' && <span className="text-stone-400">尚未連線</span>}
        </div>
      </div>
    </div>
  );
}
