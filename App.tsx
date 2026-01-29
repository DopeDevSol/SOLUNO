
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { POOLS, HOUSE_FEE_PERCENT } from './constants';
import { Card, GameState, Player, Pool, CardColor, LeaderboardEntry, GameHistoryEntry } from './types';
import UnoCard from './components/UnoCard';
import { getGameCommentary } from './services/geminiService';

const MAX_TURN_TIME = 15;
const COMMENTARY_COOLDOWN = 20000; 

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, address: "7xV1...9pQz", wins: 142, totalWon: 84.50 },
  { rank: 2, address: "D8eW...2mNx", wins: 118, totalWon: 62.15 },
  { rank: 3, address: "A3sK...8jLp", wins: 95, totalWon: 44.20 },
  { rank: 4, address: "B9qM...1vRb", wins: 82, totalWon: 31.80 },
  { rank: 5, address: "F2nH...5tYs", wins: 76, totalWon: 28.45 },
  { rank: 6, address: "E4mJ...9vKn", wins: 64, totalWon: 22.10 },
  { rank: 7, address: "K1pL...3xZq", wins: 51, totalWon: 18.50 },
  { rank: 8, address: "R6tN...7mBc", wins: 42, totalWon: 12.30 },
];

const MOCK_HISTORY: GameHistoryEntry[] = [
  { id: "1", winner: "7xV1...9pQz", poolFee: 1.0, prize: 9.0, timeAgo: "2m ago", playersCount: 10 },
  { id: "2", winner: "D8eW...2mNx", poolFee: 0.5, prize: 4.5, timeAgo: "5m ago", playersCount: 10 },
  { id: "3", winner: "A3sK...8jLp", poolFee: 0.25, prize: 2.25, timeAgo: "12m ago", playersCount: 10 },
  { id: "4", winner: "B9qM...1vRb", poolFee: 1.0, prize: 9.0, timeAgo: "18m ago", playersCount: 10 },
  { id: "5", winner: "F2nH...5tYs", poolFee: 0.1, prize: 0.9, timeAgo: "24m ago", playersCount: 10 },
  { id: "6", winner: "7xV1...9pQz", poolFee: 0.5, prize: 4.5, timeAgo: "31m ago", playersCount: 10 },
  { id: "7", winner: "K1pL...3xZq", poolFee: 1.0, prize: 9.0, timeAgo: "45m ago", playersCount: 10 },
  { id: "8", winner: "E4mJ...9vKn", poolFee: 0.05, prize: 0.45, timeAgo: "1h ago", playersCount: 10 },
];

