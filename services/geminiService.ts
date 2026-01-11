
import { GoogleGenAI } from "@google/genai";

// Always use the process.env.API_KEY directly for initialization as per guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getGameCommentary = async (gameStateSummary: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a hype-man and strategic commentator for a high-stakes Solana card tournament called SOLUNO Royale. 
      Analyze this game state and provide a short, punchy, witty comment (max 20 words): ${gameStateSummary}`,
    });
    return response.text || "The tension is rising at the SOLUNO table!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Next move is critical!";
  }
};

export const askUnoAssistant = async (query: string, stateSummary: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are the Official SOLUNO Royale Referee and Strategy Assistant. 
      A player is asking a question during a high-stakes Solana game.
      CURRENT GAME STATE: ${stateSummary}
      PLAYER QUESTION: ${query}
      Provide a helpful, concise answer based on official rules and the current game state. (Max 50 words)`,
    });
    return response.text || "I'm not sure, but keep playing!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The referee is currently busy, try again in a moment!";
  }
};
