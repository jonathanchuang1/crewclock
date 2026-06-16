import { rpc } from "../lib/supabase.js";

/**
 * Admin data layer — reads the database through the secret-gated function and
 * maps DB columns to the field names the rest of the admin UI already uses
 * (employee_id, job_name, timestamp_utc, …). The secret lives only in the
 * desktop app, so the public web build can't read this data.
 */
export async function getAdminData(secret) {
  const d = await rpc("get_admin_data", { p_secret: secret });
  if (!d || d.error) throw new Error((d && d.error) || "no data");

  const employees = (d.employees || []).map((e) => ({
    employee_id: e.id,
    employee_name: e.name,
    employee_token: e.token,
    employee_token_revoked: e.token_revoked ? "yes" : "no",
    active_status: e.active ? "active" : "inactive",
    hourly_rate: e.hourly_rate,
    phone: e.phone || "",
    email: e.email || "",
  }));
  const jobs = (d.jobs || []).map((j) => ({
    job_id: j.id,
    job_name: j.name,
    job_address: j.address,
    customer_name: j.customer || "",
    active_status: j.active ? "active" : "inactive",
  }));
  const events = (d.events || []).map((c) => ({
    event_id: c.id,
    employee_id: c.employee_id,
    employee_name: c.employee_name,
    event_type: c.event_type,
    job_id: c.job_id || "",
    job_name: c.job_name || "",
    job_address: c.job_address || "",
    note_text: c.note || "",
    timestamp_utc: c.ts,
  }));
  return {
    employees,
    jobs,
    events,
    access: d.access || [],
    todos: d.todos || [],
    approvals: d.approvals || [],
    settings: d.settings || {},
    fetchedAt: new Date(),
  };
}

/** Pay-schedule options shown in the admin payroll settings. */
export const PAY_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks (biweekly)" },
  { value: "semimonthly", label: "Twice a month (1st–15th, 16th–end)" },
  { value: "monthly", label: "Monthly" },
];

const _date = (y, m, d) => new Date(y, m, d, 0, 0, 0, 0);

/**
 * Generate the recurring pay periods around the anchor (the next payroll date,
 * treated as a period cutoff). Returns a newest-first list of
 * { start: Date, end: Date } at local midnight, end inclusive. For weekly /
 * biweekly the anchor sets the cadence; semimonthly / monthly follow the
 * calendar. `back`/`fwd` = how many periods to include before/after the anchor.
 */
export function payPeriods(frequency, anchorStr, back = 9, fwd = 1) {
  if (!anchorStr) return [];
  const [y, m, d] = String(anchorStr).split("-").map(Number);
  if (!y || !m || !d) return [];
  const out = [];

  if (frequency === "weekly" || frequency === "biweekly") {
    const len = frequency === "weekly" ? 7 : 14;
    for (let k = fwd; k >= -back; k--) {
      const end = _date(y, m - 1, d + k * len); // a period cutoff / payday
      const start = _date(end.getFullYear(), end.getMonth(), end.getDate() - (len - 1));
      out.push({ start, end });
    }
  } else if (frequency === "monthly") {
    for (let k = fwd; k >= -back; k--) {
      const start = _date(y, m - 1 + k, 1);
      const end = _date(start.getFullYear(), start.getMonth() + 1, 0);
      out.push({ start, end });
    }
  } else if (frequency === "semimonthly") {
    const halves = [];
    for (let k = -back; k <= fwd + 1; k++) {
      const base = _date(y, m - 1 + k, 1);
      const yy = base.getFullYear();
      const mm = base.getMonth();
      halves.push({ start: _date(yy, mm, 1), end: _date(yy, mm, 15) });
      halves.push({ start: _date(yy, mm, 16), end: _date(yy, mm + 1, 0) });
    }
    halves.sort((a, b) => b.start - a.start);
    halves.forEach((h) => out.push(h));
  }
  return out;
}

