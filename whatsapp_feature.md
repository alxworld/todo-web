# WhatsApp Integration — Surf ToDo

Manage your tasks from WhatsApp: **add, close, edit, move, delete and list tasks**
(including completed and urgent lists), plus **task reminders** — all at **zero cost**.

This document is the complete from-zero guide. You currently have: **a SIM card only**.
Everything else is covered step by step.

> **Status of the code: ✅ ALREADY BUILT AND DEPLOYED.** The backend webhook, command
> parser, Gemini natural-language support, reminder cron, and the dashboard
> "Connect WhatsApp" panel are live on your Convex deployment. You only need to do
> the Meta/phone setup (Stages A–D) and wire the webhook (Stage F) — about 30 minutes.

---

## Table of contents

1. [Architecture & how it works](#1-architecture--how-it-works)
2. [The zero-cost model (verified)](#2-the-zero-cost-model-verified)
3. [Stage A — SIM ready for OTP](#3-stage-a--sim-ready-for-otp)
4. [Stage B — Meta developer account + app](#4-stage-b--meta-developer-account--app)
5. [Stage C — Self-serve onboarding: put your SIM number on the API](#5-stage-c--self-serve-onboarding-put-your-sim-number-on-the-api)
6. [Stage D — Credentials (token + app secret)](#6-stage-d--credentials-token--app-secret)
7. [Stage E — Backend environment variables](#7-stage-e--backend-environment-variables)
8. [Stage F — Wire the webhook in Meta](#8-stage-f--wire-the-webhook-in-meta)
9. [Stage G — Link your WhatsApp & test](#9-stage-g--link-your-whatsapp--test)
10. [Command reference](#10-command-reference)
11. [Task reminders (Phase 3)](#11-task-reminders-phase-3)
12. [Security](#12-security)
13. [Testing appendix (simulated webhooks)](#13-testing-appendix-simulated-webhooks)
14. [Troubleshooting](#14-troubleshooting)
15. [Free-tier limits](#15-free-tier-limits)

---

## 1. Architecture & how it works

```
Your WhatsApp ──msg──▶ Meta WhatsApp Cloud API (FREE)
                            │ POST webhook (HTTPS, HMAC-signed)
                            ▼
        https://site.todo.surfbible.in/whatsapp/webhook   (convex/http.ts)
            ├── GET  → one-time Meta verification handshake
            └── POST → verify X-Hub-Signature-256 → schedule → instant 200
                            ▼
              internalAction "processInbound"   (convex/whatsapp.ts)
              ├── LINK gate: only linked phones get replies
              ├── deterministic parser          (convex/whatsappParser.ts)
              ├── fallback: Gemini 2.5 Flash    (convex/gemini.ts, free tier)
              ├── task ops (same ownership rules as the app)
              └── reply via Graph API (free within 24h window)

        convex/crons.ts (every 15 min): due-task reminders
            window OPEN (<24h since your last msg) → send (free)
            window CLOSED → queue → flushed free on your next message
```

**Anti-interference guarantee:** the bot replies **only** to phone numbers that
completed the `LINK` flow. Anyone else messaging the bot number gets zero bot
responses — the number is a dedicated bot line (no WhatsApp app attached).

**What was built (deployed, nothing for you to code):**

| Piece | File | Purpose |
|---|---|---|
| Schema | `convex/schema.ts` | `whatsappLinks` (10-min single-use codes), `whatsappUsers` (phone→user), `pendingNotifications` (reminder queue), `todos.dueAt`/`remindedAt` |
| Webhook | `convex/http.ts` | GET handshake + POST with HMAC-SHA256 signature check, instant-200 + async processing |
| Bot logic | `convex/whatsapp.ts` | link codes, task ops, message routing, sender |
| Parser | `convex/whatsappParser.ts` | pure, unit-tested command grammar (27 tests) |
| NL parsing | `convex/gemini.ts` | Gemini 2.5 Flash via REST for free-form messages + due-time extraction |
| Reminders | `convex/crons.ts` | 15-min due-task scan with free-window gating |
| Dashboard UI | `app/dashboard/page.tsx` | chat-bubble icon in header → Connect panel (code, countdown, wa.me button, unlink) |

---

## 2. The zero-cost model (verified)

| Fact | Source |
|---|---|
| Replies inside the **24-hour customer service window** (opened each time *you* message the bot) are **free** — free-form messages, and even utility templates | Meta pricing update, Nov 2024 / Jul 2025 |
| **Self-serve onboarding** ("Add phone number" in API Setup) puts your own SIM number on the Cloud API directly — **no BSP, no fee** | Meta app dashboard |
| Coexistence (Business App + API on one number) is **partner-only** (BSP/Tech Provider embedded signup) and deliberately **not used** — this SIM is a dedicated bot line | Meta Embedded Signup docs |
| Gemini 2.5 Flash free tier (~1,500 requests/day) covers natural-language parsing | Google AI free tier |
| Convex crons/scheduler/HTTP actions on your self-hosted backend | already running, ₹0 |
| **The bot never initiates paid conversations** — it only replies inside the window, and *no message templates are ever created*. Charges are structurally impossible. | by design |

What *would* cost money (and we deliberately avoid): business-**initiated** template
messages sent outside the 24h window. Not needed for this bot.

---

## 3. Stage A — SIM ready for OTP

**You need:** the SIM active in any phone, able to receive SMS/calls. That is all —
**no WhatsApp app installation is required** (the number goes straight onto the API).

1. Insert the SIM; make sure it can receive SMS and calls (needed for the Stage-C
   OTP — if SMS doesn't arrive, Meta offers a **"Call me"** option).
2. **Only if this number is currently registered on WhatsApp / WhatsApp Business**
   (e.g. you already installed the Business app): in that app go to
   **Settings → Account → Delete my account**, confirm, then wait ~5 minutes.
   A number can't join the Cloud API while an app registration is active.
   A fresh SIM has nothing to lose — skip this step.

---

## 4. Stage B — Meta developer account + app

1. You need a **Facebook account** (personal is fine).
2. Go to <https://developers.facebook.com> → **Get Started** (top right) →
   complete registration (contact email, no business documents needed at this tier).
3. **Create App** → **Other** → type: **Business** → name it (e.g. `Surf ToDo Bot`)
   → select/create a Business Portfolio when asked (a plain container is fine).
4. On the app dashboard → **Add product** → find **WhatsApp** → **Set up**.
   - This auto-creates a **WhatsApp Business Account (WABA)** and a **free test
     number**. Your own SIM number replaces it in Stage C.

> **Optional warm-up (₹0, ~5 min):** you can validate the whole backend today using
> the test number — do Stages D–F with the test number's Phone Number ID, add your
> personal phone as a recipient (API Setup → recipient list → OTP), and run the
> Stage-G loop. Then onboard the SIM in Stage C and just update
> `WHATSAPP_PHONE_NUMBER_ID` (same WABA, same app, same webhook).

---

## 5. Stage C — Self-serve onboarding: put your SIM number on the API

This registers your Stage-A SIM number directly on the Cloud API — Meta-direct,
self-serve, **no BSP and no fee**. The number becomes a dedicated bot line (no
WhatsApp app can use it afterwards).

> **Why not "coexistence"** (Business App + API on one number)? That flow is only
> offered inside partner-hosted Embedded Signup (Meta Tech Providers / BSPs); it
> does not exist in the self-serve developer portal. It's also unnecessary here —
> this SIM exists only to serve the bot.

1. In your Meta app → **WhatsApp** → **API Setup**.
2. Open the phone-number dropdown (Step 1 area) → **Add phone number**
   (Meta-hosted embedded signup pops up).
3. Sign in with your Facebook account → select/create your **Business Portfolio**
   → confirm the **WhatsApp Business Account (WABA)**.
4. Set the **business display name** — this is what users see.
   ⚠️ Until the business is verified, recipients may see your raw number instead of
   the name. Cosmetic only; skip verification to stay at ₹0.
5. Enter your **SIM's phone number** → choose SMS or **voice call** → enter the
   **OTP** received on the phone.
   - If it says the number is already registered on WhatsApp: do Stage A.2
     (delete the app account), wait ~5 min, retry.
6. Finish. Back on **API Setup**, select your number and copy these two values
   (you'll need them in Stage E):
   - **Phone Number ID** (a long number, e.g. `10293...`)
   - **WhatsApp Business Account ID** (WABA ID)

---

## 6. Stage D — Credentials (token + app secret)

The temporary token on the API Setup page expires in 24h — create a **permanent** one:

1. Go to <https://business.facebook.com> → your business →
   **Business Settings** (gear) → **Users → System Users**.
2. **Add** a system user → name it (e.g. `todo-bot`) → role **Admin** → Create.
3. Select it → **Add Assets** → **Apps** → your app → **Full control** → Save.
4. Click **Generate New Token** → select your app → enable permissions:
   - `whatsapp_business_messaging` ✅ (required)
   - `whatsapp_business_management` ✅ (recommended)
   → Generate → **copy and store it safely** (shown once). This token never expires.
5. Get the **App Secret**: Meta app dashboard → **Settings → Basic** →
   **App Secret** → Show → copy.

---

## 7. Stage E — Backend environment variables

Already set for you (no action needed): `WHATSAPP_VERIFY_TOKEN` ✅,
`WHATSAPP_API_VERSION` ✅, `GEMINI_API_KEY` ✅.

**You set these three** (values from Stages C & D) — run from the project root:

```bash
cd /home/alex/aiprojects/todo-web

npx convex env set WHATSAPP_ACCESS_TOKEN '<permanent system-user token>'
npx convex env set WHATSAPP_APP_SECRET '<app secret>'
npx convex env set WHATSAPP_PHONE_NUMBER_ID '<phone number id>'

# Frontend: your bot number (E.164 digits, country code, no + or spaces)
# Example for India: 919876543210 — edit .env.local:
#   NEXT_PUBLIC_WHATSAPP_BOT_NUMBER=91xxxxxxxxxx
```

Verify what the backend has (names only, no secrets leaked):

```bash
npx convex env list
```

> ⚠️ `WHATSAPP_APP_SECRET` activates webhook **signature verification**. Until you
> set it, the webhook accepts unsigned posts (convenient for the Stage-F handshake
> and early testing). Set it before real use.

---

## 8. Stage F — Wire the webhook in Meta

1. Get your verify token (I generated one on the backend already):

   ```bash
   npx convex env get WHATSAPP_VERIFY_TOKEN
   ```

2. Meta app dashboard → **WhatsApp** → **Configuration** → **Webhook** → Edit:
   - **Callback URL:** `https://site.todo.surfbible.in/whatsapp/webhook`
   - **Verify Token:** paste the value from step 1
   - Click **Verify and save** — Meta calls our GET endpoint; you should see it
     turn green instantly. (Already curl-tested: returns the challenge ✓.)
3. Under **Webhook fields**, subscribe to **`messages`** ✅ (nothing else needed).

---

## 9. Stage G — Link your WhatsApp & test

1. Open `https://todo.surfbible.in/dashboard` (sign in) → tap the **chat-bubble
   icon** in the header → **Connect WhatsApp** panel.
2. **Generate link code** → you get a 6-character code (valid 10 minutes).
3. Tap **"Open WhatsApp with code"** (uses your `NEXT_PUBLIC_WHATSAPP_BOT_NUMBER`)
   → WhatsApp opens a chat to your bot number with `LINK ABC123` pre-filled →
   **Send**.
4. Bot replies: `✅ Linked!` + the command cheat-sheet. 🎉
5. Try the full loop:

   | You send | Expected reply |
   |---|---|
   | `add buy milk urgent` | ✅ Added: *buy milk* `Urgent` |
   | `add call dentist` | ✅ Added: *call dentist* `Personal` |
   | `list` | Numbered open tasks |
   | `done 1` | ✔️ Closed: *buy milk* |
   | `list done` | Completed list (shows buy milk) |
   | `list urgent` | Urgent-only list |
   | `edit 1 call dentist friday` | ✏️ Updated |
   | `move 1 work` | 📁 Moved → `Work` |
   | `today` | Daily digest |
   | `remind me to pay rent tomorrow 6pm` | ✅ Added with ⏰ due time (Gemini) |
   | `delete 1` | 🗑 Deleted |
   | `help` | Command cheat-sheet |

6. Check the app dashboard — the same tasks appear there too (shared per-user list).

---

## 10. Command reference

| Command | Aliases | What it does |
|---|---|---|
| `LINK ABC123` | `start ABC123` | Bind this phone to your app account (one-time) |
| `add <text> [in] <category>` | — | New task; category optional (default Personal) |
| `list` | `ls`, `tasks`, `todos`, `open`, `pending` | Open tasks (numbered) |
| `list done` | `completed`, `closed` | Completed tasks |
| `list urgent` | `urgent` | Open urgent tasks |
| `today` | `digest`, `summary`, `agenda` | Open count + urgent + due-today |
| `done <n\|text>` | `complete`, `close`, `check`, `finish` | Mark task complete (by list number or text) |
| `edit <n> <new text>` | `update`, `rename`, `change` | Change task text |
| `move <n> <category>` | `mv` | Change category |
| `delete <n\|text>` | `remove`, `del`, `trash` | Delete task |
| `unlink` | `disconnect`, `logout` | Disconnect this phone |
| `help` | `hi`, `hello`, `menu`, `?` | Show cheat-sheet |
| *(anything else)* | — | Parsed by Gemini (natural language) |

Notes:
- Numbered references (`done 2`) refer to the **most recent list the bot showed you**.
- Text references match by containment: `done milk` closes the first task containing "milk".
- Categories (case-insensitive): `personal`, `work`, `errands`, `fitness`, `urgent`.

---

## 11. Task reminders (Phase 3)

**How to set a reminder:** include a time in natural language —
`remind me to call the dentist tomorrow 5pm` or `add pay rent in work on 1st aug 9am`.
Gemini extracts the time and stores it as `dueAt` on the task.

**Delivery logic (every 15 minutes, `convex/crons.ts`):**

```
task due & not done & not yet reminded
   ├─ your 24h window OPEN  → WhatsApp message now (FREE)
   └─ window CLOSED         → queued to pendingNotifications
                                 └─ delivered FREE the next time you message the bot
                                   (prepended as "🔔 While you were away: …")
```

**Cost guarantee:** the bot only ever sends *session* messages inside the free
window. No paid message templates are created anywhere, so a bill is impossible.

---

## 12. Security

- **Webhook authenticity:** every POST is verified with `X-Hub-Signature-256`
  (HMAC-SHA256 of the raw body using your App Secret) once `WHATSAPP_APP_SECRET`
  is set. Unsigned/invalid → `401`.
- **Account binding:** link codes are 6 chars from an unambiguous alphabet,
  **single-use**, **10-minute expiry**, one active code per user.
- **Authorization:** all task operations derive the user from the phone→user
  mapping server-side; unlinked phones can only run `LINK`.
- **Secrets location:** tokens live only on the Convex backend (`npx convex env`),
  never in git, never in the frontend bundle. The frontend only knows the public
  bot number (`NEXT_PUBLIC_WHATSAPP_BOT_NUMBER`).
- Rate limiting: for a personal bot this is optional; if you ever open the number
  publicly, add per-phone throttling in `processInbound`.

---

## 13. Testing appendix (simulated webhooks)

You can exercise the live webhook without Meta:

```bash
SITE=https://site.todo.surfbible.in

# 1. Handshake (should print the challenge back):
VT=$(npx convex env get WHATSAPP_VERIFY_TOKEN)
curl -s "$SITE/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=$VT&hub.challenge=hello-123"

# 2. Wrong token → 403:
curl -s -o /dev/null -w "%{http_code}\n" "$SITE/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=x"

# 3. Simulated inbound message (before APP_SECRET is set) → 200:
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SITE/whatsapp/webhook" \
  -H "Content-Type: application/json" \
  -d '{"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{"metadata":{"phone_number_id":"PN"},"messages":[{"from":"910000000000","id":"wamid.t1","timestamp":"1","type":"text","text":{"body":"list"}}]}}]}]}'
```

With `WHATSAPP_APP_SECRET` set, sign the body yourself:

```bash
SECRET='<app secret>'
BODY='{"object":"whatsapp_business_account","entry":[]}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)"
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SITE/whatsapp/webhook" \
  -H "Content-Type: application/json" -H "x-hub-signature-256: $SIG" -d "$BODY"
```

Parser unit tests (27 cases): the pure parser lives in `convex/whatsappParser.ts`
and can be tested with any TS runner (e.g. `npx tsx <testfile>`).

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| OTP never arrives (Stage C) | SMS delays / DND (India) | Use **"Call me"**; check SIM is active; disable DND for transactional SMS |
| "Number already registered" error (Stage C) | SIM still tied to a WhatsApp / Business app account | Delete the account in the app (Stage A.2), wait ~5 min, retry |
| Recipients see a raw number, not your display name | Business not verified (expected) | Cosmetic only — ignore, or verify the business later (optional) |
| "Verify and save" fails (Stage F) | Wrong verify token or URL | Token must equal `npx convex env get WHATSAPP_VERIFY_TOKEN`; URL exactly `https://site.todo.surfbible.in/whatsapp/webhook` |
| Webhook verified but bot silent | `messages` field not subscribed; or ACCESS_TOKEN/PHONE_NUMBER_ID missing | Stage F.3 + Stage E env vars; check backend logs for `[whatsapp] send failed` |
| Replies say "not linked" after linking | Code expired (10 min) / typo | Generate a fresh code; send `LINK <CODE>` exactly |
| `done 2` can't find task | List changed since shown | Send `list` again, then the number |
| Reminder didn't arrive | Window was closed → it's queued | Message the bot anything; it flushes pending reminders |
| Meta shows message errors about templates | You tried to message outside 24h window | By design — see §11; never use templates to stay at ₹0 |
| Token works then suddenly 401 from Graph API | You used the 24h temporary token | Generate the permanent system-user token (Stage D) |

---

## 15. Free-tier limits

| Resource | Limit | Bot impact |
|---|---|---|
| Service conversations (user-initiated, 24h window) | Free (service replies free since Nov 2024) | All bot replies ✅ ₹0 |
| Business-initiated templates outside window | Paid per message | Not used — reminders queue instead |
| Cloud API throughput (standard tier) | 80 msg/sec default | Far above personal use |
| Gemini 2.5 Flash free tier | ~1,500 req/day | Hundreds of NL parses/day headroom |
| Meta test number (optional warm-up) | 5 recipients | Validate Stages D–G before onboarding the SIM |
| Convex self-hosted | Your server | Already running ✅ |

**Bottom line: total monthly cost = ₹0**, as long as the bot only replies inside
24-hour windows and no paid templates are ever created.
