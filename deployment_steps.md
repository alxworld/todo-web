# Deploying todo-web to Vercel

This guide deploys the updated frontend (public landing page, auth, per-user dashboard)
to Vercel. The Convex backend is **self-hosted** at `https://api.todo.surfbible.in` and is
already live — no backend deployment is needed.

**Time required:** ~10 minutes.

---

## 0. What is being deployed

- Public landing page at `/` (visible to everyone)
- Sign-in / sign-up at `/signin` (Google + email/password via Convex Auth)
- Auth-gated task dashboard at `/dashboard`
- Error boundary (`app/error.tsx`) — no more white screens
- Convex backend functions are **already pushed** to the self-hosted deployment

---

## 1. Prerequisites

- [ ] Vercel account with the project already created (the one serving `todo.surfbible.in`)
- [ ] The Vercel project is connected to the GitHub repo `alxworld/todo-web`
      (check: Vercel Dashboard → your project → **Settings → Git**)
- [ ] You are on the `main` branch locally with the latest code

---

## 2. Step 1 — Commit and push the code

All deployment steps assume the project root as the working directory.

```bash
cd /home/alex/aiprojects/todo-web
```

### 2a. (Recommended, one-time) Restore build-artifact ignore rules

The current `.gitignore` is minimal and would commit build artifacts. Add the missing
entries:

```bash
cat >> .gitignore << 'EOF'

# build artifacts
.next/
out/
*.tsbuildinfo
next-env.d.ts

# vercel
.vercel

# env files
.env*
EOF
```

> `.env.local` stays git-ignored — your secrets never reach GitHub or Vercel.

### 2b. Stage, commit, push

```bash
git add -A
git status          # review: no .env.local, no tsbuildinfo, no next-env.d.ts
git commit -m "Add Convex Auth (Google + password), public landing page, /dashboard route"
git push origin main
```

> If your Vercel project is connected to this repo, **the push alone triggers a
> production deployment**. Continue to Step 2 (env vars) before it finishes, or
> redeploy afterwards — env vars are baked in at build time.

---

## 3. Step 2 — Configure environment variables in Vercel

`.env.local` is **not** pushed to git, so Vercel must be given these values explicitly.

Go to: **Vercel Dashboard → your project → Settings → Environment Variables**
(apply to **Production**, and Preview if you use preview deployments).

| Name | Value | Why it's needed |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `https://api.todo.surfbible.in` | Browser → Convex backend connection. **Inlined at build time** — missing this = white screen |
| `GEMINI_API_KEY` | copy the value from your local `.env.local` | Used by the AI server action (`app/actions/ai.ts`) at runtime |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `http://127.0.0.1:3211` *(optional for now)* | Only used by OAuth browser redirects; see Step 5 |

**DO NOT** add these to Vercel (local CLI use only — never expose them publicly):

- `CONVEX_SELF_HOSTED_ADMIN_KEY` ❌ (full admin access to your backend)
- `CONVEX_SELF_HOSTED_URL` ❌ (only used by the local Convex CLI)

> ⚠️ **After adding/changing env vars, you must redeploy** — they do not apply to
> existing deployments (Vercel Dashboard → Deployments → ⋯ → Redeploy).

---

## 4. Step 3 — Deploy

### Option A — Git push (recommended, if Vercel ↔ GitHub is connected)

Already done in Step 1: pushing to `main` auto-deploys to production.
Watch progress: **Vercel Dashboard → your project → Deployments**.

### Option B — Vercel CLI (manual)

```bash
npx vercel login                 # one-time: opens browser to authenticate
npx vercel link                  # one-time: connect this folder to your Vercel project
                               #   → choose your existing project (todo-web)
npx vercel pull                  # (optional) pulls project settings/env for a local check
npx vercel --prod                # builds and deploys straight to production
```

The CLI prints the deployment URL when done. A `.vercel/` folder is created locally —
it is covered by the `.gitignore` update in Step 2a.

### Build settings (auto-detected — verify only)

Vercel Dashboard → **Settings → General → Build & Development Settings**:

- Framework Preset: **Next.js**
- Build Command: `next build` (default)
- Install Command: `npm install` (default)
- Root Directory: `./`

---

## 5. Step 4 — Verify the deployment

### Automated checks (run from your machine)

