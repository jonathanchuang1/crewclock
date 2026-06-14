import { parseCSV } from "../lib/csv.js";

/**
 * Admin data layer. Reads the PRIVATE Admin spreadsheet via the Google
 * Visualization CSV endpoint (works cross-origin without auth as long as the
 * sheet is shared "anyone with the link can view"). The sheet id lives only in
 * this machine's localStorage — never hardcoded into the shipped app.
 */

const gvizUrl = (sheetId, tab) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    tab
  )}`;

export async function fetchTab(sheetId, tab) {
  let res;
  try {
    res = await fetch(gvizUrl(sheetId, tab), { cache: "no-store" });
  } catch {
    throw new Error(
      `Couldn't reach your sheet. Make sure it's shared “Anyone with the link → Viewer”.`
    );
  }
  if (!res.ok) throw new Error(`${tab}: HTTP ${res.status} (is the tab named “${tab}”?)`);
  const text = await res.text();
  if (text.trim().startsWith("<")) {
    throw new Error(
      `Your sheet isn't publicly readable yet. In Google Sheets: Share → General access → “Anyone with the link” → Viewer.`
    );
  }
  return parseCSV(text);
}

export async function fetchAdminData(sheetId) {
  const [employees, jobs, events] = await Promise.all([
    fetchTab(sheetId, "Employees"),
    fetchTab(sheetId, "Jobs"),
    fetchTab(sheetId, "ClockEvents"),
  ]);
  return { employees, jobs, events, fetchedAt: new Date() };
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
      hours: 0,
      openHours: 0,
    });
    a.hours += s.hours;
    if (s.open) a.openHours += s.hours;
  }
  return Object.values(acc)
    .map((a) => ({
      ...a,
      rate: rate[a.employee_id] || 0,
      pay: a.hours * (rate[a.employee_id] || 0),
    }))
    .sort((x, y) => y.pay - x.pay);
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
    const key = s.job_id || "(none)";
    const a = (acc[key] ||= {
      job_id: s.job_id,
      job_name: jobName[s.job_id] || s.job_name || "(unknown job)",
      job_address: jobAddr[s.job_id] || s.job_address || "",
      hours: 0,
      cost: 0,
      workers: new Set(),
    });
    a.hours += s.hours;
    a.cost += s.hours * (rate[s.employee_id] || 0);
    a.workers.add(s.employee_name || s.employee_id);
  }
  return Object.values(acc)
    .map((a) => ({ ...a, workers: [...a.workers] }))
    .sort((x, y) => y.cost - x.cost);
}
