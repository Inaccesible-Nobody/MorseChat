# Signal / Morse Trainer — prototype 0.1

A desktop-first Morse practice prototype built with plain HTML, CSS and JavaScript.

## Run it
Open `index.html` in a browser, or use VS Code with the Live Server extension.

## Keyboard controls
- `J` — add a dit
- `K` — add a dah
- `Space` — manually commit the current character
- `Backspace` — undo the most recent element or decoded character
- `I` — clear the current message
- `Enter` — check the phrase

## Included in this prototype
- Send and Receive practice modes, including unlimited receive-audio replay
- Synthesized CW audio
- Adjustable WPM and word-gap threshold
- Morse reference chart
- Translator with audio playback
- Default, Community and My Dictionary tabs
- Add private or community phrases
- Local practice history and basic accuracy stats
- Browser localStorage persistence

## Timing note
The trainer auto-commits a character after 3 units of silence and inserts a word boundary at the selected 5–7 unit threshold. Space can manually commit a character sooner. The default word gap is 5 units, as agreed for beginner practice.

## Current limitation
This is the frontend/local prototype. Dictionary entries and progress are stored in the current browser using localStorage. Community phrases are not actually shared between users yet. Supabase authentication, database persistence, cross-device sync and multiplayer chat are the next integration stage. Do not treat the local Community tab as a live shared database.

## Suggested next build step
Connect Supabase and move phrase storage and user progress from localStorage into database tables, while retaining local guest practice.

## Morse Chat setup

Morse Chat uses Supabase Auth, Postgres and Realtime. The chat screen is in place, but sign-in and shared rooms stay unavailable until a Supabase project is configured.

1. In `supabase-config.js`, set `url` to your project URL and `publishableKey` to the project's publishable key. Never use a secret or `service_role` key in browser code.
2. Run `supabase/schema.sql` in the Supabase SQL Editor. It creates room/member/message tables, the create/join-by-code functions, row-level security policies and the Realtime publication entry.
3. Enable Google under Supabase Authentication providers. Add the Supabase callback URL shown on that provider settings page to the Google OAuth client's authorized redirect URIs.
4. Add the app origin to Supabase Authentication URL Configuration and allowed redirect URLs. Run the app through a local web server (such as VS Code Live Server); OAuth does not work from `file://`.

Chat messages are stored as Morse only. Each user's incoming display preference (text or Morse) is stored in that user's chat settings. Supabase Auth persists and refreshes browser sessions, so users remain signed in until they sign out or their session expires.

The schema also enables Supabase Cron and schedules a database deletion every minute for Morse messages older than 24 hours. Rerun the updated schema after code changes so the room rename RPC and retention job are installed; the rooms themselves are retained.