```bash
# Home page: public, must contain hero + both CTAs
curl -s https://todo.surfbible.in/ | grep -o "Create a free account\|Sign in\|Real-time sync"

# Sign-in page: must render the shell
curl -s -o /dev/null -w "%{http_code}\n" https://todo.surfbible.in/signin     # expect 200

# Dashboard: must render (redirect to /signin happens client-side)
curl -s -o /dev/null -w "%{http_code}\n" https://todo.surfbible.in/dashboard  # expect 200
```

### Manual browser checklist

1. [ ] Open `https://todo.surfbible.in/` in an **incognito window** → landing page
      with "Create a free account" and "Sign in" buttons (no blank page!)
2. [ ] Click **Create a free account** → sign-up form (email + password)
3. [ ] Register a new account → you land on `/dashboard` with an empty task list
4. [ ] Add a task, toggle it, delete it → changes persist after reload
5. [ ] Sign out (header icon) → back at `/signin`; sign in again → your tasks are there
6. [ ] Try the Gemini chat console (requires `GEMINI_API_KEY` in Vercel env vars)
7. [ ] Open `/` while signed in → CTA reads "Open your dashboard"

---

## 6. Step 5 — Make Google sign-in work in production (optional)

Email/password sign-in works in production **immediately** — no extra setup.
Google OAuth needs three things because the browser is redirected through the Convex
backend's site URL:

1. **Publicly reachable site URL.** The backend's site port is currently
   `http://127.0.0.1:3211` — end users' browsers cannot reach that. Expose it publicly
   (e.g. reverse-proxy `https://site.todo.surfbible.in` → `127.0.0.1:3211` on your
   backend server, the same way `api.todo.surfbible.in` fronts the API port).
2. **Point the app at the public site URL** — update in Vercel:
   `NEXT_PUBLIC_CONVEX_SITE_URL=https://site.todo.surfbible.in`, and set the backend's
   advertised site URL accordingly. Then run locally:
   ```bash
   npx convex env set SITE_URL https://todo.surfbible.in
   ```
   (This is where users land after Google sign-in. Note: a single `SITE_URL` serves
   all environments — setting it to production means local-dev Google sign-in will
   redirect to the prod URL.)
3. **Google Cloud OAuth client** ([console](https://console.cloud.google.com/auth/overview)):
   - Authorized JavaScript origins: `https://todo.surfbible.in`
   - Authorized redirect URIs: `https://site.todo.surfbible.in/api/auth/callback/google`
   - Then: `npx convex env set AUTH_GOOGLE_ID <id>` and
     `npx convex env set AUTH_GOOGLE_SECRET <secret>`

Until this is done, hide nothing — the email/password path fully covers registration.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Blank/white page in production | `NEXT_PUBLIC_CONVEX_URL` missing in Vercel | Add it (Step 3), then **Redeploy** |
| "Create a free account" works but tasks never load | Browser can't reach backend | Verify `https://api.todo.surfbible.in` responds; check Vercel env var spelling |
| Sign-in button spins forever | Wrong `NEXT_PUBLIC_CONVEX_URL` value | Must be `https://api.todo.surfbible.in` (no trailing slash issues — copy exactly) |
| AI console says "Could not parse command" | `GEMINI_API_KEY` not set in Vercel | Add it, redeploy |
| Google button does nothing / redirect error | Step 5 not completed | Expected — Google OAuth needs the public site URL + Google client config |
| Vercel build fails on TypeScript | Stale local state | Run `npm run build` locally first; it must pass (it does on this code) |
| Old UI still shows after deploy | CDN/browser cache | Hard-refresh (Ctrl+Shift+R); confirm the latest commit SHA in Vercel → Deployments |

---

## 8. Quick reference — full command sequence

```bash
cd /home/alex/aiprojects/todo-web

# 1. (one-time) fix .gitignore, then commit + push
cat >> .gitignore << 'EOF'

# build artifacts
.next/
out/
*.tsbuildinfo
next-env.d.ts

# vercel
.vercel

# env files
.env*
EOF
git add -A && git commit -m "Add Convex Auth (Google + password), public landing page, /dashboard route"
git push origin main

# 2. Vercel Dashboard → Settings → Environment Variables:
#    NEXT_PUBLIC_CONVEX_URL = https://api.todo.surfbible.in
#    GEMINI_API_KEY         = <from your local .env.local>

# 3. Deploy: push already triggered it (or: npx vercel --prod)

# 4. Verify
curl -s https://todo.surfbible.in/ | grep -o "Create a free account"
```
