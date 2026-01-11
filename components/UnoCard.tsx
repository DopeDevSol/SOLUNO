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
      default: return '#000000'; // Black for Wilds
    }
  };

  // Sizes reduced by ~15-20% for mobile compared to previous version
  const dimensions = {
    sm: 'w-6 h-9 lg:w-18 lg:h-28',
    md: 'w-12 h-18 sm:w-16 sm:h-24 lg:w-48 lg:h-72', 
    lg: 'w-16 h-24 sm:w-24 sm:h-36 lg:w-64 lg:h-[24rem]'
  };

  const getEffectClass = () => {
    if (!isSpecialEffect) return '';
    if (card.value === 'draw4') return 'animate-draw4-impact z-[100]';
    if (card.value === 'skip') return 'animate-skip-impact';
    if (card.value === 'reverse') return 'animate-reverse-impact';
    if (card.value === 'draw2') return 'animate-draw4-impact'; 
    return 'animate-skip-impact'; 
  };

  const baseClasses = `
    ${dimensions[size]} border-[1.5px] lg:border-[12px] border-white rounded-md lg:rounded-[4rem] flex flex-col items-center justify-between 
    shadow-[0_5px_15px_rgba(0,0,0,0.5)] lg:shadow-[0_10px_30px_rgba(0,0,0,0.5)] relative transition-all flex-shrink-0 overflow-hidden select-none
    ${disabled ? 'opacity-60 grayscale-[10%]' : 'cursor-pointer hover:brightness-110 active:scale-95 lg:hover:-translate-y-8'}
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
        className={`${baseClasses} bg-black border-white justify-center p-0`}
        style={{ transform: isVertical ? 'none' : 'rotate(90deg)' }}
      >
        <div className="absolute w-[160%] h-[65%] bg-[#ed1c24] rounded-[100%] rotate-[-25deg] flex items-center justify-center border-[1.5px] lg:border-[12px] border-white shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-none">
          <span className="font-bungee text-[#ffcc00] italic tracking-tighter font-black text-[8px] lg:text-[10rem] drop-shadow-[1px_1px_0px_rgba(0,0,0,1)] lg:drop-shadow-[6px_6px_0px_rgba(0,0,0,1)]">UNO</span>
        </div>
      </button>
    );
  }

  const renderCenterIcon = () => {
    const color = getBgColor(card.color);
    const isNumber = (card.value >= '0' && card.value <= '9');
    const centerTextColor = isNumber ? '#000000' : color;
    
    switch (card.value) {
      case 'draw4':
        return (
          <div className="flex items-center justify-center gap-0.25 scale-[0.6] lg:scale-[2.2]">
            <div className="w-2.5 h-4 lg:w-16 lg:h-24 bg-[#39b54a] border border-white rounded-sm -rotate-12 shadow-sm"></div>
            <div className="w-2.5 h-4 lg:w-16 lg:h-24 bg-[#0054a6] border border-white rounded-sm -rotate-6 -ml-1.5 lg:-ml-4 shadow-sm"></div>
            <div className="w-2.5 h-4 lg:w-16 lg:h-24 bg-[#ed1c24] border border-white rounded-sm rotate-6 -ml-1.5 lg:-ml-4 shadow-sm"></div>
            <div className="w-2.5 h-4 lg:w-16 lg:h-24 bg-[#fcee21] border border-white rounded-sm rotate-12 -ml-1.5 lg:-ml-4 shadow-sm"></div>
          </div>
        );
      case 'wild':
        return (
          <div className="w-8 h-8 lg:w-56 lg:h-56 rounded-full overflow-hidden flex flex-wrap border-[2px] lg:border-[10px] border-white rotate-12">
            <div className="w-1/2 h-1/2 bg-[#fcee21]"></div>
            <div className="w-1/2 h-1/2 bg-[#39b54a]"></div>
            <div className="w-1/2 h-1/2 bg-[#0054a6]"></div>
            <div className="w-1/2 h-1/2 bg-[#ed1c24]"></div>
          </div>
        );
      case 'draw2':
        return (
          <div className="flex items-center justify-center gap-0.5 scale-[0.6] lg:scale-[2.8]">
            <div className="w-3 h-5 lg:w-16 lg:h-28 rounded-sm border border-white -rotate-12" style={{ backgroundColor: color }}></div>
            <div className="w-3 h-5 lg:w-16 lg:h-28 rounded-sm border border-white rotate-12 -ml-2 lg:-ml-6" style={{ backgroundColor: color }}></div>
          </div>
        );
      case 'skip':
        return <span className="font-bungee font-black text-3xl lg:text-[18rem] leading-none drop-shadow-md lg:drop-shadow-lg" style={{ color }}>⊘</span>;
      case 'reverse':
        return (
          <div className="flex flex-col items-center justify-center scale-[0.8] lg:scale-[3]">
            <span className="font-bungee font-black text-2xl lg:text-[14rem] leading-none drop-shadow-md lg:drop-shadow-lg" style={{ color }}>⇄</span>
          </div>
        );
      default:
        return (
          <span className="font-bungee text-[2.5rem] lg:text-[24rem] font-black leading-none drop-shadow-md lg:drop-shadow-lg" style={{ color: centerTextColor }}>
            {card.value}
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
      <div className="absolute inset-0 pointer-events-none opacity-20" style={{
        backgroundImage: 'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.8) 0deg 20deg, transparent 20deg 40deg)'
      }}></div>

      <div className="absolute top-0.5 left-0.5 lg:top-6 lg:left-8 font-bungee font-black text-black text-[10px] lg:text-[5rem] drop-shadow-[0_0_1px_rgba(255,255,255,1)] lg:drop-shadow-[0_0_3px_rgba(255,255,255,1)] z-20">
        {symbol}
      </div>

      <div className="absolute inset-1.5 lg:inset-12 bg-white rounded-[100%] rotate-[-25deg] shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)] lg:shadow-[inset_0_15px_40px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden border lg:border-[10px] border-white/90">
        <div className="rotate-[25deg] w-full h-full flex items-center justify-center">
          {renderCenterIcon()}
        </div>
      </div>

      <div className="absolute bottom-0.5 right-0.5 lg:bottom-6 lg:right-8 font-bungee font-black text-black text-[10px] lg:text-[5rem] drop-shadow-[0_0_1px_rgba(255,255,255,1)] lg:drop-shadow-[0_0_3px_rgba(255,255,255,1)] rotate-180 z-20">
        {symbol}
      </div>
    </button>
  );
};

export default UnoCard;