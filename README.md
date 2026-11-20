# CounTrack

CounTrack turns photos of the result sheet posted at a polling unit into time-stamped, tamper-evident evidence, and shows plainly where the figures announced later don't match the figures on the wall.

> CounTrack doesn't accuse anyone. It shows what the wall said, who photographed it, when, and whether the announced figure matches.

**AI reads · rules check · people confirm.**

Built by Team 7 for KTechFest.

## The Problem

At 4:15 PM, counting ends at a polling unit in Ikeja. The presiding officer pastes the result sheet (Form EC8A) on the wall. Tunde, a voter, takes a photo. So do a party agent and a neighbour.

That evening the ward collation centre announces a figure for the same unit. It's different. Party B had 142 votes on the wall and 241 in the announcement.

Tunde has the proof on his phone, but it's one photo among thousands in WhatsApp groups. It has no time stamp anyone trusts, nobody can tell whether it's been edited, and nobody has put it next to the announced figure. By the time anyone compares them, the result has been declared and the photo has been forwarded so often that it no longer looks like evidence.

The figures exist. What's missing is a trusted way to record them at the source and compare them with what's announced, unit by unit.

## What We Chose to Build

We didn't build a result-collation system, a fraud detector or a prediction tool. We don't announce winners.

We focused on one gap: between "the result was posted on the wall" and "the announced figure for that unit matches it, or doesn't".

CounTrack lets anyone photograph a polling unit's result sheet. It seals the photo with a fingerprint the moment it's taken, reads the figures with AI, checks them with plain arithmetic rules, and marks the unit verified only when independent witnesses agree. Then it puts the verified wall result beside any announced figure, party by party.

## How We Approached the Challenge

Our first realisation was that Nigerians already photograph result sheets. The problem is that those photos are scattered, can't be checked for edits, aren't tied to a polling unit, and are never compared with the announced figures. Another place to upload pictures would just add to the pile.

So we built around four ideas:

1. **Evidence at the source.** The photo is hashed (SHA-256) and time-stamped on the phone before it goes anywhere, and the server hashes it again on arrival. An edited or damaged file never counts.
2. **Independent agreement.** One photo is a claim. Two or more witnesses whose readings match is a verified result.
3. **Plain comparison.** The verified wall result and the announced figure sit side by side. Every gap shows, party by party.
4. **Works where elections happen.** It works offline: photos queue on the phone and upload when there's a signal. It speaks English, Naijá, Hausa, Yorùbá and Igbo.

AI is good at one thing here: reading handwritten and printed figures off a photo. We deliberately stopped it there. It transcribes. It doesn't decide what's true, and it never compares numbers. Plain code does that.

## How CounTrack Works

```
A witness picks the polling unit and photographs the result sheet
        ↓
The phone compresses the photo, strips its location data and seals it (SHA-256 + time)
        ↓
It waits in the phone's queue until there's a connection, then uploads
        ↓
The server re-hashes the file. If the fingerprint doesn't match, it's rejected
        ↓
AI transcribes the sheet into strict JSON (figures, words, polling unit code)
        ↓
Plain rules check it: sums, missing fields, words vs digits, unit code matches
        ↓
2+ independent witnesses with identical readings → the unit is Verified
Readings disagree → Needs review       Only one witness → Pending
        ↓
Anyone enters the announced figure → CounTrack shows every gap, party by party
```

## Key Features

