/**
 * CrewClock configuration — WIRED UP to the live Google backend.
 *
 * Created automatically by setup/CrewClock_Setup.gs on 2026-06-13 for
 * sealbeachrainbowrestores@gmail.com (Rainbow Restoration of Seal Beach).
 *
 *   Admin sheet:  https://docs.google.com/spreadsheets/d/1g-PDzvJ-sCuJhYX0DrDO4N5X714F5TqHIZcnPnStGMk/edit
 *   Config sheet: https://docs.google.com/spreadsheets/d/1YmVenmek1rsfc7EhIpCA5oBcsc2Pqhj_pWzgVvfKFwQ/edit
 *   Form editor:  https://docs.google.com/forms/d/1f1y2mc4jcsbVD2I3c3sSQOsjlFELyfQMfAUHPKZWmuk/edit
 */

export const APP = {
  name: "CrewClock",
  refreshMs: 5 * 60 * 1000,
  syncIntervalMs: 15 * 1000,
};

/** Google Form endpoint for WRITES (clock events). */
export const FORM = {
  actionUrl:
    "https://docs.google.com/forms/d/e/1FAIpQLSdA2xsSaZnfRF2qU1vbh07CR1cdQ7eAh6ywG4AJmOl_TL6z3Q/formResponse",

  // ClockEvents column -> Google Form entry id.
  // (Read from the live form's FB_PUBLIC_LOAD_DATA_ — these are the real
  // submission ids, which differ from Apps Script's item.getId().)
  fields: {
    event_id: "entry.1764650624",
    employee_id: "entry.1926535576",
    employee_name: "entry.316842679",
    employee_token_identifier: "entry.235212670",
    event_type: "entry.369639988",
    job_id: "entry.1275637467",
    job_name: "entry.1929308427",
    job_address: "entry.252812746",
    note_text: "entry.784554929",
    todo_id: "entry.1832274122",
    todo_status: "entry.596171711",
    todo_completion_note: "entry.1197946888",
    timestamp_local: "entry.1136408260",
    timestamp_utc: "entry.1817753995",
    timezone: "entry.626310417",
    device_info: "entry.672129560",
    user_agent: "entry.617945810",
    duplicate_check_key: "entry.1851616018",
  },
};

/**
 * Published Google Sheet CSV endpoints for READS (sanitized, employee-safe).
 *
 * These use the CSV export endpoint on the "CrewClock — App Config" sheet,
 * which is shared "anyone with link can view". Verified to return a proper
 * CORS response (Access-Control-Allow-Origin) for anonymous cross-origin
 * fetches, so the static app can read them from any host. No pay rates or
 * PII are present in these tabs.
 */
const CONFIG_SHEET_ID = "1YmVenmek1rsfc7EhIpCA5oBcsc2Pqhj_pWzgVvfKFwQ";
const csvUrl = (gid) =>
  `https://docs.google.com/spreadsheets/d/${CONFIG_SHEET_ID}/export?format=csv&gid=${gid}`;

export const CSV = {
  employees: csvUrl(0), // EmployeesConfig
  jobs: csvUrl(1373808387), // JobsConfig
  access: csvUrl(944075018), // AccessConfig
  todos: csvUrl(1222125671), // TodosConfig
};

/**
 * Demo mode auto-enables only while placeholders remain. Now that real
 * endpoints are wired in, this is false and the app talks to Google for real.
 */
export const DEMO_MODE =
  FORM.actionUrl.includes("REPLACE") || CSV.employees.includes("REPLACE");
