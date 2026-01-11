
# $UNO Royale: Deployment & Setup Guide

## 1. Development Environment
- Install **Node.js** (v18+) and **Git**.
- Install **Solana CLI**: `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`.
- Install **Anchor Framework**: `cargo install --git https://github.com/coral-xyz/anchor avm --locked && avm install latest`.

## 2. Launching $UNO on Pump.fun
1. Go to [pump.fun](https://pump.fun).
2. Connect your Solana wallet.
3. Click "Create a coin".
4. Name: **Uno Royale**, Symbol: **$UNO**, Description: **The first multiplayer high-stakes Uno game on Solana.**
5. Once launched, copy the **Mint Address**.
6. Update the `UNO_TOKEN_MINT` in `constants.ts`.

## 3. Smart Contract Deployment (Devnet)
1. Navigate to your contract folder.
2. Run `anchor build`.
3. Run `anchor deploy --provider.cluster devnet`.
4. Update the `declare_id!` in `uno_game.rs` and `anchor.json` with the generated program ID.

## 4. Frontend Deployment
1. Build the React app: `npm run build`.
2. Deploy the `dist` folder to **Vercel** or **Netlify**.
3. Set your **Gemini API Key** in the deployment environment variables as `API_KEY`.

## 5. Testing Instructions
1. **Connect Wallet**: Ensure you can connect using Phantom on Devnet.
2. **Token Verification**: Verify that the "Join Pool" button is only enabled if you mock or hold the required $UNO balance.
3. **Gameplay**: Test the card-matching logic (color to color, value to value, or Wilds).
4. **AI Commentary**: Watch the header bubble for strategic insults and praise powered by Gemini.
5. **Multiplayer**: Open the app in two tabs (mocking two players) or wait for the backend integration to sync turns.

## Marketing Tips
- Run a "Leaderboard Sprint": The player with the most wins in 24 hours wins 500,000 $UNO.
- Host "Creator Matches": Have popular Solana influencers play in the 1 SOL pool live on X (Twitter).
