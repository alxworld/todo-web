/**
 * Gemini natural-language parsing for WhatsApp messages.
 * Plain helper (not a registered Convex function) — called directly from
 * internal actions in whatsapp.ts. Uses the REST API via fetch (available in
 * the default Convex runtime, no Node needed).
 */

export interface GeminiTaskRef {
  _id: string;
  text: string;
  category: string;
  dueAt?: number;
}

export interface GeminiParseResult {
  action: "ADD" | "TOGGLE" | "DELETE" | "LIST" | "LIST_DONE" | "LIST_URGENT" | "DIGEST" | "UNKNOWN";
  text?: string;
  category?: string;
  taskRef?: string;
  dueAt?: number;
}

export async function parseWithGemini(
  userText: string,
  openTasks: GeminiTaskRef[]
): Promise<GeminiParseResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are a command parser for a WhatsApp to-do bot. Current open tasks:
${JSON.stringify(openTasks)}

Valid categories: "Personal", "Work", "Errands", "Fitness", "Urgent".
Current time (epoch ms): ${Date.now()}.

Analyze the user message and return a strict JSON object with keys:
- "action": one of "ADD" (new task), "TOGGLE" (complete/close existing), "DELETE" (remove),
  "LIST" (show open tasks), "LIST_DONE" (show completed), "LIST_URGENT" (show urgent),
  "DIGEST" (daily summary), "UNKNOWN".
- "text": for ADD — the clean task text.
- "category": for ADD — best matching category (default "Personal").
- "taskRef": for TOGGLE/DELETE — the exact "_id" of the best matching task from the list above.
- "dueAt": for ADD with a date/time mentioned — due time as epoch milliseconds.

Reply with JSON only, no prose.

User message: ${userText}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) {
      console.error(`[gemini] API error ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (typeof parsed?.action !== "string") return null;
    return parsed as GeminiParseResult;
  } catch (err) {
    console.error("[gemini] parse failed:", err);
    return null;
  }
}
