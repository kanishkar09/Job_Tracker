# Job Application Tracker

A React + Vite app for tracking job applications: add/edit/delete entries,
change status inline, get follow-up reminders, and see salaries in euros.
Accounts and data are stored in **Supabase** (real email/password auth + a
cloud database), so your list syncs across every device and browser you sign
in from.

## ⚠️ First: set up Supabase
Before running or deploying, do the one-time setup in **`SUPABASE_SETUP.md`**
(create a free project, run one SQL snippet, paste two keys into
`src/supabaseClient.js`). The app won't sign in until those two keys are filled.

## Run locally

Requires Node.js 18+ (https://nodejs.org).

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173).

To make a production build:

```bash
npm run build     # outputs to /dist
npm run preview   # serve the built version locally
```

## Deploy to Vercel

This project builds with zero configuration — Vercel auto-detects Vite.

**Option A — from the dashboard (easiest)**
1. Push this project to your GitHub repo (see below).
2. In Vercel, click **Add New → Project** and import the repo.
3. Framework Preset: **Vite** (auto-detected). Build command `npm run build`,
   Output directory `dist` — these are filled in automatically.
4. Click **Deploy**.

**Option B — from the CLI**
```bash
npm i -g vercel
vercel
```

### Pushing to your GitHub repo

If your repo already has an old single `.jsx` file, replace everything with the
contents of this folder so the project structure is correct:

```bash
git init                       # skip if already a git repo
git add .
git commit -m "Deployable Vite build of Job Tracker"
git branch -M main
git remote add origin https://github.com/kanishkar09/Job_Tracker.git   # skip if already added
git push -u origin main --force   # --force only if replacing old contents
```

## Why the earlier deploy failed

The previous repo had only the component file — no `package.json`, no entry
point, and it called `window.storage`, an API that only exists inside Claude.
Vercel had nothing to build. This version adds the full Vite scaffold, real
dependencies (`react`, `react-dom`, `lucide-react`), and swaps storage to
`localStorage`, so it builds and runs anywhere.

## Project structure

```
job-tracker/
├── index.html            # HTML entry
├── package.json          # dependencies + scripts
├── vite.config.js        # Vite + React plugin
├── SUPABASE_SETUP.md     # one-time backend setup (read this first)
├── .gitignore
└── src/
    ├── main.jsx          # mounts <App/>
    ├── index.css         # minimal global reset
    ├── supabaseClient.js # paste your Supabase URL + anon key here
    └── App.jsx           # the whole app
```

## Note on security

Auth and data now live in Supabase, not the browser. Passwords are handled by
Supabase Auth (hashed server-side; never stored in your code or the browser),
and Row Level Security ensures each signed-in user can only read and write their
own applications. The `anon` key in `src/supabaseClient.js` is a public,
browser-safe key — it is not a secret and is protected by those RLS policies.
