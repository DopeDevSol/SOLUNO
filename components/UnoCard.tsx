import React from 'react';
import { Card, CardColor } from '../types';

interface UnoCardProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  isBack?: boolean;
  size?: 'sm' | 'md' | 'lg';
  isVertical?: boolean;
  isSpecialEffect?: boolean;
}

const UnoCard: React.FC<UnoCardProps> = ({ card, onClick, disabled, isBack, size = 'md', isVertical = true, isSpecialEffect }) => {
  const getBgColor = (color: CardColor) => {
    switch (color) {
      case 'red': return '#ed1c24';
      case 'blue': return '#0054a6';
      case 'green': return '#39b54a';
      case 'yellow': return '#fcee21';
      default: return '#111111'; 
    }
  };

  // Optimized dimensions for 10-player visibility
  const dimensions = {
    sm: 'w-6 h-9 lg:w-10 lg:h-14',
    md: 'w-14 h-20 lg:w-24 lg:h-36', 
    lg: 'w-20 h-28 lg:w-32 lg:h-44'
  };

  const getEffectClass = () => {
    if (!isSpecialEffect) return '';
    if (card.value === 'draw4') return 'animate-draw4-impact z-[100]';
    return 'scale-125 brightness-125 z-50 transition-all duration-300'; 
  };

  const baseClasses = `
    ${dimensions[size]} border-[1.5px] lg:border-[4px] border-white rounded-md lg:rounded-[1.2rem] flex flex-col items-center justify-between 
    shadow-[0_4px_12px_rgba(0,0,0,0.8)] relative transition-all flex-shrink-0 overflow-hidden select-none
    ${disabled ? 'opacity-40 grayscale-[10%]' : 'cursor-pointer hover:brightness-110 active:scale-90 hover:shadow-[0_0_20px_rgba(20,241,149,0.3)]'}
    ${getEffectClass()}
  `;

  const getSymbolText = () => {
    switch (card.value) {
      case 'draw4': return '+4';
      case 'draw2': return '+2';
      case 'skip': return '⊘';
      case 'reverse': return '⇄';
      case 'wild': return 'W';
      default: return card.value;
    }
  };

  const symbol = getSymbolText();

  if (isBack) {
    return (
      <button 
        onClick={onClick}
        disabled={disabled}
        className={`${baseClasses} bg-[#0a0a0a] border-[#9945FF] justify-center p-0`}
      >
        <div className="absolute inset-0.5 border border-[#14F195]/20 rounded-sm"></div>
        <div className="absolute w-[180%] h-[75%] bg-gradient-to-br from-[#9945FF] to-[#14F195] rounded-[100%] rotate-[-25deg] flex items-center justify-center border lg:border-[6px] border-white shadow-xl">
          <span className="font-bungee text-white italic tracking-tighter font-black text-[8px] lg:text-[3rem] drop-shadow-md">SOLUNO</span>
        </div>
      </button>
    );
  }

  const renderCenterIcon = () => {
    switch (card.value) {
      case 'draw4':
        return (
          <div className="flex items-center justify-center gap-0.1 scale-[0.6] lg:scale-[1.1]">
            <div className="w-4 h-6 lg:w-8 lg:h-12 bg-[#39b54a] border border-white/60 rounded-sm -rotate-12 shadow-lg"></div>
            <div className="w-4 h-6 lg:w-8 lg:h-12 bg-[#0054a6] border border-white/60 rounded-sm -rotate-6 -ml-3 shadow-lg"></div>
            <div className="w-4 h-6 lg:w-8 lg:h-12 bg-[#ed1c24] border border-white/60 rounded-sm rotate-6 -ml-3 shadow-lg"></div>
            <div className="w-4 h-6 lg:w-8 lg:h-12 bg-[#fcee21] border border-white/60 rounded-sm rotate-12 -ml-3 shadow-lg"></div>
          </div>
        );
      case 'wild':
        return (
          <div className="w-9 h-9 lg:w-20 lg:h-20 rounded-full overflow-hidden flex flex-wrap border-[2px] lg:border-[6px] border-white rotate-12 shadow-inner">
            <div className="w-1/2 h-1/2 bg-[#fcee21]"></div>
            <div className="w-1/2 h-1/2 bg-[#39b54a]"></div>
            <div className="w-1/2 h-1/2 bg-[#0054a6]"></div>
            <div className="w-1/2 h-1/2 bg-[#ed1c24]"></div>
          </div>
        );
      default:
        return (
          <span className="font-bungee text-[1.8rem] lg:text-[5rem] font-black leading-none drop-shadow-md text-black">
            {symbol}
          </span>
        );
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={baseClasses}
      style={{ backgroundColor: getBgColor(card.color) }}
    >
      <div className="absolute top-0.5 left-0.5 lg:top-1 lg:left-1 font-bungee font-black text-black text-[9px] lg:text-xl z-20">
        {symbol}
      </div>

      <div className="absolute inset-2 lg:inset-4 bg-white rounded-[100%] rotate-[-25deg] flex items-center justify-center border border-white/90 overflow-hidden shadow-[inset_0_2px_6px_rgba(0,0,0,0.3)]">
        <div className="rotate-[25deg] w-full h-full flex items-center justify-center">
          {renderCenterIcon()}
        </div>
      </div>

      <div className="absolute bottom-0.5 right-0.5 lg:bottom-1 lg:right-1 font-bungee font-black text-black text-[9px] lg:text-xl rotate-180 z-20">
        {symbol}
      </div>
    </button>
  );
};

export default UnoCard;