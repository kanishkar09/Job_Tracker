import { createClient } from "@supabase/supabase-js";

/* ---------------------------------------------------------------------------
   SUPABASE CONFIG  —  paste your two values below.

   Where to find them:
   Supabase dashboard → your project → Settings (gear) → API
     • "Project URL"      → SUPABASE_URL
     • "anon" "public" key → SUPABASE_ANON_KEY

   The anon key is meant to be used in browser code and is safe to commit —
   your data is protected by Row Level Security (see SUPABASE_SETUP.md).
--------------------------------------------------------------------------- */
const SUPABASE_URL = "PASTE_YOUR_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_PUBLIC_KEY_HERE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
