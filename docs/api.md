# REST API

JSON is used unless an endpoint explicitly transfers bytes. All protected requests use `Authorization: Bearer <access_token>`. Errors have `{ "error": { "code", "message", "fields"?, "request_id"? } }`. UUID route parameters and all structured inputs are runtime validated. Unknown write-body fields are rejected. Dates are ISO 8601 strings.

## Authentication

| Method and path           | Request / behavior                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| POST `/api/auth/register` | `{email, username, display_name, password}` → 201 `{user, access_token}` + refresh cookie |
| POST `/api/auth/login`    | `{email, password}` → `{user, access_token}` + refresh cookie                             |
| POST `/api/auth/refresh`  | Refresh cookie → rotated cookie + `{user, access_token}`                                  |
| POST `/api/auth/logout`   | Refresh cookie → revoke session, clear cookie, 204                                        |
| GET `/api/auth/me`        | `{user}`                                                                                  |

Username: 3–32 letters/numbers/underscores. Display name: 1–80 characters. Registration password: 12–72 characters and at most 72 UTF-8 bytes. Email and username are normalized to lowercase. Password hashes are never returned. Client requests that use the cookie must include credentials. SameSite=Strict and exact Origin checks protect browser cookie mutations.

## Users

| Method and path               | Request / response                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/users/me`           | `{user}`                                                                                                                     |
| PATCH `/api/users/me`         | Any of `{display_name, avatar_url, status}` → `{user}`; avatar URL must be HTTPS or null; status is online/away/busy/offline |
| GET `/api/users/search?q=...` | 2–80 characters; up to 20 `{users}`; public profile fields only                                                              |

## Conversations

| Method and path                                 | Request / response                                                                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/conversations`                        | `{conversations}` including joined conversations and discoverable public channels; membership, unread counts, and member profiles are included for joined conversations |
| POST `/api/conversations`                       | `{type, name?, description?, is_private?, member_ids?}` → 201 `{conversation}`                                                                                          |
| GET `/api/conversations/:id`                    | `{conversation}` with members                                                                                                                                           |
| PATCH `/api/conversations/:id`                  | `{name?, description?, is_private?}`; owner/admin only                                                                                                                  |
| DELETE `/api/conversations/:id`                 | Owner only; cascades messages/members; 204                                                                                                                              |
| POST `/api/conversations/:id/members`           | `{user_id, role?: "member" or "admin"}`; owner/admin, or public-channel self-join; only owner can appoint an admin                                                      |
| DELETE `/api/conversations/:id/members/:userId` | Authorized removal or self-leave; cannot remove owner or change direct members; 204                                                                                     |
| GET `/api/conversations/:id/details`            | `{pins, files}`; newest 50 of each                                                                                                                                      |
| PATCH `/api/conversations/:id/preferences`      | `{muted_until: ISO date or null}`; own notification preference; 204                                                                                                     |

`type` is direct/group/channel. Direct creation requires exactly one other user; pairs are deduplicated. Other types require a name, with at most 100 invited IDs. Public channels must be joined before history is accessible. Group history is always membership-protected, even when its `is_private` flag is false; only public channels are discoverable.

## Messages

| Method and path                                                | Request / response                                                                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/conversations/:id/messages?before=<cursor>&limit=30` | `{messages, next_cursor}`; each page is chronological; limit 1–100                                                                     |
| POST `/api/conversations/:id/messages`                         | `{body, client_message_id, reply_to_id?, attachment_ids?}` → 201 `{message, duplicate:false}`; retry → 200 `{message, duplicate:true}` |
| PATCH `/api/messages/:id`                                      | Either `{body}` or `{is_pinned}` → `{message}`                                                                                         |
| DELETE `/api/messages/:id`                                     | Soft-deletes and clears content; 204                                                                                                   |
| POST `/api/messages/:id/reactions`                             | `{emoji}` → `{message}`; idempotent                                                                                                    |
| DELETE `/api/messages/:id/reactions/:emoji`                    | URL-encoded emoji → `{message}`                                                                                                        |
| POST `/api/messages/:id/read`                                  | Advances own read watermark; `{ok:true}`                                                                                               |
| GET `/api/search/messages?q=...&conversation_id=<optional>`    | `{messages}`; newest 50 authorized matches, query 2–150 characters                                                                     |

Bodies are plain text, up to 10,000 characters. Empty bodies require attachments. Replies must reference a visible message in the same conversation. The supported reaction set is 👍 ❤️ 😂 🎉 👀 🚀 ✅ 🙌. Message responses include safe sender profiles, reactions, attachment metadata, and a sanitized reply preview. Deleted records return an empty body and no reactions/attachments. `client_message_id` is a UUID unique per sender; reuse across conversations returns 409.

## Notifications and files

| Method and path                         | Request / response                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET `/api/notifications`                | `{notifications}`; latest 100 for the authenticated user and current memberships               |
| POST `/api/notifications/read`          | Marks own activity entries read; 204; does not advance message read watermarks                 |
| POST `/api/uploads/presigned-url`       | `{conversation_id, filename, mime_type, size}` → `{attachment_id, upload_url, expires_in:300}` |
| PUT `<upload_url>`                      | Raw bytes with declared MIME type; exact size and detected format required                     |
| GET `/api/attachments/:id/download-url` | `{url, preview_url, expires_in:60}`; preview_url only for images                               |
| GET `<url>`                             | Signed, current-membership-checked file transfer                                               |

After uploading bytes, send a message with the returned attachment ID. Reserved/unattached files cannot be downloaded. A reservation must be used within 24 hours. Allowed formats: PNG, JPEG, WebP, GIF, PDF, UTF-8 plain text. Filename ≤180 characters with no path separators/control characters. Maximum 10 MiB per file and five per message. The signed-URL contract is implemented by the local persistent-storage adapter, not a third-party object store.

## Operations and limits

`GET /health` → 200 liveness. `GET /ready` → 200 ready or 503 dependency unavailable.

Shared Redis limits: authentication 30 requests / 15 minutes / IP; general API 300 / minute / IP; message mutations 60 / minute / IP; upload operations 20 / minute / IP. Socket limits are per authenticated user and event, described in the realtime document. HTTP rate-limit headers follow the draft-8 format. HTTP statuses include 400 validation, 401 authentication, 403 authorization/origin, 404 missing resource, 409 conflict, 413 oversized body, and 429 rate limit.
