# Job Application Tracker

A React + Vite app for tracking job applications: add/edit/delete entries,
change status inline, get follow-up reminders, keep separate password-protected
lists per person, and see salaries in euros. Data is saved in the browser via
`localStorage`.

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
├── .gitignore
└── src/
    ├── main.jsx          # mounts <App/>
    ├── index.css         # minimal global reset
    └── App.jsx           # the whole app (with a localStorage adapter at the top)
```

## Note on the password

The password is a client-side lock, not real authentication. The data and the
(hashed) password live in the same browser storage the app reads, so a
technical person could read entries via browser dev tools without the password.
It keeps casual users out; it does not protect truly sensitive data. Real
verification would require a backend (e.g. Supabase/Firebase auth or a custom
API with a database).
