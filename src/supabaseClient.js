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
const SUPABASE_URL = "https://qqfsuervskcxwswajbul.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TAEMO7_WtvDuuxNVs_YndQ_hiWf5KDJ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
