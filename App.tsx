
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { POOLS, HOUSE_FEE_PERCENT } from './constants';
import { Card, GameState, Player, Pool, CardColor, LeaderboardEntry, GameHistoryEntry } from './types';
import UnoCard from './components/UnoCard';
import { getGameCommentary } from './services/geminiService';

const MAX_TURN_TIME = 15;
const JOIN_WINDOW_SECONDS = 600; // 10 minutes

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, address: "7xV1...9pQz", wins: 142, totalWon: 84.50 },
  { rank: 2, address: "D8eW...2mNx", wins: 118, totalWon: 62.15 },
  { rank: 3, address: "A3sK...8jLp", wins: 95, totalWon: 44.20 },
  { rank: 4, address: "B9qM...1vRb", wins: 82, totalWon: 31.80 },
  { rank: 5, address: "F2nH...5tYs", wins: 76, totalWon: 28.45 },
];

const MOCK_RESULTS: GameHistoryEntry[] = [
  { id: "1", winner: "7xV1...9pQz", poolFee: 1.0, prize: 9.0, timeAgo: "2m ago", playersCount: 6 },
  { id: "2", winner: "D8eW...2mNx", poolFee: 0.5, prize: 4.5, timeAgo: "5m ago", playersCount: 4 },
  { id: "3", winner: "A3sK...8jLp", poolFee: 0.25, prize: 2.25, timeAgo: "12m ago", playersCount: 5 },
];

const INITIAL_POOL_STATES = POOLS.map(() => {
  const playersJoined = Math.floor(Math.random() * 6) + 1;
  return {
    roundId: Math.random().toString(36).substring(2, 10).toUpperCase(),
    playersJoined,
    timeLeft: Math.floor(Math.random() * (JOIN_WINDOW_SECONDS - 60)) + 60, 
    isInGame: playersJoined === 6
  };
});

