import { uuid, duplicateKey } from "./id.js";

/**
 * Build a fully-formed ClockEvents row. One row per employee action.
 * `profile` = { employee_id, employee_name, token } ; `extra` = event-specific
 * fields (event_type, job_*, note_text, todo_*).
 */
export function buildEvent(profile, extra) {
  const now = new Date();
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";

  const base = {
    event_id: uuid(),
    employee_id: profile.employee_id || "",
    employee_name: profile.employee_name || "",
    employee_token_identifier: (profile.token || "").slice(0, 8), // partial, not full secret
    event_type: "",
    job_id: "",
    job_name: "",
    job_address: "",
    note_text: "",
    todo_id: "",
    todo_status: "",
    todo_completion_note: "",
    timestamp_local: now.toLocaleString("sv-SE"), // YYYY-MM-DD HH:mm:ss, locale-stable
    timestamp_utc: now.toISOString(),
    timezone,
    device_info: `${navigator.platform || ""} ${
      window.screen ? window.screen.width + "x" + window.screen.height : ""
    }`.trim(),
    user_agent: navigator.userAgent || "",
    duplicate_check_key: "",
    ...extra,
  };
  base.duplicate_check_key = duplicateKey(base);
  return base;
}
