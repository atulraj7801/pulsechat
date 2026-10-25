# Realtime contracts

Connect with Socket.IO 4 and `{ auth: { token: accessToken } }`. Origin, JWT issuer/audience/expiry, and active session are checked. Identity always comes from the token; client user IDs are never accepted as authorization. Every event is reauthenticated and rate-limited. Token expiry disconnects the socket; the client rotates its cookie session and reconnects with a new access token.

## Client to server

Every event accepts an optional acknowledgement callback. Success is `{ok:true, ...result}`. Failure is `{ok:false, error:{code,message}}`.

| Event                     | Payload                                                                     | Result / behavior                                              |
| ------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `conversation:join`       | `{conversation_id}`                                                         | Membership check, join `conversation:<id>`, recheck membership |
| `conversation:leave`      | `{conversation_id}`                                                         | Leave the room                                                 |
| `message:send`            | `{conversation_id, body, client_message_id, reply_to_id?, attachment_ids?}` | Persist transaction first, then `{message, duplicate}`         |
| `message:typing:start`    | `{conversation_id}`                                                         | Authorized transient typing signal                             |
| `message:typing:stop`     | `{conversation_id}`                                                         | Stop signal                                                    |
| `message:read`            | `{message_id}`                                                              | Persist monotonic watermark                                    |
| `message:delivered`       | `{message_id}`                                                              | Additional client receipt acknowledgement, not persistence     |
| `message:reaction:add`    | `{message_id, emoji}`                                                       | Same service as REST                                           |
| `message:reaction:remove` | `{message_id, emoji}`                                                       | Same service as REST                                           |
| `presence:update`         | `{status}`                                                                  | online / away / busy / offline preference                      |

Limits per user/minute/event: sends and reactions 60, typing 80, presence changes 20, other events 120. Handshake packets and event buffers are bounded to 32 KiB. A conversation join cannot be used to bypass service membership checks.

## Server to client

| Event                  | Payload                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `message:new`          | Persisted, hydrated message                                    |
| `message:updated`      | Full message after edit, pin, or reaction                      |
| `message:deleted`      | Tombstone with cleared body/attachments/reactions              |
| `message:delivered`    | `{message_id, conversation_id, user_id}`                       |
| `message:read`         | `{message_id, conversation_id, user_id, created_at}` watermark |
| `user:presence`        | `{user_id, status}`                                            |
| `presence:snapshot`    | Additional initial array of current peer presence              |
| `user:typing`          | `{conversation_id, user_id, display_name, typing, expires_at}` |
| `notification:new`     | Persisted notification belonging to the recipient              |
| `conversation:updated` | `{id, deleted?}`; refetch authorized state                     |

Sockets also join `user:<id>` and `session:<id>` rooms. Durable event fan-out resolves current conversation members and sends to the union of their user rooms, which updates all tabs and prevents relying on stale room membership after removal. Room removal works across Redis-adapter instances. Logout/replay revocation disconnects the session room.

## Delivery semantics

- **Sending:** optimistic client row. The UUID retry key remains stable.
- **Sent:** PostgreSQL committed and the client obtained the persisted message through acknowledgement or an authoritative event.
- **Delivered:** at least one other authorized client acknowledged receiving the event. This is ephemeral, is not proof that a human saw the message, and may revert to “sent” after a reload.
- **Read:** at least one other member's durable watermark covers the message. The UI only advances its own watermark when the document is visible and the history is at the bottom.

The storage effect is idempotent per `(sender_id, client_message_id)`. Transport is not exactly-once. Clients may see duplicate events and must merge by server ID or retry key. Each message also has a monotonically increasing `version`; the client ignores stale versions so delayed edits or reactions cannot overwrite newer state. Update/delete events for unloaded history do not append old rows to the current page. The UI waits eight seconds for send acknowledgements; a timeout leaves an uncertain/failed row with a retry action. Retrying safely returns the already committed message when appropriate.

There is a commit-to-broadcast crash window. PostgreSQL remains authoritative. The client refetches active history and conversation/read/notification state on reconnect; query focus and a 30-second active-history interval provide additional reconciliation. Missing older messages remain available by cursor pagination. An offline outbox is in memory only and requires explicit retry; page reloads discard unsent text/outbox state.

Redis Pub/Sub adapter packets are not durable, and the standard adapter does not support Socket.IO connection-state replay. See the [official Redis adapter documentation](https://socket.io/docs/v4/redis-adapter/). This application deliberately implements recovery by reading the database. Redis outages fail protected operations closed rather than silently switching to inconsistent process-local state.

Two-instance integration tests use real Redis Pub/Sub and PostgreSQL to verify cross-node delivery, authenticated joins, retry deduplication, typing/receipts, reconnect history, revoked membership, and logout disconnection. Multi-replica HTTP polling requires sticky load balancing; use WebSocket-only transport if avoiding that requirement. Redis must remain trusted private infrastructure.