/** Run an admin write function (all gated server-side by the secret). */
export async function adminWrite(secret, fn, params) {
  const r = await rpc(fn, { p_secret: secret, ...(params || {}) });
  if (r && r.ok === false) throw new Error(r.error || "write failed");
  return r;
}

const TIME_EVENTS = new Set(["clock_in", "clock_out", "change_job"]);
const ts = (e) => new Date(e.timestamp_utc || e.Timestamp || 0).getTime();

/**
 * Turn the append-only event log into worked TimeSegments.
 *  clock_in  → opens a segment
 *  change_job→ closes the current segment, opens a new one at the new job
 *  clock_out → closes the current segment
 * A still-open segment (no clock_out) counts up to "now" and is flagged open.
 */
export function buildSegments(events) {
  const byEmp = {};
  for (const e of events) {
    if (!TIME_EVENTS.has(e.event_type)) continue;
    (byEmp[e.employee_id] ||= []).push(e);
  }

  const segments = [];
  for (const evs of Object.values(byEmp)) {
    evs.sort((a, b) => ts(a) - ts(b));
    let open = null;

    const close = (endIso) => {
      if (!open) return;
      const end = new Date(endIso).getTime();
      const start = new Date(open.start).getTime();
      segments.push({
        ...open,
        end: endIso,
        hours: Math.max(0, (end - start) / 3.6e6),
        open: false,
      });
      open = null;
    };
    const start = (e) => {
      open = {
        id: e.event_id, // stable shift id = the event that started it
        employee_id: e.employee_id,
        employee_name: e.employee_name,
        job_id: e.job_id,
        job_name: e.job_name,
        job_address: e.job_address,
        start: e.timestamp_utc,
      };
    };

    for (const e of evs) {
      if (e.event_type === "clock_in") {
        close(e.timestamp_utc); // auto-close if a clock-out was missed
        start(e);
      } else if (e.event_type === "change_job") {
        close(e.timestamp_utc);
        start(e);
      } else if (e.event_type === "clock_out") {
        close(e.timestamp_utc);
      }
    }
    if (open) {
      const startMs = new Date(open.start).getTime();
      segments.push({
        ...open,
        end: null,
        hours: Math.max(0, (Date.now() - startMs) / 3.6e6),
        open: true,
      });
    }
  }
  return segments;
}

/** Latest admin decision per shift, keyed by shift id, from the approvals table. */
export function approvalMap(approvals) {
  const map = {};
  for (const a of approvals || []) {
    const id = a.shift_id;
    if (!id) continue;
    const at = new Date(a.created_at).getTime() || 0;
    if (!map[id] || at >= map[id].at) {
      map[id] = {
        action: (a.action || "").toLowerCase(), // "approved" | "denied"
        hours: a.hours == null ? NaN : Number(a.hours),
        note: a.note || "",
        editedStart: a.edited_start || null,
        editedEnd: a.edited_end || null,
        at,
      };
    }
  }
  return map;
}

const latest = (a, b) => (!a ? b : !b ? a : b.at >= a.at ? b : a);

/**
 * Annotate each shift with review status + payable hours.
 * `extra` = optimistic local decisions not yet round-tripped to the sheet.
 */
export function annotate(segments, approvals, extra = {}) {
  return segments.map((s) => {
    const base = { ...s, dispStart: s.start, dispEnd: s.end };
    const a = latest(approvals[s.id], extra[s.id]);
    if (!a) return { ...base, status: "pending", payHours: 0, effHours: s.hours };
    if (a.action === "denied")
      return { ...base, status: "denied", payHours: 0, effHours: 0, note: a.note };
    // Edited clock-in/out times drive the paid hours; otherwise use the stored hours.
    const dispStart = a.editedStart || s.start;
    const dispEnd = a.editedEnd || s.end;
    const h =
      a.editedStart && a.editedEnd
        ? Math.max(0, (new Date(a.editedEnd) - new Date(a.editedStart)) / 3.6e6)
        : Number.isFinite(a.hours)
        ? a.hours
        : s.hours;
    return {
      ...base,
      status: "approved",
      payHours: h,
      effHours: h,
      dispStart,
      dispEnd,
      edited: !!(a.editedStart || a.editedEnd) || Math.abs(h - s.hours) > 0.01,
      note: a.note,
    };
  });
}

