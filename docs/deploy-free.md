# Deploy PulseChat for free

This path is for a portfolio demo or a small hobby project. It uses **Render Free** for the application, **Supabase Free** for PostgreSQL and private file storage, and **Upstash Redis Free** for presence, rate limits, caching, and Socket.IO. Pricing and limits were checked on 25 October 2026; verify the Free label in each dashboard before creating a resource. No custom domain or paid disk is required.

Free does not mean unlimited or always available. Render sleeps after 15 idle minutes and can take about a minute to wake. Supabase can pause an inactive free project after a week. Upstash has command limits, and presence heartbeats consume commands even if you are not sending messages. Close unused demo tabs and monitor usage; do not add artificial keep-alive pings. Avoid paid plans, automatic upgrades, and optional add-ons. If Render has a payment method on file, some usage overages can be billed; without a payment method, its documented behavior is to suspend affected free services/builds instead. Account verification requirements may vary.

Sources: [Render free services](https://render.com/docs/free), [Supabase pricing](https://supabase.com/pricing), [Upstash pricing](https://upstash.com/pricing/redis).

## 1. Put your code on GitHub

Create an empty GitHub repository named `pulsechat` (private is fine). Do not add a README on GitHub because this project already has one. For a folder that is not already a Git repository:

```sh
cd "/Users/atulraj/Desktop/Chat app"
git init -b main
git add .
git status --short
git commit -m "Build PulseChat with realtime messaging and cloud deployment"
git remote add origin https://github.com/YOUR_USERNAME/pulsechat.git
git push -u origin main
```

Replace `YOUR_USERNAME`. GitHub may prompt you to authenticate. If you already initialized Git or configured a remote, use that repository instead of repeating initialization or adding a duplicate remote.

Before committing, confirm that `.env`, `.local/`, `node_modules/`, and `backend/uploads/` are absent from the staged list. The supplied `.gitignore` excludes them. Never paste database passwords or API keys into source code or commit them.

## 2. Create the PostgreSQL database in Supabase

1. Sign in at [Supabase](https://supabase.com/dashboard) and create a **Free** organization/project called `pulsechat`.
2. Save its database password in your password manager. Prefer a generated long alphanumeric password to avoid URL-encoding mistakes.
3. Pick a region close to the region you will use in Render and Upstash.
4. Disable the **Data API** for this project (during creation if offered, or in Data API settings afterward). PulseChat uses its own Express API and direct SQL connection; it does not use Supabase's generated table API. This does not mean disabling Storage. Dashboard labels may move; see [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).
5. Click **Connect**, choose **Session pooler**, and copy its PostgreSQL connection string. Use port **5432**, not the transaction-pooler port 6543. Session pooling supports the persistent Node backend over IPv4. Copy the entire host and username from the dashboard rather than guessing them. [Connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres).
6. Replace `[YOUR-PASSWORD]` with the database password. If it contains reserved URL characters, percent-encode the password. Add `?sslmode=verify-full` if the URL has no query parameters; otherwise set its existing `sslmode` to `verify-full`. Keep certificate verification enabled.

The result becomes your Render `DATABASE_URL`. Example shape only:

```text
postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@YOUR_POOLER_HOST:5432/postgres?sslmode=verify-full
```

Do not put your local `localhost` database URL into Render. This creates a fresh cloud database; your local accounts/messages stay local. Migrations run automatically when the Render service starts. Migration 003 also enables row-level security without public policies on PulseChat tables, while the table-owning backend connection continues to enforce application authorization. Do not add public table policies.

## 3. Set up private attachment storage in Supabase

1. In the same project, open **Storage → New bucket**.
2. Name it exactly `pulsechat-files`.
3. Keep **Public bucket OFF**. Set the maximum file size to **10 MB** (10,485,760 bytes if the dashboard accepts bytes).
4. Optionally restrict MIME types to `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `application/pdf`, and `text/plain`.
5. Copy the project URL (`https://PROJECT_REF.supabase.co`) and the server-side **service_role** key from the project's API Keys settings, usually under legacy keys. This key is privileged: put it only in Render's backend environment, never in `VITE_*`, React code, screenshots, or GitHub. The adapter also accepts Supabase server secret keys when provided by the project.

No anonymous storage policies are needed. Express validates file contents and conversation membership, then accesses the private bucket with the server credential. Download links still go through Express and recheck membership. This uses Supabase Storage only; PulseChat retains its own registration, passwords, JWTs, and sessions. [Private bucket documentation](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## 4. Create Redis in Upstash

1. Sign in at [Upstash](https://console.upstash.com) and create a Redis database named `pulsechat`.
2. Choose **Free**, not Pay as You Go. Select a nearby region.
3. Open **Connect → TCP** and copy the TLS connection URL beginning with `rediss://`.
4. Save it as `REDIS_URL` in Render. Do **not** copy the REST `https://` endpoint or a REST token into this field.

The shape is `rediss://default:PASSWORD@HOST:6379`. The existing ioredis client uses the standard Redis protocol, including Pub/Sub. [Upstash Express instructions](https://upstash.com/docs/redis/quickstarts/express).

## 5. Generate production signing secrets

Run locally:

```sh
node scripts/deployment-secrets.js
```

Copy the two generated values into Render as `JWT_SECRET` and `UPLOAD_SECRET`. They must be different. This command does not change your local `.env`. Do not post its output publicly. Keep the same production secrets across routine redeploys; regenerating them invalidates sessions/file tickets.

## 6. Create one Render web service

In [Render](https://dashboard.render.com), choose **New → Web Service**, connect GitHub, and select your `pulsechat` repository.

| Setting           | Value                                            |
| ----------------- | ------------------------------------------------ |
| Name              | An available name such as `pulsechat-yourname`   |
| Language/runtime  | **Node**                                         |
| Branch            | `main`, or your actual deployment branch         |
| Root directory    | Leave empty — use the repository root            |
| Build command     | `npm ci --include=dev && npm run build`          |
| Start command     | `npm run db:migrate && npm run start -w backend` |
| Instance type     | **Free**                                         |
| Health check path | `/ready`                                         |

Choose **Node**, not Docker, for this guide. Docker remains available for local infrastructure; you do not need to install it to follow this hosting path. The frontend build is served by Express, so you do not create a second frontend service or use `npm run dev` on Render. [Render's Node deployment guide](https://render.com/docs/deploy-node-express-app).

Add these environment variables:

| Name                        | Value                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `NODE_ENV`                  | `production`                                                                           |
| `NODE_VERSION`              | `22`                                                                                   |
| `SERVE_FRONTEND`            | `true`                                                                                 |
| `DATABASE_URL`              | Supabase session-pooler URL from step 2                                                |
| `REDIS_URL`                 | Upstash **TCP TLS** URL from step 4                                                    |
| `JWT_SECRET`                | First generated secret                                                                 |
| `UPLOAD_SECRET`             | Second generated secret                                                                |
| `CORS_ORIGIN`               | Your exact Render URL, e.g. `https://pulsechat-yourname.onrender.com` — no final slash |
| `COOKIE_SECURE`             | `true`                                                                                 |
| `TRUST_PROXY`               | `1` for this direct Render-to-Express setup                                            |
| `STORAGE_DRIVER`            | `supabase`                                                                             |
| `SUPABASE_URL`              | Your Supabase project URL                                                              |
| `SUPABASE_SERVICE_ROLE_KEY` | Your server-only Supabase key                                                          |
| `SUPABASE_STORAGE_BUCKET`   | `pulsechat-files`                                                                      |
| `LOG_LEVEL`                 | `info`                                                                                 |

Let Render supply `PORT`. Do not add `SEED_PASSWORD` or run the demo seed in the live database. If the exact Render URL is only shown after creation, update `CORS_ORIGIN` to that URL and redeploy before trying registration/login. Render may assign a suffix when the name is taken, so copy the actual URL.

Click **Deploy Web Service**. Wait for the build, migrations, and “PulseChat API ready” log, and for the service to become Live. No cloud credentials are needed in the frontend build.

## 7. Check that deployment really works

1. Open `https://YOUR-SERVICE.onrender.com/health`: expect `{"status":"ok","service":"pulsechat"}`.
2. Open `/ready`: expect `{"status":"ready"}`. This checks PostgreSQL and Redis.
3. Open the main URL and register a real account. The cloud database is empty; local demo credentials will not work.
4. Create a public channel named `general`.
5. Open an incognito window or another browser and register a second test account.
6. Send messages in both directions. Check typing, reactions, replies, and read receipts.
7. Refresh both pages. Confirm messages remain and login refresh works.
8. Upload a small image and download it from the other account.
9. Redeploy the same commit from Render's dashboard. Verify the message and attachment remain available afterward.
10. Sign out and sign back in. Test the layout on your phone using the public URL.

In Supabase, open **Table Editor → public → messages** to inspect live rows. PulseChat users live in `public.users`, not the Supabase Auth users screen. In Storage, the private bucket contains UUID-named files. Upstash shows Redis usage and temporary state. Your local inspectors still point at your local `.env`, not the cloud database.

## 8. Update it later

After changing code locally and running your checks:

```sh
git add .
git commit -m "Describe your change"
git push
```

Render can automatically rebuild the linked branch. Database migrations run at service startup. Do not edit already-applied migrations; add a new migration. Keep production backups before changes that could remove or transform data. Supabase's Free plan does not include the Pro plan's daily backup feature, so export valuable data yourself.

## Troubleshooting

| Symptom                                                      | Check                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| First visit is slow                                          | Render may be waking from sleep; wait about a minute.                                                                                            |
| “Origin is not allowed”                                      | `CORS_ORIGIN` must exactly match the live HTTPS URL.                                                                                             |
| `ENETUNREACH` for PostgreSQL                                 | Use the copied IPv4 Session pooler endpoint, not the IPv6 direct database endpoint.                                                              |
| Database authentication fails                                | Check the pooler username, password, and URL encoding.                                                                                           |
| Certificate verification fails                               | Check the host and Supabase SSL certificate instructions. Add the provider's trusted CA if required; never use `NODE_TLS_REJECT_UNAUTHORIZED=0`. |
| Redis connection fails                                       | Use `rediss://` TCP connection credentials, not REST credentials; check the free quota.                                                          |
| Upload/download fails                                        | Check the private bucket name, storage key, file limit, and Supabase quota.                                                                      |
| Frontend build is missing                                    | Use the repository root and the exact build command above; set `SERVE_FRONTEND=true`.                                                            |
| “Permission denied” or empty results after changing DB roles | The runtime uses the migration/table-owning role. A non-owner role needs a deliberate RLS/grant design before switching.                         |

This remains a single shared workspace with public registration, not a private multi-tenant service. Add invitations before using it for a private company. Uploaded files are validated but not malware-scanned. Free tiers are suitable for demonstrating the project, not a promise of always-on service, unlimited storage, or production uptime.

## What has been prepared and tested

The repository now supports `SERVE_FRONTEND=true`, local or Supabase file storage, private backend-mediated downloads, remote orphan cleanup, and a migration protecting application tables from direct public-role access. Local HTTP contract tests exercise the real Supabase SDK against a controlled storage server, and API/socket tests still use real local PostgreSQL and Redis. A live Render/Supabase/Upstash deployment has **not** been performed; its credentials and accounts must be configured by you. The cloud smoke checks above are required after deployment.
