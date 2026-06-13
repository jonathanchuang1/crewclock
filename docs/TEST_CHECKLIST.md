# Test checklist

Run in **demo mode** first (no setup), then repeat against the live Sheet/Form. In demo mode, open the browser console and watch `window.__ccDemoLog` to see the exact rows that would be submitted.

## Core employee flow
- [ ] Open `?t=demo` → see employee name, Clocked Out status, Clock In button.
- [ ] Tap **Clock In** → job sheet opens, lists only allowed + active jobs (J102 is hidden — access disabled).
- [ ] Pick a job, add a note, confirm → status flips to **Clocked In instantly**, timer starts, toast shows. Console log has a `clock_in` row.
- [ ] **Change Job** → current job is excluded from the list; pick another → status updates instantly; `change_job` row logged.
- [ ] **Add Note** while clocked in → note row carries the current job_id.
- [ ] **Clock Out** → status flips to Clocked Out; `clock_out` row logged with the last job.
- [ ] Add a note while clocked **out** → row has empty job fields (general note).

## To-dos
- [ ] "My To-Dos" shows tasks assigned to the employee; "Current Job To-Dos" appears only while clocked into a job that has open job-todos.
- [ ] A todo with `employee_can_complete = no` shows a lock and can't be checked.
- [ ] Complete a todo → completion sheet asks for an optional note → row marked done, `todo_update` logged, stays done after refresh.

## Optimistic / persistence
- [ ] After Clock In, **refresh the page** → still Clocked In with correct job and running timer (status persisted in localStorage).
- [ ] All taps update the UI in well under a second, never blocking on network.

## Offline & sync (DevTools → Network → Offline)
- [ ] Go offline, tap Clock In → UI updates; sync bar shows **"Offline · N saved on device"**.
- [ ] Tap several more actions offline → all reflected in UI, all queued.
- [ ] Go back online → sync bar shows **Syncing…** then **Synced**; queue drains. (Live mode: rows appear in the sheet.)
- [ ] Close the tab while offline, reopen → queued events are still there and flush when online.

## Duplicate prevention
- [ ] Same logical action isn't enqueued twice (same `event_id` guarded). In live mode, a retried event de-dupes in the sheet on `event_id` / `duplicate_check_key` (see REPORTING.md).

## Tokens / access control
- [ ] Open with no `?t=` (live mode) → "open your secure link" message.
- [ ] Set `employee_token_revoked = yes` (or inactive) in config, wait for refresh / reopen → actions blocked, revoked message.
- [ ] An employee never sees: hourly rate, other employees, admin pages, disabled jobs, or jobs they lack access to.

## Edge cases (verify via REPORTING.md once events exist)
- [ ] Forgot clock-out → open segment flagged.
- [ ] Double clock-in / clock-out-while-out → no broken segments.
- [ ] Change to same job → blocked by UI (current job excluded from list).
- [ ] Shift crossing midnight → hours correct.
- [ ] Out-of-order / late offline event → sorts correctly by `timestamp_utc`.

## PWA
- [ ] `npm run build && npm run preview` over HTTPS (or deployed) → "Add to Home Screen" works; app opens full-screen; shell loads offline.
