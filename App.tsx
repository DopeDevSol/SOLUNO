
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { POOLS, HOUSE_FEE_PERCENT } from './constants';
import { Card, GameState, Player, Pool, CardColor, LeaderboardEntry, GameHistoryEntry } from './types';
import UnoCard from './components/UnoCard';
import { getGameCommentary } from './services/geminiService';

const MAX_TURN_TIME = 15;
const JOIN_WINDOW_SECONDS = 300; // 5 minutes max

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, address: "7xV1...9pQz", wins: 142, totalWon: 84.50 },
  { rank: 2, address: "D8eW...2mNx", wins: 118, totalWon: 62.15 },
  { rank: 3, address: "A3sK...8jLp", wins: 95, totalWon: 44.20 },
  { rank: 4, address: "B9qM...1vRb", wins: 82, totalWon: 31.80 },
  { rank: 5, address: "F2nH...5tYs", wins: 76, totalWon: 28.45 },
];

const MOCK_RESULTS: GameHistoryEntry[] = [
  { id: "1", winner: "7xV1...9pQz", poolFee: 1.0, prize: 9.0, timeAgo: "2m ago", playersCount: 10 },
  { id: "2", winner: "D8eW...2mNx", poolFee: 0.5, prize: 4.5, timeAgo: "5m ago", playersCount: 8 },
  { id: "3", winner: "A3sK...8jLp", poolFee: 0.25, prize: 2.25, timeAgo: "12m ago", playersCount: 9 },
];

const INITIAL_POOL_STATES = POOLS.map((_, idx) => {
  const playersJoined = Math.floor(Math.random() * 10) + 1; // 10 max
  return {
    roundId: (idx + 101).toString(), // Unique sequential round IDs
    playersJoined,
    timeLeft: Math.floor(Math.random() * (JOIN_WINDOW_SECONDS - 60)) + 60, 
    isInGame: playersJoined === 10
  };
});