- **Capture.** Pick the state, LGA, ward and polling unit from INEC's directory of ~176,000 units, then take the photo in the app's own camera. The election type (presidential down to councillorship) is chosen with tabs.
- **Tamper-evident photos.** Every photo carries a SHA-256 fingerprint taken on the phone and checked again on the server.
- **Offline first.** Photos are saved on the phone and upload automatically when the connection returns. Without a connection, a photo can be saved as a draft and assigned to a unit later.
- **Verification by agreement.** A unit is verified when two or more distinct witnesses submit identical readings, and they outnumber any disagreeing group. A single clear EC8A can stand on its own after five hours if nothing contradicts it.
- **Wrong-unit protection.** If the code printed on the sheet doesn't match the unit the witness picked, or can't be read, the report is rejected with a clear explanation.
- **Wall × Announced.** On `/collation`, enter the officially announced figure, or snap a screenshot of it, and see each party's gap against the verified wall result. Saved gaps become public evidence.
- **IReV comparison.** `/irev` browses INEC's Result Viewing portal by election, state, LGA, ward and unit. From a polling unit, open the CounTrack comparison board to read the IReV sheet and compare matching party figures with the witness wall. The import is analysis-only and checks that the sheet's polling-unit code matches.
- **Live feed.** The home page shows what's happening at polling units: new photos, verified units, mismatches and incident reports.
- **SMS incident reports and lookup.** Report vote buying, violence, staff misbehaviour, ballot snatching or intimidation by SMS (`PU37/05/04/017VUB`). Send `LKP PU37/05/04/017` to get recent incident counts for a polling unit. `/incidents` simulates both commands; Africa's Talking sandbox callbacks can also reply to lookup requests.
- **Five languages.** English, Naijá (Nigerian Pidgin), Hausa, Yorùbá and Igbo, including error messages.

## How AI Fits Into CounTrack

We use DeepSeek's vision model (`deepseek-flash`, DeepSeek-V4.1-Flash), called only from server-side routes so the API key never reaches the browser.

| Step | File | What the AI does |
|---|---|---|
| Reading a result sheet | `app/api/extract/route.ts`, `lib/vision/extract.ts` | Transcribes the photo into strict JSON: unit details, voter counts, each party's score in figures and words, totals, and a confidence for each field. Told to copy exactly what's written and not to calculate, correct or guess. |
| Reading an announced figure | `app/api/collation/read/route.ts` | Reads party figures from a screenshot or photo of the announced result, to fill in the form. The person checks them before saving. |

Every AI answer is validated against a schema (zod), with one retry. The instructions are in `lib/vision/prompt.ts`.

These parts are **not** AI. They're plain, tested code:

- Arithmetic and consistency checks (`lib/rules/checks.ts`)
- Deciding whether a unit is verified (`lib/rules/consensus.ts`)
- Comparing wall and announced figures (`lib/rules/diff.ts`)
- Matching the sheet's polling unit code to the chosen unit (`lib/vision/map.ts`)

**What the AI does not do:**

- It doesn't decide that a result is genuine or that fraud happened.
- It doesn't fill in figures it can't read. An unreadable figure is left blank and flagged.
- It doesn't verify a unit. Only agreement between independent witnesses does.
- It doesn't replace INEC, observers or the courts.

If the AI call fails, the photo stays safely queued and is read again later. A reading the witness thinks is wrong can be read again from the same phone.

## Trust, Verification & Uncertainty

Being straight about this: CounTrack does **not** know which figure is the true result. It records what witnesses photographed and shows where records disagree.

