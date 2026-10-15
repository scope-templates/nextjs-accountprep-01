# Pemberline account desk

Pemberline is a thirty-person company that sells maintenance-scheduling software to regional bus and shuttle operators:
transit agencies, airport shuttle firms, school-bus contractors, paratransit and campus fleets, charter coach lines. This
desk is where our sales team, four reps and a head of sales, keeps what it knows about each operator it sells to: the
account, its contacts, every meeting we have had with them, the facts we have checked about them and our notes. A rep
opens the account before a call, and the assistant on the account page answers the rep's questions from the desk's
records.

Facts about an operator are typed in by a colleague after checking them, with the date they checked it and their name.

## What is in it

| Table | Holds |
| --- | --- |
| `staff` | Name, email, role (`rep`, `head`, `admin`), active flag |
| `accounts` | Operator name, kind, HQ city and state, fleet size as told to us, stage, owner rep, created, last touched |
| `contacts` | People at the account: name, title, email, phone, notes |
| `meetings` | Held on, attended by (one of us), typed notes, next step |
| `facts` | Field, value, `checked_on`, `checked_by` (a person on staff), note on how they know |
| `notes` | Author, written at, body |
| `activity` | Append-only log: actor, action, account, detail (JSON: who was added or changed, owner and stage from and to, the account a refused tool call asked for), at |

Fact fields: headcount, fleet size, depots, parent company, operating area, contract renewals, recent change.

| Operation | Route | Refuses |
| --- | --- | --- |
| List accounts, filter by `stage` and `owner` | `GET /api/accounts` | no session (401), unknown stage (400) |
| Create an account | `POST /api/accounts` | no session, admin (403), another owner unless head (403) |
| Read one account with contacts, meetings, facts, notes | `GET /api/accounts/[id]` | no session, unknown id (404) |
| Add a fact | `POST /api/accounts/[id]/facts` | no session, not owner or head (403), missing `checked_on` or `checked_by` (400 `checked_required`), `checked_on` after today (400), checker not on active staff (400) |
| Add a note | `POST /api/accounts/[id]/notes` | no session, not owner or head, empty body |
| Log a meeting | `POST /api/accounts/[id]/meetings` | no session, not owner or head, date after today |
| Move the stage | `POST /api/accounts/[id]/stage` | no session, not owner or head (403), anything but the next stage or `lost` (400 `stage_not_next`), an account already won or lost (409 `stage_closed`) |
| Reassign the owner | `POST /api/accounts/[id]/owner` | anyone but the head (403), owner outside sales (400) |
| Ask the assistant | `POST /api/accounts/[id]/assistant` | no session (401), no model configured (503 `assistant_unconfigured`), unknown id, empty question; an empty answer or a failed model call is 502 `model_call_failed` |
| List staff | `GET /api/staff` | no session |
| Add or change staff | `POST /api/staff`, `PATCH /api/staff/[id]` | anyone but admin (403), duplicate email (409), deactivating someone who owns accounts (409), removing the last active admin or head (409) |

Refusals use one problem shape, `application/problem+json`: `{ type, status, code, title, detail? }`. Every route checks the
session first, before it reads the body. Dates (`checked_on`, `held_on`) are real calendar dates from 2000 on and no
later than today.

Pages: `/accounts` (list with stage and rep filters), `/accounts/[id]` (the record, the forms for facts, meetings,
notes and the stage, and the assistant box), `/signin` (pick your name; a signed cookie keeps you signed in for seven days).

## The assistant

`POST /api/accounts/[id]/assistant` with `{ "question": "..." }` returns `{ answer, tool_calls }`, where `tool_calls`
lists each tool call the loop made with its `name` and `arguments`. It runs `generateText` from the AI SDK with the
Anthropic provider and these tools:

| Tool | Reads or writes | Scope |
| --- | --- | --- |
| `account_summary` | Reads the account row, owner, stage, last touched, and the notes on the account | The account in the path |
| `contacts` | Reads the account's contacts | The account in the path |
| `meetings` | Reads the last N meetings with their notes (default 10) | The account in the path |
| `facts` | Reads every fact row with `checked_on` and `checked_by` | The account in the path |
| `save_note` | Writes a note with the signed-in rep as author, and logs it; at most one per question | The account in the path, owner or head only |

The account id comes from the request, never from the model. A tool call that names another account (a number or a
numeric string) gets a `scope_refused` result, an activity row is written, and the loop goes on. The loop makes at most
six model calls, with no retries, and each call may write up to 1,024 tokens. The sixth goes out with tool choice `none`
and with the earlier tool calls and results written out as plain text, so it answers with what it has read. If the rep
closes the request, the call is aborted. The model is built in `src/lib/assistant/model.ts`.

## Roles

- **rep**: reads every account; writes facts, meetings and notes and moves the stage on the accounts they own; creates
  accounts they own.
- **head**: everything a rep does on every account, plus reassigning owners and creating accounts for someone else.
- **admin**: reads every account and manages staff. Writes no facts, meetings or notes.

Nobody writes without a session, and every write is logged with the person who made it.

## Running locally

Node 22 and npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

Settings in `.env`:

- `ANTHROPIC_API_KEY`: the key for the assistant's model (`claude-sonnet-4-5`). Unset, the assistant route answers
  503 `assistant_unconfigured` and the rest of the desk works.
- `SESSION_SECRET`: signs the session cookie. Unset, each server process signs with a random key of its own, so
  sessions end when the server restarts.

Set `PORT` in the shell to change the port from 3000 (`PORT=4000 npm run dev`); Next reads it at startup, not from
`.env`.

`npm run build` and `npm start` run the production build. Dates on the desk (today, for the checked-on and held-on
limits) are Central time.

## Tests

```sh
npm test
npm run typecheck
```

Vitest runs against an in-memory SQLite store loaded with the seed; every date a test checks comes from a fixed
clock. The assistant tests drive the loop with `MockLanguageModelV3` from `ai/test`, and one drives the Anthropic
provider through a fake `fetch`; no test reads a model setting or makes a network call.

## The data

`data/seed.json` holds sixty accounts across every stage, about 150 contacts, about four hundred meetings, the fact rows
with their checked dates, notes and the activity log. Meetings and notes run from October 2025 through September 2026;
some accounts were created earlier, and the oldest facts were checked in June 2025. It is
written by `scripts/generate-seed.ts` from a fixed seed number (`npm run seed:generate`), and a test checks the
committed file matches the generator byte for byte. The store lives in `var/desk.sqlite`; the seed loads on first start
when the store is empty. Delete `var/` to start over from the seed.
