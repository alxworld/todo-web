"use server";

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Explicit interface for expected task structure
interface ActiveTask {
  _id: string;
  text: string;
  isCompleted: boolean;
  category: string;
}

export async function processTaskCommand(userUtterance: string, activeTodoList: ActiveTask[]) {
  try {
    const systemPrompt = `
      You are an advanced text/voice processor for a mobile-first To-Do web app.
      Analyze the user input and compare it against the current tasks to determine if they want to add a new item, complete/toggle an existing item, or delete/remove an item.
      
      Current tasks in database:
      ${JSON.stringify(activeTodoList)}

      Available valid categories: "Personal", "Work", "Errands", "Fitness", "Urgent".

      Return a clean, strict JSON response object containing three explicit keys:
      1. "action": Value MUST be either "ADD", "TOGGLE", "DELETE", or "UNKNOWN".
      2. "data": 
         - For "ADD": Object containing {"text": "Clean Task string", "category": "MatchedCategory"}.
         - For "TOGGLE" or "DELETE": String containing the exact matching schema "_id" from the current tasks list.
      3. "feedback": A short, friendly confirmation statement (max 1 sentence) explaining the action.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: systemPrompt + "\n\nUser Input: " + userUtterance,
      config: {
        responseMimeType: "application/json",
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    return { success: true, payload: parsedData };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("AI Action Server Execution Error:", errorMessage);
    return { success: false, error: errorMessage };
  }
}