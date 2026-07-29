/**
 * Pure command parsing + webhook payload extraction for the WhatsApp bot.
 * No Convex imports — this module is unit-testable with plain Node.
 */

export const CATEGORIES = ["Personal", "Work", "Errands", "Fitness", "Urgent"] as const;
export type Category = (typeof CATEGORIES)[number];

export type ParsedCommand =
  | { kind: "link"; code: string }
  | { kind: "help" }
  | { kind: "list"; filter: "open" | "done" | "urgent" }
  | { kind: "digest" }
  | { kind: "add"; text: string; category: Category }
  | { kind: "done"; ref: string }
  | { kind: "edit"; ref: string; text: string }
  | { kind: "move"; ref: string; category: Category }
  | { kind: "delete"; ref: string }
  | { kind: "unlink" }
  | { kind: "unknown" };

const CATEGORY_LOOKUP: Record<string, Category> = {
  personal: "Personal",
  work: "Work",
  errands: "Errands",
  fitness: "Fitness",
  urgent: "Urgent",
};

/** Parse a deterministic bot command. Returns { kind: "unknown" } when nothing matches. */
export function parseCommand(raw: string): ParsedCommand {
  const input = raw.trim().replace(/\s+/g, " ");
  if (!input) return { kind: "unknown" };

  let m: RegExpMatchArray | null;

  // link ABC123 (also accepts "start ABC123")
  if ((m = input.match(/^(?:link|start)\s+([A-Za-z0-9]{6})$/i))) {
    return { kind: "link", code: m[1].toUpperCase() };
  }

  // help / greetings
  if (/^(help|commands|\?|hi|hello|hey|start|menu)$/i.test(input)) {
    return { kind: "help" };
  }

  // lists
  if (/^(list\s+(done|completed|closed|complete)|done\s+list|completed|closed)$/i.test(input)) {
    return { kind: "list", filter: "done" };
  }
  if (/^(list\s+urgent|urgent|urgents)$/i.test(input)) {
    return { kind: "list", filter: "urgent" };
  }
  if (/^(list|ls|tasks|todos?|open|pending)$/i.test(input)) {
    return { kind: "list", filter: "open" };
  }

  // daily digest
  if (/^(today|digest|summary|agenda)$/i.test(input)) {
    return { kind: "digest" };
  }

  // add <text> [in <category>] / add <text> <category>
  if ((m = input.match(/^add\s+(.+)$/i))) {
    let text = m[1].trim();
    let category: Category = "Personal";
    const catMatch = text.match(/^(.*?)\s+(?:in\s+)?(personal|work|errands|fitness|urgent)$/i);
    if (catMatch && catMatch[1].trim().length > 0) {
      text = catMatch[1].trim();
      category = CATEGORY_LOOKUP[catMatch[2].toLowerCase()];
    }
    return { kind: "add", text, category };
  }

  // edit/update N <new text>
  if ((m = input.match(/^(?:edit|update|rename|change)\s+(\S+)\s+(.+)$/i))) {
    return { kind: "edit", ref: m[1], text: m[2].trim() };
  }

  // move N <category>
  if ((m = input.match(/^(?:move|mv)\s+(\S+)\s+(personal|work|errands|fitness|urgent)$/i))) {
    return { kind: "move", ref: m[1], category: CATEGORY_LOOKUP[m[2].toLowerCase()] };
  }

  // done/complete/close <ref>
  if ((m = input.match(/^(?:done|complete|close|check|finish|tick)\s+(.+)$/i))) {
    return { kind: "done", ref: m[1].trim() };
  }

  // delete/remove <ref>
  if ((m = input.match(/^(?:delete|remove|del|trash)\s+(.+)$/i))) {
    return { kind: "delete", ref: m[1].trim() };
  }

  // unlink
  if (/^(unlink|disconnect|logout)$/i.test(input)) {
    return { kind: "unlink" };
  }

  return { kind: "unknown" };
}

/** One inbound WhatsApp text message, narrowed from the webhook payload. */
export interface InboundText {
  from: string;
  body: string;
  phoneNumberId: string;
}

interface WhatsappMessage {
  from?: unknown;
  type?: unknown;
  text?: { body?: unknown };
}

interface WhatsappChangeValue {
  metadata?: { phone_number_id?: unknown };
  messages?: WhatsappMessage[];
}

interface WhatsappChange {
  field?: unknown;
  value?: WhatsappChangeValue;
}

interface WhatsappEntry {
  changes?: WhatsappChange[];
}

interface WhatsappPayload {
  object?: unknown;
  entry?: WhatsappEntry[];
}

/** Extract text messages from a Meta webhook payload. Ignores statuses & non-text types. */
export function extractInboundTexts(payload: unknown): InboundText[] {
  const out: InboundText[] = [];
  if (typeof payload !== "object" || payload === null) return out;
  const p = payload as WhatsappPayload;
  if (p.object !== "whatsapp_business_account" || !Array.isArray(p.entry)) return out;

  for (const entry of p.entry) {
    if (!Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes) {
      if (change?.field !== "messages") continue;
      const value = change.value;
      if (!value || !Array.isArray(value.messages)) continue;
      const phoneNumberId =
        typeof value.metadata?.phone_number_id === "string" ? value.metadata.phone_number_id : "";
      for (const msg of value.messages) {
        if (msg?.type !== "text" || typeof msg.from !== "string") continue;
        const body = msg.text?.body;
        if (typeof body !== "string" || body.trim() === "") continue;
        out.push({ from: msg.from, body, phoneNumberId });
      }
    }
  }
  return out;
}

/** Format a task list for WhatsApp (*bold*, `code`, emoji). */
export function formatTaskList(
  title: string,
  tasks: Array<{ text: string; category: string; dueAt?: number | null }>
): string {
  if (tasks.length === 0) return `${title}\n(nothing here — enjoy the calm ✨)`;
  const lines = tasks.map((t, i) => {
    const due = t.dueAt ? ` ⏰ ${new Date(t.dueAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "";
    return `${i + 1}. ${t.text} \`${t.category}\`${due}`;
  });
  return `*${title}* (${tasks.length})\n${lines.join("\n")}`;
}
