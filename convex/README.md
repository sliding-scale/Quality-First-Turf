# Convex backend

Read `_generated/ai/guidelines.md` before changing anything here.

## Modules

| Path | Contents |
|---|---|
| `schema.ts` | Tables and shared validators (`projectStatus`, `answerValidator`, `measurementValidator`, `workAreaInput`) |
| `convex.config.ts` | Typed deployment env vars (`SALES_EMAIL`, `SALES_PASSWORD`, `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET`, `JOBBER_CONNECT_KEY`) |
| `http.ts` | HTTP routes `GET /jobber/connect`, `GET /jobber/callback` |
| `projects/` | `mutations.ts` (create, update, generateUploadUrl, internal `recordJobberResult`), `queries.ts` (`listForSales`, `visit`, internal `get`), `actions.ts` (`publishVisit`, `draftVisit`: push client + draft quote to Jobber) |
| `sales/` | `login.ts` (Node action, timing-safe credential check), `mutations.ts` (start/end session), `session.ts` (`activeSalesSession`), `queries.ts` |
| `jobber/` | `client.ts` (OAuth + GraphQL), `connection.ts`, `mutations.ts`/`queries.ts` (token storage), `http.ts` (OAuth handlers) |

## Tables

- `projects` — one per customer request: contact, address, services, answers, measurements, Jobber ids, `status`, `missingMapping`, `integrationError`.
- `workAreas` — measured areas and photo storage ids per project (index `by_projectId`, capped at 100).
- `salesSessions` — sign-in tokens (index `by_token`), 14-day expiry.
- `jobberConnections` — singleton row with Jobber tokens and the in-flight OAuth state.

## Access model

- **Public** (customer flow): `projects.mutations.create`, `projects.actions.publishVisit`.
- **Sales only** (require a valid `sessionToken`): `projects.mutations.update`/`generateUploadUrl`, `projects.queries.listForSales`/`visit`, `projects.actions.draftVisit`.
- **Internal**: everything that touches Jobber tokens or writes integration fields (`recordJobberResult`, `jobber.*`).
- Clients cannot set `jobberClientId`, `jobberQuoteId`, `missingMapping`, or `integrationError`; only `recordJobberResult` does. `update` only accepts `status: "on-site saved"`.
- `/jobber/connect` requires `?key=<JOBBER_CONNECT_KEY>`.

## Jobber flow

1. `/jobber/connect` stores a one-time `oauthState` + PKCE verifier and redirects to Jobber.
2. `/jobber/callback` validates `state`, exchanges the code, stores tokens.
3. `publishVisit` / `draftVisit` refresh the access token when needed, find or create the client and property, then create a **draft** quote from `lib/quote-lines.ts`. Quotes are never sent automatically.

## Other behaviour worth knowing

- **Short project codes**: every project gets a 6-character `shortCode` (no 0/O/1/I/L), shown as `K7M-3PQ`, searchable in the sales list and used in Jobber quote titles. Projects created before this need `npx convex run projects/mutations:backfillShortCodes` once.
- **Rate limits** (`rateLimits.ts`, `@convex-dev/rate-limiter`): project creation, `publishVisit`, and sign-in (per email and global).
- **Sessions**: only a SHA-256 hash of the token is stored; each session schedules its own deletion at expiry and `crons.ts` purges stragglers hourly.
- **Jobber pushes** take a per-project lock (`claimDraft`, 2 minutes) so double clicks cannot create two quotes; the catalogue is read once per push; requests time out after 20 s.
- The customer-facing `publishVisit` never returns Jobber ids or upstream error text.
- Photos are validated (image type, ≤ 15 MB) on create/update and removed from storage when dropped from a project.

## Commands

```bash
npx convex dev      # develop against a dev deployment
npx convex deploy   # deploy to production
npx convex env set NAME value
```
