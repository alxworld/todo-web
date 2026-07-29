# Project Overview — todo-web (Surf ToDo Canvas)

## 1. What This Project Is

**todo-web** is a mobile-first, real-time to-do list web application branded in the UI as
**"Surf ToDo Canvas" / "Surf ToDo Workbench"**. Beyond standard manual task management, it
features an **AI command console** (text + voice) powered by Google Gemini that can add,
toggle/complete, and delete tasks using natural language.

- **Package name:** `todo-web` (v0.1.0, private)
- **Metadata title:** "Surf ToDo Canvas" — described as a "Mobile-First Edge Web Application"
- **Git history:** 2 commits — scaffolded with `create-next-app`, then a single "Initial production commit"

### Core Capabilities

| Capability | How It Works |
|---|---|
| **Sign up / sign in** | **Convex Auth — Google OAuth or email+password; unauthenticated visitors see only the sign-in screen** |
| List tasks (real-time) | Convex reactive query subscription, **filtered to the signed-in user** |
| Add a task manually | Input + category picker → Convex mutation (stamped with owner `userId`) |
| Toggle complete / delete | Buttons → Convex mutations (**server-side ownership checks**) |
| Filter by category | Client-side filter tabs ("All" + 5 categories) |
| AI text commands | Next.js Server Action → Gemini → structured JSON → client executes mutation |
| AI voice commands | Web Speech API (SpeechRecognition) → transcript → same AI pipeline |
| **WhatsApp bot** | Meta Cloud API webhook → Convex HTTP action → command parser (+Gemini NL) → per-user task ops; replies free inside 24h window |
| **WhatsApp reminders** | Convex cron (15 min) scans `dueAt` → send if 24h window open, else queue → flushed on next inbound (zero-cost-by-construction) |
| Sign out | Header button → `useAuthActions().signOut` |

---

## 2. Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                          │
│  Next.js App Router (React 19, "use client" page)                │
│  ├── UI: Tailwind CSS v4, lucide-react icons, Inter font         │
│  ├── Voice: Web Speech API (SpeechRecognition)                   │
│  ├── ConvexAuthProvider (@convex-dev/auth/react)                 │
│  │     ├── unauthenticated → renders <SignIn/>                   │
│  │     └── authenticated → JWT attached to all Convex calls      │
│  ├── useQuery(api.todos.getTodos | "skip") ──live sub──┐         │
│  └── useMutation(addTodo / toggleTodo / deleteTodo) ─┐ │         │
└──────────────────────────────────────────────┬───────┼─┼─────────┘
                                               │       │ │
            ┌──────────────────────────────────┘       │ │
            ▼ (Server Action, "use server")            │ │
┌──────────────────────────────────┐                   │ │
│  Next.js Server                  │                   │ │
│  app/actions/ai.ts               │                   │ │
│  processTaskCommand(utterance,   │                   │ │
│  activeTodoList)                 │                   │ │
└──────────────┬───────────────────┘                   │ │
               ▼ HTTPS                                 ▼ ▼
