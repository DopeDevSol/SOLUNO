import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { POOLS, HOUSE_FEE_PERCENT } from './constants';
import { Card, GameState, Player, Pool, CardColor } from './types';
import UnoCard from './components/UnoCard';
import { getGameCommentary } from './services/geminiService';

const MAX_TURN_TIME = 15;
const COMMENTARY_COOLDOWN = 20000; 

const App: React.FC = () => {
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [view, setView] = useState<'lobby' | 'game' | 'leaderboard'>('lobby');
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

  useEffect(() => {
    if (gameState.status === 'playing' && !gameState.isGameOver) {
      const topCard = gameState.discardPile[gameState.discardPile.length - 1];
      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      const isCriticalMoment = currentPlayer.isLocal || topCard.value === 'draw4' || topCard.value === 'wild' || currentPlayer.hand.length <= 2;
      const now = Date.now();
      const onCooldown = now - lastCommentaryTimeRef.current < COMMENTARY_COOLDOWN;
      if (isCriticalMoment && !onCooldown) {
        lastCommentaryTimeRef.current = now;
        getGameCommentary(`${currentPlayer?.name} played ${topCard?.color} ${topCard?.value}.`).then(setCommentary);
      }
    }
  }, [gameState.currentPlayerIndex, gameState.status, gameState.isGameOver, gameState.discardPile]);

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
    <div className="h-[100dvh] flex flex-col felt-table overflow-hidden">
      <nav className="flex-none px-4 py-2 flex justify-between items-center bg-black/80 backdrop-blur-3xl z-[150] border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-gradient-to-br from-[#9945FF] to-[#14F195] rounded flex items-center justify-center text-white font-black text-[10px]">S</div>
          <h1 className="text-[10px] font-black italic text-white/80 tracking-tighter">SOLUNO ROYALE</h1>
        </div>
        <div className="flex gap-4 items-center">
          <span className="text-[9px] font-black text-[#14F195] italic">SOL: ${solPrice?.toFixed(2)}</span>
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

      <main className="flex-1 relative overflow-hidden">
        {view === 'lobby' && (
          <div className="h-full flex flex-col items-center justify-center gap-6 p-4">
             <div className="text-center">
                <div className="inline-block px-3 py-0.5 bg-[#9945FF]/20 border border-[#9945FF]/40 rounded-full text-[7px] text-[#9945FF] font-black tracking-[0.5em] mb-4">SEEKER EXCLUSIVE MATCHMAKING</div>
                <h2 className="text-5xl lg:text-8xl font-black italic tracking-tighter text-white drop-shadow-2xl">SOLUNO Royale</h2>
                <p className="text-[#14F195] text-[10px] font-black tracking-[0.8em] mt-3 uppercase">Decentralized High Stakes</p>
             </div>
             
             {!walletConnected ? (
                <div className="mt-8 text-center bg-black/40 p-8 rounded-[3rem] border border-white/5 backdrop-blur-xl">
                   <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-6">Authorize via Seed Vault to play</p>
                   <button onClick={() => setWalletConnected(true)} className="bg-white text-black px-12 py-4 rounded-2xl font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)]">LINK SEEKER WALLET</button>
                </div>
             ) : (
               <div className="grid grid-cols-5 gap-4 max-w-5xl w-full px-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {POOLS.map(p => (
                  <button key={p.id} onClick={() => enterPool(p)} className="bg-black/90 border border-white/10 p-6 rounded-[2rem] flex flex-col items-center hover:border-[#14F195] hover:scale-105 transition-all group active:scale-95 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-8 h-8 bg-[#14F195]/10 rounded-bl-3xl flex items-center justify-center">
                       <span className="text-[7px] font-black text-[#14F195] italic">LIVE</span>
                    </div>
                    <span className="text-4xl font-black text-[#14F195] italic leading-none">{p.entryFee}</span>
                    <span className="text-[8px] text-white/40 mt-2 uppercase tracking-widest font-bold">SOL BUY-IN</span>
                  </button>
                ))}
              </div>
             )}
          </div>
        )}

        {view === 'game' && (
          <div className="w-full h-full relative">
            <div className={`direction-ring ${gameState.direction === 1 ? 'spin-cw' : 'spin-ccw'}`} />
            <div className="table-watermark-center"><div className="watermark-text">SOLUNO</div><div className="watermark-text mt-2" style={{ fontSize: '1.5vh' }}>TABLE PRO #8831</div></div>
            <div className="absolute top-[5%] right-[2%] z-[60]"><div className="bg-black/95 backdrop-blur-2xl border border-white/10 px-4 py-2 rounded-xl max-w-[200px] shadow-2xl"><p className="text-[10px] font-bold text-[#14F195] leading-tight italic">"{commentary}"</p></div></div>
            <div className="absolute inset-0 z-10">{gameState.players.map((p, i) => <PlayerSlot key={p.id} player={p} index={i} active={gameState.currentPlayerIndex === i} />)}</div>
            <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-16 lg:gap-32 z-30 scale-[0.7] lg:scale-100">
               <div className="flex flex-col items-center gap-3 group" onClick={drawFromDeck}>
                  <div className="relative">
                     <div className="absolute stack-2"><UnoCard card={{} as any} isBack size="lg" disabled /></div>
                     <div className="absolute stack-1"><UnoCard card={{} as any} isBack size="lg" disabled /></div>
                     <div className="relative transform group-active:translate-y-1 transition-transform"><UnoCard card={{} as any} isBack size="lg" disabled={gameState.currentPlayerIndex !== 0} /></div>
                  </div>
                  <span className="text-[9px] font-black text-white/30 tracking-[0.4em]">DECK</span>
               </div>
               <div className="flex flex-col items-center gap-3">
                  <div className="relative w-24 h-36 flex items-center justify-center">
                    <svg className="absolute w-[140%] h-[140%] rotate-[-90deg] pointer-events-none opacity-40"><circle cx="50%" cy="50%" r="48%" stroke={turnTimeLeft < 5 ? '#ef4444' : '#14F195'} strokeWidth="4" fill="transparent" strokeDasharray="300" strokeDashoffset={300 - (300 * (turnTimeLeft / MAX_TURN_TIME))} className="transition-all duration-1000" /></svg>
                    {gameState.discardPile.length > 1 && <div className="absolute opacity-20 rotate-[-12deg] translate-x-1 translate-y-1"><UnoCard card={gameState.discardPile[gameState.discardPile.length - 2]} size="lg" disabled /></div>}
                    {gameState.discardPile.slice(-1).map(c => <UnoCard key={c.id} card={c} size="lg" isSpecialEffect={c.id === activeSpecialId} />)}
                  </div>
                  <span className="text-[9px] font-black text-[#14F195] tracking-[0.4em]">PILE</span>
               </div>
            </div>
            <div className="absolute top-[12%] left-1/2 -translate-x-1/2 z-[40] bg-black/90 border border-[#14F195]/20 px-6 py-2 rounded-full shadow-2xl flex items-center gap-3"><div className="w-2 h-2 bg-[#14F195] rounded-full animate-pulse"></div><span className="text-xl font-black italic text-[#14F195] leading-none tracking-tighter">{winningPrize.toFixed(2)} SOL POT</span></div>
            {dealingCardTarget && <div className="dealing-card-anim" style={{ '--tx': `${dealingCardTarget.x}vw`, '--ty': `${dealingCardTarget.y}vh` } as any}><div className="w-8 h-12 bg-[#111] border border-white/20 rounded-md"></div></div>}
            <div className="absolute bottom-[-10px] w-full z-[200] flex flex-col items-center hand-tray-bg pt-4 pb-6 overflow-visible">
              <div className="flex justify-between items-center w-full px-12 mb-3 pointer-events-none">
                <button onClick={() => setView('lobby')} className="pointer-events-auto bg-white/5 border border-white/10 px-4 py-1.5 rounded-full text-[8px] font-black text-white/40 hover:bg-red-500/10 hover:text-red-500 transition-all uppercase tracking-widest">EXIT</button>
                <div className={`pointer-events-auto px-10 py-2 rounded-full text-[11px] font-black italic border-2 transition-all flex items-center gap-4 ${gameState.currentPlayerIndex === 0 ? 'bg-[#14F195] border-[#14F195] text-black shadow-[0_0_40px_rgba(20,241,149,0.3)]' : 'bg-black/80 border-white/10 text-white/30'}`}>
                  <span>{gameState.currentPlayerIndex === 0 ? "★ YOUR TURN ★" : `WAITING FOR ${gameState.players[gameState.currentPlayerIndex]?.name}...`}</span>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center border border-current font-bold ${turnTimeLeft < 5 ? 'animate-ping' : ''}`}>{turnTimeLeft}</span>
                </div>
                <div className="w-[60px]"></div>
              </div>
              <div className="relative pointer-events-auto w-full flex justify-center h-[110px] lg:h-[180px] overflow-visible">
                {sortedHand.map((c, idx) => {
                  const total = sortedHand.length;
                  const middle = (total - 1) / 2;
                  const offset = idx - middle;
                  const rotation = offset * (total > 10 ? 3.5 : 5);
                  const xShift = offset * (total > 10 ? 22 : 32);
                  const yShift = Math.abs(offset) * 1.5;
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
        <div className="fixed inset-0 z-[300] bg-black/98 backdrop-blur-3xl flex flex-col items-center justify-center text-center p-8 animate-in zoom-in duration-500">
           <div className="text-8xl mb-8 drop-shadow-[0_0_40px_#14F195]">🏆</div>
           <h3 className="text-6xl lg:text-9xl font-black italic tracking-tighter text-white mb-4">{gameState.winner === 'YOU' ? 'TABLE MASTER!' : `${gameState.winner} WON`}</h3>
           <p className="text-[#14F195] font-black text-4xl mb-12 tracking-tight">TOTAL POT: {winningPrize.toFixed(2)} SOL</p>
           <button onClick={() => setView('lobby')} className="bg-white text-black px-24 py-5 rounded-2xl font-black text-lg uppercase shadow-[0_0_60px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95 transition-all">RE-ENTRY</button>
        </div>
      )}
    </div>
  );
};

export default App;