const App: React.FC = () => {
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [view, setView] = useState<'lobby' | 'game' | 'leaderboard' | 'history'>('lobby');
  const [activeSpecialId, setActiveSpecialId] = useState<string | null>(null);
  const [dealingCardTarget, setDealingCardTarget] = useState<{ x: number, y: number } | null>(null);
  const [commentary, setCommentary] = useState("Seeker session active...");
  const [turnTimeLeft, setTurnTimeLeft] = useState(MAX_TURN_TIME);
  const [walletConnected, setWalletConnected] = useState(false);

  const [gameState, setGameState] = useState<GameState>({
    deck: [], discardPile: [], players: [], currentPlayerIndex: 0, direction: 1,
    isGameOver: false, winner: null, status: 'lobby', pool: null, lobbyCountdown: 300
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCommentaryTimeRef = useRef<number>(0);

  const winningPrize = useMemo(() => {
    if (!gameState.pool) return 0;
    const totalPot = gameState.players.length * gameState.pool.entryFee;
    return totalPot * (1 - HOUSE_FEE_PERCENT);
  }, [gameState.pool, gameState.players.length]);

  const sortedHand = useMemo(() => {
    const localPlayer = gameState.players.find(p => p.isLocal);
    if (!localPlayer) return [];
    const colorOrder = { red: 0, blue: 1, green: 2, yellow: 3, wild: 4 };
    const valueOrder = { '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'skip': 10, 'reverse': 11, 'draw2': 12, 'wild': 13, 'draw4': 14 };
    return [...localPlayer.hand].sort((a, b) => {
      if (colorOrder[a.color] !== colorOrder[b.color]) return colorOrder[a.color] - colorOrder[b.color];
      return valueOrder[a.value] - valueOrder[b.value];
    });
  }, [gameState.players]);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
        const data = await res.json();
        setSolPrice(parseFloat(data.price));
      } catch (e) { setSolPrice(152.41); }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (gameState.status !== 'playing' || gameState.isGameOver) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setTurnTimeLeft(MAX_TURN_TIME);
    timerRef.current = setInterval(() => {
      setTurnTimeLeft(prev => {
        if (prev <= 1) { handleTimeout(); return MAX_TURN_TIME; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState.currentPlayerIndex, gameState.status, gameState.isGameOver]);

  const handleTimeout = useCallback(() => drawFromDeck(), [gameState.currentPlayerIndex]);

  useEffect(() => {
    if (gameState.status === 'playing' && gameState.currentPlayerIndex !== 0 && !gameState.isGameOver) {
      const botDelay = 1500 + Math.random() * 2000;
      const timeout = setTimeout(() => performBotMove(), botDelay);
      return () => clearTimeout(timeout);
    }
  }, [gameState.currentPlayerIndex, gameState.status, gameState.isGameOver]);

  const performBotMove = () => {
    const bot = gameState.players[gameState.currentPlayerIndex];
    if (!bot) return;
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const validCard = bot.hand.find(c => c.color === 'wild' || c.color === topCard.color || c.value === topCard.value);
    if (validCard) playCardInternal(validCard, gameState.currentPlayerIndex);
    else drawFromDeckInternal(gameState.currentPlayerIndex);
  };

  const createDeck = useCallback((): Card[] => {
    const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
    const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
    const deck: Card[] = [];
    colors.forEach(color => {
      values.forEach(val => {
        deck.push({ id: `${color}-${val}-1`, color, value: val as any });
        if (val !== '0') deck.push({ id: `${color}-${val}-2`, color, value: val as any });
      });
    });
    for (let i = 0; i < 4; i++) {
      deck.push({ id: `wild-${i}`, color: 'wild', value: 'wild' });
      deck.push({ id: `draw4-${i}`, color: 'wild', value: 'draw4' });
    }
    return deck.sort(() => Math.random() - 0.5);
  }, []);

  const nextPlayer = (state: GameState, skip: boolean = false): number => {
    let nextIdx = state.currentPlayerIndex + (state.direction * (skip ? 2 : 1));
    if (nextIdx < 0) nextIdx = state.players.length + (nextIdx % state.players.length);
    return nextIdx % state.players.length;
  };

  const drawCards = (state: GameState, playerIdx: number, count: number): GameState => {
    const newState = { ...state };
    const newPlayers = [...newState.players];
    const newDeck = [...newState.deck];
    for (let i = 0; i < count; i++) {
      if (newDeck.length === 0) {
        const top = newState.discardPile.pop()!;
        newDeck.push(...newState.discardPile.sort(() => Math.random() - 0.5));
        newState.discardPile = [top];
      }
      const card = newDeck.pop();
      if (card) newPlayers[playerIdx].hand.push(card);
    }
    newState.players = newPlayers;
    newState.deck = newDeck;
    return newState;
  };

  const playCardInternal = (card: Card, playerIdx: number) => {
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const isValid = card.color === 'wild' || card.color === topCard.color || card.value === topCard.value;
    if (!isValid) return;

    let newState = { ...gameState };
    newState.players[playerIdx].hand = newState.players[playerIdx].hand.filter(c => c.id !== card.id);
    newState.discardPile.push(card);
    setActiveSpecialId(card.id);

    if (newState.players[playerIdx].hand.length === 0) {
      setGameState({ ...newState, isGameOver: true, winner: newState.players[playerIdx].name, status: 'ended' });
      return;
    }

    let skip = false;
    if (card.value === 'skip') skip = true;
    if (card.value === 'reverse') newState.direction *= -1;
    if (card.value === 'draw2') { newState = drawCards(newState, nextPlayer(newState), 2); skip = true; }
    if (card.value === 'draw4') { newState = drawCards(newState, nextPlayer(newState), 4); skip = true; card.color = 'red'; }
    if (card.value === 'wild') card.color = 'blue';

    newState.currentPlayerIndex = nextPlayer(newState, skip);
    setGameState(newState);
    setTimeout(() => setActiveSpecialId(null), 1200);
  };

  const drawFromDeckInternal = (playerIdx: number) => {
    let newState = drawCards(gameState, playerIdx, 1);
    newState.currentPlayerIndex = nextPlayer(newState);
    setGameState(newState);
  };

  const playCard = (card: Card) => {
    if (gameState.currentPlayerIndex !== 0 || gameState.status !== 'playing') return;
    playCardInternal(card, 0);
  };

  const drawFromDeck = () => {
    if (gameState.status !== 'playing') return;
    drawFromDeckInternal(gameState.currentPlayerIndex);
  };

  const startDealingAnimation = async () => {
    const deck = createDeck();
    setGameState(prev => ({ ...prev, deck }));
    for (let round = 0; round < 7; round++) {
      for (let pIdx = 0; pIdx < 10; pIdx++) {
        const angle = 90 + (pIdx * 36);
        setDealingCardTarget({ x: 42 * Math.cos((angle * Math.PI) / 180), y: 32 * Math.sin((angle * Math.PI) / 180) });
        await new Promise(r => setTimeout(r, 40));
        setGameState(prev => {
          const players = [...prev.players];
          const newDeck = [...prev.deck];
          const card = newDeck.pop();
          if (card && players[pIdx]) players[pIdx].hand.push(card);
          return { ...prev, players, deck: newDeck };
        });
      }
    }
    setDealingCardTarget(null);
    setGameState(prev => {
      const newDeck = [...prev.deck];
      let top = newDeck.pop()!;
      while(top.color === 'wild' || top.value === 'draw4') { newDeck.unshift(top); top = newDeck.pop()!; }
      return { ...prev, status: 'playing', discardPile: [top], deck: newDeck };
    });
  };

  const enterPool = (pool: Pool) => {
    if (!walletConnected) {
      alert("Please connect your Seeker Wallet first!");
      return;
    }
    const players: Player[] = [
      { id: 'me', name: 'YOU', hand: [], isLocal: true, avatarSeed: 88 },
      ...Array.from({ length: 9 }).map((_, i) => ({ id: `b-${i}`, name: `BOT ${i+1}`, hand: [], isLocal: false, avatarSeed: Math.random() * 1000 }))
    ];
    setGameState({ deck: [], discardPile: [], players, currentPlayerIndex: 0, direction: 1, isGameOver: false, winner: null, status: 'shuffling', pool, lobbyCountdown: 0 });
    setView('game');
    setTimeout(() => startDealingAnimation(), 1200);
  };

  const PlayerSlot: React.FC<{ player: Player; index: number; active: boolean }> = ({ player, index, active }) => {
    if (index === 0) return null;
    const angle = 180 - ((index - 1) * (180 / 8)); 
    const x = 50 + 46 * Math.cos((angle * Math.PI) / 180);
    const y = 42 - 34 * Math.sin((angle * Math.PI) / 180);
    return (
      <div className={`absolute flex flex-col items-center transition-all duration-700 ${active ? 'z-50 scale-125' : 'z-20 opacity-50 scale-90'}`} style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
        <div className={`w-10 h-10 rounded-full border-2 overflow-hidden shadow-2xl transition-all duration-300 ${active ? 'border-[#14F195] bg-[#14F195]/20 shadow-[0_0_25px_#14F195]' : 'border-white/10 bg-black/40'}`}>
          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${player.avatarSeed}`} alt="av" className="w-full h-full" />
        </div>
        <div className={`mt-2 px-2 py-0.5 rounded text-[8px] font-black tracking-tighter ${active ? 'bg-[#14F195] text-black' : 'bg-black/80 text-white/50'}`}>
          {player.name} • {player.hand.length}
        </div>
        {active && <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[7px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{turnTimeLeft}</div>}
      </div>
    );
  };

  return (
    <div className="h-[100dvh] flex flex-col felt-table overflow-y-auto no-scrollbar">
      <nav className="flex-none px-4 py-2 flex justify-between items-center bg-black/80 backdrop-blur-3xl z-[150] border-b border-white/5 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-gradient-to-br from-[#9945FF] to-[#14F195] rounded flex items-center justify-center text-white font-black text-[10px]">S</div>
          <h1 className="text-[10px] font-black italic text-white/80 tracking-tighter uppercase">SOLUNO</h1>
        </div>
        <div className="flex gap-4 items-center">
          <span className="text-[9px] font-black text-[#14F195] italic uppercase">SOL: ${solPrice?.toFixed(2)}</span>
          {!walletConnected ? (
             <button onClick={() => setWalletConnected(true)} className="bg-[#14F195] text-black px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all">CONNECT SEEKER</button>
          ) : (
             <div className="bg-[#14F195]/10 px-3 py-1 rounded-lg border border-[#14F195]/20 text-[9px] font-mono text-[#14F195] flex items-center gap-2">
               <div className="w-1.5 h-1.5 bg-[#14F195] rounded-full animate-pulse"></div>
               8.80 SOL
             </div>
          )}
        </div>
      </nav>

      <main className="flex-1 relative">
        {view === 'lobby' && (
          <div className="min-h-full flex flex-col items-center justify-center gap-6 p-4 py-12">
             <div className="text-center">
                <div className="inline-block px-3 py-0.5 bg-[#9945FF]/20 border border-[#9945FF]/40 rounded-full text-[7px] text-[#9945FF] font-black tracking-[0.5em] mb-4 uppercase">SEEKER EXCLUSIVE MATCHMAKING</div>
                <h2 className="text-5xl lg:text-8xl font-black italic tracking-tighter text-white drop-shadow-2xl uppercase">SOLUNO</h2>
                <p className="text-[#14F195] text-[10px] font-black tracking-[0.8em] mt-3 uppercase">Decentralized High Stakes</p>
             </div>
             
             {!walletConnected ? (
                <div className="mt-8 text-center bg-black/40 p-8 rounded-[3rem] border border-white/5 backdrop-blur-xl">
                   <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-6">Authorize via Seed Vault to play</p>
                   <button onClick={() => setWalletConnected(true)} className="bg-white text-black px-12 py-4 rounded-2xl font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)]">LINK SEEKER WALLET</button>
                </div>
             ) : (
               <div className="flex flex-col items-center gap-8 w-full">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-5xl w-full px-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {POOLS.map(p => (
                    <button key={p.id} onClick={() => enterPool(p)} className="bg-black/90 border border-white/10 p-6 rounded-[2rem] flex flex-col items-center hover:border-[#14F195] hover:scale-105 transition-all group active:scale-95 shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-8 h-8 bg-[#14F195]/10 rounded-bl-3xl flex items-center justify-center">
                        <span className="text-[7px] font-black text-[#14F195] italic uppercase">LIVE</span>
                      </div>
                      <span className="text-4xl font-black text-[#14F195] italic leading-none">{p.entryFee}</span>
                      <span className="text-[8px] text-white/40 mt-2 uppercase tracking-widest font-bold">SOL BUY-IN</span>
                    </button>
                  ))}
                </div>
                
                <div className="flex flex-wrap justify-center gap-4 px-6 pb-12">
                  <button 
                    onClick={() => setView('leaderboard')}
                    className="bg-black/60 border border-white/5 px-8 py-3 rounded-full flex items-center gap-3 hover:bg-white/5 transition-all group"
                  >
                    <span className="text-[10px] font-black text-white/40 tracking-[0.3em] uppercase group-hover:text-[#14F195] transition-colors">Hall of Fame</span>
                    <div className="w-5 h-5 bg-gradient-to-r from-[#9945FF] to-[#14F195] rounded-full flex items-center justify-center text-[10px]">🏆</div>
                  </button>

                  <button 
                    onClick={() => setView('history')}
                    className="bg-black/60 border border-white/5 px-8 py-3 rounded-full flex items-center gap-3 hover:bg-white/5 transition-all group"
                  >
                    <span className="text-[10px] font-black text-white/40 tracking-[0.3em] uppercase group-hover:text-[#14F195] transition-colors">Live SOLUNO Feed</span>
                    <div className="w-5 h-5 bg-white/5 rounded-full flex items-center justify-center text-[10px]">📡</div>
                  </button>
                </div>
               </div>
             )}
          </div>
        )}

        {view === 'leaderboard' && (
          <div className="min-h-full w-full flex flex-col items-center justify-center p-8 pb-16 animate-in fade-in zoom-in duration-500">
            <div className="max-w-4xl w-full flex flex-col items-center">
              <div className="text-center mb-10">
                <div className="inline-block px-4 py-1 bg-[#14F195]/10 border border-[#14F195]/20 rounded-full text-[9px] text-[#14F195] font-black tracking-[0.4em] mb-4 uppercase">SOLUNO Hall of Fame</div>
                <h2 className="text-4xl lg:text-6xl font-black italic tracking-tighter text-white uppercase">THE ELITE MASTERS</h2>
                <p className="text-white/30 text-[10px] tracking-[0.5em] mt-3 font-bold uppercase">Top earners across all brackets</p>
              </div>

              <div className="w-full bg-black/40 backdrop-blur-3xl border border-white/5 rounded-[3rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
                <div className="grid grid-cols-4 px-10 py-6 border-b border-white/5 bg-white/5">
                  <span className="text-[9px] font-black text-white/20 tracking-[0.2em] uppercase">RANK</span>
                  <span className="text-[9px] font-black text-white/20 tracking-[0.2em] uppercase">MASTER</span>
                  <span className="text-[9px] font-black text-white/20 tracking-[0.2em] text-center uppercase">WINS</span>
                  <span className="text-[9px] font-black text-white/20 tracking-[0.2em] text-right uppercase">TOTAL WON</span>
                </div>
                <div className="max-h-[50vh] overflow-y-auto no-scrollbar">
                  {MOCK_LEADERBOARD.map((entry, idx) => (
                    <div 
                      key={entry.address} 
                      className={`grid grid-cols-4 px-10 py-5 border-b border-white/5 items-center transition-all hover:bg-white/5 ${entry.rank === 1 ? 'bg-[#14F195]/5' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-xl font-black italic ${entry.rank <= 3 ? 'text-[#14F195]' : 'text-white/40'}`}>
                          #{entry.rank}
                        </span>
                        {entry.rank === 1 && <span className="text-xl animate-bounce">🏆</span>}
                      </div>
                      <span className="font-mono text-[11px] text-white/80">{entry.address}</span>
                      <span className="text-sm font-black text-white text-center italic">{entry.wins}</span>
                      <div className="text-right flex flex-col">
                        <span className="text-sm font-black text-[#14F195] italic leading-none">{entry.totalWon.toFixed(2)} SOL</span>
                        <span className="text-[8px] text-white/20 font-bold uppercase tracking-widest mt-1">Verified</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => setView('lobby')}
                className="mt-12 bg-white text-black px-12 py-4 rounded-2xl font-black text-sm uppercase hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)]"
              >
                Return to Lobby
              </button>
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="min-h-full w-full flex flex-col items-center justify-center p-8 pb-16 animate-in slide-in-from-right-10 duration-500">
            <div className="max-w-4xl w-full flex flex-col items-center">
              <div className="text-center mb-8">
                <div className="inline-block px-4 py-1 bg-[#14F195]/10 border border-[#14F195]/20 rounded-full text-[9px] text-[#14F195] font-black tracking-[0.4em] mb-4 uppercase">Live SOLUNO Feed</div>
                <h2 className="text-4xl lg:text-6xl font-black italic tracking-tighter text-white uppercase">RECENT CONQUESTS</h2>
                <p className="text-white/30 text-[10px] tracking-[0.5em] mt-3 font-bold uppercase">Last 24 hours of total table domination</p>
              </div>

              <div className="w-full bg-black/40 backdrop-blur-3xl border border-white/5 rounded-[3rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
                <div className="grid grid-cols-5 px-10 py-6 border-b border-white/5 bg-white/5">
                  <span className="text-[9px] font-black text-white/20 tracking-[0.2em] uppercase">TIME</span>
                  <span className="text-[9px] font-black text-white/20 tracking-[0.2em] uppercase">WINNER</span>
                  <span className="text-[9px] font-black text-white/20 tracking-[0.2em] text-center uppercase">TIER</span>
                  <span className="text-[9px] font-black text-white/20 tracking-[0.2em] text-center uppercase">TABLE</span>
                  <span className="text-[9px] font-black text-white/20 tracking-[0.2em] text-right uppercase">PRIZE</span>
                </div>
                <div className="max-h-[55vh] overflow-y-auto no-scrollbar">
                  {MOCK_HISTORY.map((entry) => (
                    <div 
                      key={entry.id} 
                      className="grid grid-cols-5 px-10 py-6 border-b border-white/5 items-center transition-all hover:bg-white/5 group"
                    >
                      <span className="text-[10px] font-bold text-white/40 group-hover:text-white/60 transition-colors uppercase">{entry.timeAgo}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-[#14F195] rounded-full animate-pulse shadow-[0_0_8px_#14F195]"></div>
                        <span className="font-mono text-[11px] text-white/80">{entry.winner}</span>
                      </div>
                      <div className="flex justify-center">
                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${entry.poolFee >= 0.5 ? 'bg-[#9945FF]/20 text-[#9945FF] border border-[#9945FF]/40' : 'bg-white/5 text-white/40 border border-white/10'}`}>
                          {entry.poolFee >= 1.0 ? '🐋 Whale' : entry.poolFee >= 0.25 ? '🦈 Shark' : '🐟 Minnow'}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-white/30 text-center uppercase tracking-widest">{entry.playersCount} Players</span>
                      <div className="text-right">
                        <span className="text-lg font-black text-[#14F195] italic leading-none drop-shadow-[0_0_15px_rgba(20,241,149,0.3)]">+{entry.prize.toFixed(2)} SOL</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => setView('lobby')}
                className="mt-12 bg-white text-black px-12 py-4 rounded-2xl font-black text-sm uppercase hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)]"
              >
                Return to Lobby
              </button>
            </div>
          </div>
        )}

        {view === 'game' && (
          <div className="w-full h-screen relative overflow-hidden">
            <div className={`direction-ring ${gameState.direction === 1 ? 'spin-cw' : 'spin-ccw'}`} />
            <div className="table-watermark-center"><div className="watermark-text">SOLUNO</div><div className="watermark-text mt-2" style={{ fontSize: '1.5vh' }}>TABLE PRO #8831</div></div>
            <div className="absolute top-[5%] right-[2%] z-[60]"><div className="bg-black/95 backdrop-blur-2xl border border-white/10 px-4 py-2 rounded-xl max-w-[200px] shadow-2xl"><p className="text-[10px] font-bold text-[#14F195] leading-tight italic uppercase">"{commentary}"</p></div></div>
            <div className="absolute inset-0 z-10">{gameState.players.map((p, i) => <PlayerSlot key={p.id} player={p} index={i} active={gameState.currentPlayerIndex === i} />)}</div>
            
            <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-20 lg:gap-40 z-30 scale-[0.7] lg:scale-100">
               {/* Deck Stack */}
               <div className="flex flex-col items-center gap-4 group" onClick={drawFromDeck}>
                  <div className="relative cursor-pointer transition-transform hover:scale-105 active:scale-95">
                     <div className="absolute top-0 left-0 rotate-[2deg] translate-x-1 translate-y-1 opacity-40"><UnoCard card={{} as any} isBack size="lg" disabled /></div>
                     <div className="absolute top-0 left-0 rotate-[-1deg] -translate-x-0.5 translate-y-0.5 opacity-60"><UnoCard card={{} as any} isBack size="lg" disabled /></div>
                     <div className="absolute top-0 left-0 rotate-[3deg] translate-x-0.5 -translate-y-0.5 opacity-80"><UnoCard card={{} as any} isBack size="lg" disabled /></div>
                     <div className="relative z-10 transform transition-transform group-hover:translate-y-[-5px]"><UnoCard card={{} as any} isBack size="lg" disabled={gameState.currentPlayerIndex !== 0} /></div>
                  </div>
                  <span className={`text-[10px] font-black tracking-[0.5em] transition-colors uppercase ${gameState.currentPlayerIndex === 0 ? 'text-[#14F195] animate-pulse' : 'text-white/20'}`}>DRAW DECK</span>
               </div>

               {/* Discard Pile */}
               <div className="flex flex-col items-center gap-4">
                  <div className="relative w-32 h-44 flex items-center justify-center">
                    {/* Turn Timer Halo */}
                    <div className="absolute -inset-8 pointer-events-none">
                      <svg className="w-full h-full rotate-[-90deg]">
                        <circle cx="50%" cy="50%" r="46%" 
                          stroke={turnTimeLeft < 5 ? '#ef4444' : '#14F195'} 
                          strokeWidth="6" 
                          fill="transparent" 
                          strokeDasharray="400" 
                          strokeDashoffset={400 - (400 * (turnTimeLeft / MAX_TURN_TIME))} 
                          strokeLinecap="round"
                          className="transition-all duration-1000 shadow-[0_0_20px_rgba(20,241,149,0.5)]" 
                        />
                        <circle cx="50%" cy="50%" r="46%" stroke="white" strokeWidth="1" fill="transparent" opacity="0.1" />
                      </svg>
                    </div>
                    {/* Stacked Pile Visual */}
                    {gameState.discardPile.length > 2 && <div className="absolute opacity-10 rotate-[-15deg] translate-x-2 translate-y-2"><UnoCard card={gameState.discardPile[gameState.discardPile.length - 3]} size="lg" disabled /></div>}
                    {gameState.discardPile.length > 1 && <div className="absolute opacity-30 rotate-[8deg] -translate-x-1 translate-y-1"><UnoCard card={gameState.discardPile[gameState.discardPile.length - 2]} size="lg" disabled /></div>}
                    {gameState.discardPile.slice(-1).map(c => (
                      <div key={c.id} className="relative z-20">
                        <UnoCard card={c} size="lg" isSpecialEffect={c.id === activeSpecialId} />
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] font-black text-[#14F195] tracking-[0.5em] uppercase">Active Pile</span>
               </div>
            </div>

            <div className="absolute top-[12%] left-1/2 -translate-x-1/2 z-[40] bg-black/90 border border-[#14F195]/20 px-6 py-2 rounded-full shadow-2xl flex items-center gap-3"><div className="w-2 h-2 bg-[#14F195] rounded-full animate-pulse"></div><span className="text-xl font-black italic text-[#14F195] leading-none tracking-tighter uppercase">{winningPrize.toFixed(2)} SOL POT</span></div>
            {dealingCardTarget && <div className="dealing-card-anim" style={{ '--tx': `${dealingCardTarget.x}vw`, '--ty': `${dealingCardTarget.y}vh` } as any}><div className="w-8 h-12 bg-[#111] border border-white/20 rounded-md"></div></div>}
            
            <div className="absolute bottom-[-10px] w-full z-[200] flex flex-col items-center hand-tray-bg pt-4 pb-6 overflow-visible">
              <div className="flex justify-between items-center w-full px-12 mb-3 pointer-events-none">
                <button onClick={() => setView('lobby')} className="pointer-events-auto bg-white/5 border border-white/10 px-4 py-1.5 rounded-full text-[8px] font-black text-white/40 hover:bg-red-500/10 hover:text-red-500 transition-all uppercase tracking-widest">EXIT</button>
                <div className={`pointer-events-auto px-10 py-2 rounded-full text-[11px] font-black italic border-2 transition-all flex items-center gap-4 uppercase ${gameState.currentPlayerIndex === 0 ? 'bg-[#14F195] border-[#14F195] text-black shadow-[0_0_40px_rgba(20,241,149,0.3)]' : 'bg-black/80 border-white/10 text-white/30'}`}>
                  <span>{gameState.currentPlayerIndex === 0 ? "★ YOUR TURN ★" : `WAITING FOR ${gameState.players[gameState.currentPlayerIndex]?.name}...`}</span>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center border border-current font-bold ${turnTimeLeft < 5 ? 'animate-ping' : ''}`}>{turnTimeLeft}</span>
                </div>
                <div className="w-[60px]"></div>
              </div>
              <div className="relative pointer-events-auto w-full flex justify-center h-[130px] lg:h-[200px] overflow-visible">
                {sortedHand.map((c, idx) => {
                  const total = sortedHand.length;
                  const middle = (total - 1) / 2;
                  const offset = idx - middle;
                  const rotation = offset * (total > 10 ? 3.5 : 5);
                  const xShift = offset * (total > 10 ? 25 : 40);
                  const yShift = Math.abs(offset) * 2;
                  return (
                    <div key={c.id} className="absolute transition-all duration-300 hover:-translate-y-20 active:scale-90 transform-gpu z-10" style={{ zIndex: 10 + idx, transform: `translateX(${xShift}px) translateY(${yShift}px) rotate(${rotation}deg)`, transformOrigin: 'bottom center' }}>
                      <UnoCard card={c} size="md" onClick={() => playCard(c)} disabled={gameState.currentPlayerIndex !== 0} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {gameState.isGameOver && (
        <div className="fixed inset-0 z-[300] bg-black/98 backdrop-blur-3xl flex flex-col items-center justify-center text-center p-8 animate-in zoom-in duration-500 overflow-hidden">
           {/* Confetti Engine Celebration */}
           <div className="absolute inset-0 pointer-events-none">
              {Array.from({ length: 80 }).map((_, i) => {
                const shape = ['rounded-full', 'rounded-none', 'rounded-sm'][Math.floor(Math.random() * 3)];
                const colors = ['#14F195', '#9945FF', '#ed1c24', '#fcee21', '#0054a6', '#ffffff'];
                return (
                  <div 
                    key={i} 
                    className="confetti-piece"
                    style={{
                      left: `${Math.random() * 100}%`,
                      animationDelay: `${Math.random() * 5}s`,
                      animationDuration: `${3 + Math.random() * 4}s`
                    }}
                  >
                    <div className={`confetti-inner ${shape}`} style={{ 
                      backgroundColor: colors[Math.floor(Math.random() * colors.length)],
                      width: `${8 + Math.random() * 8}px`,
                      height: `${12 + Math.random() * 12}px`
                    }} />
                  </div>
                );
              })}
           </div>

           <div className="relative z-10 max-w-6xl w-full">
              <div className="text-[12rem] lg:text-[16rem] mb-4 winner-cup-animation inline-block text-shadow-glow">🏆</div>
              
              <div className="mb-6">
                <span className="text-[#14F195] font-black text-[10px] lg:text-sm tracking-[1em] uppercase block">High Stakes Victory</span>
              </div>

              <h3 className="text-4xl lg:text-7xl font-black italic tracking-tighter text-white mb-10 uppercase leading-[0.9] drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                CONGRATS "{gameState.winner}" <br/> YOU ARE THE WINNER
              </h3>
              
              <div className="bg-white/5 border border-white/10 p-12 lg:p-16 rounded-[4rem] backdrop-blur-3xl inline-block shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative group overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#14F195]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#14F195] text-black px-6 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_#14F195]">Payout Authorized</div>
                <p className="text-white/30 text-[10px] lg:text-xs font-bold uppercase tracking-[0.4em] mb-4">You have been awarded</p>
                <div className="flex items-center justify-center gap-4">
                  <p className="text-[#14F195] font-black text-8xl lg:text-[12rem] tracking-tighter italic leading-none drop-shadow-[0_0_60px_rgba(20,241,149,0.4)]">
                    {winningPrize.toFixed(2)}
                  </p>
                  <span className="text-[#14F195] font-black text-2xl lg:text-5xl italic mt-auto mb-2 opacity-80 uppercase">SOL</span>
                </div>
                <p className="text-white/20 text-[10px] mt-6 font-mono tracking-widest uppercase">Tx ID: confirmed_on_solana_network</p>
              </div>

              <div className="mt-16 flex flex-col items-center gap-6 pb-20">
                <button 
                  onClick={() => setView('lobby')} 
                  className="bg-white text-black px-24 py-7 rounded-2xl font-black text-2xl uppercase shadow-[0_0_80px_rgba(255,255,255,0.15)] hover:bg-[#14F195] hover:scale-110 active:scale-95 transition-all group relative overflow-hidden"
                >
                  <span className="relative z-10 group-hover:tracking-[0.2em] transition-all">START NEXT TOURNAMENT</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                </button>
                <div className="flex items-center gap-4 text-white/40">
                  <div className="h-[1px] w-8 bg-current opacity-20" />
                  <p className="text-[10px] font-bold uppercase tracking-widest italic">Winner stays on table #8831</p>
                  <div className="h-[1px] w-8 bg-current opacity-20" />
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
