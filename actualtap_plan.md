# ActualTap integration notes

Living notes for folding ActualTap's tap-to-pay functionality directly into
actual-backup, instead of running it as a separate container. Updated as
implementation proceeds.

## Why

actual-backup already has a multi-user web UI, session auth, and per-user/
per-budget config storage. ActualTap was a single-tenant Fastify service
(one global API key, one global Actual server/budget). Running both in one
container as two separate processes would have meant a process supervisor,
a second port, and duplicate Actual-connection logic for no real benefit.
Instead, ActualTap's transaction-creation logic is ported into the existing
Express app as a new route on the existing port, keyed per user/per budget
instead of one global secret.

## Design: two-tier API key

- Each **user** has one enable toggle + one 32-hex-character API key
  (`state.users[userId].actualtap = { enabled, apiKey }`).
- Each **budget config** also has its own enable toggle + its own
  32-hex-character API key (`ACTUALTAP_ENABLED` / `ACTUALTAP_API_KEY`
  fields alongside the existing `ACTUAL_SERVER_URL` etc. in that config).
- The value entered into Tasker / Automate / Home Assistant is the two
  halves joined with a dash: `<userKey>-<budgetKey>`.
- Keys started out at 8 hex characters per half and were lengthened to 32
  after a security review (see below); `findActualtapTarget` accepts
  8-64 hex characters per half so already-generated 8-char keys keep
  working without forcing a regeneration.
- Incoming `POST /transaction` requests are authenticated purely by this
  combined key (no session cookie) — split on `-`, look up the user by the
  first half, then that user's budget by the second half.

This lets one user run tap-to-pay against multiple budgets (different
device automations pointing at different budget keys) without a
dropdown-based "pick a budget" step.

## Key constraint: one global Actual connection per process

`@actual-app/api` holds one global connection/open-budget state per Node
process. The original ActualTap plugin connected once at startup to a
single budget — that can't serve multiple users/budgets. Instead, both the
scheduled backup job and the new tap-transaction path connect briefly,
do their work, and shut down per request/run (same pattern `runBackup`
already used). All such access is serialized through a process-wide lock
(`src/actualLock.js`) so a backup for one config can never race a tap
request for another config against the same in-process Actual state.

## File map

- `src/actualLock.js` — process-wide mutex around all `@actual-app/api` use.
- `src/actualConnect.js` — shared connect/verify/download/open-budget
  sequence, used by both `runBackup` (src/app.js) and the new tap flow.
- `src/tapTransaction.js` — ported transaction-creation logic + orchestration.
- `src/routes/tap.js` — `POST /transaction`, API-key auth + validation.
- `src/state.js` — user/config-level actualtap settings + key lookup.
- `src/routes/pages.js` — config payload fields + `/actualtap/settings` route.
- `src/views/dashboard.js` — user-level enable/key card + help panel.
- `src/views/settings.js` — per-budget enable/key fields + combined-key preview.

Removed (ported, no longer needed): `src/server.js`, `src/routes/health.js`,
`src/routes/transaction.js`, `src/plugins/env.js`,
`src/plugins/actualConnector.js`.

## Security review findings (addressed)

- **Timing side-channel**: the original key lookup compared keys with a
  plain `!==`, which leaks how many leading characters matched via
  response timing - letting an attacker guess a key character-by-character
  far faster than brute force. Fixed with a constant-time comparison
  (`safeCompare` in `state.js`, mirroring the existing pattern in
  `auth.js`'s local-login check).
- **Key length**: 8 hex characters (32 bits) per half was thin for a
  secret exposed directly to the internet with no other protection layer.
  Increased to 32 hex characters (128 bits) per half in the client-side
  generators (`views/dashboard.js`, `views/settings.js`); the lookup
  accepts both lengths so existing keys aren't invalidated.
- **No brute-force throttling**: `/transaction` has no session/OIDC gate
  by design (external automations can't do a browser login), so a wrong
  API key was the only barrier, with no rate limit. Added a small in-memory
  per-IP failed-attempt counter in `routes/tap.js` (429 after 20 failures
  in 5 minutes) - no new dependency.
- **Known accepted tradeoff, not fixed**: all `@actual-app/api` calls
  (backups and tap transactions) share one process-wide lock
  (`actualLock.js`) because the library only supports one open budget per
  process. An authenticated request against a slow/unreachable Actual
  server can hold that lock for up to ~40s, delaying other users' tap
  requests and scheduled backups during that window. This only affects
  requests with a *valid* key, not anonymous internet traffic, and a
  bigger redesign (per-config connections) isn't warranted given the
  library's constraints.

## Caddy

Once tap requests are served from the same container/port as the main web
UI, the old `actualtap.yourdomain.com { @auth header X-API-KEY ... }` Caddy
block is replaced with a plain `reverse_proxy` to the same upstream (no
header gate — the app now validates per-user/per-budget keys itself).

## Status

- [x] Shared plumbing (`actualLock.js`, `actualConnect.js`, `app.js` refactor)
- [x] `tapTransaction.js`
- [x] `state.js` additions
- [x] `pages.js` additions + `/actualtap/settings` route
- [x] `routes/tap.js` + mount in `web.js`
- [x] Dashboard UI
- [x] Settings page UI
- [x] Remove old Fastify scaffolding
- [x] Manual end-to-end verification (login, enable user + budget keys,
      `/transaction` auth/validation paths, mutex serialization test)
- [ ] Update the Caddy config once this is deployed (see "Caddy" section
      above) — not done yet, needs the user's actual Caddyfile/deployment
- [ ] Real end-to-end test against a live Actual Budget server (verified
      here only against a fake/unreachable one, since no real server was
      available in this environment)
