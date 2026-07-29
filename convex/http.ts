import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

// ── WhatsApp Cloud API webhook ────────────────────────────────────────────────

// Meta verification handshake (one-time, when you save the webhook in the app dashboard).
http.route({
  path: "/whatsapp/webhook",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && challenge && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }),
});

// Incoming messages. Verify the HMAC signature, schedule processing, return 200 fast.
http.route({
  path: "/whatsapp/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const rawText = await req.text();

    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret) {
      const ok = await verifySignature(appSecret, req.headers.get("x-hub-signature-256"), rawText);
      if (!ok) return new Response("Invalid signature", { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    // Process asynchronously so Meta always gets a fast 200 (no retries/timeouts).
    await ctx.scheduler.runAfter(0, internal.whatsapp.processInbound, { payload });
    return new Response("OK", { status: 200 });
  }),
});

async function verifySignature(
  secret: string,
  header: string | null,
  rawText: string
): Promise<boolean> {
  try {
    if (!header) return false;
    const [algo, hex] = header.split("=");
    if (algo !== "sha256" || !hex) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    // JSON payloads are valid UTF-8, so decode→re-encode is byte-identical.
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawText));
    const computed = Array.from(new Uint8Array(signature), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    return computed === hex.toLowerCase();
  } catch (err) {
    console.error("[whatsapp] signature verification error:", err);
    return false;
  }
}

export default http;
