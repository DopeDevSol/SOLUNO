
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { POOLS, HOUSE_FEE_PERCENT } from './constants';
import { Card, GameState, Player, Pool, CardColor, LeaderboardEntry } from './types';
import UnoCard from './components/UnoCard';

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, address: "7vM8...xP2q", wins: 142, totalWon: 45.5 },
  { rank: 2, address: "G3nK...pL9s", wins: 128, totalWon: 38.2 },
  { rank: 3, address: "Bn2M...wQ4r", wins: 115, totalWon: 31.0 },
  { rank: 4, address: "X9zP...mK5t", wins: 98, totalWon: 22.4 },
];

const POOL_THEMES: Record<number, { glow: string, accent: string }> = {
  1: { glow: 'shadow-[0_0_30px_rgba(59,130,246,0.1)]', accent: 'text-blue-400' },
  2: { glow: 'shadow-[0_0_30px_rgba(16,185,129,0.1)]', accent: 'text-emerald-400' },
  3: { glow: 'shadow-[0_0_30px_rgba(139,92,246,0.1)]', accent: 'text-purple-400' },
  4: { glow: 'shadow-[0_0_30px_rgba(249,115,22,0.1)]', accent: 'text-orange-400' },
  5: { glow: 'shadow-[0_0_30px_rgba(239,68,68,0.1)]', accent: 'text-red-400' },
};

const SolanaLogoSVG: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 387 310" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M60.1 76.5H387L326.9 0H0L60.1 76.5Z" fill="white"/>
    <path d="M326.9 233.5H0L60.1 310H387L326.9 233.5Z" fill="white"/>
    <path d="M326.9 116.5H0L60.1 193H387L326.9 116.5Z" fill="white"/>
  </svg>
);

const ConfettiBurst: React.FC = () => {
  const pieces = useMemo(() => Array.from({ length: 80 }), []);
  const colors = ['#9945FF', '#14F195', '#ed1c24', '#0054a6', '#fcee21', '#ffffff'];
  
  return (
    <div className="fixed inset-0 pointer-events-none z-[150] overflow-hidden">
      {pieces.map((_, i) => (
        <div
          key={i}
          className="confetti"
          style={{
            left: `${Math.random() * 100}%`,
            backgroundColor: colors[Math.floor(Math.random() * colors.length)],
            animationDelay: `${Math.random() * 4}s`,
            animationDuration: `${2.5 + Math.random() * 3}s`,
            width: `${8 + Math.random() * 12}px`,
            height: `${8 + Math.random() * 12}px`,
            borderRadius: Math.random() > 0.5 ? '50%' : '0%',
          }}
        />
      ))}
    </div>
  );
};

const DirectionIndicator: React.FC<{ direction: 1 | -1 }> = ({ direction }) => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
    <div className="w-64 h-64 lg:w-[50rem] lg:h-[50rem] border-4 lg:border-8 border-dashed border-white/5 rounded-full flex items-center justify-center opacity-30" style={{ animation: `spin ${direction === 1 ? '30s' : '30s reverse'} linear infinite` }}>
      <svg className="w-32 h-32 lg:w-[30rem] lg:h-[30rem] fill-white/5" viewBox="0 0 24 24">
        <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
      </svg>
    </div>
  </div>
);

const SolunoLogo: React.FC<{ size?: 'sm' | 'lg' }> = ({ size = 'lg' }) => (
  <div className={`flex items-center gap-2 ${size === 'lg' ? 'mb-8' : ''}`}>
    <div className="w-8 h-8 lg:w-20 lg:h-20 bg-white rounded-lg lg:rounded-2xl rotate-12 flex items-center justify-center font-black text-black italic text-lg lg:text-4xl shadow-2xl">S</div>
    <h1 className={`${size === 'lg' ? 'text-4xl lg:text-7xl' : 'text-xl lg:text-2xl'} text-white font-black italic tracking-tighter drop-shadow-lg`}>SOLUNO</h1>
  </div>
);

