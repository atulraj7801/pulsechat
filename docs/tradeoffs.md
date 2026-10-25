# Tradeoffs and next improvements

## Chosen deliberately

- **One workspace, modular monolith.** All registered users belong to the same organization directory. Conversation membership is the security boundary. Multi-tenant organizations require tenant IDs and tenant-scoped constraints/queries before exposing the service to unrelated organizations.
- **Objection.js + Knex.** JavaScript models and explicit SQL fit the requested ES-module stack. Controllers and transport validation remain separate from transactional services. Query repositories avoid generated-client requirements and make locking/cursor behavior inspectable.
- **Per-conversation write serialization.** Row locks coordinate sends with membership changes. This favors correctness and understandable transactions; high-volume broadcast channels may need a less serialized design and measured contention profiling.
- **Database recovery, transient transport.** Message storage is idempotent, but realtime delivery is at-most-once per Pub/Sub packet. Refetch recovers durable state. A transactional outbox with a dispatcher is the next step if immediate delivery across process crashes needs stronger guarantees.
- **Local or private cloud uploads.** Signed ticket flows, byte/MIME validation, ownership, and authorization work locally without cloud credentials. An optional Supabase adapter preserves files on ephemeral hosting. Local storage requires a shared filesystem when scaling; no malware scanner or media re-encoder is included. Downloads are buffered and proxied through Express, which adds app bandwidth and memory costs. Raster previews are supported, and arbitrary active content is not served inline.
- **Plain text messages.** React escapes text. There is no HTML/Markdown renderer, link unfurling, or rich text editor, keeping the content execution surface small.
- **Simple presence and receipts.** Presence uses socket heartbeats and TTLs and may be stale for about 100 seconds after a process/network loss. Delivery is ephemeral; read watermarks are durable. “Read” means at least one other member, not all members.
- **Cursor-based history, bounded auxiliary lists.** History is paginated with an index. Search returns 50 matches, files/pins 50, notifications 100. Conversations and member lists are currently unpaginated. Long histories are not virtualized, so very large loaded histories need windowing.
- **Notification scope.** Activity is in-app only. Mutes suppress new activity records, not chat events. No browser push, email, mobile push, or notification preferences per keyword are implemented.
- **Security scope.** Passwords are hashed, refresh tokens rotate, session revocation is checked per request/event, writes are validated, and conversation permissions are enforced. This is not end-to-end encryption. Email ownership verification, recovery flows, MFA, and external identity providers are future work.
- **Browser refresh coordination.** Web Locks serialize refresh rotation across modern tabs. In older browsers without Web Locks, concurrent rotations can trigger replay revocation and require sign-in again. Reloading drops unsent in-memory drafts/outbox messages; durable local offline queues are not implemented.
- **Operational scope.** Health/readiness, logs, cleanup, containers, and CI are included. Metrics, tracing, alerting, load tests, restore drills, key rotation automation, and deployment-specific TLS/secret management remain environment responsibilities.

## Suggested next increments

1. Transactional outbox and retrying event dispatcher, extending the existing per-message version checks with durable event replay.
2. Generic S3 support, quarantine, antivirus scanning, image re-encoding, per-user storage quotas, and streaming downloads.
3. Email verification/password recovery, session-management UI, MFA/SSO, and abuse controls.
4. Tenant/workspace model with invitation-based enrollment and tenant isolation tests.
5. Message virtualization, conversation/member pagination, paginated full-text search, and deep links to historical message context.
6. OpenTelemetry metrics/traces, reproducible load tests, documented backup/restore drills, and tested zero-downtime migration strategy.

## Verification boundary

Automated tests verify actual SQL transactions and Redis-adapter behavior. Browser checks exercise the running client. Docker was absent on the authoring host, so Compose startup is covered by a supplied CI job but remains unexecuted locally. No claim of production load capacity, third-party penetration testing, or successful hosted deployment is made.
