
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const FALLBACK_HYPE = [
  "The table is heating up! Who's holding the Wild?",
  "Big SOL on the line, stay sharp.",
  "That move was calculated. Or was it?",
  "The dealer is watching... play your cards right.",
  "High stakes, high pressure. Don't blink.",
  "Solana speed, Solana stakes. Let's go!",
  "Is that a bluff or a winning hand?",
  "The pot is growing. Tension is peaking!",
  "SOLUNO: Where legends are minted.",
  "Don't let the bots outplay you!"
];

export const getGameCommentary = async (gameStateSummary: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a hype-man and strategic commentator for a high-stakes Solana card tournament called SOLUNO. 
      Analyze this game state and provide a short, punchy, witty comment (max 15 words). 
      If there's nothing special, be encouraging.
      STATE: ${gameStateSummary}`,
    });
    return response.text?.trim() || FALLBACK_HYPE[Math.floor(Math.random() * FALLBACK_HYPE.length)];
  } catch (error) {
    // Gracefully handle 429 (Quota) and other errors with local fallback
    console.warn("Gemini Quota/Error - Using fallback hype.");
    return FALLBACK_HYPE[Math.floor(Math.random() * FALLBACK_HYPE.length)];
  }
};

export const askUnoAssistant = async (query: string, stateSummary: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are the Official SOLUNO Referee. 
      Help the player. (Max 30 words)
      STATE: ${stateSummary}
      Q: ${query}`,
    });
    return response.text || "Stick to the strategy, focus on the colors.";
  } catch (error) {
    return "The referee is checking the replay. Keep playing!";
  }
};
