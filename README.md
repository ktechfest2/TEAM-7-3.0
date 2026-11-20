# CounTrack

Witnesses photograph the result sheet (Form EC8A) posted at a polling unit. CounTrack hashes and
timestamps each photo, reads the numbers with a vision model, checks them with plain rules,
compares independent readings (or one clear EC8A after five hours without a conflicting clear
reading), and shows where entered collation figures don't match the wall.

**AI reads · rules check · people confirm.** The app never accuses anyone: it reports that records don't match.

> ⚠️ All demo data (units, parties PA–PD, results, collation figures) is **SIMULATED**.

## Setup

1. `npm install`
2. Create a Supabase project. Copy `.env.local.example` to `.env` and fill in the URL and keys (including `SUPABASE_SERVICE_ROLE_KEY`, which the seed script needs).
3. Supabase dashboard → **SQL Editor** → paste and run `supabase/migrations/20261118000000_init.sql`.
4. For a local walkthrough only, `npm run seed` creates 5 demo accounts and 5 simulated polling units. Do not run it against a shared or production Supabase project.
5. `npm run dev` → http://localhost:3000

**Supabase dashboard settings:** Authentication → Sign In / Providers → enable **Anonymous sign-ins** (for "Continue anonymously").

**Phones need HTTPS** (camera and hashing require a secure context). Use the Vercel URL, or `npx next dev --experimental-https` on the same Wi-Fi.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Rule-engine tests (checks, consensus, diff) |
| `npm run typecheck` | TypeScript check |
| `npm run seed` | (Re)create simulated demo data |
| `npm run import:polling-units` | Import a versioned INEC polling-unit directory snapshot into Supabase |
| `npm run icons` | Regenerate PWA PNG icons from `public/icons/icon.svg` |
| `npm run fixture -- <photoId>` | Save a real reading as a `DEMO_MODE` cached fixture |

## SMS incident sandbox

Open `/incidents` to submit a **simulated** incoming SMS and view the sanitized incident feed. The demo page does not send a real text. It validates the message against the real polling-unit directory and records reports as unreviewed. For a fresh database, apply `supabase/migrations/20261120000000_sms_incident_reports.sql` followed by `supabase/migrations/20261120000200_sms_incident_reports_reconcile.sql`. For an existing database, apply the reconciliation migration; it preserves the separate public-verification `incident_reports` table and renames an earlier SMS-shaped table if one exists, or creates `sms_incident_reports` beside it.

For Africa's Talking sandbox callbacks, deploy the app to a publicly reachable HTTPS URL, create a sandbox two-way SMS shortcode, and set its incoming SMS callback to `https://<your-domain>/api/sms/inbound?token=<AT_CALLBACK_TOKEN>`. Set `AT_CALLBACK_TOKEN`, `AFRICASTALKING_API_KEY`, and `AFRICASTALKING_SHORTCODE` in the deployment environment so the route authenticates callbacks and can send a sandbox reply. Test using Africa's Talking's web simulator; sandbox messages do not reach real handsets. The accepted report format is `PU37/05/04/017VUB` (also accepts `COUNTRACK PU37/05/04/017VUB` for a shared keyword). Incident reports are not proof that an incident occurred.

The live incident list and grouped home feed omit reports older than 24 hours. Old reports remain stored in `sms_incident_reports` for history; there is no stale label in the interface and no automatic deletion. The message format has no incident-occurrence time, so the 24-hour window is measured from `received_at`, which is only a proxy for when the incident happened. Apply `supabase/migrations/20261120000500_sms_incident_feed_24h.sql` to enable the grouped-feed cutoff in Supabase.

## Removing simulated data

The shared database can be cleaned by applying `supabase/migrations/20261120000400_remove_simulated_demo_data.sql` in the Supabase SQL Editor. This permanently removes rows marked simulated, including the seeded `SIM-*` units and their dependent data, simulated collation rows, and existing demo/Africa's Talking sandbox incident reports. It does not remove imported polling-unit directory rows or reports from any future production SMS source. Do not apply this to a database where the simulated records are still needed. Do not run `npm run seed` against the shared or production database: it recreates the `SIM-*` fixtures.

The seed script remains useful for a separate development database and local walkthroughs.

## Polling unit directory API

`GET /api/polling-units` serves real directory records from Supabase. Search with `?code=01/02/03/004` for a full PVC polling-unit code, or use `?q=market&state=Lagos&limit=20&offset=0` for paginated text search. The capture form loads its State → LGA → Ward → Polling unit options from `?level=states`, `?level=lgas&state=Lagos`, `?level=wards&state=Lagos&lga=Ikeja`, and `?level=units&state=Lagos&lga=Ikeja&ward=...`. Responses include dataset provenance. Simulated `SIM-*` fixtures are for isolated local development only.

To import real directory data:

1. Apply `supabase/migrations/20261119000000_polling_unit_directory.sql` in the Supabase SQL Editor.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
3. Run `npm run import:polling-units`.

The importer resolves the selected GitHub ref to a commit, validates the source manifest, row count, full codes, and duplicates, then upserts in batches. It marks older imported snapshots inactive only after the new snapshot has fully imported. By default it uses the source repo's `main` branch; set `INEC_DATASET_REF` to a 40-character commit SHA for a repeatable import. The source is the community-maintained [`nigeria-inec-geo`](https://github.com/saidiadegoke/nigeria-inec-geo) snapshot of INEC's public CVR directory; check records against INEC before relying on them. This import contains names and administrative locations, not verified directions or coordinates.

