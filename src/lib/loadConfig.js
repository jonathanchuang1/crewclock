import { rpc } from "./supabase.js";
import { getCachedConfig, setCachedConfig } from "./storage.js";

function normalizeTodo(t) {
  return {
    todo_id: t.todo_id,
    title: t.title,
    description: t.description || "",
    job_id: t.job_id || "",
    assigned_employee_id: t.assigned_employee_id || "",
    priority: (t.priority || "medium").toLowerCase(),
    status: t.status,
    can_complete: !!t.can_complete,
    due_date: t.due_date || "",
  };
}

/**
 * Load everything one employee may see, by token. The database function does
 * the filtering server-side (token validated; unknown/revoked/inactive ->
 * {error}); the public key can't read any table directly.
 */
export async function loadConfig(token) {
  const data = await rpc("get_profile", { p_token: token });
  if (!data || data.error) return { error: (data && data.error) || "network" };

  const jobs = (data.jobs || []).map((j) => ({
    job_id: j.job_id,
    job_name: j.job_name,
    job_address: j.job_address,
    customer_name: j.customer_name || "",
  }));

  const selected = {
    profile: { ...data.profile, token },
    jobs,
    allJobIds: new Set(jobs.map((j) => j.job_id)),
    myTodos: (data.myTodos || []).map(normalizeTodo),
    jobTodos: (data.jobTodos || []).map(normalizeTodo),
  };
  setCachedConfig(token, selected);
  return selected;
}

/** Synchronous cache read for instant first paint. */
export function loadCached(token) {
  return getCachedConfig(token);
}