/** Current clocked-in / out state for every employee. */
export function liveStatus(events, employees) {
  const last = {};
  for (const e of events) {
    if (!TIME_EVENTS.has(e.event_type)) continue;
    const cur = last[e.employee_id];
    if (!cur || ts(e) > ts(cur)) last[e.employee_id] = e;
  }
  return employees.map((emp) => {
    const l = last[emp.employee_id];
    const clockedIn =
      !!l && (l.event_type === "clock_in" || l.event_type === "change_job");
    return {
      ...emp,
      clockedIn,
      job_name: clockedIn ? l.job_name : "",
      job_address: clockedIn ? l.job_address : "",
      since: clockedIn ? l.timestamp_utc : null,
    };
  });
}

const inRange = (iso, startMs, endMs) => {
  const t = new Date(iso).getTime();
  return t >= startMs && t <= endMs;
};

/** Per-employee hours + gross pay for a date range. */
export function payroll(segments, employees, startMs, endMs) {
  const rate = {};
  const name = {};
  employees.forEach((e) => {
    rate[e.employee_id] = parseFloat(e.hourly_rate) || 0;
    name[e.employee_id] = e.employee_name;
  });

  const acc = {};
  for (const s of segments) {
    if (!inRange(s.start, startMs, endMs)) continue;
    const a = (acc[s.employee_id] ||= {
      employee_id: s.employee_id,
      employee_name: name[s.employee_id] || s.employee_name,
      hours: 0, // approved only
      pendingHours: 0,
    });
    if (s.status === "approved") a.hours += s.payHours;
    else if (s.status === "pending") a.pendingHours += s.effHours;
  }
  return Object.values(acc)
    .map((a) => ({
      ...a,
      rate: rate[a.employee_id] || 0,
      pay: a.hours * (rate[a.employee_id] || 0),
    }))
    .sort((x, y) => y.pay - x.pay);
}

/**
 * All-time totals per job for the Jobs tab cards: hours worked + labor cost.
 * Uses approved (corrected) hours where reviewed; excludes denied & in-progress.
 */
export function jobTotals(segments, employees) {
  const rate = {};
  employees.forEach((e) => (rate[e.employee_id] = parseFloat(e.hourly_rate) || 0));
  const acc = {};
  for (const s of segments) {
    if (s.open || s.status === "denied") continue;
    const h = s.status === "approved" ? s.payHours : s.hours;
    const a = (acc[s.job_id] ||= { hours: 0, cost: 0 });
    a.hours += h;
    a.cost += h * (rate[s.employee_id] || 0);
  }
  return acc;
}

/** Per-job labor hours + cost for a date range. */
export function jobCost(segments, jobs, employees, startMs, endMs) {
  const rate = {};
  employees.forEach((e) => (rate[e.employee_id] = parseFloat(e.hourly_rate) || 0));
  const jobName = {};
  const jobAddr = {};
  jobs.forEach((j) => {
    jobName[j.job_id] = j.job_name;
    jobAddr[j.job_id] = j.job_address;
  });

  const acc = {};
  for (const s of segments) {
    if (!inRange(s.start, startMs, endMs)) continue;
    if (s.status !== "approved") continue; // bill only approved labor
    const key = s.job_id || "(none)";
    const a = (acc[key] ||= {
      job_id: s.job_id,
      job_name: jobName[s.job_id] || s.job_name || "(unknown job)",
      job_address: jobAddr[s.job_id] || s.job_address || "",
      hours: 0,
      cost: 0,
      workers: new Set(),
    });
    a.hours += s.payHours;
    a.cost += s.payHours * (rate[s.employee_id] || 0);
    a.workers.add(s.employee_name || s.employee_id);
  }
  return Object.values(acc)
    .map((a) => ({ ...a, workers: [...a.workers] }))
    .sort((x, y) => y.cost - x.cost);
}
