# PulseChat

**A little more connected.** A team chat application built entirely in JavaScript, with a React interface and a modular Express backend. PostgreSQL owns durable state. Redis powers shared rate limits, presence, profile caching, and Socket.IO fan-out.

## What you can do

- Register, sign in, refresh a session, edit your profile/avatar/status, and sign out.
- Create direct conversations, groups, public channels, and private channels; discover public channels and manage members with owner/admin authorization.
- Send realtime messages with optimistic feedback, safe retries, history pagination, typing indicators, presence, and sent/delivered/read states.
- Edit/delete messages, reply, react, pin messages, search authorized history, mute notifications, and view activity.
- Upload images, PDFs, and text files; preview images and download files through short-lived, membership-checked links.
- Use light/dark themes, mobile navigation, keyboard shortcuts, skeletons, empty/error states, and offline/reconnecting indicators.

## Prerequisites

- Node.js **22.12+** and npm **10+** (Node 22 LTS recommended).
- Docker Engine/Desktop with the Docker Compose plugin for the standard setup.
- Ports 5432, 6379, 4000, and 5173 available for development, or 8080 for the full container stack.

## Run locally

From the repository root:

```sh
npm ci
npm run setup
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev
```

Open [PulseChat](http://localhost:5173). The seed command is optional and idempotent. It creates six demonstration accounts and a populated workspace; it never runs automatically.

**Demo login:** `alex@pulsechat.demo`, using `SEED_PASSWORD` in `.env` (the example value is `PulseChat-demo-2026!`). Other demo usernames are `maya`, `jordan`, `olivia`, `noah`, and `sophie`, at the same domain. These credentials are for local demonstration only. A fresh registration automatically joins `general` if that public channel exists; otherwise create or discover a channel.

`npm run setup` creates `.env` from `.env.example` with cryptographically random signing secrets and refuses to overwrite an existing file. If you copy the example manually, replace both secrets. Access tokens live only in browser memory; refresh tokens live in HTTP-only cookies.

## Run the entire application in Docker

```sh
node scripts/setup-env.js
docker compose config --quiet
docker compose up --build --wait
```

Open [the containerized frontend](http://localhost:8080). The backend runs migrations before listening. PostgreSQL, Redis, and uploaded files use named volumes. Only the frontend and loopback-bound infrastructure ports are published; the API is reached through Nginx.

Optional demo data for this local container deployment:

```sh
docker compose exec -e ALLOW_PRODUCTION_SEED=true backend npm run db:seed
```

The container uses `NODE_ENV=production`, so seeding requires that explicit opt-in. Never seed an actual production installation. `docker compose down` preserves data; adding `-v` destroys the named volumes.

## Test and build

Create a dedicated test database once after starting the infrastructure:

```sh
docker compose exec postgres createdb -U pulsechat pulsechat_test
npm run lint
npm test
npm run test:integration
npm run build
# All of the above:
npm run verify
```

If the test database already exists, skip `createdb`. Tests use `postgresql://pulsechat:pulsechat_local@127.0.0.1:5432/pulsechat_test` and Redis database **15** by default. Override with `TEST_DATABASE_URL` and `TEST_REDIS_URL`. The database name must end in `_test`, and Redis must use `/15`: tests truncate their database and clear only the `pulse:*` keys in that Redis database. Never point tests at valuable data.

- `npm test`: frontend and backend unit/component tests.
- `npm run test:integration`: Supertest and Socket.IO tests using **real PostgreSQL and Redis**. No persistence or adapter mocks.
- `npm run build`: Vite production build and recursive native-ESM backend syntax validation. The backend runs directly from JavaScript; no transpilation is required.
- `npm run format`: Prettier; `npm run lint`: ESLint including React hook rules.

Integration coverage includes password hashing, invalid authentication, refresh rotation/replay, session logout, conversation authorization, concurrent idempotency, cursor pagination, edits/deletion, reactions, search isolation, read receipts, MIME spoofing, signed downloads, socket handshake/room authorization, and cross-instance delivery/reconnect behavior. CI also includes a separate Compose build/startup job.

## Development without Docker

You may instead supply PostgreSQL 17 and Redis 7 URLs in `.env`. An optional local-only helper, `node scripts/local-infra.js`, starts the installed `embedded-postgres` development dependency and a Redis binary specified with `REDIS_BINARY`. It stores its data in ignored `.local/`; it is not used by the application or production containers. The development environment used to build this project lacked Docker, so this helper was used to verify the application against actual PostgreSQL and Redis.

On the current machine, the Redis binary is already available under `.local/redis-7.4.7/src/`. If the local services have stopped, restart them in one terminal with `node scripts/local-infra.js`, then run `npm run dev` in another. Do not start a second infrastructure process while ports 5432 and 6379 are already in use. After changing migrations, run `npm run db:migrate` before starting the application.

## Configuration

| Variable        | Purpose                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`  | PostgreSQL connection string                                                                 |
| `REDIS_URL`     | Redis URL; use private infrastructure and TLS/auth where applicable                          |
| `JWT_SECRET`    | Independent random secret, at least 32 characters                                            |
| `UPLOAD_SECRET` | Separate random signing secret for file tickets                                              |
| `CORS_ORIGIN`   | Comma-separated exact browser origins                                                        |
| `COOKIE_SECURE` | `true` behind HTTPS; `false` only for local HTTP                                             |
| `TRUST_PROXY`   | Number of trusted reverse-proxy hops; default 0, Compose 1                                   |
| `UPLOAD_DIR`    | Durable local/shared upload directory, relative to backend working directory unless absolute |
| `LOG_LEVEL`     | Pino level, such as `info`                                                                   |
| `SEED_PASSWORD` | Password for explicitly seeded demo accounts                                                 |

Production: configure an HTTPS ingress, exact production origin, `COOKIE_SECURE=true`, independent secrets, managed backups, least-privilege database credentials, and restricted Redis access. All replicas need shared upload storage with the current local-storage adapter. HTTP polling needs sticky routing when scaling Socket.IO; WebSocket-only deployments can omit sticky sessions. See the architecture and tradeoffs documents before deploying multiple instances.

## Project map

```text
frontend/src/
  components/     common UI, layout, chat, conversations, users
  features/       auth forms, query boundaries, notifications, search
  hooks/          realtime lifecycle
  pages/          auth, workspace, 404
  services/       HTTP and Socket.IO clients
  stores/         authentication, UI, realtime/outbox state
  lib/            TanStack Query configuration
  routes/         application routing
  utils/          display helpers
backend/src/
  config/         validated environment, Redis, structured logger
  controllers/    thin HTTP handlers
  routes/         endpoints, schemas, middleware composition
  services/       transactional business rules
  repositories/   database queries and data access
  models/         Objection.js models
  middleware/     auth, validation, rate limits, errors
  sockets/        authenticated Socket.IO boundary
  jobs/           periodic cleanup
  database/       connection, migrations, explicit seed
  utils/          cursor encoding and application errors
```

## Documentation

- [Free deployment walkthrough](docs/deploy-free.md) — Render + Supabase + Upstash, including exact dashboard settings and cloud file storage.
- [Hands-on database and Redis guide](docs/database-guide.md) — inspect tables, follow a message, understand read receipts and sessions.
- [Architecture](docs/architecture.md)
- [REST API](docs/api.md)
- [Realtime events and delivery guarantees](docs/realtime-events.md)
- [Tradeoffs and next improvements](docs/tradeoffs.md)
- [Verification record](docs/verification.md)
- [Contributing](CONTRIBUTING.md)

## Current limits

This is a single-workspace modular monolith, not a multi-tenant SaaS. Email verification, password recovery, malware scanning, end-to-end encryption, and push/email notifications are not included. File storage supports local volumes or a private Supabase bucket; a generic S3 adapter is not included. Delivery acknowledgements are ephemeral; durable read watermarks survive reconnects. A committed message can miss its immediate broadcast if a process crashes at that boundary; reconnect/focus and periodic history refetch reconcile it. There is no durable background outbox or exactly-once transport claim.

Docker configuration and a startup-verification CI job are provided, but Docker startup was **not executed on the authoring machine**, because Docker was unavailable. See [verification](docs/verification.md) for precisely what was run.
