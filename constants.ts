import { Pool } from './types';

export const POOLS: Pool[] = [
  { id: 1, entryFee: 0.05, minUno: 1000 },
  { id: 2, entryFee: 0.1, minUno: 1000 },
  { id: 3, entryFee: 0.25, minUno: 5000 },
  { id: 4, entryFee: 0.5, minUno: 10000 },
  { id: 5, entryFee: 1.0, minUno: 25000 },
];

export const UNO_TOKEN_MINT = "UNO_TOKEN_MINT_ADDRESS_HERE";
export const HOUSE_FEE_PERCENT = 0.10; // Updated from 5% to 10%

export const COLORS: Record<string, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  wild: 'bg-zinc-800'
};