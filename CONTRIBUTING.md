# Contributing to PulseChat

1. Use Node 22.12+ and install with `npm ci`.
2. Run `npm run setup`, start PostgreSQL/Redis, and follow the README migration instructions.
3. Work in JavaScript ES modules. Do not introduce TypeScript or mixed CommonJS modules.
4. Keep HTTP/socket handlers thin. Share business services between both transports; place database queries in repositories/data-access modules.
5. Validate all inputs, derive identity from the verified session, and authorize conversation membership before protected operations.
6. Commit persistence before emitting events. Keep retry keys stable across retries. Do not weaken ownership, replay detection, or authorization to make tests pass.
7. Update API/realtime documentation when changing contracts. Add a new migration rather than editing an already-deployed migration.
8. Run `npm run format`, `npm run verify`, and the Compose smoke check before proposing a deployment.

Tests require a disposable database ending in `_test` and dedicated Redis database 15. Unit tests can run without infrastructure. Add regression tests for security, ordering, retry, and concurrency behavior rather than implementation-mirroring assertions.

Keep demo data inside the explicit seed. Never put credentials or real message content in fixtures, logs, screenshots, or commits. Describe the problem, behavior change, relevant validation, and limitations in a pull request. Avoid unrelated formatting churn.