- **Fingerprints.** Each photo is hashed on the phone and again on the server. Edited or damaged files are rejected.
- **Independent witnesses.** Only each phone's latest reading counts, and one phone can't verify a unit alone (except a lone clear EC8A after five hours, with nothing contradicting it).
- **Visible disagreement.** If witnesses' readings differ, the unit is marked "Needs review" and doesn't pick a side.
- **Visible problems.** Every flag (a sum that doesn't add up, figures that disagree with the words, low confidence) is shown with the reading.
- **Neutral language.** CounTrack says records "don't match". It never says anyone cheated.
- **Simulated data stays out of public results.** Simulated polling units are excluded from public lists and feeds. The database cleanup migration below can remove seeded fixtures when they are no longer needed.

We don't check the identity of witnesses. Each phone gets an anonymous session, so one person with several phones could pose as several witnesses. That's a real limitation, listed below.

## Moderation

There are no user accounts. Nobody signs in, so witnesses stay anonymous.

- An admin can remove an item from the home page's "What's happening" feed by entering the passcode set in `ADMIN_DELETE_KEY`. The record itself is kept.
- Incident reports are stored as unreviewed, and can be dismissed in the database.

| Unit | Status | What it shows |
|---|---|---|
Seeded `SIM-*` units are local walkthrough fixtures. They are excluded from public search and feeds and should not be loaded into a shared or production database.

**A quick demo path:**

1. Open `/collation`, pick a unit and enter a figure to compare with the witness wall.
2. Open `/irev`, choose an uploaded result sheet, and use **Compare in CounTrack** to read it and compare matching figures.
3. Turn on Airplane Mode, take a photo on `/capture`, then reconnect and watch it upload from `/queue`.
4. On `/incidents`, send `PU37/05/04/017VUB` to simulate a report, then send `LKP PU37/05/04/017` to look up the unit's recent reports.
5. Switch the language from the header menu.

## Tech Stack

- **Framework:** Next.js 16 (App Router, React 19, TypeScript)
- **Styling:** Tailwind CSS v4
- **Database, storage and auth:** Supabase (Postgres, Storage, anonymous auth, row-level security)
- **AI:** DeepSeek vision model, behind server routes
- **Election data:** INEC's IReV results API and CVR polling unit directory
- **Offline:** a service worker (`public/sw.js`) and IndexedDB (via `idb`)
- **SMS:** Africa's Talking sandbox
- **Testing:** Vitest

## Getting Started

Requires Node.js 22 or later.

1. **Install:**
   ```
   npm install
   ```
2. **Create a Supabase project.** In Authentication → Sign In / Providers, enable **Anonymous sign-ins**.
3. **Run the migrations** in the SQL editor, in this order. Run `all_elections` on its own, because new enum values must be committed before they're used.
   ```
   supabase/migrations/20261118000000_init.sql
   supabase/migrations/20261119000000_polling_unit_directory.sql
   supabase/migrations/20261119000100_solidarity.sql
   supabase/migrations/20261119000200_elections.sql
   supabase/migrations/20261119000300_all_elections.sql      (on its own)
   supabase/migrations/20261119000400_polling_unit_search.sql
   supabase/migrations/20261120000000_sms_incident_reports.sql
   supabase/migrations/20261120000200_sms_incident_reports_reconcile.sql
   supabase/migrations/20261120000300_feed_hidden.sql
   ```
4. **Create `.env`** from the example and fill it in (see below):
   ```
   cp .env.local.example .env
   ```
5. **Load data.** `npm run seed` is for an isolated local development database only. It creates simulated demo records. `npm run import:polling-units` imports INEC's polling unit directory (it reads `.env.local`, so copy the Supabase variables there too). Do not run the seed script against shared or production Supabase.
6. **Run:**
   ```
   npm run dev
   ```
   Open http://localhost:3000.
7. **Test on a phone.** The camera and offline mode need HTTPS. Run `npm run preview`, then `npm run tunnel` in a second terminal, and open the `https://…trycloudflare.com` address it prints.
8. **Deploy** to Vercel or any Node host (`npm run build`, then `npm start`). Add the same environment variables in the host's settings. Your local `.env` isn't used in production.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm test` | Tests (rule checks, consensus, diff, vision mapping, translations, IReV mapping) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run seed` | Recreate simulated demo data |
| `npm run import:polling-units` | Import the INEC polling unit directory snapshot |
| `npm run preview` | Production build served on your network |
| `npm run tunnel` | Temporary HTTPS address for phone testing |
| `npm run icons` | Regenerate app icons from `public/icons/icon.svg` |
| `npm run fixture -- <photoId>` | Save a real reading as a cached demo fixture (`DEMO_MODE`) |

## Environment Variables

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key. Never prefix with `NEXT_PUBLIC_`. |
| `DEEPSEEK_API_KEY` | Server-only key for the vision model |
| `DEEPSEEK_VISION_MODEL`, `DEEPSEEK_BASE_URL` | Optional model and endpoint overrides |
| `AFRICASTALKING_API_KEY`, `AFRICASTALKING_SHORTCODE` | Sandbox SMS replies |
| `AT_CALLBACK_TOKEN` | Authenticates Africa's Talking callbacks to `/api/sms/inbound?token=…` |
| `SMS_SENDER_HASH_SECRET` | Optional key for pseudonymous SMS rate limiting (defaults to the service-role key) |
| `ADMIN_DELETE_KEY` | Passcode for removing items from the home feed |
| `DEMO_PASSWORD` | Password for the seeded demo witness accounts |
| `DEMO_MODE` | `true` returns cached readings for known demo photos, so a live demo doesn't depend on venue Wi-Fi |
| `INEC_DATASET_REF` | Git commit of the polling unit dataset to import, for repeatable imports |
| `IREV_API_BASE` | Optional override for the IReV backend address |
| `NEXT_PUBLIC_SOLIDARITY_ENABLED`, `INCIDENT_SLA_MINUTES` | Experimental check-in feature, off by default |

Don't commit `.env` or paste keys into issues or chats.

## SMS incident lookups and report age

Send `LKP PU37/05/04/017` to request a lookup. Replies summarize non-dismissed reports received for that polling unit in the last 24 hours and label them as public, unverified reports. The `/incidents` simulator exercises the same command without sending a real SMS. Because the message doesn't include when an incident happened, the 24-hour window uses `received_at` as a proxy; older rows remain in the database and are simply omitted from the live feed and lookup.

Apply `supabase/migrations/20261120000500_sms_incident_feed_24h.sql` to enable the grouped feed's database-side cutoff.

## Removing seeded demo data

Apply `supabase/migrations/20261120000400_remove_simulated_demo_data.sql` in Supabase only when you are ready to permanently remove seeded polling units, their dependent records, simulated collation records, and existing demo/Africa's Talking sandbox incident reports. This migration has not been applied automatically. It doesn't remove imported real polling-unit directory rows.

## Project Structure

```
app/
  [lang]/            Pages, one per language (the URL stays the same; proxy.ts picks the language)
    page.tsx           Home: report form, live feed, compare a unit
    (app)/capture      Photograph a result sheet
    (app)/queue        The phone's upload queue
    (app)/units        Polling unit directory and each unit's evidence
    (app)/review       One photo and its reading
    (app)/collation    Wall × Announced tally board
    (app)/irev         INEC IReV browser
    (app)/incidents    SMS incident simulator
  api/               Server routes (extract, collation, compare, feed, irev, polling-units, sms, …)
components/          UI pieces (camera, unit picker, feed, diff table, …)
lib/
  vision/            AI prompt, call and mapping to stored results
  rules/             Plain-code checks, consensus and diff
  offline/           IndexedDB queue, sync and offline directory
  irev/              IReV client and mapping
  i18n/              Translations (en, pcm, ha, yo, ig)
  supabase/          Browser, server and admin clients
public/sw.js         Service worker (offline pages and files)
proxy.ts             Language selection and Supabase session refresh
scripts/             Directory import, icon generation, demo fixtures
supabase/            Migrations and seed script
tests/               Vitest tests
```

## Credits & Acknowledgements

As required by rule 1.2, these are the open-source libraries, public APIs, pre-trained AI models and public datasets CounTrack uses.

### Pre-trained AI models

| Model | Provider | Used for |
|---|---|---|
| DeepSeek-V4.1-Flash (`deepseek-flash`) | [DeepSeek](https://www.deepseek.com) | Reading result sheets and announced figures from photos |

### AI coding assistants

| Tool | Provider | Used for |
|---|---|---|
| [Claude](https://www.anthropic.com/claude), through [Claude Code](https://claude.com/claude-code) | Anthropic | Help writing, reviewing and debugging code, translations and documentation during development. Every change was reviewed by the team. Claude is not part of the running app. |

### INEC open data and APIs

CounTrack is built on public data from the [Independent National Electoral Commission (INEC)](https://inecnigeria.org). Each source powers specific features:

| INEC source | Features that use it | Where in the code |
|---|---|---|
| [IReV, the Result Viewing portal](https://www.inecelectionresults.ng) results API | The `/irev` browser (election type → election → state → LGA → ward → polling unit), and INEC's uploaded result beside CounTrack's witness-verified result | `lib/irev/client.ts`, `app/api/irev/route.ts` |
| IReV result-sheet storage | Viewing and downloading the EC8A sheet INEC uploaded for a unit, streamed through CounTrack (INEC's hosts only, images and PDFs only) | `app/api/irev/sheet/route.ts` |
| [INEC Continuous Voter Registration (CVR) polling unit directory](https://cvr.inecnigeria.org/pu) | The State → LGA → Ward → Polling unit picker on Capture and Collation, the `/units` directory and search, the offline unit list, and checking the code in SMS incident reports | `scripts/import-polling-units.ts`, `app/api/polling-units/` |
| INEC's list of registered political parties (2023 general elections) | A hint for reading handwritten party names on result sheets | `lib/parties.ts` |

The IReV backend address can be changed with `IREV_API_BASE` if INEC moves it. CounTrack only reads public INEC data; it never writes to INEC systems.

### Public APIs and services

| Service | Used for |
|---|---|
| [DeepSeek API](https://api-docs.deepseek.com) | Calling the vision model |
| [Supabase](https://supabase.com) | Database, photo storage and anonymous sessions |
| [Africa's Talking](https://africastalking.com) (sandbox) | Inbound SMS incident reports and replies |
| [Google Fonts](https://fonts.google.com) via `next/font` | Font files, downloaded at build time and served by CounTrack |
| [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (`cloudflared`) | Development only: a temporary HTTPS address for phone testing |

### Public datasets

| Dataset | Used for |
|---|---|
| [`nigeria-inec-geo`](https://github.com/saidiadegoke/nigeria-inec-geo) by saidiadegoke | The snapshot of INEC's CVR polling unit directory (~176,000 units) that `npm run import:polling-units` loads. See that repository for its licence. Check records against INEC before relying on them. |

### Open-source libraries

| Library | Licence | Used for |
|---|---|---|
| [Next.js](https://nextjs.org) | MIT | Web framework |
| [React](https://react.dev) and React DOM | MIT | UI |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 | Language |
| [Tailwind CSS](https://tailwindcss.com) and `@tailwindcss/turbopack` | MIT | Styling |
| [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) and [`@supabase/ssr`](https://github.com/supabase/ssr) | MIT | Supabase clients |
| [Zod](https://zod.dev) | MIT | Validating AI output and API input |
| [idb](https://github.com/jakearchibald/idb) | ISC | IndexedDB for the offline queue |
| [Lucide](https://lucide.dev) (`lucide-react`) | ISC | Icons |
| [`server-only`](https://www.npmjs.com/package/server-only) | MIT | Keeps server code out of the browser |
| [sharp](https://sharp.pixelplumbing.com) | Apache-2.0 | Generating app icons |
| [Vitest](https://vitest.dev) | MIT | Tests |
| [tsx](https://tsx.is) | MIT | Running scripts |
| [ESLint](https://eslint.org) and `eslint-config-next` | MIT | Linting |

### Fonts

| Font | Designer | Licence |
|---|---|---|
| [Geist and Geist Mono](https://vercel.com/font) | Vercel | SIL Open Font License 1.1 |
| [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) | Mathieu Triay | SIL Open Font License 1.1 |

## Future Improvements

- Native-speaker review of the Naijá, Hausa, Yorùbá and Igbo translations. They're a careful first draft, not a certified translation.
- Stronger witness independence. Today each phone is one witness, so one person with several phones counts several times.
- More robust IReV sheet parsing and party-name matching across election types.
- Real SMS on a production shortcode, beyond the Africa's Talking sandbox.
- Polling unit locations on a map. The directory has names, not verified coordinates.
- Testing with real observers and voters during an election, which we haven't been able to do.

## Safety Note

CounTrack is not an official source of election results. It records what witnesses photographed and shows where records don't match. It does not prove that fraud happened, and the AI can misread a figure. For official results, refer to INEC. Report electoral offences to INEC, the police or accredited observers. Incident reports in CounTrack are unverified and are not proof that an incident occurred.

## Team

- Zainab Musa
- Victory Anyanwu

---

CounTrack doesn't accuse anyone. It shows what the wall said, who photographed it, when, and whether the announced figure matches.
