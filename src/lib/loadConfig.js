import { CSV, DEMO_MODE } from "../config.js";
import { parseCSV, truthy } from "./csv.js";
import { DEMO } from "./demoData.js";
import { getCachedConfig, setCachedConfig } from "./storage.js";

async function fetchCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV ${res.status}`);
  return parseCSV(await res.text());
}

async function fetchAll() {
  if (DEMO_MODE) return DEMO;
  const [employees, jobs, access, todos] = await Promise.all([
    fetchCSV(CSV.employees),
    fetchCSV(CSV.jobs),
    fetchCSV(CSV.access),
    fetchCSV(CSV.todos),
  ]);
  return { employees, jobs, access, todos };
}

/**
 * Resolve everything the employee app is allowed to see for a given token.
 * Returns null if the token is unknown/revoked/inactive.
 *
 * Filtering happens client-side: the published CSV is the same for everyone,
 * but the app only ever surfaces rows matching this token's employee_id.
 */
export function selectForToken(raw, token) {
  const me = raw.employees.find(
    (e) => (e.employee_token || "").trim() === token
  );
  if (!me) return { error: "unknown" };
  if (truthy(me.employee_token_revoked)) return { error: "revoked" };
  if (!truthy(me.active_status)) return { error: "inactive" };

  const allowedJobIds = new Set(
    raw.access
      .filter((a) => a.employee_id === me.employee_id && truthy(a.enabled_status))
      .map((a) => a.job_id)
  );

  const jobs = raw.jobs
    .filter((j) => allowedJobIds.has(j.job_id) && truthy(j.active_status))
    .map((j) => ({
      job_id: j.job_id,
      job_name: j.job_name,
      job_address: j.job_address,
      customer_name: j.customer_name || "",
    }));

  const allJobIds = new Set(jobs.map((j) => j.job_id));

  const open = (t) => /^(open|in_progress)$/i.test((t.status || "").trim());
  const myTodos = raw.todos.filter(
    (t) => t.assigned_employee_id === me.employee_id && open(t)
  );
  // Job to-dos are resolved per current job at render time; we pass them through.
  const jobTodos = raw.todos.filter((t) => t.job_id && open(t));

  return {
    profile: {
      employee_id: me.employee_id,
      employee_name: me.employee_name,
      token,
      timezone: me.timezone || "",
    },
    jobs,
    allJobIds,
    myTodos: myTodos.map(normalizeTodo),
    jobTodos: jobTodos.map(normalizeTodo),
  };
}

function normalizeTodo(t) {
  return {
    todo_id: t.todo_id,
    title: t.title,
    description: t.description || "",
    job_id: t.job_id || "",
    assigned_employee_id: t.assigned_employee_id || "",
    priority: (t.priority || "medium").toLowerCase(),
    status: t.status,
    can_complete: truthy(t.employee_can_complete),
    due_date: t.due_date || "",
  };
}

/**
 * Load config for a token. Returns cached data instantly if present, then
 * (caller decides) refresh in the background. Throws only on hard failure.
 */
export async function loadConfig(token) {
  const raw = await fetchAll();
  const selected = selectForToken(raw, token);
  if (!selected.error) setCachedConfig(token, selected);
  return selected;
}

/** Synchronous cache read for instant first paint. */
export function loadCached(token) {
  return getCachedConfig(token);
}
