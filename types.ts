
export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
export type CardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'draw4';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  isLocal: boolean;
  avatarSeed: number;
  avatarUrl?: string;
}

export interface Pool {
  id: number;
  entryFee: number; // in SOL
  minUno: number; // min $UNO tokens required
}

export interface GameState {
  deck: Card[];
  discardPile: Card[];
  players: Player[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  isGameOver: boolean;
  winner: string | null;
  status: 'lobby' | 'shuffling' | 'dealing' | 'playing' | 'ended';
  pool: Pool | null;
  lobbyCountdown: number; // seconds left for join window
}

export interface LeaderboardEntry {
  rank: number;
  address: string;
  wins: number;
  totalWon: number;
}

export interface GameHistoryEntry {
  id: string;
  winner: string;
  poolFee: number;
  prize: number;
  timeAgo: string;
  playersCount: number;
}
