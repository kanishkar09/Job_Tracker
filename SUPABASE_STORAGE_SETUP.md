# Supabase Storage setup — file uploads (one time, ~5 minutes)

The app now lets you attach a **tailored résumé** and a **tailored cover letter**
to each application. Those files live in **Supabase Storage** (not the database),
so you need one small one-time setup, similar to `SUPABASE_SETUP.md`.

Files are stored privately at the path `documents/<your-user-id>/<app-id>/<file>`
and are only ever opened through short-lived signed URLs, so no one else can read
them.

## 1. Create the storage bucket
1. In your Supabase project, open **Storage** (left sidebar) → **New bucket**.
2. Name it exactly **`documents`**.
3. Leave **Public bucket** turned **OFF** (it must stay private).
4. (Optional) Set **File size limit** to `10 MB` and **Allowed MIME types** to:
   `application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document`
5. Create it.

## 2. Add the access rules (Row Level Security)
1. Open **SQL Editor** → **New query**.
2. Paste the SQL below and click **Run**. It lets each signed-in user read and
   write only the files inside their own folder.

```sql
-- each user may only touch files whose first folder matches their user id:
--   documents/<user_id>/<app_id>/<file>
create policy "read own documents"
  on storage.objects for select
  using ( bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text );

create policy "upload own documents"
  on storage.objects for insert
  with check ( bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text );

create policy "update own documents"
  on storage.objects for update
  using ( bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text );

create policy "delete own documents"
  on storage.objects for delete
  using ( bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text );
```

> If a policy with the same name already exists, run
> `drop policy "read own documents" on storage.objects;` (and so on) first, then re-run.

## 3. Use it
That's all — no code changes needed. Open **Add application** (or edit an existing
one), scroll to **Tailored documents**, and upload a PDF or Word file for the
résumé and/or cover letter. They'll show as clickable chips in the **Docs** column
and open in a new tab. Deleting an application also deletes its files.
