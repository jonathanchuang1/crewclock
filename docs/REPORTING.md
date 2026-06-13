# Reporting — turning ClockEvents into hours, pay & job cost

`ClockEvents` is the raw, append-only truth. Everything else is derived. The model:

- `clock_in` → **starts** a segment
- `change_job` → **ends** the previous segment, **starts** a new one
- `clock_out` → **ends** the current segment
- `add_note` / `todo_update` → do **not** affect time; they're context

No drive time, no travel split — a segment's job is simply whatever the employee last selected.

---

## 1. Clean the event stream

In a working tab `Events`, pull a sorted, de-duplicated view of `ClockEvents`:
```
=QUERY(
  UNIQUE(ClockEvents!A2:U),   /* drop exact dupes */
  "select * order by Col14",  /* timestamp_utc ascending */
  0
)
```
For a stronger de-dupe (retries that produced two rows with different `event_id` but the same action), de-dupe on `duplicate_check_key` (column T) with a helper:
```
=SORTN(ClockEvents!A2:U, 9^9, 2, 20 /*duplicate_check_key col*/, TRUE)
```
`SORTN(..., mode 2)` keeps one row per unique key.

---

## 2. Build TimeSegments

A segment = a time-relevant event paired with the **next** time-relevant event for the **same employee**. "Time-relevant" = `clock_in`, `change_job`, `clock_out`.

Practical approach (Google Sheets):

1. Filter `Events` to time-relevant rows only, sorted by `employee_id`, then `timestamp_utc`.
2. For each row that is `clock_in` or `change_job`, the **segment_end** is the `timestamp_utc` of the *next* row for that same employee (whatever its type). If the next row is `clock_out` or `change_job`, that's a clean close. If there is no next row for that employee, the segment is **open**.

Formula skeleton for a `TimeSegments` tab (assuming the cleaned, sorted list is in `Seg!A:F` = employee_id, job_id, job_name, job_address, event_type, timestamp_utc):

```
segment_start = ts of this row
segment_end   = IF(next row same employee, next ts, "")          // open if blank
total_hours   = IF(segment_end="", "", (segment_end - segment_start) * 24)
hourly_rate_at_time = VLOOKUP(employee_id, Employees!A:E, 5, FALSE)   // rate snapshot
labor_cost    = IF(total_hours="", "", total_hours * hourly_rate_at_time)
status        = IF(segment_end="", "open", "closed")
```

Example "next row, same employee" end-time formula in row *n* (employee in `A`, ts in `F`):
```
=IF( A2=A3, F3, "" )      // if next row is the same employee, use its timestamp; else open
```

> **Rate snapshotting:** copy `hourly_rate_at_time` as a **value** once a pay period is approved (Paste special → values only), so a later raise can't rewrite historical payroll. Or store the rate in the segment row at close time. This satisfies "future rate changes must not alter old payroll."

### Edge cases & how they resolve
| Case | Handling |
|---|---|
| Forgot to clock out | Segment stays **open** (`segment_end` blank). Flag in payroll as `missing_clock_out`; admin closes via `AdminCorrections`. |
| Double clock-in | Two consecutive `clock_in` rows → the first closes when the second starts (≈0 h) or you ignore a `clock_in` while already open. Add a guard column: `is_dup_open = AND(prev_type∈{clock_in,change_job}, this_type=clock_in)`. |
| Clock-out while already out | A `clock_out` with no open segment → ignore (no matching start). |
| Change to same job | `change_job` where new `job_id` = current → the app already blocks it; in reports it produces a zero-length segment you can drop (`total_hours ≈ 0`). |
| Change job while clocked out | App blocks it (button hidden). If one slips in, treat as a stray and ignore. |
| Crosses midnight | UTC math handles it; total_hours is correct. Split per-day only if payroll needs it (add a daily QUERY). |
| Duplicate submitted event | De-duped by `event_id` / `duplicate_check_key` in step 1. |
| Offline event syncs later | Lands with its original `timestamp_utc`; the sort in step 1 re-orders it correctly. |
| Out-of-order events | The `timestamp_utc` sort fixes ordering before segmentation. |
| Job disabled mid-shift | Open segment is unaffected; employee just can't start a new one there. |
| Missing hourly rate | `labor_cost` shows blank/error; flag employee, fix rate, recompute. |

---

## 3. PayrollReport (per employee, per date range)
```
total_hours         = SUMIFS(TimeSegments.total_hours, employee_id, E, start, >=, end, <=)
gross_pay           = SUMIFS(TimeSegments.labor_cost, ...)         // uses snapshotted rate
missing_clock_out_count = COUNTIFS(TimeSegments.status, "open", employee_id, E)
final_payroll_hours = total_hours + admin_adjustments
final_gross_pay     = final_payroll_hours * hourly_rate           (or sum of segment costs)
```
A single `QUERY` does it all:
```
=QUERY(TimeSegments!A:K,
 "select B, C, sum(I), sum(J) where status='closed' group by B, C label sum(I) 'hours', sum(J) 'pay'")
```
(columns: B=employee_id, C=employee_name, I=total_hours, J=labor_cost — adjust to your layout).

## 4. JobCostReport (per job)
```
=QUERY(TimeSegments!A:K,
 "select D, E, sum(I), sum(J), count(A) where status='closed' group by D, E
  label sum(I) 'labor_hours', sum(J) 'labor_cost', count(A) 'segments'")
```
Add `open_todos` / `completed_todos` with `COUNTIFS(Todos.job_id, job, Todos.status, "open")` etc.

## 5. Export
File → Download → **CSV** (current tab) or **.xlsx** for the whole book. That's your payroll/job-cost export. For recurring exports, duplicate the report tab per pay period and freeze it (paste-values) so the numbers never drift.