const App: React.FC = () => {
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [view, setView] = useState<'lobby' | 'game' | 'leaderboard' | 'results'>('lobby');
  const [activeSpecialId, setActiveSpecialId] = useState<string | null>(null);
  const [turnTimeLeft, setTurnTimeLeft] = useState(MAX_TURN_TIME);
  const [walletConnected, setWalletConnected] = useState(false);
  const [scrollPos, setScrollPos] = useState(0);
  const [poolStates, setPoolStates] = useState(INITIAL_POOL_STATES);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pendingWildCard, setPendingWildCard] = useState<Card | null>(null);
  const [commentary, setCommentary] = useState("Seeker session active...");

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
    if (gameState.status !== 'playing' || gameState.isGameOver || showColorPicker) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setTurnTimeLeft(MAX_TURN_TIME);
    timerRef.current = setInterval(() => {
      setTurnTimeLeft(prev => {
        if (prev <= 1) { handleTimeout(); return MAX_TURN_TIME; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState.currentPlayerIndex, gameState.status, gameState.isGameOver, showColorPicker]);

  const handleTimeout = useCallback(() => drawFromDeck(), [gameState.currentPlayerIndex]);

  useEffect(() => {
    if (gameState.status === 'playing' && gameState.currentPlayerIndex !== 0 && !gameState.isGameOver) {
      const botDelay = 1500 + Math.random() * 1500;
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

  const handleColorSelection = (color: CardColor) => {
    if (!pendingWildCard) return;
    setShowColorPicker(false);
    
    let newState = { ...gameState };
    const topCard = newState.discardPile[newState.discardPile.length - 1];
    topCard.color = color;

    let skip = false;
    if (pendingWildCard.value === 'draw4') {
      newState = drawCards(newState, nextPlayer(newState), 4);
      skip = true;
    }

    newState.currentPlayerIndex = nextPlayer(newState, skip);
    setGameState(newState);
    setPendingWildCard(null);
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

    // Handle Wild Cards
    if (card.color === 'wild') {
      if (playerIdx === 0) {
        setGameState(newState);
        setPendingWildCard(card);
        setShowColorPicker(true);
        return;
      } else {
        const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
        card.color = colors[Math.floor(Math.random() * 4)];
      }
    }

    let skip = false;
    if (card.value === 'skip') skip = true;
    if (card.value === 'reverse') newState.direction *= -1;
    if (card.value === 'draw2') { newState = drawCards(newState, nextPlayer(newState), 2); skip = true; }
    if (card.value === 'draw4') { newState = drawCards(newState, nextPlayer(newState), 4); skip = true; }

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
    if (gameState.currentPlayerIndex !== 0 || gameState.status !== 'playing' || showColorPicker) return;
    playCardInternal(card, 0);
  };

  const drawFromDeck = () => {
    if (gameState.status !== 'playing' || showColorPicker) return;
    drawFromDeckInternal(gameState.currentPlayerIndex);
  };

  const startDealingAnimation = async (playerCount: number) => {
    const deck = createDeck();
    setGameState(prev => ({ ...prev, deck }));
    for (let round = 0; round < 7; round++) {
      for (let pIdx = 0; pIdx < playerCount; pIdx++) {
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
    const playerCount = Math.floor(Math.random() * 8) + 2; // Up to 10
    const players: Player[] = [
      { id: 'me', name: 'YOU', hand: [], isLocal: true, avatarSeed: 88 },
      ...Array.from({ length: playerCount - 1 }).map((_, i) => ({ id: `b-${i}`, name: `BOT ${i+1}`, hand: [], isLocal: false, avatarSeed: Math.random() * 1000 }))
    ];
    setGameState({ deck: [], discardPile: [], players, currentPlayerIndex: 0, direction: 1, isGameOver: false, winner: null, status: 'shuffling', pool, lobbyCountdown: 0 });
    setView('game');
    setTimeout(() => startDealingAnimation(playerCount), 1200);
  };

  const handleExitClick = () => {
    if (gameState.status === 'playing' && !gameState.isGameOver) {
      setShowExitWarning(true);
    } else {
      setView('lobby');
    }
  };

  const confirmExit = () => {
    setShowExitWarning(false);
    setView('lobby');
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

  const winningPrizeValue = useMemo(() => {
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
      {/* Dynamic Animated Background Cards */}
      <div className="fixed inset-0 pointer-events-none z-[5] overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => {
          const speedFactor = 0.5 + (i / 10);
          const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
          const values: any[] = ['7', 'skip', 'draw2', '4', 'wild', 'reverse', '9', 'draw4'];
          const xStart = -200 + (i * 150);
          const currentX = xStart + (scrollPos * speedFactor);
          const currentY = 5 + (i % 6) * 16;
          const currentRot = (scrollPos * 0.05) + (i * 45);
          return (
            <div key={i} className="absolute opacity-20 filter blur-[0.5px] animate-float" style={{ left: `${currentX}px`, top: `${currentY}%`, transform: `rotate(${currentRot}deg)`, transition: 'left 0.1s linear', animationDelay: `${i * 0.8}s` }}>
              <UnoCard card={{ id: `bg-${i}`, color: colors[i % 4], value: values[i % 8] }} size="md" isBack={i % 3 === 0} disabled />
            </div>
          );
        })}
      </div>

      <nav className="flex-none px-4 py-2 flex justify-between items-center bg-black/95 backdrop-blur-3xl z-[150] border-b border-white/5 sticky top-0 shadow-xl">
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
          <div className="min-h-full flex flex-col items-center gap-6 p-4 py-4 lg:py-6 overflow-visible text-center">
             <div className="text-center transition-transform duration-300 pointer-events-none" style={{ transform: `scale(${Math.max(0.6, 1 - scrollPos/1200)}) translateY(${-scrollPos * 0.05}px)` }}>
                <h2 className="text-3xl lg:text-7xl font-black italic tracking-tighter text-white drop-shadow-2xl uppercase leading-none">SOLUNO</h2>
                <div className="mt-1 text-[#9945FF] text-[6px] lg:text-[12px] font-black tracking-[0.3em] uppercase opacity-90 leading-tight">SOLANA UNO - SEEKER MOBILE VERSION</div>
                <div className="mt-4 text-white/40 text-[7px] lg:text-[9px] font-black tracking-[0.15em] uppercase px-4 max-w-sm lg:max-w-none leading-relaxed mx-auto">
                  Classic UNO vibes, Solana speed, Quick matches,<br />
                  Crypto stakes and Endless flex.
                </div>
             </div>
             <div className="w-full flex flex-col items-center gap-4 relative z-30">
                 <div className="flex flex-col items-center gap-2 w-full max-w-6xl">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 w-full px-1 mt-2">
                      {POOLS.map((p, idx) => {
                        const pState = poolStates[idx];
                        const isFree = p.entryFee === 0;
                        const maxPrize = isFree ? 0 : (10 * p.entryFee) * (1 - HOUSE_FEE_PERCENT);
                        return (
                          <div key={p.id} className="scroll-deal" style={{ transitionDelay: `${idx * 40}ms` }}>
                            <button onClick={() => enterPool(p, pState)} className={`w-full border rounded-xl flex flex-col transition-all group shadow-2xl relative overflow-hidden min-h-[140px] lg:min-h-[170px] ${pState.isInGame ? 'bg-red-950/40 border-red-500/30 grayscale opacity-80' : 'bg-gradient-to-br from-zinc-900/80 to-black border-white/10 hover:border-[#14F195]/50 hover:from-zinc-800/80 hover:scale-105 backdrop-blur-xl'}`}>
                              <div className="flex justify-between items-center w-full px-2 py-1.5 border-b border-white/5 bg-white/2">
                                <span className="text-[5px] lg:text-[6px] font-black uppercase text-white/30 tracking-widest">RND #{pState.roundId}</span>
                                <div className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${pState.isInGame ? 'bg-red-600' : 'bg-[#14F195]/10 border border-[#14F195]/20'}`}>
                                  {pState.isInGame ? <span className="text-[4px] lg:text-[5px] font-black uppercase text-white">BUSY</span> : <><div className="w-1 h-1 bg-[#14F195] rounded-full animate-pulse"></div><span className="text-[4px] lg:text-[5px] font-black uppercase text-[#14F195]">JOIN</span></>}
                                </div>
                              </div>
                              <div className="flex flex-col items-center justify-center flex-1 py-1">
                                <span className={`text-2xl lg:text-4xl font-black italic leading-none mb-1 ${pState.isInGame ? 'text-white/20' : 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]'}`}>{isFree ? 'FREE' : p.entryFee.toFixed(2)}</span>
                                <span className={`text-[6px] lg:text-[7px] uppercase tracking-[0.2em] font-black ${pState.isInGame ? 'text-white/10' : 'text-[#9945FF]'}`}>{isFree ? 'DEMO MODE' : 'SOL ENTRY'}</span>
                              </div>
                              <div className={`w-full text-center pb-1 transition-opacity ${pState.isInGame ? 'opacity-0' : 'opacity-100'}`}>
                                <span className="text-[6px] font-black text-[#14F195] uppercase tracking-widest bg-black/40 px-2 py-0.5 rounded-full inline-block">GAME STARTING IN: {formatTime(pState.timeLeft)}</span>
                              </div>
                              <div className="mt-auto w-full">
                                <div className="h-[22px] lg:h-[26px] bg-black/60 relative overflow-hidden flex items-center border-t border-white/5">
                                   <div className={`absolute inset-y-0 left-0 transition-all duration-1000 ${pState.isInGame ? 'bg-red-600/30' : 'bg-[#14F195]/30'}`} style={{ width: `${(pState.playersJoined / 10) * 100}%` }} />
                                   <div className="relative w-full px-2 flex justify-between items-center z-10">
                                      <div className="flex items-center gap-1">
                                        <span className="text-[6px] font-black text-white/40 uppercase">DEGENS:</span>
                                        <span className={`text-[8px] font-black ${pState.playersJoined >= 8 ? 'text-red-400' : 'text-[#14F195]'}`}>{pState.playersJoined}/10</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[5px] font-black text-white/40 uppercase">POT:</span>
                                        <span className="text-[8px] font-black text-[#14F195] italic">{isFree ? '0.00' : maxPrize.toFixed(2)} SOL</span>
                                      </div>
                                   </div>
                                </div>
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 px-4 pt-4">
                      <button onClick={() => setView('leaderboard')} className="bg-white/5 backdrop-blur-sm border border-white/10 px-4 py-1.5 rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all shadow-md scroll-deal">
                        <span className="text-[7px] font-black text-white/50 tracking-[0.1em] uppercase">Leaderboard</span>
                        <div className="w-4 h-4 bg-[#9945FF]/20 rounded-full flex items-center justify-center text-[7px] border border-[#9945FF]/40">🏆</div>
                      </button>
                      <button onClick={() => setView('results')} className="bg-white/5 backdrop-blur-sm border border-white/10 px-4 py-1.5 rounded-lg flex items-center gap-2 hover:bg-white/10 transition-all shadow-md scroll-deal">
                        <span className="text-[7px] font-black text-white/50 tracking-[0.1em] uppercase">History</span>
                        <div className="w-4 h-4 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-[7px]">📡</div>
                      </button>
                    </div>
                 </div>
             </div>
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
                        <circle cx="50%" cy="50%" r="46%" stroke={turnTimeLeft < 5 ? '#ef4444' : '#14F195'} strokeWidth="4" fill="transparent" strokeDasharray="300" strokeDashoffset={300 - (300 * (turnTimeLeft / MAX_TURN_TIME))} strokeLinecap="round"/>
                      </svg>
                    </div>
                    {gameState.discardPile.slice(-1).map(c => (
                      <div key={c.id} className="relative z-20"><UnoCard card={c} size="lg" isSpecialEffect={c.id === activeSpecialId} /></div>
                    ))}
                  </div>
                  <span className="text-[6px] font-black text-[#14F195] tracking-widest uppercase">ACTIVE</span>
               </div>
            </div>

            {/* PRIZE POOL POSITIONED BELOW DECK */}
            <div className="absolute top-[62%] left-1/2 -translate-x-1/2 z-[40] bg-black/95 border border-[#14F195]/30 px-10 py-4 rounded-3xl shadow-[0_0_60px_rgba(20,241,149,0.3)] flex flex-col items-center">
               <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 bg-[#14F195] rounded-full animate-pulse shadow-[0_0_10px_#14F195]"></div>
                  <span className="text-[28px] lg:text-[40px] font-black italic text-[#14F195] tracking-tighter uppercase leading-none drop-shadow-[0_0_15px_rgba(20,241,149,0.5)]">
                    {winningPrizeValue > 0 ? winningPrizeValue.toFixed(2) + ' SOL' : 'DEMO MODE'}
                  </span>
               </div>
               <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.4em] mt-2">CURRENT PRIZE POOL</span>
            </div>

            {/* Color Selection Modal */}
            {showColorPicker && (
              <div className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
                <div className="flex flex-col items-center">
                  <h3 className="text-xl font-black text-white italic uppercase tracking-[0.3em] mb-8">PICK THE NEXT COLOR</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {['red', 'blue', 'green', 'yellow'].map((color) => (
                      <button
                        key={color}
                        onClick={() => handleColorSelection(color as CardColor)}
                        className={`w-24 h-24 lg:w-32 lg:h-32 rounded-2xl border-4 border-white/20 transition-all hover:scale-110 active:scale-95 shadow-2xl`}
                        style={{ 
                          backgroundColor: color === 'red' ? '#ed1c24' : color === 'blue' ? '#0054a6' : color === 'green' ? '#39b54a' : '#fcee21',
                          boxShadow: `0 0 40px ${color === 'red' ? 'rgba(237,28,36,0.4)' : color === 'blue' ? 'rgba(0,84,166,0.4)' : color === 'green' ? 'rgba(57,181,74,0.4)' : 'rgba(252,238,33,0.4)'}`
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="absolute bottom-[-10px] w-full z-[200] flex flex-col items-center hand-tray-bg pt-4 pb-5 overflow-visible">
              <div className="flex justify-between items-center w-full px-6 mb-1.5 pointer-events-none">
                <button onClick={handleExitClick} className="pointer-events-auto bg-white/5 border border-white/10 px-4 py-1.5 rounded-full text-[7px] font-black text-white/40 uppercase tracking-widest hover:bg-red-500/20 hover:text-red-500 transition-all">EXIT TABLE</button>
                <div className={`pointer-events-auto px-6 py-1.5 rounded-full text-[8px] font-black italic border transition-all flex items-center gap-2 uppercase ${gameState.currentPlayerIndex === 0 ? 'bg-[#14F195] border-[#14F195] text-black shadow-glow' : 'bg-black/80 border-white/10 text-white/30'}`}>
                  <span>{gameState.currentPlayerIndex === 0 ? "★ YOUR TURN ★" : `BOT THINKING...`}</span>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center border border-current font-bold ${turnTimeLeft < 5 ? 'animate-ping' : ''}`}>{turnTimeLeft}</span>
                </div>
                <div className="w-[80px]"></div>
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
                      <UnoCard card={c} size="md" onClick={() => playCard(c)} disabled={gameState.currentPlayerIndex !== 0 || showColorPicker} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {(view === 'leaderboard' || view === 'results') && (
          <div className="min-h-full w-full flex flex-col items-center justify-center p-4 animate-in fade-in duration-500 text-center">
            <h2 className="text-2xl font-black italic text-white uppercase mb-6 tracking-tighter">{view === 'leaderboard' ? 'DEGEN LEADERBOARD' : 'GAME HISTORY'}</h2>
            <div className="w-full max-w-lg bg-black/80 border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
              <div className={`grid ${view === 'leaderboard' ? 'grid-cols-3' : 'grid-cols-4'} px-6 py-3 border-b border-white/10 bg-white/5`}>
                {view === 'leaderboard' ? (<><span className="text-[7px] font-black text-white/20 uppercase">RANK / ADDRESS</span><span className="text-[7px] font-black text-white/20 uppercase text-center">WINS</span><span className="text-[7px] font-black text-white/20 uppercase text-right">WON</span></>) : (<><span className="text-[7px] font-black text-white/20 uppercase">TIME</span><span className="text-[7px] font-black text-white/20 uppercase">WINNER</span><span className="text-[7px] font-black text-white/20 uppercase text-center">STAKE</span><span className="text-[7px] font-black text-white/20 uppercase text-right">PRIZE</span></>)}
              </div>
              <div className="max-h-[40vh] overflow-y-auto no-scrollbar">
                {view === 'leaderboard' ? MOCK_LEADERBOARD.map((entry) => (
                  <div key={entry.address} className="grid grid-cols-3 px-6 py-4 border-b border-white/5 items-center hover:bg-white/5">
                    <div className="flex items-center gap-2 truncate"><span className={`text-sm font-black italic ${entry.rank <= 3 ? 'text-[#14F195]' : 'text-white/20'}`}>#{entry.rank}</span><span className="font-mono text-[9px] text-white/60 truncate">{entry.address}</span></div>
                    <span className="text-[10px] font-black text-white text-center">{entry.wins}</span>
                    <span className="text-[10px] font-black text-[#14F195] italic text-right">{entry.totalWon.toFixed(1)} SOL</span>
                  </div>
                )) : MOCK_RESULTS.map((entry) => (
                  <div key={entry.id} className="grid grid-cols-4 px-6 py-4 border-b border-white/5 items-center hover:bg-white/5">
                    <span className="text-[7px] font-bold text-white/30 uppercase">{entry.timeAgo}</span>
                    <span className="font-mono text-[8px] text-white/60 truncate">{entry.winner}</span>
                    <span className="text-[8px] font-black text-white/30 text-center">{entry.poolFee}</span>
                    <span className="text-[10px] font-black text-[#14F195] italic text-right">+{entry.prize.toFixed(1)} SOL</span>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setView('lobby')} className="mt-8 bg-white text-black px-12 py-3 rounded-md font-black text-[10px] uppercase tracking-widest shadow-xl">BACK TO LOBBY</button>
          </div>
        )}
      </main>

      {showExitWarning && (
        <div className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-[#111] border border-red-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-[0_0_50px_rgba(239,68,68,0.2)]">
            <div className="text-5xl mb-4">⚠️</div>
            <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">ABANDON GAME?</h3>
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-8 leading-relaxed">Leaving now will forfeit your current stake and mark the game as a loss. Are you sure?</p>
            <div className="flex flex-col gap-3">
              <button onClick={confirmExit} className="w-full bg-red-600 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-transform">FORFEIT & EXIT</button>
              <button onClick={() => setShowExitWarning(false)} className="w-full bg-white/5 border border-white/10 text-white/60 py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-white/10">STAY IN GAME</button>
            </div>
          </div>
        </div>
      )}

      {gameState.isGameOver && (
        <div className="fixed inset-0 z-[300] bg-black/98 flex flex-col items-center justify-center text-center p-6 animate-in zoom-in duration-500 overflow-hidden">
           <div className="text-[5rem] lg:text-[8rem] mb-3 winner-cup-animation drop-shadow-glow">🏆</div>
           <h3 className="text-3xl lg:text-[5rem] font-black italic tracking-tighter text-white mb-6 uppercase leading-none">{gameState.winner === 'YOU' ? 'VICTORY' : 'DEFEAT'}</h3>
           <div className="bg-white/5 border border-white/10 p-8 rounded-[2rem] shadow-2xl mb-10 flex flex-col items-center min-w-[280px]">
              <p className="text-[#14F195] font-black text-5xl lg:text-7xl leading-none">{winningPrizeValue > 0 ? winningPrizeValue.toFixed(2) : '---'}</p>
              <p className="text-[#14F195]/60 text-[10px] font-black mt-3 uppercase tracking-[0.3em]">{winningPrizeValue > 0 ? 'SOL CLAIMED' : 'UNLUCKY DEGEN'}</p>
           </div>
           <button onClick={() => setView('lobby')} className="bg-white text-black px-16 py-4 rounded-xl font-black text-xs shadow-2xl uppercase tracking-widest transition-transform hover:scale-105 active:scale-95">RETURN TO LOBBY</button>
        </div>
      )}
    </div>
  );
};

export default App;
