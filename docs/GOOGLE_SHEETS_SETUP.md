# Google Sheets setup (admin database + reporting)

You will keep **two** Google Sheets:

1. **CrewClock — Admin (private)** — everything, including pay rates. Never published.
2. **CrewClock — App Config (published, sanitized)** — only employee-safe data. Published tab-by-tab as CSV for the app to read.

> Why two files? Publishing a tab to the web makes that tab readable by anyone with the link. Keeping pay/admin data in a *separate private file* guarantees rates can never leak through the published config, no matter what.

---

## A. Admin (private) workbook — tabs & fields

Create these tabs with a header row exactly matching the field names. Sample rows are in `docs/sample-data/`.

1. **Employees** — `employee_id, employee_name, employee_token, employee_token_revoked, hourly_rate, active_status, phone, email, notes, created_at, updated_at`
2. **Jobs** — `job_id, job_name, job_address, customer_name, active_status, notes, quickbooks_customer_id, quickbooks_project_id, quickbooks_display_name, sync_source, last_synced_at, created_at, updated_at`
3. **EmployeeJobAccess** — `access_id, employee_id, employee_name, job_id, job_name, enabled_status, created_at, updated_at`
4. **ClockEvents** *(append-only — the Form writes here)* — `event_id, employee_id, employee_name, employee_token_identifier, event_type, job_id, job_name, job_address, note_text, todo_id, todo_status, todo_completion_note, timestamp_local, timestamp_utc, timezone, device_info, user_agent, submitted_at, sync_status, duplicate_check_key`
5. **Todos** — `todo_id, title, description, assigned_employee_id, assigned_employee_name, job_id, job_name, priority, status, due_date, employee_can_complete, created_by, created_at, completed_at, completion_note, admin_notes`
6. **TimeSegments** *(formula-generated)* — see `docs/REPORTING.md`
7. **PayrollReport** *(formula-generated)*
8. **JobCostReport** *(formula-generated)*
9. **AdminCorrections** — `correction_id, corrected_by, correction_type, employee_id, job_id, original_value, corrected_value, reason, created_at`
10. **AuditLog** — `audit_id, actor_type, actor_id, action, details, timestamp, device_info`

> The Google **Form** must write into tab **ClockEvents**. When you link the form to this spreadsheet it usually creates a tab called *Form Responses 1* — either rename that tab to `ClockEvents`, or point your reports at the form-responses tab. The column order must match the order the form questions were created in.

---

## B. App Config (published, sanitized) workbook — tabs & fields

Create a **second** spreadsheet with exactly these four tabs. You can fill them by hand, or have them pull from the Admin workbook with `IMPORTRANGE` (see below) so you maintain data in one place.

1. **EmployeesConfig** — `employee_id, employee_name, employee_token, employee_token_revoked, active_status, timezone`
   *(note: NO hourly_rate, NO phone/email)*
2. **JobsConfig** — `job_id, job_name, job_address, customer_name, active_status`
3. **AccessConfig** — `employee_id, job_id, enabled_status`
4. **TodosConfig** — `todo_id, title, description, assigned_employee_id, job_id, priority, status, employee_can_complete, due_date`

### Auto-sync from the Admin workbook (recommended)
In `EmployeesConfig!A2` of the published file:
```
=IMPORTRANGE("<ADMIN_FILE_ID>", "Employees!A2:F")
```
…selecting only the safe columns. (The first time, click **Allow access**.) Do the same for the other three tabs. Now you edit only the Admin file and the published config follows — with rates left behind.

### Publish each tab as CSV
For the published config file: **File → Share → Publish to web**. Choose **Entire document** or, better, publish **each tab individually** as **Comma-separated values (.csv)**. You get URLs like:
```
https://docs.google.com/spreadsheets/d/e/2PACX-xxxxx/pub?gid=0&single=true&output=csv
```
The `gid` differs per tab. Copy one URL per tab into `src/config.js` → `CSV.{employees,jobs,access,todos}`.

> Tip: to find a tab's `gid`, open that tab in the browser and read `#gid=NUMBER` from the URL. The published URL uses the same number.

---

## C. Admin instructions (day-to-day, all in the Sheet)

- **Add an employee:** new row in `Employees`. Generate a token (see README §5). Set `active_status = active`. The matching row flows to `EmployeesConfig`. Send them `https://your-site/?t=TOKEN`.
- **Set/raise a rate:** edit `hourly_rate`. Past payroll is protected because `TimeSegments` snapshots the rate at segment time (see reporting doc) — change rates going forward only, or log a correction.
- **Create a job:** new row in `Jobs`, `active_status = active`.
- **Let an employee clock into a job:** add a row in `EmployeeJobAccess` with `enabled_status = enabled`. Remove/disable to revoke. The app only ever lists jobs that are *both* active *and* enabled for that employee.
- **Disable a job/employee:** set `active_status = inactive`. Anyone currently clocked in keeps their open segment; they just can't start a *new* one there.
- **Revoke a link:** `employee_token_revoked = yes`.
- **Create a to-do:** new row in `Todos`. Assign by `assigned_employee_id`, by `job_id`, both, or neither (general). Set `employee_can_complete = yes` to let the employee check it off; `no` makes it read-only (admin verifies).
- **Review work:** filter `ClockEvents` by employee/job/date for notes and actions; read `completion_note` on `Todos`.
- **Correct time:** never edit `ClockEvents` (append-only). Instead log the change in `AdminCorrections` and adjust the relevant `TimeSegments` row (`admin_corrected = yes`).

---

## D. Who is clocked in right now?
Add a helper tab `LiveStatus` and per employee:
```
=ARRAYFORMULA( ... )  // or simply:
=QUERY(ClockEvents, "select B, F, G, max(O) where E matches 'clock_in|clock_out|change_job' group by B, F, G label max(O) 'last_event'")
```
The simplest reliable view: sort `ClockEvents` by `timestamp_utc` desc and look at each employee's latest `event_type` — `clock_in`/`change_job` = on the clock, `clock_out` = off. `docs/REPORTING.md` turns this into segments automatically.