const App: React.FC = () => {
  const [address, setAddress] = useState<string | null>(null);
  const [view, setView] = useState<'lobby' | 'game' | 'leaderboard'>('lobby');
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [activeSpecialId, setActiveSpecialId] = useState<string | null>(null);
  const [dealingCardTarget, setDealingCardTarget] = useState<{ x: number, y: number } | null>(null);

  const [poolStates, setPoolStates] = useState<Record<number, { players: number, countdown: number, round: number }>>({
    1: { players: 1, countdown: 15, round: 1242 },
    2: { players: 10, countdown: 0, round: 856 },
    3: { players: 2, countdown: 210, round: 431 },
    4: { players: 5, countdown: 350, round: 219 },
    5: { players: 9, countdown: 12, round: 94 },
  });

  const [gameState, setGameState] = useState<GameState>({
    deck: [], discardPile: [], players: [], currentPlayerIndex: 0, direction: 1,
    isGameOver: false, winner: null, status: 'lobby', pool: null, lobbyCountdown: 300
  });

  const winningPrize = useMemo(() => {
    if (!gameState.pool) return 0;
    const totalPot = gameState.players.length * gameState.pool.entryFee;
    return totalPot * (1 - HOUSE_FEE_PERCENT);
  }, [gameState.pool, gameState.players.length]);

  // Organizing hand: Numbers by color first, then Actions (grouped), then Wilds on far right
  const sortedHand = useMemo(() => {
    if (!gameState.players[0]) return [];
    const colorOrder = { red: 0, blue: 1, green: 2, yellow: 3, wild: 4 };
    const valueOrder = {
      '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      'skip': 10, 'reverse': 11, 'draw2': 12, 'wild': 13, 'draw4': 14
    };

    return [...gameState.players[0].hand].sort((a, b) => {
      if (colorOrder[a.color] !== colorOrder[b.color]) {
        return colorOrder[a.color] - colorOrder[b.color];
      }
      return valueOrder[a.value] - valueOrder[b.value];
    });
  }, [gameState.players[0]?.hand]);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
        const data = await res.json();
        setSolPrice(parseFloat(data.price));
      } catch (e) {
        setSolPrice(138.42);
      }
    };
    fetchPrice();
    const priceInterval = setInterval(fetchPrice, 30000);

    const occupancyInterval = setInterval(() => {
      setPoolStates(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          const poolId = Number(id);
          if (Math.random() > 0.9 && next[poolId].players < 10) {
            next[poolId].players++;
          } else if (Math.random() > 0.98 && next[poolId].players > 1) {
            next[poolId].players--;
          }
        });
        return next;
      });
    }, 5000);

    return () => {
      clearInterval(priceInterval);
      clearInterval(occupancyInterval);
    };
  }, []);

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
        const topCard = newState.discardPile.pop()!;
        const reshuffled = newState.discardPile.sort(() => Math.random() - 0.5);
        newDeck.push(...reshuffled);
        newState.discardPile = [topCard];
      }
      const card = newDeck.pop();
      if (card) newPlayers[playerIdx].hand.push(card);
    }
    
    newState.players = newPlayers;
    newState.deck = newDeck;
    return newState;
  };

  const playCard = (card: Card) => {
    if (gameState.currentPlayerIndex !== 0 || gameState.status !== 'playing') return;
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const isValid = card.color === 'wild' || card.color === topCard.color || card.value === topCard.value;
    if (!isValid) return;

    let newState = { ...gameState };
    const currentPlayer = newState.players[0];
    currentPlayer.hand = currentPlayer.hand.filter(c => c.id !== card.id);
    newState.discardPile.push(card);
    setActiveSpecialId(card.id);

    if (currentPlayer.hand.length === 0) {
      newState.isGameOver = true;
      newState.winner = 'YOU';
      newState.status = 'ended';
      setGameState(newState);
      return;
    }

    let skip = false;
    if (card.value === 'skip') skip = true;
    if (card.value === 'reverse') newState.direction *= -1;
    if (card.value === 'draw2') {
      newState = drawCards(newState, nextPlayer(newState), 2);
      skip = true;
    }
    if (card.value === 'draw4') {
      newState = drawCards(newState, nextPlayer(newState), 4);
      skip = true;
      card.color = ['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)] as CardColor;
    }
    if (card.value === 'wild') {
       card.color = ['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)] as CardColor;
    }

    newState.currentPlayerIndex = nextPlayer(newState, skip);
    setGameState(newState);
    setTimeout(() => setActiveSpecialId(null), 1000);
  };

  const drawFromDeck = () => {
    if (gameState.currentPlayerIndex !== 0 || gameState.status !== 'playing') return;
    let newState = drawCards(gameState, 0, 1);
    newState.currentPlayerIndex = nextPlayer(newState);
    setGameState(newState);
  };

  const handleLeaveGame = () => {
    if (window.confirm("WARNING: If you leave now, you will lose your bet amount and the round will count as a loss. Are you sure?")) {
      setView('lobby');
    }
  };

  useEffect(() => {
    if (gameState.status === 'playing' && gameState.currentPlayerIndex !== 0 && !gameState.isGameOver) {
      const timer = setTimeout(() => {
        const botIdx = gameState.currentPlayerIndex;
        const bot = gameState.players[botIdx];
        const topCard = gameState.discardPile[gameState.discardPile.length - 1];
        const playableCard = bot.hand.find(c => c.color === 'wild' || c.color === topCard.color || c.value === topCard.value);

        if (playableCard) {
          let newState = { ...gameState };
          const botRef = newState.players[botIdx];
          botRef.hand = botRef.hand.filter(c => c.id !== playableCard.id);
          newState.discardPile.push(playableCard);
          setActiveSpecialId(playableCard.id);

          if (botRef.hand.length === 0) {
            newState.isGameOver = true;
            newState.winner = botRef.name;
            newState.status = 'ended';
            setGameState(newState);
            return;
          }

          let skip = false;
          if (playableCard.value === 'skip') skip = true;
          if (playableCard.value === 'reverse') newState.direction *= -1;
          if (playableCard.value === 'draw2') {
            newState = drawCards(newState, nextPlayer(newState), 2);
            skip = true;
          }
          if (playableCard.value === 'draw4') {
            newState = drawCards(newState, nextPlayer(newState), 4);
            skip = true;
            playableCard.color = ['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)] as CardColor;
          }
          if (playableCard.value === 'wild') {
            playableCard.color = ['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)] as CardColor;
          }

          newState.currentPlayerIndex = nextPlayer(newState, skip);
          setGameState(newState);
          setTimeout(() => setActiveSpecialId(null), 800);
        } else {
          let newState = drawCards(gameState, botIdx, 1);
          newState.currentPlayerIndex = nextPlayer(newState);
          setGameState(newState);
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState.currentPlayerIndex, gameState.status, gameState.isGameOver]);

  const startDealingAnimation = async () => {
    const deck = createDeck();
    const CARDS_PER_PLAYER = 7;
    for (let round = 0; round < CARDS_PER_PLAYER; round++) {
      for (let pIdx = 0; pIdx < 10; pIdx++) {
        const angleOffset = 90;
        const step = 360 / 10;
        const angle = angleOffset + (pIdx * step);
        const tx = 35 * Math.cos((angle * Math.PI) / 180);
        const ty = 25 * Math.sin((angle * Math.PI) / 180);
        setDealingCardTarget({ x: tx, y: ty });
        await new Promise(r => setTimeout(r, 80));
        setGameState(prev => {
          const newPlayers = [...prev.players];
          const newDeck = [...prev.deck.length ? prev.deck : deck];
          const card = newDeck.pop();
          if (card && newPlayers[pIdx]) newPlayers[pIdx].hand.push(card);
          return { ...prev, players: newPlayers, deck: newDeck };
        });
      }
    }
    setDealingCardTarget(null);
    setGameState(prev => {
      const newDeck = [...prev.deck];
      let firstCard = newDeck.pop()!;
      while(firstCard.color === 'wild' || firstCard.value === 'draw4') { newDeck.unshift(firstCard); firstCard = newDeck.pop()!; }
      return { ...prev, status: 'playing', discardPile: [firstCard], deck: newDeck };
    });
  };

  // Fixed the missing 'enterPool' error by implementing the function
  const enterPool = (pool: Pool) => {
    const localPlayer: Player = {
      id: 'local-1',
      name: 'YOU',
      hand: [],
      isLocal: true,
      avatarSeed: Math.floor(Math.random() * 1000),
    };

    const bots: Player[] = Array.from({ length: 9 }).map((_, i) => ({
      id: `bot-${i}`,
      name: `WHALE #${i + 1}`,
      hand: [],
      isLocal: false,
      avatarSeed: Math.floor(Math.random() * 1000),
    }));

    setGameState({
      deck: [],
      discardPile: [],
      players: [localPlayer, ...bots],
      currentPlayerIndex: 0,
      direction: 1,
      isGameOver: false,
      winner: null,
      status: 'shuffling',
      pool,
      lobbyCountdown: 0
    });
    
    setView('game');

    // Slight delay to allow the 'shuffling' UI to be visible before dealing starts
    setTimeout(() => {
      startDealingAnimation();
    }, 2000);
  };

  const PlayerSlot: React.FC<{ player: Player; index: number; total: number; active: boolean }> = ({ player, index, total, active }) => {
    if (index === 0) return null; 
    const isMobile = window.innerWidth < 768;
    const angleOffset = 90;
    const step = 360 / total;
    const angle = angleOffset + (index * step);
    const radiusX = isMobile ? 42 : 46; 
    const radiusY = isMobile ? 32 : 36;
    const x = 50 + radiusX * Math.cos((angle * Math.PI) / 180);
    const y = 35 + radiusY * Math.sin((angle * Math.PI) / 180); // Seat positions shifted high
    
    return (
      <div className={`absolute flex flex-col items-center transition-all duration-500 ${active ? 'z-[60] scale-105 lg:scale-125' : 'z-20 opacity-40 scale-[0.5] lg:scale-90 grayscale'}`} style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
        <div className={`w-7 h-7 lg:w-20 lg:h-20 rounded-full border lg:border-4 overflow-hidden mb-1 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${active ? 'border-purple-500 bg-purple-500/30' : 'border-white/10 bg-black'}`}>
          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${player.avatarSeed}`} alt={player.name} className="w-full h-full object-cover" />
        </div>
        <div className={`px-1 py-0.25 lg:px-4 lg:py-1 rounded-full text-[6px] lg:text-xs font-black transition-all ${active ? 'bg-purple-600 text-white' : 'bg-black/80 text-white/50 border border-white/5'}`}>
          <span className="hidden lg:inline">{player.name}</span> <span className="bg-white/20 px-1 lg:ml-1 rounded-sm lg:rounded-md">{player.hand.length}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="h-[100dvh] flex flex-col font-sans uppercase select-none overflow-hidden relative">
      <nav className="flex-none border-b border-white/10 p-2 lg:p-6 flex justify-between items-center bg-black/80 backdrop-blur-xl z-[100]">
        <SolunoLogo size="sm" />
        <div className="flex gap-2 lg:gap-6 items-center">
          <button onClick={() => setView('leaderboard')} className="px-2 lg:px-5 py-2 hover:bg-white/10 rounded-full text-[9px] lg:text-sm font-black transition-all text-white/70 tracking-tighter lg:tracking-widest border border-transparent">STATS</button>
          {!address ? (
            <button onClick={() => setAddress("DEMO")} className="bg-white text-black px-3 lg:px-10 py-2 lg:py-3 rounded-lg lg:rounded-xl font-black text-[9px] lg:text-sm hover:scale-105 active:scale-95 transition-all shadow-xl">CONNECT</button>
          ) : (
            <div className="flex items-center gap-2 lg:gap-3 bg-white/5 border border-white/10 px-3 lg:px-6 py-2 lg:py-3 rounded-lg lg:rounded-xl font-mono text-[10px] lg:text-sm">
              <span className="text-emerald-400 font-black tracking-tighter">8.8 SOL</span>
            </div>
          )}
        </div>
      </nav>

      <main className="flex-1 relative overflow-hidden z-10 custom-scrollbar">
        {view === 'lobby' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 lg:p-8 overflow-y-auto">
            <SolunoLogo />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-8 max-w-[90rem] w-full">
              {POOLS.map(p => {
                const occupancy = poolStates[p.id].players;
                const isFull = occupancy >= 10;
                return (
                  <button key={p.id} onClick={() => enterPool(p)} className={`group relative bg-black/60 backdrop-blur-md border border-white/10 p-6 lg:p-12 rounded-3xl lg:rounded-[2.5rem] transition-all duration-500 flex flex-col items-center overflow-hidden hover:border-white/40 lg:hover:-translate-y-4 ${POOL_THEMES[p.id].glow}`}>
                    <div className="absolute top-2 right-4 lg:top-4 lg:right-8 text-[8px] lg:text-[11px] font-black text-white/20 tracking-tighter">ROUND #{poolStates[p.id].round}</div>
                    <div className={`text-4xl lg:text-7xl font-black italic tracking-tighter mb-1 lg:mb-2 ${POOL_THEMES[p.id].accent}`}>{p.entryFee}<span className="text-sm lg:text-lg opacity-30 ml-1 lg:ml-2">SOL</span></div>
                    
                    <div className="w-full flex flex-col items-center gap-1 lg:gap-3 my-2 lg:my-6">
                       <div className="flex justify-between w-full text-[8px] lg:text-[10px] font-black tracking-widest text-white/50">
                          <span>{occupancy}/10 PLAYERS</span>
                       </div>
                       <div className="w-full h-1.5 lg:h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                          <div className={`h-full transition-all duration-1000 ${isFull ? 'bg-red-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]'}`} style={{ width: `${occupancy * 10}%` }}></div>
                       </div>
                    </div>

                    <div className="w-full py-2 lg:py-4 bg-white text-black rounded-xl lg:rounded-2xl text-[10px] lg:text-sm font-black uppercase shadow-2xl group-hover:bg-emerald-400 group-hover:scale-105 transition-all">JOIN</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'leaderboard' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 lg:p-8 overflow-y-auto">
             <div className="max-w-5xl w-full text-center">
                <h2 className="text-4xl lg:text-[10rem] font-black italic tracking-tighter text-white uppercase mb-4 lg:mb-20 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)] leading-none text-wrap break-words">THE WHALE LIST</h2>
                <div className="bg-black/80 border border-white/10 rounded-3xl lg:rounded-[3rem] overflow-hidden backdrop-blur-3xl shadow-[0_0_100px_rgba(0,0,0,0.8)]">
                   {MOCK_LEADERBOARD.map(entry => (
                      <div key={entry.rank} className="grid grid-cols-4 p-4 lg:p-10 items-center border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                         <span className="w-8 h-8 lg:w-16 lg:h-16 flex items-center justify-center rounded-lg lg:rounded-2xl bg-white/10 text-sm lg:text-3xl font-black text-white">{entry.rank}</span>
                         <span className="font-mono text-[9px] lg:text-lg text-white/40 tracking-wider truncate px-2">{entry.address}</span>
                         <span className="text-center font-black italic text-emerald-400 text-[9px] lg:text-2xl uppercase">{entry.wins} W</span>
                         <span className="text-right font-black italic text-sm lg:text-4xl tracking-tighter text-white">{entry.totalWon} SOL</span>
                      </div>
                   ))}
                </div>
                <button onClick={() => setView('lobby')} className="mt-8 lg:mt-20 px-12 lg:px-24 py-3 lg:py-6 bg-white text-black rounded-xl lg:rounded-2xl font-black text-xs lg:text-lg hover:scale-110 active:scale-95 transition-all shadow-2xl uppercase">BACK</button>
             </div>
          </div>
        )}

        {view === 'game' && (
          <div className="h-full flex flex-col relative felt-table overflow-hidden">
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
              
              <SolanaLogoSVG className="solana-watermark left-[2%] top-[5%] scale-50 lg:scale-75" />
              <SolanaLogoSVG className="solana-watermark right-[2%] top-[5%] scale-50 lg:scale-75" />

              <DirectionIndicator direction={gameState.direction} />
              
              <div className="neon-circle-container flex items-center justify-center scale-50 sm:scale-75 lg:scale-110 mt-[-15dvh]">
                 <div className={`neon-circle ${gameState.direction === 1 ? 'animate-cw' : 'animate-ccw'}`}></div>
              </div>

              {gameState.status === 'shuffling' ? (
                <div className="z-50 flex flex-col items-center gap-4 lg:gap-12">
                   <div className="relative w-24 h-36 lg:w-64 lg:h-96">
                      <div className="absolute inset-0 shuffle-anim-1 shadow-[0_10px_30px_rgba(0,0,0,0.8)]"><UnoCard card={{} as any} isBack size="lg" disabled /></div>
                   </div>
                   <div className="text-lg lg:text-7xl font-black italic tracking-tighter animate-pulse text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.6)] uppercase">SHUFFLING...</div>
                </div>
              ) : gameState.isGameOver ? (
                <>
                  <ConfettiBurst />
                  <div className="z-[200] bg-black/95 backdrop-blur-[100px] p-6 lg:p-32 rounded-3xl lg:rounded-[5rem] border-2 lg:border-[6px] border-yellow-500/40 text-center animate-in zoom-in duration-700 shadow-[0_0_100px_rgba(234,179,8,0.3)] max-w-4xl w-[85%] flex flex-col items-center">
                    <div className="text-2xl lg:text-[14rem] mb-2 lg:mb-10 animate-bounce">🏆</div>
                    <div className="text-emerald-400 text-[8px] lg:text-4xl font-black tracking-[0.4em] mb-1 lg:mb-6 uppercase">VICTORY!</div>
                    <div className="text-xl lg:text-[12rem] font-black italic tracking-tighter mb-2 lg:mb-8 text-white leading-none uppercase">WINNER!</div>
                    
                    <div className="bg-white/5 border border-white/10 rounded-xl lg:rounded-[4rem] p-4 lg:p-20 mb-4 lg:mb-16 w-full shadow-inner">
                      <div className="text-3xl lg:text-[12rem] font-black text-emerald-400 italic tracking-tighter">
                        {winningPrize.toFixed(3)} <span className="text-[10px] lg:text-5xl opacity-40 uppercase">SOL</span>
                      </div>
                    </div>

                    <button onClick={() => setView('lobby')} className="px-6 lg:px-24 py-2 lg:py-8 bg-white text-black rounded-lg lg:rounded-3xl text-[10px] lg:text-5xl font-black hover:scale-110 active:scale-90 transition-all uppercase">CLAIM</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="absolute inset-0 z-20 pointer-events-none">
                    {gameState.players.map((p, idx) => (
                      <PlayerSlot key={p.id} player={p} index={idx} total={gameState.players.length} active={gameState.currentPlayerIndex === idx} />
                    ))}
                  </div>
                  
                  <div className="relative z-[50] flex flex-col items-center justify-center scale-[0.4] sm:scale-[0.8] lg:scale-100 mt-[-22dvh] lg:mt-[-15dvh]">
                    <div className="flex items-center gap-4 lg:gap-64 relative z-10">
                      
                      {/* CARD PACK (DRAW DECK) */}
                      <div className="flex flex-col items-center gap-4 lg:gap-8">
                        <div className="relative w-16 h-24 lg:w-48 lg:h-72 cursor-pointer group active:scale-90 transition-all" onClick={drawFromDeck}>
                           <div className="absolute inset-0 translate-x-1 translate-y-1 bg-white/10 rounded-lg lg:rounded-[2.5rem] border border-white/20"></div>
                           <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 bg-white/20 rounded-lg lg:rounded-[2.5rem] border border-white/30 shadow-xl"></div>
                           <div className="relative transform lg:group-hover:-translate-y-4 transition-transform">
                             <UnoCard card={{} as any} isBack size="lg" disabled={gameState.currentPlayerIndex !== 0 || gameState.status !== 'playing'} />
                           </div>
                        </div>
                        <div className="px-2 py-0.5 lg:px-6 lg:py-2 bg-black/60 rounded-full border border-white/10 backdrop-blur-md">
                           <span className="text-[7px] lg:text-lg font-black text-white/90 italic tracking-widest uppercase">DRAW</span>
                        </div>
                      </div>

                      {/* DISCARD PILE */}
                      <div className="flex flex-col items-center gap-4 lg:gap-8">
                        <div className="relative w-16 h-24 lg:w-48 lg:h-72 flex items-center justify-center">
                          {gameState.discardPile.slice(-3).map((c, i) => (
                            <div key={c.id} className="absolute inset-0 transition-all duration-500" style={{ transform: `rotate(${(i-1)*12}deg) translate(${(i-1)*4}px, ${(i-1)*2}px)`, zIndex: i + 10 }}>
                              <UnoCard card={c} size="lg" isSpecialEffect={c.id === activeSpecialId} />
                            </div>
                          ))}
                        </div>
                        <div className="px-2 py-0.5 lg:px-6 lg:py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20 backdrop-blur-md">
                           <span className="text-[7px] lg:text-lg font-black text-emerald-400 italic tracking-widest uppercase">PLAY</span>
                        </div>
                      </div>
                    </div>

                    {/* Pot Display */}
                    <div className="mt-8 lg:mt-20 px-4 lg:px-16 py-2 lg:py-8 bg-black/90 border border-white/10 rounded-xl lg:rounded-[3rem] backdrop-blur-3xl relative z-20 shadow-[0_0_20px_rgba(153,69,255,0.4)] group border-b-emerald-500/60">
                       <div className="flex items-center gap-2 lg:gap-10">
                          <span className="text-xl lg:text-6xl animate-float-money">💸</span>
                          <div className="flex flex-col">
                             <span className="text-[6px] lg:text-[12px] font-black text-white/30 tracking-[0.3em] lg:tracking-[0.5em] mb-0.5 uppercase">POT TOTAL</span>
                             <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-white to-emerald-400 font-black italic tracking-tighter text-xl lg:text-9xl">
                               {winningPrize.toFixed(3)} <span className="text-[10px] lg:text-4xl opacity-40">SOL</span>
                             </span>
                          </div>
                          <span className="text-xl lg:text-6xl animate-float-money" style={{ animationDelay: '0.3s' }}>💰</span>
                       </div>
                    </div>
                  </div>

                  {dealingCardTarget && (
                    <div className="dealing-card-anim" style={{ '--tx': `${dealingCardTarget.x}vw`, '--ty': `${dealingCardTarget.y}vh` } as any}>
                       <UnoCard card={{} as any} isBack size="sm" disabled />
                    </div>
                  )}

                  {/* FLOATING PLAYER UI - Background line removed to show full table */}
                  <div className="absolute bottom-0 w-full flex flex-col items-center z-[100] bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-6 lg:pt-12 pb-4 lg:pb-10">
                     <div className="flex items-center justify-between w-full px-3 lg:px-20 mb-2 lg:mb-4 pointer-events-none">
                        <button 
                          onClick={handleLeaveGame}
                          className="bg-red-500/20 border border-red-500/40 px-3 lg:px-8 py-1 lg:py-3 rounded-full text-[6px] lg:text-xs font-black text-red-500 hover:bg-red-500 hover:text-white transition-all tracking-tighter lg:tracking-widest uppercase pointer-events-auto"
                        >
                          LEAVE GAME
                        </button>
                        <div className={`px-4 lg:px-16 py-1 lg:py-4 rounded-full text-[8px] lg:text-lg font-black italic tracking-[0.1em] lg:tracking-[0.4em] transition-all border lg:border-2 pointer-events-auto ${gameState.currentPlayerIndex === 0 ? 'bg-emerald-600 text-white animate-pulse border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-white/5 text-white/10 border-white/5'}`}>
                          {gameState.currentPlayerIndex === 0 ? 'YOUR TURN' : 'WAITING...'}
                        </div>
                        <div className="w-[40px] lg:w-[120px]"></div>
                     </div>
                     
                     {/* SORTED HAND: Colors first, then Action cards on right side */}
                     <div className="w-full overflow-x-auto custom-scrollbar flex justify-start lg:justify-center gap-1 lg:gap-4 px-2 lg:px-16 pb-2 lg:pb-4 mask-fade-edges min-h-[80px] lg:min-h-[160px]">
                        {sortedHand.map((c) => (
                          <div key={c.id} className="hover:z-[110] transition-all lg:hover:-translate-y-12 active:scale-90 scale-[0.55] lg:scale-[0.9] flex-shrink-0 origin-bottom">
                             <UnoCard card={c} size="md" onClick={() => playCard(c)} disabled={gameState.currentPlayerIndex !== 0} />
                          </div>
                        ))}
                     </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="flex-none z-[110] hidden lg:flex justify-between items-center p-8 bg-black/95 backdrop-blur-3xl border-t border-white/5 text-white/20">
        <div className="text-xs font-black tracking-[0.5em] uppercase">SOLUNO ROYALE // NETWORK: SOLANA MAINNET</div>
        <div className="flex gap-16 items-center">
          {solPrice && <span className="text-sm font-black text-emerald-400 italic tracking-widest uppercase">SOL: ${solPrice.toFixed(2)}</span>}
          <span className="text-sm font-black italic tracking-widest uppercase">RAKE: 10%</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
