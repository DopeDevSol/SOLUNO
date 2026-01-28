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

  const dimensions = {
    sm: 'w-6 h-9 lg:w-10 lg:h-14',
    md: 'w-14 h-20 lg:w-24 lg:h-36', 
    lg: 'w-24 h-36 lg:w-36 lg:h-52'
  };

  const getEffectClass = () => {
    if (!isSpecialEffect) return '';
    if (card.value === 'draw4') return 'animate-draw4-impact z-[100]';
    return 'scale-110 brightness-125 z-50 transition-all duration-300 shadow-[0_0_30px_#fff]'; 
  };

  const baseClasses = `
    ${dimensions[size]} border-[2px] lg:border-[5px] border-white rounded-md lg:rounded-[1.5rem] flex flex-col items-center justify-between 
    shadow-[0_8px_16px_rgba(0,0,0,0.6)] relative transition-all flex-shrink-0 overflow-hidden select-none
    ${disabled ? 'opacity-50 grayscale-[20%]' : 'cursor-pointer hover:-translate-y-1 hover:brightness-110 active:scale-95'}
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
        className={`${baseClasses} bg-black border-white/20 p-0`}
      >
        <div className="absolute inset-1 lg:inset-2 border border-[#14F195]/30 rounded-sm lg:rounded-xl"></div>
        <div className="absolute w-[160%] h-[70%] bg-gradient-to-br from-[#9945FF] via-[#000] to-[#14F195] rounded-[100%] rotate-[-28deg] flex items-center justify-center border lg:border-[8px] border-white shadow-[0_10px_30px_rgba(0,0,0,0.8)] overflow-hidden">
          <div className="rotate-[28deg] flex flex-col items-center">
            <span className="font-bungee text-white italic tracking-tighter font-black text-[10px] lg:text-[2.2rem] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">SOLUNO</span>
            <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-white/40 to-transparent mt-1"></div>
          </div>
        </div>
        <div className="absolute inset-0 bg-black opacity-10 pointer-events-none"></div>
      </button>
    );
  }

  const renderCenterIcon = () => {
    switch (card.value) {
      case 'draw4':
        return (
          <div className="flex items-center justify-center gap-0.1 scale-[0.6] lg:scale-[1.25]">
            <div className="w-4 h-6 lg:w-9 lg:h-14 bg-[#39b54a] border border-white rounded-sm -rotate-15 shadow-xl"></div>
            <div className="w-4 h-6 lg:w-9 lg:h-14 bg-[#0054a6] border border-white rounded-sm -rotate-6 -ml-4 shadow-xl"></div>
            <div className="w-4 h-6 lg:w-9 lg:h-14 bg-[#ed1c24] border border-white rounded-sm rotate-6 -ml-4 shadow-xl"></div>
            <div className="w-4 h-6 lg:w-9 lg:h-14 bg-[#fcee21] border border-white rounded-sm rotate-15 -ml-4 shadow-xl"></div>
          </div>
        );
      case 'wild':
        return (
          <div className="w-10 h-10 lg:w-24 lg:h-24 rounded-full overflow-hidden flex flex-wrap border-[3px] lg:border-[8px] border-white rotate-[30deg] shadow-2xl">
            <div className="w-1/2 h-1/2 bg-[#fcee21]"></div>
            <div className="w-1/2 h-1/2 bg-[#39b54a]"></div>
            <div className="w-1/2 h-1/2 bg-[#0054a6]"></div>
            <div className="w-1/2 h-1/2 bg-[#ed1c24]"></div>
          </div>
        );
      default:
        return (
          <span className="font-bungee text-[2.5rem] lg:text-[7rem] font-black leading-none text-black drop-shadow-[0_2px_2px_rgba(255,255,255,0.4)]">
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
      <div className="absolute top-1 left-1 lg:top-2 lg:left-2 font-bungee font-black text-black text-[10px] lg:text-2xl z-20">
        {symbol}
      </div>

      <div className="absolute inset-2 lg:inset-5 bg-white rounded-[100%] rotate-[-25deg] flex items-center justify-center border border-white/90 overflow-hidden shadow-[inset_0_4px_8px_rgba(0,0,0,0.4)]">
        <div className="rotate-[25deg] w-full h-full flex items-center justify-center">
          {renderCenterIcon()}
        </div>
      </div>

      <div className="absolute bottom-1 right-1 lg:bottom-2 lg:right-2 font-bungee font-black text-black text-[10px] lg:text-2xl rotate-180 z-20">
        {symbol}
      </div>
    </button>
  );
};

export default UnoCard;