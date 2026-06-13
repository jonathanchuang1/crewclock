# CrewClock — mobile-first field-service time tracker

A polished, fast PWA for field crews to **clock in/out, switch job addresses, add notes, and complete to-dos** from their phone — backed entirely by **free Google Sheets + Google Forms**. No server, no office computer, no monthly cost.

```
Employee phone  →  static PWA (React/Vite)  →  hidden Google Form POST  →  Google Sheets (ClockEvents, append-only)
Admin           →  manages Employees / Jobs / Access / To-dos in Google Sheets, runs reports there
```

---

## 1. MVP architecture (what & why)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + Tailwind + Framer Motion + Lucide, shipped as a static site | Loads instantly, installs to home screen, no backend to keep alive |
| Writes (clock events) | **Google Form** `formResponse` endpoint, POSTed with `fetch(..., { mode: "no-cors" })` | Forms accept anonymous cross-origin POSTs and pipe straight into a Sheet — a free write API with zero credentials in the client |
| Reads (employee config) | A **sanitized published Sheet** exported as CSV, fetched + filtered client-side by token | Free, cacheable, never exposes pay rates |
| Source of truth | Google Sheets | Admin already knows it; pivots/formulas do the reporting |
| Offline / speed | localStorage cache + optimistic UI + retry queue | UI never waits on Google |

### Why this avoids the laggy Google Apps Script UI
Apps Script web apps render server-side on every interaction: each tap does a round-trip to Google's servers, re-runs your `doGet`, and re-paints — typically 1–3 s of lag, plus quota limits. CrewClock instead ships a **pre-built static bundle** that runs entirely on the phone. Taps update the screen in **<16 ms** from local state; the Google round-trip happens silently in the background and can fail/retry without the user ever waiting. Google is a *data pipe*, never the renderer.

---

## 2. Repo layout

```
src/
  config.js              ← the ONLY file you edit to connect your Form + Sheet
  lib/
    loadConfig.js        reads sanitized CSVs, filters by token
    sync.js              Google Form submit + offline retry queue
    storage.js           localStorage cache + queue
    events.js            builds ClockEvents rows
    csv.js, id.js        parser + event_id/duplicate key
    demoData.js          sample data for demo mode
  hooks/useTimeTracker.js  all employee state + optimistic actions
  components/, pages/    the UI
public/
  sw.js, manifest.webmanifest, icon.svg   ← PWA
docs/
  GOOGLE_SHEETS_SETUP.md   tabs, sample rows, what to publish
  GOOGLE_FORM_SETUP.md     create the form, find entry IDs, test it
  REPORTING.md             TimeSegments / payroll / job-cost formulas
  DEPLOYMENT.md            GitHub Pages / Netlify / Cloudflare
  TEST_CHECKLIST.md        end-to-end test list + edge cases
  LIMITATIONS_AND_UPGRADE.md  honest limits + path to a real backend
  sample-data/             CSVs you can paste straight into the Sheet
```

---

## 3. Run it now (demo mode)

```bash
npm install
npm run dev      # open the printed URL on your phone or browser
```

While `src/config.js` still contains `REPLACE`, the app runs in **demo mode**: bundled sample data, and "submitted" events go to `window.__ccDemoLog` (open the console to inspect them). The demo token is `demo` — the app loads it automatically.

Try the full flow: **Clock In → pick a job → Change Job → add a note → complete a to-do → Clock Out.** Toggle your browser/devtools to Offline and watch the sync bar say *"Saved on device"*, then come back online and watch it flush.

---

## 4. Go live — 4 steps

1. **Build the Sheet** — follow [`docs/GOOGLE_SHEETS_SETUP.md`](docs/GOOGLE_SHEETS_SETUP.md). Paste the sample CSVs from `docs/sample-data/`.
2. **Build the Form** — follow [`docs/GOOGLE_FORM_SETUP.md`](docs/GOOGLE_FORM_SETUP.md). Copy its action URL and the `entry.xxxx` IDs.
3. **Edit `src/config.js`** — paste the Form action URL, the entry IDs, and the four published-CSV URLs. Demo mode turns itself off automatically.
4. **Deploy** — follow [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), then send each employee `https://your-site/?t=THEIR_TOKEN`.

---

## 5. Employee link & token logic

- Each employee row has a long random `employee_token` (32+ chars). Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
  ```
- Link format: `https://your-site/?t=THE_TOKEN` (also accepts `#t=` and `?token=`).
- The app loads the sanitized config, finds the row whose `employee_token` matches, and shows **only that employee's** name, allowed active jobs, and to-dos.
- **Revoke:** set `employee_token_revoked = yes` (or `active_status = inactive`) in the Sheet. On next config refresh the app blocks all actions and shows a revoked message. Cached actions already queued still flush, but no new ones are allowed.

---

## 6. Optimistic UI + offline guarantees (already built)

- Every tap (clock in/out, change job, add note, complete to-do) updates the screen and the localStorage cache **immediately**, then enqueues an event.
- `lib/sync.js` flushes the queue on an interval, on regaining connectivity (`online` event), and on window focus.
- Each event carries a UUID `event_id` and a deterministic `duplicate_check_key`, so a retried submission can be de-duplicated in the Sheet (see [`docs/REPORTING.md`](docs/REPORTING.md)).
- Clock status survives refresh/airplane mode because it lives in `localStorage`.

---

## 7. Deliverables map

| # | Deliverable | Where |
|---|---|---|
| 1–2 | Architecture & why-not-Apps-Script | this file, §1 |
| 3 | Full frontend code | `src/`, `public/` |
| 4–5 | Sheet tabs + sample rows | `docs/GOOGLE_SHEETS_SETUP.md`, `docs/sample-data/` |
| 6–8 | Form endpoint, entry IDs, submission | `docs/GOOGLE_FORM_SETUP.md`, `src/lib/sync.js` |
| 9–10 | Offline queue + duplicate prevention | `src/lib/sync.js`, `src/lib/storage.js`, `src/lib/id.js` |
| 11 | Token link logic | §5 above, `src/lib/loadConfig.js` |
| 12–13 | Admin & employee instructions | `docs/GOOGLE_SHEETS_SETUP.md`, §3/§5 |
| 14 | Reporting formulas | `docs/REPORTING.md` |
| 15 | Test checklist | `docs/TEST_CHECKLIST.md` |
| 16 | Deployment | `docs/DEPLOYMENT.md` |
| 17–18 | Limitations + upgrade path | `docs/LIMITATIONS_AND_UPGRADE.md` |

Built lean on purpose. Everything QuickBooks-related is left as structure-only (extra columns in the Sheet, an adapter-friendly data model) — no integration code in the MVP.