const App: React.FC = () => {
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [view, setView] = useState<'lobby' | 'game' | 'leaderboard' | 'results'>('lobby');
  const [activeSpecialId, setActiveSpecialId] = useState<string | null>(null);
  const [dealingCardTarget, setDealingCardTarget] = useState<{ x: number, y: number } | null>(null);
  const [commentary, setCommentary] = useState("Seeker session active...");
  const [turnTimeLeft, setTurnTimeLeft] = useState(MAX_TURN_TIME);
  const [walletConnected, setWalletConnected] = useState(false);
  const [scrollPos, setScrollPos] = useState(0);
  const [poolStates, setPoolStates] = useState(INITIAL_POOL_STATES);

  const [gameState, setGameState] = useState<GameState>({
    deck: [], discardPile: [], players: [], currentPlayerIndex: 0, direction: 1,
    isGameOver: false, winner: null, status: 'lobby', pool: null, lobbyCountdown: 300
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lobbyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrollPos(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    lobbyTimerRef.current = setInterval(() => {
      setPoolStates(prev => prev.map(p => ({
        ...p,
        timeLeft: p.timeLeft > 0 ? p.timeLeft - 1 : JOIN_WINDOW_SECONDS
      })));
    }, 1000);
    return () => { if (lobbyTimerRef.current) clearInterval(lobbyTimerRef.current); };
  }, []);

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
    if (view !== 'lobby') return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('active');
      });
    }, { threshold: 0.05 });

    const scrollElements = document.querySelectorAll('.scroll-deal');
    scrollElements.forEach(el => observer.observe(el));
    return () => scrollElements.forEach(el => observer.unobserve(el));
  }, [view]);

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
      const botDelay = 1000 + Math.random() * 1500;
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

  const startDealingAnimation = async (playerCount: number) => {
    const deck = createDeck();
    setGameState(prev => ({ ...prev, deck }));
    for (let round = 0; round < 7; round++) {
      for (let pIdx = 0; pIdx < playerCount; pIdx++) {
        const angle = 90 + (pIdx * (360 / playerCount));
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

  const enterPool = (pool: Pool, pState: typeof INITIAL_POOL_STATES[0]) => {
    if (pState.isInGame) return;
    if (!walletConnected) {
      setWalletConnected(true);
      return;
    }
    const playerCount = Math.floor(Math.random() * 5) + 2; 
    const players: Player[] = [
      { id: 'me', name: 'YOU', hand: [], isLocal: true, avatarSeed: 88 },
      ...Array.from({ length: playerCount - 1 }).map((_, i) => ({ id: `b-${i}`, name: `BOT ${i+1}`, hand: [], isLocal: false, avatarSeed: Math.random() * 1000 }))
    ];
    setGameState({ deck: [], discardPile: [], players, currentPlayerIndex: 0, direction: 1, isGameOver: false, winner: null, status: 'shuffling', pool, lobbyCountdown: 0 });
    setView('game');
    setTimeout(() => startDealingAnimation(playerCount), 1200);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const PlayerSlot: React.FC<{ player: Player; index: number; active: boolean; total: number }> = ({ player, index, active, total }) => {
    if (index === 0) return null;
    const angleOffset = 180 / (total - 1);
    const angle = 180 - ((index - 1) * angleOffset);
    const x = 50 + 46 * Math.cos((angle * Math.PI) / 180);
    const y = 42 - 34 * Math.sin((angle * Math.PI) / 180);
    return (
      <div className={`absolute flex flex-col items-center transition-all duration-700 ${active ? 'z-50 scale-125' : 'z-20 opacity-50 scale-90'}`} style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
        <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-full border-2 overflow-hidden shadow-2xl transition-all duration-300 ${active ? 'border-[#14F195] bg-[#14F195]/20 shadow-[0_0_25px_#14F195]' : 'border-white/10 bg-black/40'}`}>
          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${player.avatarSeed}`} alt="av" className="w-full h-full" />
        </div>
        <div className={`mt-1 px-1.5 py-0.5 rounded text-[6px] lg:text-[7px] font-black tracking-tighter ${active ? 'bg-[#14F195] text-black' : 'bg-black/80 text-white/50'}`}>
          {player.name} • {player.hand.length}
        </div>
      </div>
    );
  };

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

  return (
    <div className="min-h-screen flex flex-col felt-table overflow-y-auto no-scrollbar scroll-smooth relative">
      {/* Background Card Flight */}
      <div className="fixed inset-0 pointer-events-none z-[5] overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => {
          const speed = 0.5 + (i / 10) * 2.0;
          const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
          const values: any[] = ['7', 'skip', 'draw2', '4', 'wild', 'reverse', '9', 'draw4'];
          const isBack = i % 2 === 0;
          const xStart = -300 + (i * 120);
          const currentX = xStart + (scrollPos * speed);
          const currentY = 10 + (i % 5) * 18;
          const currentRot = (scrollPos * 0.1) + (i * 36);
          return (
            <div key={i} className="absolute opacity-15 filter blur-[1px]" style={{
              left: `${currentX}px`, top: `${currentY}%`,
              transform: `rotate(${currentRot}deg)`, transition: 'left 0.1s linear',
            }}>
              <UnoCard card={{ id: `bg-${i}`, color: colors[i % 4], value: values[i % 8] }} size="md" isBack={isBack} disabled />
            </div>
          );
        })}
      </div>

      <nav className="flex-none px-4 py-2 flex justify-between items-center bg-black/90 backdrop-blur-3xl z-[150] border-b border-white/5 sticky top-0 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-gradient-to-br from-[#9945FF] to-[#14F195] rounded-md flex items-center justify-center text-white font-black text-[10px]">S</div>
          <h1 className="text-[10px] font-black italic text-white tracking-tighter uppercase">SOLUNO</h1>
        </div>
        <div className="flex gap-3 items-center">
          <span className="text-[8px] lg:text-[9px] font-black text-[#14F195] italic uppercase">SOL: ${solPrice?.toFixed(2)}</span>
          {!walletConnected ? (
             <button onClick={() => setWalletConnected(true)} className="bg-[#14F195] text-black px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest shadow-lg">CONNECT</button>
          ) : (
             <div className="bg-[#14F195]/10 px-2 py-1 rounded-md border border-[#14F195]/20 text-[8px] font-mono text-[#14F195] flex items-center gap-1.5">
               <div className="w-1 h-1 bg-[#14F195] rounded-full animate-pulse shadow-glow"></div>8.80 SOL
             </div>
          )}
        </div>
      </nav>

      <main className="flex-1 relative z-10">
        {view === 'lobby' && (
          <div className="min-h-full flex flex-col items-center gap-8 p-4 py-4 lg:py-10 overflow-visible">
             <div className="text-center transition-transform duration-300 pointer-events-none" 
                  style={{ transform: `scale(${Math.max(0.6, 1 - scrollPos/1200)}) translateY(${-scrollPos * 0.05}px)` }}>
                <h2 className="text-3xl lg:text-8xl font-black italic tracking-tighter text-white drop-shadow-2xl uppercase select-none text-shadow-glow leading-none">SOLUNO</h2>
                <div className="mt-2 text-[#9945FF] text-[7px] lg:text-[14px] font-black tracking-[0.3em] uppercase opacity-90 leading-tight">SOLANA UNO VERSION - SEEKER EXCLUSIVE</div>
             </div>
             
             <div className="w-full flex flex-col items-center gap-4 relative z-30">
                 <div className="flex flex-col items-center gap-2 w-full max-w-6xl">
                    <span className="text-white/20 text-[6px] font-black tracking-[0.3em] uppercase">STAKE YOUR SOLANA</span>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 w-full px-1">
                      {POOLS.map((p, idx) => {
                        const pState = poolStates[idx];
                        return (
                          <div key={p.id} className="scroll-deal" style={{ transitionDelay: `${idx * 40}ms` }}>
                            <button 
                              onClick={() => enterPool(p, pState)} 
                              className={`w-full border p-2 lg:p-3 rounded-xl flex flex-col items-center transition-all group shadow-xl relative overflow-hidden neon-card min-h-[110px] lg:min-h-[150px] ${pState.isInGame ? 'bg-red-950/80 border-red-500/50 grayscale-[10%]' : 'bg-black/95 border-white/5 hover:border-[#14F195] hover:scale-105 active:scale-95'}`}
                            >
                              <div className={`absolute top-0 right-0 px-1.5 py-0.5 rounded-bl-lg flex items-center justify-center ${pState.isInGame ? 'bg-red-600' : 'bg-[#14F195]/10'}`}>
                                <span className={`text-[4px] lg:text-[5px] font-black uppercase tracking-tighter ${pState.isInGame ? 'text-white' : 'text-[#14F195]'}`}>
                                  {pState.isInGame ? 'FULL' : 'OPEN'}
                                </span>
                              </div>
                              
                              <span className={`text-xl lg:text-2xl font-black italic leading-none mb-0.5 mt-2 ${pState.isInGame ? 'text-red-500' : 'text-[#14F195]'}`}>
                                {pState.isInGame ? 'IN GAME' : (p.entryFee > 0 ? p.entryFee : 'FREE')}
                              </span>
                              <span className="text-[5px] text-white/30 uppercase tracking-widest font-bold mb-3">
                                {pState.isInGame ? 'LOCKED' : (p.entryFee > 0 ? 'SOL BET' : 'PRACTICE')}
                              </span>

                              <div className="mt-auto pt-2 flex flex-col items-center gap-1.5 w-full border-t border-white/5">
                                 <div className="flex justify-between items-center w-full px-1">
                                    <div className={`w-7 h-7 lg:w-9 lg:h-9 flex flex-col items-center justify-center rounded-md border ${pState.isInGame ? 'bg-red-900/30 border-red-500/30' : 'bg-[#9945FF]/20 border-[#9945FF]/40'}`}>
                                      <span className="text-[4px] text-white/40 font-bold uppercase leading-none mb-0.5">Players</span>
                                      <span className={`text-[8px] lg:text-[10px] font-black ${pState.isInGame ? 'text-red-400' : 'text-white'}`}>{pState.playersJoined}/6</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                      <span className="text-[4px] text-white/20 font-bold uppercase tracking-widest">Window</span>
                                      <span className={`text-[7px] lg:text-[8px] font-black ${pState.isInGame ? 'text-white/10' : 'text-[#14F195]'}`}>
                                        {pState.isInGame ? 'BUSY' : formatTime(pState.timeLeft)}
                                      </span>
                                    </div>
                                 </div>
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap justify-center gap-2 px-4 pt-4">
                      <button onClick={() => setView('leaderboard')} className="bg-black/40 border border-white/5 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all shadow-md scroll-deal">
                        <span className="text-[7px] font-black text-white/40 tracking-[0.1em] uppercase">Soluno Degens</span>
                        <div className="w-4 h-4 bg-[#9945FF]/20 rounded-full flex items-center justify-center text-[7px] border border-[#9945FF]/40">🏆</div>
                      </button>
                      <button onClick={() => setView('results')} className="bg-black/40 border border-white/5 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all shadow-md scroll-deal">
                        <span className="text-[7px] font-black text-white/40 tracking-[0.1em] uppercase">Game Results</span>
                        <div className="w-4 h-4 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-[7px]">📡</div>
                      </button>
                    </div>
                 </div>
             </div>
          </div>
        )}

        {view === 'leaderboard' && (
          <div className="min-h-full w-full flex flex-col items-center justify-center p-4 pb-12 animate-in fade-in zoom-in duration-500">
            <h2 className="text-2xl font-black italic text-white uppercase mb-6 tracking-tighter">SOLUNO DEGENS</h2>
            <div className="w-full max-w-lg bg-black/60 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="grid grid-cols-3 px-6 py-3 border-b border-white/10 bg-white/5">
                <span className="text-[7px] font-black text-white/20 uppercase">RANK / ADDRESS</span>
                <span className="text-[7px] font-black text-white/20 uppercase text-center">WINS</span>
                <span className="text-[7px] font-black text-white/20 uppercase text-right">TOTAL</span>
              </div>
              <div className="max-h-[35vh] overflow-y-auto no-scrollbar">
                {MOCK_LEADERBOARD.map((entry) => (
                  <div key={entry.address} className="grid grid-cols-3 px-6 py-3 border-b border-white/5 items-center hover:bg-white/5">
                    <div className="flex items-center gap-2 truncate">
                       <span className={`text-sm font-black italic ${entry.rank <= 3 ? 'text-[#14F195]' : 'text-white/20'}`}>#{entry.rank}</span>
                       <span className="font-mono text-[9px] text-white/60 truncate">{entry.address}</span>
                    </div>
                    <span className="text-[10px] font-black text-white text-center">{entry.wins}</span>
                    <span className="text-[10px] font-black text-[#14F195] italic text-right">{entry.totalWon.toFixed(1)} S</span>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setView('lobby')} className="mt-6 bg-white text-black px-10 py-2.5 rounded-md font-black text-[10px] uppercase tracking-widest">BACK</button>
          </div>
        )}

        {view === 'results' && (
          <div className="min-h-full w-full flex flex-col items-center justify-center p-4 pb-12 animate-in slide-in-from-right-10 duration-500">
            <h2 className="text-2xl font-black italic text-white uppercase mb-6 tracking-tighter">GAME RESULTS</h2>
            <div className="w-full max-w-lg bg-black/60 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="grid grid-cols-4 px-6 py-3 border-b border-white/10 bg-white/5">
                <span className="text-[7px] font-black text-white/20 uppercase">TIME</span>
                <span className="text-[7px] font-black text-white/20 uppercase">WINNER</span>
                <span className="text-[7px] font-black text-white/20 uppercase text-center">SIZE</span>
                <span className="text-[7px] font-black text-white/20 uppercase text-right">PRIZE</span>
              </div>
              <div className="max-h-[40vh] overflow-y-auto no-scrollbar">
                {MOCK_RESULTS.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-4 px-6 py-3 border-b border-white/5 items-center hover:bg-white/5">
                    <span className="text-[7px] font-bold text-white/40 uppercase">{entry.timeAgo}</span>
                    <span className="font-mono text-[8px] text-white/60 truncate">{entry.winner}</span>
                    <span className="text-[7px] font-black text-white/30 text-center">{entry.playersCount}P</span>
                    <span className="text-[10px] font-black text-[#14F195] italic text-right">+{entry.prize.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setView('lobby')} className="mt-6 bg-white text-black px-10 py-2.5 rounded-md font-black text-[10px] uppercase tracking-widest">BACK</button>
          </div>
        )}

        {view === 'game' && (
          <div className="w-full h-screen relative overflow-hidden">
            <div className={`direction-ring ${gameState.direction === 1 ? 'spin-cw' : 'spin-ccw'}`} />
            <div className="table-watermark-center"><div className="watermark-text">SOLUNO</div><div className="watermark-text mt-1.5" style={{ fontSize: '1vh' }}>PRO TABLE</div></div>
            <div className="absolute top-[4%] right-[2%] z-[60]"><div className="bg-black/95 backdrop-blur-2xl border border-white/10 px-2 py-1 rounded-lg max-w-[120px] shadow-2xl"><p className="text-[7px] font-bold text-[#14F195] leading-tight italic uppercase">"{commentary}"</p></div></div>
            <div className="absolute inset-0 z-10">{gameState.players.map((p, i) => <PlayerSlot key={p.id} player={p} index={i} active={gameState.currentPlayerIndex === i} total={gameState.players.length} />)}</div>
            
            <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-10 lg:gap-32 z-30 scale-[0.5] lg:scale-100">
               <div className="flex flex-col items-center gap-1.5 group" onClick={drawFromDeck}>
                  <div className="relative cursor-pointer transition-transform hover:scale-105 active:scale-95">
                     <div className="absolute top-0 left-0 rotate-[2deg] translate-x-1 translate-y-1 opacity-40"><UnoCard card={{} as any} isBack size="lg" disabled /></div>
                     <div className="relative z-10"><UnoCard card={{} as any} isBack size="lg" disabled={gameState.currentPlayerIndex !== 0} /></div>
                  </div>
                  <span className={`text-[6px] font-black tracking-widest transition-colors uppercase ${gameState.currentPlayerIndex === 0 ? 'text-[#14F195] animate-pulse' : 'text-white/20'}`}>DRAW</span>
               </div>

               <div className="flex flex-col items-center gap-1.5">
                  <div className="relative w-24 h-36 flex items-center justify-center">
                    <div className="absolute -inset-6 pointer-events-none">
                      <svg className="w-full h-full rotate-[-90deg]">
                        <circle cx="50%" cy="50%" r="46%" 
                          stroke={turnTimeLeft < 5 ? '#ef4444' : '#14F195'} 
                          strokeWidth="4" fill="transparent" strokeDasharray="300" 
                          strokeDashoffset={300 - (300 * (turnTimeLeft / MAX_TURN_TIME))} 
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    {gameState.discardPile.slice(-1).map(c => (
                      <div key={c.id} className="relative z-20">
                        <UnoCard card={c} size="lg" isSpecialEffect={c.id === activeSpecialId} />
                      </div>
                    ))}
                  </div>
                  <span className="text-[6px] font-black text-[#14F195] tracking-widest uppercase">ACTIVE</span>
               </div>
            </div>

            <div className="absolute top-[10%] left-1/2 -translate-x-1/2 z-[40] bg-black/95 border border-[#14F195]/30 px-6 py-2 rounded-2xl shadow-2xl flex flex-col items-center">
               <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-1.5 h-1.5 bg-[#14F195] rounded-full animate-pulse"></div>
                  <span className="text-[12px] font-black italic text-[#14F195] tracking-tight uppercase leading-none">{winningPrize > 0 ? winningPrize.toFixed(2) + ' SOL POT' : 'DEMO MODE'}</span>
               </div>
               {gameState.pool && gameState.pool.entryFee > 0 && (
                 <span className="text-[6px] font-black text-white/30 uppercase tracking-[0.2em]">TABLE STAKE: {gameState.pool.entryFee} SOL</span>
               )}
            </div>

            {dealingCardTarget && <div className="dealing-card-anim" style={{ '--tx': `${dealingCardTarget.x}vw`, '--ty': `${dealingCardTarget.y}vh` } as any}><div className="w-5 h-8 bg-[#111] border border-white/10 rounded-sm"></div></div>}
            
            <div className="absolute bottom-[-10px] w-full z-[200] flex flex-col items-center hand-tray-bg pt-4 pb-5 overflow-visible">
              <div className="flex justify-between items-center w-full px-6 mb-1.5 pointer-events-none">
                <button onClick={() => setView('lobby')} className="pointer-events-auto bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[6px] font-black text-white/30 uppercase tracking-widest hover:text-red-500 transition-colors">EXIT</button>
                <div className={`pointer-events-auto px-6 py-1.5 rounded-full text-[8px] font-black italic border transition-all flex items-center gap-2 uppercase ${gameState.currentPlayerIndex === 0 ? 'bg-[#14F195] border-[#14F195] text-black shadow-glow' : 'bg-black/80 border-white/10 text-white/30'}`}>
                  <span>{gameState.currentPlayerIndex === 0 ? "★ YOUR TURN ★" : `BOT THINKING...`}</span>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center border border-current font-bold ${turnTimeLeft < 5 ? 'animate-ping' : ''}`}>{turnTimeLeft}</span>
                </div>
                <div className="w-[40px]"></div>
              </div>
              <div className="relative pointer-events-auto w-full flex justify-center h-[85px] lg:h-[180px] overflow-visible">
                {sortedHand.map((c, idx) => {
                  const total = sortedHand.length;
                  const middle = (total - 1) / 2;
                  const offset = idx - middle;
                  const rotation = offset * (total > 8 ? 2.5 : 4);
                  const xShift = offset * (total > 8 ? 16 : 28);
                  const yShift = Math.abs(offset) * 1.1;
                  return (
                    <div key={c.id} className="absolute transition-all duration-300 hover:-translate-y-12 transform-gpu" style={{ zIndex: 10 + idx, transform: `translateX(${xShift}px) translateY(${yShift}px) rotate(${rotation}deg)`, transformOrigin: 'bottom center' }}>
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
        <div className="fixed inset-0 z-[300] bg-black/98 flex flex-col items-center justify-center text-center p-6 animate-in zoom-in duration-500 overflow-hidden">
           <div className="text-[5rem] lg:text-[10rem] mb-3 winner-cup-animation drop-shadow-glow">🏆</div>
           <h3 className="text-3xl lg:text-[5rem] font-black italic tracking-tighter text-white mb-6 uppercase leading-none">{gameState.winner === 'YOU' ? 'VICTORY' : 'DEFEAT'}</h3>
           <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] shadow-2xl mb-8 flex flex-col items-center">
              <p className="text-[#14F195] font-black text-4xl lg:text-7xl leading-none">{winningPrize > 0 ? winningPrize.toFixed(1) : 'GOAT'}</p>
              <p className="text-[#14F195]/60 text-[10px] font-black mt-2 uppercase">{winningPrize > 0 ? 'SOL CLAIMED' : 'HONOR EARNED'}</p>
           </div>
           <button onClick={() => setView('lobby')} className="bg-white text-black px-12 py-3.5 rounded-lg font-black text-xs shadow-2xl uppercase tracking-widest transition-transform hover:scale-105">RETURN TO LOBBY</button>
        </div>
      )}
    </div>
  );
};

export default App;
