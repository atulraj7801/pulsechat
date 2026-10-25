# Verification record

Verified locally on 25 October 2026 with Node.js 26, PostgreSQL 17.6, and Redis 7.4.7. The development application uses persistent PostgreSQL and Redis processes; tests use a separate `pulsechat_test` database and Redis database 15.

## Automated checks

`npm run verify` completed successfully:

| Check                                  | Result    |
| -------------------------------------- | --------- |
| ESLint, including React hooks          | Passed    |
| Frontend component/state tests         | 5 passed  |
| Backend validation tests               | 3 passed  |
| Deployment/storage contract tests      | 4 passed  |
| API integration tests                  | 11 passed |
| Socket integration tests               | 8 passed  |
| Upload integration tests               | 2 passed  |
| Vite production build                  | Passed    |
| Native JavaScript backend syntax build | Passed    |

Total: **33 passing tests**. Integration tests use actual PostgreSQL transactions and Redis, including two independent Socket.IO server instances with the Redis adapter. They cover registration/login, invalid credentials, refresh rotation and replay revocation, membership authorization, concurrent retry deduplication, cursor pagination, editing/deletion, reactions, search isolation, read receipts, origin enforcement, rate limits, health/readiness, socket authentication and joining, typing isolation, delivery acknowledgements, reconnect history recovery, removed-member isolation, logout disconnection, file validation, and authorized signed downloads. A temporary non-owner PostgreSQL role verifies that RLS hides application records from direct public-style access; its role/grants are rolled back.

Deployment tests check SPA deep links, asset serving, and API fallback isolation, plus the real Supabase SDK's upload/download/list/delete requests against a controlled local HTTP server. Cloud provider accounts and credentials are not mocked into a claim of live deployment: the actual hosted Supabase/Render/Upstash configuration remains unverified until the deployment walkthrough's smoke checks are run.

A temporary local server with `SERVE_FRONTEND=true` also passed checks for readiness, an SPA deep link, a real compiled JavaScript asset, and an unauthenticated API response remaining JSON rather than falling through to HTML. That temporary server was stopped after checking.

`npm audit` reported **zero known vulnerabilities** for the installed dependency tree at verification time. This is a dependency advisory check, not a penetration test or a container-image scan.

The read-only `db:inspect`, `db:inspect -- messages`, and `redis:inspect` commands were exercised against the running development services. All three migrations are applied. Compose and GitHub Actions YAML parse successfully.

## Browser checks

The running React client was reviewed at desktop (1440 × 900) and mobile (390 × 844) sizes. Checks included signing in, creating a public channel, sending a message and seeing its persisted sent state, finding that message through search, mobile navigation and details, profile settings, and light/dark themes. Automated tests additionally exercise refresh, logout, and reconnection behavior. Browser screenshots are stored in `docs/screenshots/`.

## Not verified here

Docker is not installed on the authoring host, so **Docker image builds and Compose startup were not executed locally**. A separate CI job supplies the build/startup/readiness smoke check, but that remote job has not been run from this workspace. Run the documented Compose commands on a Docker-enabled machine before treating the containers as verified.

No hosted deployment, production-scale load test, external security audit, backup restoration drill, or cross-browser accessibility certification was performed. See [tradeoffs](tradeoffs.md) for the explicit product and operational limits.
