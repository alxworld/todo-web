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
Google OAuth redirects the user's browser through the Convex backend's **site URL**,
which is currently `http://127.0.0.1:3211` — unreachable for end users.

**Your stack (verified):** Ubuntu + nginx/1.24 + docker-compose Convex backend on
`144.24.103.171`; `api.todo.surfbible.in` already proxies to the API port `3210`.

`SITE_URL` has **already been set** to `https://todo.surfbible.in` on the backend ✅
(this is where users land after Google sign-in).

### 5a. DNS (in your surfbible.in DNS provider)

Create an **A record**: `site.todo.surfbible.in` → `144.24.103.171` (same server as
`api.todo.surfbible.in`).

### 5b. nginx — proxy the site port (SSH to your server)

```bash
ssh <your-user>@144.24.103.171
```

Create `/etc/nginx/sites-available/convex-site`:

```nginx
server {
    listen 80;
    server_name site.todo.surfbible.in;

    location / {
        proxy_pass http://127.0.0.1:3211;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it and get a TLS certificate (same pattern you used for `api.todo.surfbible.in`):

```bash
sudo ln -s /etc/nginx/sites-available/convex-site /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d site.todo.surfbible.in
```

### 5c. Tell the backend its public site origin

In the `.env` file **beside your `docker-compose.yml`** on the server (per the official
self-hosting docs), add:

```bash
# URL of Convex HTTP actions as accessed by end users' browsers
CONVEX_SITE_ORIGIN='https://site.todo.surfbible.in'
# Should already exist — if not, add it too:
CONVEX_CLOUD_ORIGIN='https://api.todo.surfbible.in'
```

Recreate the backend:

```bash
docker compose up -d
```

> Note: the JWT issuer changes from `http://127.0.0.1:3211` to
> `https://site.todo.surfbible.in` — existing sessions are invalidated, so users
> (you) simply sign in again.

### 5d. Verify from your local machine

```bash
# Must return HTTP 200 with a {"keys":[...]} body:
curl -s https://site.todo.surfbible.in/.well-known/jwks.json

# Must show issuer = https://site.todo.surfbible.in:
curl -s https://site.todo.surfbible.in/.well-known/openid-configuration | grep issuer
```

### 5e. Google Cloud OAuth client

[Google Auth Platform console](https://console.cloud.google.com/auth/overview) → your
project → **Clients → Create client** (Web application):

- **Authorized JavaScript origins:** `https://todo.surfbible.in`
- **Authorized redirect URIs:** `https://site.todo.surfbible.in/api/auth/callback/google`

Then from the project root:

```bash
npx convex env set AUTH_GOOGLE_ID <your-client-id>
npx convex env set AUTH_GOOGLE_SECRET <your-client-secret>
```

### 5f. Update Vercel env var

Vercel Dashboard → Settings → Environment Variables:

- `NEXT_PUBLIC_CONVEX_SITE_URL` = `https://site.todo.surfbible.in` → then **Redeploy**

### 5g. Test

Incognito window → `https://todo.surfbible.in/signin` → **Continue with Google** →
Google consent → lands back on `https://todo.surfbible.in/dashboard`, signed in.

Until this step is done, the email/password path fully covers registration.

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