┌──────────────────────────────────┐     ┌──────────────────────────────┐
│  Google Gemini API               │     │  Convex (SELF-HOSTED)        │
│  model: gemini-2.5-flash         │     │  Real-time DB + funcs        │
│  returns strict JSON:            │     │  convex/schema.ts / todos.ts │
│  {action, data, feedback}        │     │  + Convex Auth:              │
│                                  │     │  auth.config.ts (JWT verify) │
│  ┌────────────────────────┐      │     │  auth.ts (Google, Password)  │
│  │ Google OAuth (browser  │──────┼────▶│  http.ts (/api/auth/* routes)│
│  │ redirect flow)         │      │     │  RS256 JWT via JWT_PRIVATE_  │
│  └────────────────────────┘      │     │  KEY/JWKS env vars           │
└──────────────────────────────────┘     └──────────────────────────────┘
```

### Four Data Flows

0. **Authentication:** client-side Convex Auth (no server-side auth). Password sign-in runs
   through the `api.auth.signIn` action over the Convex connection; Google sign-in redirects
   the browser to `{CONVEX_SITE_URL}/api/auth/signin/google` → Google →
   `/api/auth/callback/google` → back to `SITE_URL` (http://localhost:3000) with a `?code=`
   that `ConvexAuthProvider` exchanges for tokens. Every subsequent Convex call carries the
   RS256 JWT, verified by `convex/auth.config.ts`; `getAuthUserId(ctx)` resolves the caller's
   `users` document id inside functions.
1. **Real-time sync (read):** `useQuery(api.todos.getTodos)` (skipped while unauthenticated)
   keeps a live WebSocket subscription; the query filters `by_user` to the caller, so users
   only ever receive their own tasks.
2. **Manual mutations:** UI buttons/forms call Convex mutations; `addTodo` stamps `userId`,
   and `toggleTodo`/`deleteTodo` verify `todo.userId === caller` or throw `Unauthorized`.
3. **AI orchestration:** user utterance (typed or spoken) + the full todo list are sent to
   the `processTaskCommand` Server Action → Gemini classifies intent as
   `ADD` / `TOGGLE` / `DELETE` / `UNKNOWN` with a strict JSON payload → the **client**
   maps the result onto the corresponding Convex mutation (which re-checks ownership).
   For `TOGGLE`/`DELETE`, Gemini returns the target `_id`, with a client-side fallback that
   text-matches the task name against the command string.

---

## 3. Technology Stack

### Frontend
| Dependency | Version | Role |
|---|---|---|
| `next` | 16.2.10 | React framework (App Router) — **note: this version has breaking changes vs. common training data; docs ship in `node_modules/next/dist/docs/`** |
| `react` / `react-dom` | 19.2.4 | UI library |
| `lucide-react` | ^1.25.0 | Icon set (Mic, Send, Sparkles, Tags, etc.) |
| `tailwindcss` + `@tailwindcss/postcss` | ^4 | Utility-first CSS (v4, PostCSS plugin, `@import "tailwindcss"` + `@theme inline`) |
| `typescript` | ^5 | Strict TS; path alias `@/* → ./*` |

### Backend / Data
| Dependency | Version | Role |
|---|---|---|
| `convex` | ^1.42.3 | Real-time backend: schema, queries, mutations, generated typed API. Configured for a **self-hosted** deployment (see env vars) |
| `@convex-dev/auth` | latest | Convex Auth: Google OAuth + Password providers, auth tables, JWT session management |
| `@auth/core` | 0.41.1 | Auth.js core — provides the `Google` provider config used in `convex/auth.ts` |

### AI
| Dependency | Version | Role |
|---|---|---|
| `@google/genai` | ^2.12.0 | Google GenAI SDK; calls `gemini-2.5-flash` with `responseMimeType: "application/json"` |

### Tooling
- **ESLint 9** (flat config) with `eslint-config-next` core-web-vitals + typescript presets
- **PostCSS** via `postcss.config.mjs` (Tailwind v4 plugin only)
- **npm scripts:** `dev` (next dev), `build` (next build), `start` (next start), `lint` (eslint)

---

## 4. Directory Structure

```
todo-web/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout: Inter font, metadata, viewport, ConvexClientProvider
│   ├── page.tsx                  # PUBLIC landing page — visible to everyone, no data queries
│   ├── error.tsx                 # Route error boundary (friendly retry UI, no white screens)
│   ├── dashboard/
│   │   └── page.tsx              # Task dashboard (client component) — auth-gated, redirects to /signin
│   ├── signin/
│   │   └── page.tsx              # Sign-in screen: Google button + email/password form (Suspense-wrapped)
│   ├── ConvexClientProvider.tsx  # "use client" ConvexAuthProvider wrapper
│   ├── actions/
│   │   └── ai.ts                 # Server Action: processTaskCommand → Gemini
│   └── globals.css               # Tailwind v4 import + CSS custom properties
├── convex/                       # Convex backend
│   ├── schema.ts                 # authTables + todos (+dueAt) + whatsappLinks/whatsappUsers/pendingNotifications
│   ├── todos.ts                  # getTodos / addTodo / toggleTodo / deleteTodo (auth-gated)
│   ├── whatsapp.ts               # WhatsApp bot: link codes, task ops, processInbound, sender
│   ├── whatsappParser.ts         # Pure command grammar + webhook payload extraction (unit-tested)
│   ├── gemini.ts                 # Gemini REST helper for NL parsing + dueAt extraction
│   ├── crons.ts                  # 15-min due-task reminders with free-window gating
│   ├── auth.config.ts            # JWT provider config (domain = CONVEX_SITE_URL)
│   ├── auth.ts                   # convexAuth({ providers: [Google, Password] })
│   ├── http.ts                   # /api/auth/* routes + /whatsapp/webhook (GET handshake, POST HMAC-verified)
│   ├── tsconfig.json             # TS config for the Convex function runtime
│   ├── README.md                 # Convex scaffold docs
│   └── _generated/               # Generated API, data model types, server helpers
│       └── ai/guidelines.md      # Convex AI coding guidelines (per AGENTS.md)
├── public/                       # Static SVG assets (create-next-app defaults)
├── .agents/skills/               # Installed Convex agent skills
├── AGENTS.md / CLAUDE.md         # Agent instructions (Next.js docs note + Convex rules)
├── skills-lock.json              # Locked Convex skill versions
├── next.config.ts                # Empty NextConfig (defaults)
├── eslint.config.mjs             # Flat ESLint config
├── postcss.config.mjs            # Tailwind v4 PostCSS plugin
├── tsconfig.json                 # App TS config (strict, bundler resolution, @/* alias)
└── package.json
```

---

## 5. Backend (Convex) Details

### Schema — `convex/schema.ts`

**`...authTables`** (from `@convex-dev/auth/server`) — `users`, `authAccounts`,
`authSessions`, `authRefreshTokens`, `authVerificationCodes`, `authVerifiers`,
`authRateLimits`. Convex Auth manages these internally; there is no parallel app-level
`users` table.

App table **`todos`**:

| Field | Type | Notes |
|---|---|---|
| `text` | `v.string()` | Task description |
| `isCompleted` | `v.boolean()` | Completion flag |
| `category` | union of literals | `"Personal" \| "Work" \| "Errands" \| "Fitness" \| "Urgent"` |
| `userId` | `v.optional(v.id("users"))` | **Owner.** Optional so pre-auth rows stay valid; rows without an owner are orphaned and hidden from everyone |
| `createdAt` | `v.number()` | `Date.now()` timestamp |

**Indexes:** `by_category` on `["category"]` (still unused by queries); `by_user` on
`["userId"]` (powers the per-user list query).

### Functions — `convex/todos.ts`

Every function derives the caller server-side via `getAuthUserId(ctx)` and throws
`"Not authenticated"` when there is no session — client-supplied user ids are never accepted.

| Function | Kind | Args | Behavior |
|---|---|---|---|
| `getTodos` | query | — | Returns **only the caller's** todos via the `by_user` index, newest first |
| `addTodo` | mutation | `text: string`, `category: union` | Inserts with `isCompleted: false`, `userId: caller`, `createdAt: Date.now()`; returns new id |
| `toggleTodo` | mutation | `id: v.id("todos")`, `isCompleted: boolean` | Throws `Unauthorized` unless the todo belongs to the caller, then patches the flag |
| `deleteTodo` | mutation | `id: v.id("todos")` | Throws `Unauthorized` unless the todo belongs to the caller, then deletes |

### Auth files

- **`convex/auth.config.ts`** — registers the JWT provider: `domain: process.env.CONVEX_SITE_URL`,
  `applicationID: "convex"` (required for `ctx.auth.getUserIdentity()` to work).
- **`convex/auth.ts`** — `convexAuth({ providers: [Google, Password] })`; exports the
  `signIn`/`signOut` actions the client calls. `Password` enforces 8+ character passwords
  by default; separate `signIn`/`signUp` flows. No email verification or password reset
  configured yet (needs an email provider such as Resend).
- **`convex/http.ts`** — exposes `/api/auth/signin/:provider`, `/api/auth/callback/:provider`,
  `/.well-known/jwks.json`, `/.well-known/openid-configuration`.

There are no crons or scheduled functions for the web app itself; AI calls for the
dashboard happen in Next.js Server Actions.

### WhatsApp subsystem (see `whatsapp_feature.md` for the full guide)

A zero-cost WhatsApp bot built on Meta's **Cloud API** with the SIM number onboarded
directly via self-serve signup (a dedicated bot line — no WhatsApp app attached):

- **Webhook:** `POST /whatsapp/webhook` verifies `X-Hub-Signature-256`
  (HMAC-SHA256 with `WHATSAPP_APP_SECRET`), schedules async processing, returns 200
  instantly; `GET` handles Meta's one-time verification handshake.
- **Linking:** dashboard "Connect WhatsApp" panel issues a 6-char, single-use,
  10-minute code; the user sends `LINK <code>` from WhatsApp to bind phone→user
  (`whatsappUsers`). Only linked phones get bot replies.
- **Commands:** pure deterministic parser (`whatsappParser.ts`, 27 unit tests) for
  add/done/edit/move/delete/list/list-done/list-urgent/today/unlink; anything else
  falls back to Gemini 2.5 Flash (`gemini.ts`) which also extracts `dueAt` times.
- **Reminders:** `crons.ts` scans due tasks every 15 min — sends immediately when
  the user's 24h free window is open, otherwise queues to `pendingNotifications`
  and flushes on the next inbound message. No paid templates are ever used, so the
  integration is free by construction.
- **Env vars (backend):** `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`,
  `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`,
  `GEMINI_API_KEY`. Frontend: `NEXT_PUBLIC_WHATSAPP_BOT_NUMBER` (wa.me deep link).

---

## 6. Frontend (Next.js) Details

### `app/layout.tsx` (Server Component)
- Loads **Inter** via `next/font/google`; applies global dark-slate background, `select-none`,
  `antialiased`, and `overflow-x-hidden`.
- Exports `metadata` (title/description) and a mobile-locked `viewport`:
  `width=device-width, initialScale=1, maximumScale=1, userScalable=false, viewportFit=cover`.
- Wraps all children in `ConvexClientProvider`.

### `app/ConvexClientProvider.tsx` (Client Component)
- Instantiates a singleton `ConvexReactClient` from `process.env.NEXT_PUBLIC_CONVEX_URL` and
  provides it via `ConvexAuthProvider` from `@convex-dev/auth/react` (handles token storage,
  refresh, and `?code=` exchange after OAuth redirects).

### `app/page.tsx` — PUBLIC landing page (Client Component)

Visible to **everyone**, signed in or not. Renders the brand hero, four feature cards
(real-time sync, smart categories, Gemini voice & chat, private-by-default), and CTA
buttons. It fires **no data queries** — `useConvexAuth()` only swaps the footer CTA:
signed-in visitors see "Open your dashboard", everyone else sees "Create a free account"
(→ `/signin?mode=signup`) and "Sign in" (→ `/signin`). The CTAs are part of the static
prerendered HTML, so the page is fully actionable even if the backend is unreachable.

### `app/signin/page.tsx` (Client Component)
- Static shell + header prerenders; the form area is wrapped in `<Suspense>` because it
  reads `?mode=signup` via `useSearchParams`.
- **"Continue with Google"** button → `signIn("google", { redirectTo: "/dashboard" })`.
- **Email + password form** → `signIn("password", formData)` with a hidden `flow` field
  toggled between `"signIn"` and `"signUp"`; shows inline errors for bad credentials and
  enforces `minLength={8}` on the password input.
- On success (or if already signed in) → redirects to `/dashboard`.

### `app/dashboard/page.tsx` (Client Component — the task app)

**Auth gate:** `useConvexAuth()` drives rendering — a spinner while the session restores,
a client-side `router.replace("/signin")` when unauthenticated, and the dashboard when
authenticated. The todos query uses the `"skip"` pattern so it never fires without a
session, and the header carries a sign-out (`LogOut`) button (which lands back on
`/signin` via the same redirect).

**Layout (mobile-safe):** the shell uses `h-dvh` (dynamic viewport height) so the footer
composer is never hidden under mobile browser chrome, plus `env(safe-area-inset-*)`
padding for notched devices. All chrome is compact: a slim header (brand chip, live
"N open" task counter, sign-out) ≈60px, category pills ≈46px, and a unified composer
≈132px — so even on a 667px phone the task list keeps ~430px and every control
(including the mic button) stays on screen.

**Composer:** one footer holds the manual add form (compact category chips + input +
add button) and a unified Gemini bar (mic toggle with listening state, AI input, send
button) — no divider rows. The AI feedback line renders as a dismissible toast strip.

**Task cards:** rounded-2xl with larger touch targets (44px checkbox/delete hit areas),
per-category color-coded badges (Personal=indigo, Work=sky, Errands=amber,
Fitness=emerald, Urgent=rose), hover/active micro-interactions, and a friendly
illustrated empty state.

### `app/error.tsx` (Client Component)
Route-level error boundary: logs the error and shows a friendly "Something went wrong"
card with a retry (`reset`) button, so a runtime failure (e.g. a dropped backend
connection) can never white-screen the whole app.

The rest of the dashboard UI is unchanged:

A single-screen, mobile-shell layout (`max-w-md mx-auto`, `h-screen`, card-like column):

1. **Header** — "Surf ToDo Workbench" title + "Gemini Real-Time Processing Active" status line.
2. **Category nav** — horizontally scrollable pill tabs: `All` + the 5 system categories
   (filters client-side via `activeFilterTab`).
3. **AI feedback banner** — dismissible status line ("Listening...", "AI analyzing...",
   Gemini's confirmation message, or parse errors).
4. **Task list** — three states: loading spinner (`todos === undefined`), empty-state card,
   or rows with a complete/uncomplete circle toggle, text (line-through when done), category
   badge, and a delete (trash) button. Completed items render at reduced opacity.
5. **Footer composer:**
   - **Manual add form:** category chip selector + text input + submit button
     (`handleManualAddSubmit` → `addTodo`).
   - **"Intelligent Voice & Chat Console":** mic toggle button (Web Speech API), AI text input
     (Enter key or send button), disabled while `isAiLoading`.

**Local state:** `taskInput`, `aiInput`, `selectedCategory` (default "Personal"),
`activeFilterTab` (default "All"), `aiFeedback`, `isListening`, `isAiLoading`, plus
`recognitionRef` for the SpeechRecognition instance.

**Voice input:** initialized in a `useEffect` (re-created when `todos` changes);
`SpeechRecognition`/`webkitSpeechRecognition` guarded for browser support; `en-US`,
non-continuous, no interim results. On result, the transcript fills the AI input and
immediately triggers `triggerAiOrchestration`.

**AI orchestration (`triggerAiOrchestration`):**
- Sends the command + full todo list to the server action.
- On `ADD`: calls `addTodo` with the cleaned text and category (defaults to "Personal").
- On `TOGGLE` / `DELETE`: finds the task by returned `_id`, falling back to
  `text.toLowerCase().includes(command.toLowerCase())`, then calls the matching mutation.
- On failure: shows "Could not parse command. Try rephrasing."

### `app/actions/ai.ts` (Server Action — `"use server"`)
- Creates a `GoogleGenAI` client with `process.env.GEMINI_API_KEY` (server-only secret).
- `processTaskCommand(userUtterance, activeTodoList)` builds a system prompt containing the
  serialized current tasks and the valid category list, then calls
  `ai.models.generateContent({ model: "gemini-2.5-flash", config: { responseMimeType: "application/json" } })`.
- Contract enforced via prompt: strict JSON with keys
  `action` (`ADD` | `TOGGLE` | `DELETE` | `UNKNOWN`),
  `data` (object `{text, category}` for ADD; task `_id` string for TOGGLE/DELETE), and
  `feedback` (one-sentence confirmation).
- Returns `{ success: true, payload }` or `{ success: false, error }` — never throws to the client.

### Styling — `app/globals.css`
- Tailwind v4 via `@import "tailwindcss"`; `@theme inline` maps `--color-background`,
  `--color-foreground`, and Geist font variables.
- `prefers-color-scheme: dark` flips background/foreground CSS variables (the component
  classes themselves are light-themed regardless).

---

## 7. Configuration & Environment

### Environment variables (`.env.local`, git-ignored)
| Variable | Used by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Browser | Convex deployment URL for the React client |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Browser | Convex HTTP-actions (site) URL — used by the Google OAuth browser redirect |
| `CONVEX_SELF_HOSTED_URL` | Convex CLI | **Self-hosted** backend sync target |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | Convex CLI | Admin key for the self-hosted deployment |
| `GEMINI_API_KEY` | Next.js server | Google Gemini API key (server action only) |

### Convex deployment env vars (set via `npx convex env set`, stored on the backend)
| Variable | Purpose |
|---|---|
| `SITE_URL` | App origin for OAuth post-login redirect (`http://localhost:3000` in dev) |
| `JWT_PRIVATE_KEY` / `JWKS` | RS256 key pair generated during Convex Auth setup — signs/verifies session JWTs |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client credentials — **must be supplied before Google sign-in works** |

### Other config
- **`tsconfig.json`:** strict mode, `moduleResolution: "bundler"`, path alias `@/*`,
  includes `.next/types` and `.next/dev/types`.
- **`convex/tsconfig.json`:** ESNext target, ES2023 + dom libs — the Convex function runtime profile.
- **`next.config.ts`:** empty (all defaults).
- **`.gitignore`:** `.env.local`, `node_modules`, `.next`.
- **`skills-lock.json`:** six locked Convex agent skills (convex, create-component,
  migration-helper, performance-audit, quickstart, setup-auth) from `get-convex/agent-skills`.

---

## 8. Running the Project

```bash
# Terminal 1 — sync Convex functions to the (self-hosted) deployment
npx convex dev

# Terminal 2 — run the Next.js dev server
npm run dev        # http://localhost:3000
```

Other commands: `npm run build`, `npm start`, `npm run lint`.
Prerequisites: valid `.env.local` (see table above) and a reachable self-hosted Convex backend.

---

## 9. Notable Design Decisions, Constraints & Gaps

- **Mobile-first, app-like shell:** fixed viewport (no user zoom), `max-w-md` centered column,
  safe-area cover fit, compact 10–12px typography.
- **Server-side AI, client-side execution:** the Gemini call (and its API key) stays on the
  server; the client remains responsible for translating the returned intent into Convex
  mutations — including its own fuzzy fallback matching for TOGGLE/DELETE.
- **Client-side auth only (no SSA):** the app uses `ConvexAuthProvider` from
  `@convex-dev/auth/react` without Next.js server-side authentication — no middleware/proxy,
  no server provider. Auth state gates rendering client-side; all enforcement lives in the
  Convex functions.
- **Per-user task lists:** every todo is owned by a `users` document. Todos created before
  auth existed have no `userId` — they are orphaned and visible to no one (delete them from
  the dashboard if they should be gone entirely).
- **Google OAuth needs credentials:** the `Google` provider is wired in `convex/auth.ts` but
  requires `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` on the deployment plus a Google Cloud
  OAuth client whose redirect URI is `{CONVEX_SITE_URL}/api/auth/callback/google`.
- **Hardcoded categories:** the 5 categories are duplicated in three places —
  `convex/schema.ts` (validator), `convex/todos.ts` (mutation args), and
  `SYSTEM_CATEGORIES` in `app/page.tsx` (plus the Gemini prompt in `app/actions/ai.ts`).
  Adding a category requires touching all of them.
- **Unused index:** the `by_category` index exists but `getTodos` uses a full scan + client-side filtering.
- **Voice recognition caveat:** the `useEffect` that builds the `SpeechRecognition` instance
  re-runs on every `todos` change; voice support depends on browser `SpeechRecognition` availability.
- **Dark-mode variables** are defined in CSS but the UI components use fixed light Tailwind classes.
- **Agent-facing docs:** `AGENTS.md` warns that this Next.js version differs from training
  data (consult `node_modules/next/dist/docs/`) and mandates reading
  `convex/_generated/ai/guidelines.md` before editing Convex code.
