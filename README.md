# Frequency

A private chat + video-call app for the Dalton community. Everyone with an
`@dalton.org` Google account is connected automatically; anyone else connects
by request. Messages and images clear after 3 days.

## How it's built

The site is a **static Next.js export hosted on GitHub Pages** — there's no app
server. Everything that needs one lives elsewhere:

| Piece | Where it runs |
| --- | --- |
| Pages, UI, sign-in flow | Static files on GitHub Pages (`.github/workflows/pages.yml`) |
| Accounts, database, access rules, live updates | Supabase (Auth, Postgres + RLS, Realtime) |
| 3-day message purge | `pg_cron` job inside Supabase (`supabase/features.sql`) |
| TURN credentials for calls | Supabase Edge Function `turn` (`supabase/functions/turn`) |
| Deleting expired image files | GitHub Action every 6h (`.github/workflows/cleanup.yml`) |

All access control is enforced by Postgres row-level security, so the browser
never gets more than it's allowed to see.

## Local development

```bash
cp .env.local.example .env.local   # fill in your Supabase URL + publishable key
npm install
npm run dev                        # http://localhost:3000
```

## Supabase setup (once per project)

1. **SQL** — in Supabase → SQL Editor, run these in order (all are safe to re-run):
   `supabase/schema.sql`, `supabase/messaging.sql`, `supabase/features.sql`.
   `features.sql` makes `c28aa1@dalton.org` an admin — change it for your own.
2. **Google sign-in** — Authentication → Sign In / Providers → Google.
3. **Redirect URLs** — Authentication → URL Configuration: set the Site URL to
   your Pages URL and add `http://localhost:3000/**` and
   `https://<user>.github.io/<repo>/**` to Redirect URLs.
4. **TURN function** (optional — without it calls only work on the same network):
   ```bash
   npx supabase login
   npx supabase functions deploy turn --no-verify-jwt --project-ref <ref>
   npx supabase secrets set METERED_API_KEY=... METERED_TURN_DOMAIN=... --project-ref <ref>
   ```

## GitHub setup

Settings → Secrets and variables → Actions:

- **Variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (public values; they end up in the browser bundle anyway).
- **Secret:** `SUPABASE_SERVICE_ROLE_KEY` (the `sb_secret_...` key) for the image cleanup.

Settings → Pages → Source: **GitHub Actions**. Every push to `main` deploys.
