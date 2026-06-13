/**
 * Sample data used when DEMO_MODE is on (config still has REPLACE placeholders).
 * Mirrors the sanitized CSV tabs described in docs/GOOGLE_SHEETS_SETUP.md.
 * The demo token is "demo".
 */
export const DEMO = {
  employees: [
    {
      employee_id: "E001",
      employee_name: "Alex Rivera",
      employee_token: "demo",
      employee_token_revoked: "no",
      active_status: "active",
      timezone: "America/Chicago",
    },
  ],
  jobs: [
    {
      job_id: "J100",
      job_name: "Maple St Water Damage",
      job_address: "412 Maple St, Springfield",
      customer_name: "Janet Cole",
      active_status: "active",
    },
    {
      job_id: "J101",
      job_name: "Oak Ave Mold Remediation",
      job_address: "88 Oak Ave, Springfield",
      customer_name: "Rodriguez Family",
      active_status: "active",
    },
    {
      job_id: "J102",
      job_name: "Downtown Office Fire",
      job_address: "1200 Center Blvd, Suite 4",
      customer_name: "Hartwell LLC",
      active_status: "active",
    },
  ],
  access: [
    { employee_id: "E001", job_id: "J100", enabled_status: "enabled" },
    { employee_id: "E001", job_id: "J101", enabled_status: "enabled" },
    { employee_id: "E001", job_id: "J102", enabled_status: "disabled" },
  ],
  todos: [
    {
      todo_id: "T1",
      title: "Photograph all affected rooms",
      description: "Wide + detail shots before extraction.",
      assigned_employee_id: "E001",
      job_id: "J100",
      priority: "high",
      status: "open",
      employee_can_complete: "yes",
      due_date: "2026-06-14",
    },
    {
      todo_id: "T2",
      title: "Set up 3 air movers in basement",
      description: "",
      assigned_employee_id: "",
      job_id: "J100",
      priority: "medium",
      status: "open",
      employee_can_complete: "yes",
      due_date: "",
    },
    {
      todo_id: "T3",
      title: "Confirm moisture readings logged",
      description: "Admin will verify — read only.",
      assigned_employee_id: "E001",
      job_id: "",
      priority: "low",
      status: "open",
      employee_can_complete: "no",
      due_date: "",
    },
  ],
};
