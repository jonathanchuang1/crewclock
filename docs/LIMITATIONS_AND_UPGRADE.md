# Limitations of the free workaround + how to upgrade later

## Honest limitations

**Security (it's a lightweight MVP, not enterprise auth):**
- The published config CSV is readable by anyone who has its URL. It contains employee **names and tokens** (never rates). So the config URL is itself semi-secret — treat it like a password, don't post it publicly. A determined person with the CSV URL could read all tokens.
  - *Mitigations in place:* rates/PII live only in the private Admin file; tokens are long & random; tokens are revocable; the app only surfaces one employee's data.
  - *If you need more:* put a tiny Cloudflare Worker / serverless function in front that takes the token and returns only that employee's slice (see upgrade path) — this stops bulk token harvesting without changing the UI.
- Tokens in a URL can be shared or shoulder-surfed. There's no password/2FA. Acceptable for a small trusted crew; rotate tokens if one leaks.

**Write path (Google Forms):**
- `no-cors` POSTs are **fire-and-forget** — the app can't read a true success/failure from Google, so it assumes delivery and relies on sheet-side de-duplication. Rare double rows are possible and are cleaned in reporting via `event_id`.
- No server-side validation: a malicious actor who knows the form could submit junk rows. Guard with the `AuditLog`, sanity-check reports for impossible events, and (later) move writes behind a function that validates the token.
- Google Forms quotas are generous but not infinite; fine for a small crew, not thousands of submissions/minute.

**Reads / freshness:**
- Published CSV can lag a few minutes after a sheet edit (Google's cache). The app refreshes config every 5 min and caches offline, so it's usually invisible — but a just-revoked token may keep working briefly until the next refresh.

**Reporting:**
- All math is spreadsheet formulas. Great up to thousands of events; beyond that, formulas get slow and you'll want a real database.

**No real-time admin dashboard** in the MVP — admin works in the Sheet. (A read-only admin view can be added later from the same data.)

---

## Upgrade path — swap the backend without rewriting the UI

The app is already structured so the employee UI never talks to Google directly. Two seams do all the I/O:

- **Reads:** `src/lib/loadConfig.js` (`loadConfig(token)`)
- **Writes:** `src/lib/sync.js` (`submitEvent(event)` + the queue)

Everything else (components, the `useTimeTracker` hook, optimistic cache, offline queue) is backend-agnostic. To move to a real backend you only reimplement those two seams behind the same function signatures.

### Step 1 — introduce a storage adapter interface
```js
// src/lib/storageAdapter.js
export const adapter = {
  loadConfig(token) { /* returns { profile, jobs, myTodos, jobTodos } */ },
  submitEvent(event) { /* persists one ClockEvents row */ },
};
```
Point `loadConfig.js` / `sync.js` at `adapter`. The current Google implementation becomes `GoogleSheetsAdapter`.

### Step 2 — add a real backend adapter
Drop in a free/cheap backend (Supabase, Cloudflare D1 + Workers, Firebase, or your own API). Implement:
- `GET /config?token=...` → returns the same shape `loadConfig` already returns, **and now hides tokens** (the server filters server-side, so the client never downloads everyone's data). Fixes the biggest security limitation.
- `POST /events` → validates the token, writes one row, returns a real success/error (so the queue can stop guessing). Enforces idempotency on `event_id` server-side — true duplicate prevention.

Because the UI consumes the same shapes, **no component changes**. Optimistic UI and the offline queue keep working; the queue just gets *real* delivery confirmation.

### Step 3 — QuickBooks (already scaffolded, not built)
The data model is QuickBooks-ready:
- `Jobs` carries `quickbooks_customer_id, quickbooks_project_id, quickbooks_display_name, sync_source, last_synced_at`.
- Add a `QuickBooksService` that syncs customers/jobs/projects **into** `Jobs` (new ones land `active_status = inactive` by default; admin enables access). Map labor cost from `TimeSegments` to QB customer/project. Add `quickbooks_sync_status` to segments and push approved time/cost back to QB.
- The employee UI still only knows about generic "jobs" — it never depends on QuickBooks. Keep it that way (adapter/service mindset).

### Net result
You can go from "Google Sheets MVP" → "real database + validated API + QuickBooks sync" incrementally, reusing 100% of the front-end, by only swapping the two I/O seams.
