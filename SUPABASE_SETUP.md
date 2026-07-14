# Supabase setup (one time, ~15 minutes)

This app now uses Supabase for real accounts and cloud storage. Follow these
steps once, then deploy as normal.

## 1. Create a project
1. Go to https://supabase.com and sign up (free).
2. Click **New project**. Give it a name, set a database password (save it
   somewhere), pick a region close to you, and create it.
3. Wait ~1 minute for it to finish provisioning.

## 2. Create the table + security rules
1. In the project, open **SQL Editor** (left sidebar) → **New query**.
2. Paste the SQL below and click **Run**.

```sql
-- one row per user, holding their whole applications list as JSON
create table if not exists public.trackers (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  apps       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- turn on Row Level Security so users can only touch their own row
alter table public.trackers enable row level security;

create policy "read own tracker"
  on public.trackers for select
  using (auth.uid() = user_id);

create policy "insert own tracker"
  on public.trackers for insert
  with check (auth.uid() = user_id);

create policy "update own tracker"
  on public.trackers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

## 3. Turn off email confirmation (so sign-up works instantly)
1. Left sidebar → **Authentication** → **Sign In / Providers** (or **Providers**).
2. Open the **Email** provider.
3. Turn **OFF** "Confirm email" (also called "Enable email confirmations").
4. Save.

> If you'd rather keep email confirmation ON, that's fine — after signing up,
> users must click the link in their email before they can sign in. The app
> shows a message telling them to check their inbox.

## 4. Paste your keys into the app
1. Left sidebar → **Settings** (gear) → **API**.
2. Copy the **Project URL** and the **anon / public** key.
3. Open `src/supabaseClient.js` and paste them into the two constants:

```js
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGci...your-anon-key...";
```

The anon key is designed for browser use and is safe to commit — your data is
protected by the Row Level Security policies from step 2.

## 5. Run or deploy
```bash
npm install
npm run dev      # test locally
```
Then commit and push, and Vercel will redeploy. Sign up once, then sign in from
any browser, incognito window, or device — you'll see the same list everywhere.

## Optional: add your Vercel URL to allowed redirects
Authentication → **URL Configuration** → add your Vercel domain (e.g.
`https://your-app.vercel.app`) to **Site URL** / **Redirect URLs**. This only
matters if you later add email links or password resets; basic email+password
sign-in works without it.
