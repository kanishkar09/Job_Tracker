# Job Application Tracker

A single-file React app for tracking job applications, built to match the
spreadsheet layout and grow from it.

## Files
- `JobTracker.jsx` — the entire app (component, styles, and logic in one file).

## Features
- **Applications table** — company, position, salary, location, date applied,
  method, status, job link, and notes.
- **Add / edit / delete** applications through a form.
- **Inline status dropdown** — change an application's status right in the row.
- **Reminders** — from the date applied: review at week 1, follow up at week 2,
  re-send the follow-up at week 3. Due items appear in a panel with a header
  count. Follow-up reminders can generate a ready-to-copy message.
- **Per-user lists** — each person signs in with a name; lists are kept separate.
- **Password lock** — each name is protected by a password (stored hashed,
  SHA-256 + random salt). The password is required every time the app loads.
- **Euros (€)** salary formatting.
- **Auto-save** — data persists between sessions via the artifact storage API.

## Data model (per user, stored under `user:<key>`)
```
{ name, apps: [ { id, company, position, salary, location, listing,
                  date, method, status, notes, done: {review, follow1, follow2} } ],
  pass: { salt, hash } }
```
Support keys: `userList` (known accounts) and `activeUser` (last name, for prefill).

## Important: security limitation
This runs entirely in the browser with no server, so the password is a
**lightweight lock, not real authentication**. The stored data and the password
hash live in the same browser storage the app reads, so a technically-minded
person could open dev tools and read the applications without the password.
It prevents casual access between people sharing the app; it does **not** protect
truly sensitive data.

For real accounts (server-checked passwords, private data, multi-device access),
move authentication and storage to a backend — e.g. Supabase/Firebase auth, or a
custom API with a database.

## Running it
It's designed to run as a Claude artifact (uses the artifact `window.storage`
API and Tailwind-free inline styles). To use elsewhere, drop `JobTracker.jsx`
into a React project and replace the `window.storage` calls with your own
storage layer (e.g. `localStorage` or an API).