## Languages

CounTrack speaks English, Naijá (Nigerian Pidgin), Hausa, Yorùbá and Igbo. Readers get their language from a `lang` cookie (set by the header's language menu), else from their browser's `Accept-Language`. URLs stay the same (`/units`), and `proxy.ts` rewrites them to the prerendered `app/[lang]/…` page. A prefixed link like `/ha/units` opens in that language and remembers it.

`t()` works everywhere without a language argument: server components read the `[lang]` root param, and client components read it from context or `<html lang>`. Strings live in `lib/i18n/<code>.json`. Every non-English file overrides English key by key and falls back to English for anything missing. `tests/i18n.test.ts` fails if a catalog has an unknown key, drops a `{placeholder}`, or misses a user-facing string.

To add a language (Fulfulde, Kanuri, Tiv, Ibibio, Ijaw, Nupe…): add it to `lib/i18n/langs.ts`, add `lib/i18n/<code>.json`, and register it in `lib/i18n/index.ts`. **Have native speakers review translations before an election**: the current Pidgin, Hausa, Yorùbá and Igbo text is a careful first draft, not a certified translation. Languages with stacked tone marks use the phone's font (see `html:lang(yo)` in `globals.css`), because the web fonts can't position them.

## Elections

CounTrack tracks the seven election types INEC lists on IReV: presidential, governorship, senatorial, House of Representatives (`house_of_reps`), State House of Assembly (`state_assembly`), chairmanship and councillorship. Apply `supabase/migrations/20261119000300_all_elections.sql` in the SQL Editor **on its own** (new enum values must commit before they're used). It renames the old `local_government` value to `chairmanship`; old links and queued captures that say `local_government` are read as chairmanship.

## Polling units page

`/units` searches, filters, counts and pages the whole directory (~176k units) in the database. Apply `supabase/migrations/20261119000400_polling_unit_search.sql` for fast search: without its trigram indexes every search scans the table (several seconds).

## IReV API

INEC's Result Viewing portal ([inecelectionresults.ng](https://www.inecelectionresults.ng)) has no public API. Its web app reads a JSON backend one click at a time (election type → election → state → LGA → ward → polling unit). `GET /api/irev` wraps that backend so you can jump to any level directly:

| Query | Returns |
|---|---|
| `?level=states` | The 37 states with their INEC code and IReV id (they differ: FCT is code `37`, IReV id `15`) |
| `?level=elections&election=governorship&state=24[&date=2023-03-18]` | Elections of that type, newest first. `date` accepts `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. Presidential needs no state |
| `?level=lgas&electionId=…&state=24` | LGAs in that state for the election |
| `?level=wards&electionId=…&lga=…` | Wards in the LGA |
| `?level=units&electionId=…&ward=…` | Polling units, each with `code` (matches CounTrack's), `documentUrl` (the uploaded EC8A) and `uploadedAt` |
| `?level=unit&electionId=…&pu=…` | One polling unit |

`GET /api/irev/sheet?electionId=…&pu=…[&download=1]` streams that unit's result sheet image/PDF through CounTrack (only from INEC's storage hosts, only image/PDF types). The `/irev` page uses all of this: pick type, state, election date, LGA, ward and polling unit, and see the IReV sheet beside CounTrack's witness-verified result.

Structure (types, elections, LGAs, wards) is cached for hours and uploads for minutes. If INEC moves the backend, set `IREV_API_BASE` (the current address is in the portal's `main.*.js` bundle). The mapping from IReV's JSON lives in `lib/irev/map.ts` and is covered by `tests/irev.test.ts`.

## How the core flow works

1. **Capture** (`/capture`): photo → compressed JPEG (EXIF stripped) → SHA-256 on the phone → saved to IndexedDB.
2. **Sync** (`lib/offline/sync.ts`): uploads to Storage, inserts `result_photos` (RLS: own rows only), calls `/api/extract`. Runs on load, on reconnect, and on "Sync now".
3. **Extract** (`/api/extract`): server re-hashes the file (`hash_verified`), the vision model reads it into strict JSON (zod), rule checks run, and the result is saved.
4. **Verify** (`lib/server/recompute.ts`): matching readings from 2+ distinct witness sessions can verify a unit; alternatively, one clear, high-confidence EC8A can qualify after five hours if there is no conflicting clear EC8A. This is a system rule, not independent proof that the photo is authentic.
5. **Diff**: every collated line for the unit is compared with the verified wall result (`discrepancies`).

## Local demo fixtures (after seeding)

`witness1@demo.countrack.test`, `witness2@…`, `witness3@…`, `agent1@…`, `observer1@…`.
The password is `DEMO_PASSWORD` from `.env` (default `countrack-demo`). These accounts and the units below are fake local walkthrough fixtures, not election data.

## Seeded units

| Unit | State | Purpose |
|---|---|---|
| SIM-001, SIM-002 | Verified | Records match |
| SIM-003 | Verified | **Wall PB 142 vs announced 241** (deliberate mismatch) |
| SIM-004 | Pending (1 witness) | Add a 2nd witness live → Verified |
| SIM-005 | Needs review | Two witnesses' readings disagree |
