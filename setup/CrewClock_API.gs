/**
 * CrewClock WRITE API  — the "doorway" that lets the Admin app add/edit/delete
 * jobs, employees, assignments and access directly (no copy-paste, no extension).
 *
 * It runs inside YOUR Google account and edits both spreadsheets for you. The
 * app calls it over HTTPS with a secret token; requests without the token are
 * rejected.
 *
 * ============================ ONE-TIME SETUP ============================
 *  1. https://script.google.com  →  New project
 *  2. Delete the sample code, paste THIS whole file in, click 💾 Save.
 *  3. Click  Deploy ▸ New deployment.
 *  4. Click the gear ⚙ next to "Select type" →  Web app.
 *  5. Set:  Execute as = Me      Who has access = Anyone
 *  6. Deploy → Authorize access → pick your account → Advanced →
 *     "Go to project (unsafe)" → Allow.
 *  7. Copy the "Web app URL" (ends in /exec) and paste it back to Claude.
 * ========================================================================
 */

var SECRET = "SN0qlfWZ4-hPdRkkWpYdWx70-2RAOZGe";
var ADMIN_ID = "1g-PDzvJ-sCuJhYX0DrDO4N5X714F5TqHIZcnPnStGMk";
var CONFIG_ID = "1YmVenmek1rsfc7EhIpCA5oBcsc2Pqhj_pWzgVvfKFwQ";

function doGet(e) {
  return json_(handle_(e.parameter || {}));
}
function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {}
  return json_(handle_(body));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function handle_(req) {
  if (String(req.token) !== SECRET) return { ok: false, error: "unauthorized" };
  var p = req.payload || req;
  try {
    switch (req.action) {
      case "ping":         return { ok: true, now: now_() };
      case "job.add":      return addJob_(p);
      case "job.update":   return updateJob_(p);
      case "job.delete":   return deleteJob_(p);
      case "employee.add": return addEmployee_(p);
      case "employee.update": return updateEmployee_(p);
      case "employee.delete": return deleteEmployee_(p);
      case "access.set":   return setAccess_(p);
      case "todo.add":     return addTodo_(p);
      case "todo.delete":  return deleteTodo_(p);
      default: return { ok: false, error: "unknown action: " + req.action };
    }
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/* ---------------- sheet helpers ---------------- */
function tab_(ssId, name) {
  return SpreadsheetApp.openById(ssId).getSheetByName(name);
}
function now_() {
  return Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd'T'HH:mm:ss'Z'");
}
/** column index (1-based) of a header name, or 0 */
function col_(sheet, header) {
  var hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var i = 0; i < hdr.length; i++) if (hdr[i] === header) return i + 1;
  return 0;
}
/** row number (>=2) where column `header` == value, or 0 */
function rowOf_(sheet, header, value) {
  var c = col_(sheet, header);
  if (!c) return 0;
  var vals = sheet.getRange(2, c, Math.max(0, sheet.getLastRow() - 1), 1).getValues();
  for (var i = 0; i < vals.length; i++)
    if (String(vals[i][0]) === String(value)) return i + 2;
  return 0;
}
function setField_(sheet, row, header, value) {
  var c = col_(sheet, header);
  if (c) sheet.getRange(row, c).setValue(value);
}
/** next id like E001 / J100 from existing values in a column */
function nextId_(sheet, header, prefix, start) {
  var c = col_(sheet, header);
  var max = start - 1;
  if (c && sheet.getLastRow() > 1) {
    var vals = sheet.getRange(2, c, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var m = String(vals[i][0]).match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return prefix + (max + 1);
}

/* ---------------- jobs ---------------- */
function addJob_(p) {
  var admin = tab_(ADMIN_ID, "Jobs");
  var id = nextId_(admin, "job_id", "J", 100);
  var active = p.active === false ? "inactive" : "active";
  // Admin Jobs header: job_id,job_name,job_address,customer_name,active_status,notes,qb*4,sync_source,last_synced_at,created_at,updated_at
  admin.appendRow([id, p.job_name || "", p.job_address || "", p.customer_name || "",
    active, p.notes || "", "", "", "", "manual", "", now_(), now_()]);
  // Config JobsConfig: job_id,job_name,job_address,customer_name,active_status
  tab_(CONFIG_ID, "JobsConfig").appendRow([id, p.job_name || "", p.job_address || "",
    p.customer_name || "", active]);
  return { ok: true, job_id: id };
}
function updateJob_(p) {
  var fields = { job_name: p.job_name, job_address: p.job_address,
    customer_name: p.customer_name, active_status: p.active_status };
  // admin
  var a = tab_(ADMIN_ID, "Jobs"), ra = rowOf_(a, "job_id", p.job_id);
  if (ra) { applyFields_(a, ra, fields); setField_(a, ra, "updated_at", now_()); }
  // config
  var c = tab_(CONFIG_ID, "JobsConfig"), rc = rowOf_(c, "job_id", p.job_id);
  if (rc) applyFields_(c, rc, fields);
  return { ok: !!(ra || rc), job_id: p.job_id };
}
function deleteJob_(p) {
  delRow_(tab_(ADMIN_ID, "Jobs"), "job_id", p.job_id);
  delRow_(tab_(CONFIG_ID, "JobsConfig"), "job_id", p.job_id);
  // remove access rows for this job
  delAll_(tab_(CONFIG_ID, "AccessConfig"), "job_id", p.job_id);
  return { ok: true };
}

/* ---------------- employees ---------------- */
function addEmployee_(p) {
  var admin = tab_(ADMIN_ID, "Employees");
  var id = nextId_(admin, "employee_id", "E", 1);
  var token = randomToken_();
  var active = p.active === false ? "inactive" : "active";
  // Employees: employee_id,employee_name,employee_token,employee_token_revoked,hourly_rate,active_status,phone,email,notes,created_at,updated_at
  admin.appendRow([id, p.employee_name || "", token, "no", p.hourly_rate || "",
    active, p.phone || "", p.email || "", p.notes || "", now_(), now_()]);
  // EmployeesConfig: employee_id,employee_name,employee_token,employee_token_revoked,active_status,timezone
  tab_(CONFIG_ID, "EmployeesConfig").appendRow([id, p.employee_name || "", token,
    "no", active, p.timezone || "America/Los_Angeles"]);
  return { ok: true, employee_id: id, employee_token: token };
}
function updateEmployee_(p) {
  var a = tab_(ADMIN_ID, "Employees"), ra = rowOf_(a, "employee_id", p.employee_id);
  if (ra) {
    applyFields_(a, ra, { employee_name: p.employee_name, hourly_rate: p.hourly_rate,
      active_status: p.active_status, employee_token_revoked: p.employee_token_revoked,
      phone: p.phone, email: p.email });
    setField_(a, ra, "updated_at", now_());
  }
  var c = tab_(CONFIG_ID, "EmployeesConfig"), rc = rowOf_(c, "employee_id", p.employee_id);
  if (rc) applyFields_(c, rc, { employee_name: p.employee_name,
    active_status: p.active_status, employee_token_revoked: p.employee_token_revoked });
  return { ok: !!(ra || rc), employee_id: p.employee_id };
}
function deleteEmployee_(p) {
  delRow_(tab_(ADMIN_ID, "Employees"), "employee_id", p.employee_id);
  delRow_(tab_(CONFIG_ID, "EmployeesConfig"), "employee_id", p.employee_id);
  delAll_(tab_(CONFIG_ID, "AccessConfig"), "employee_id", p.employee_id);
  return { ok: true };
}

/* ---------------- access (who can clock into a job) ---------------- */
function setAccess_(p) {
  var c = tab_(CONFIG_ID, "AccessConfig");
  var status = p.enabled === false ? "disabled" : "enabled";
  // find existing row for (employee_id, job_id)
  var data = c.getRange(2, 1, Math.max(0, c.getLastRow() - 1), 3).getValues();
  var eCol = col_(c, "employee_id"), jCol = col_(c, "job_id"), sCol = col_(c, "enabled_status");
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][eCol - 1]) === String(p.employee_id) &&
        String(data[i][jCol - 1]) === String(p.job_id)) {
      c.getRange(i + 2, sCol).setValue(status);
      return { ok: true, updated: true };
    }
  }
  var row = []; row[eCol - 1] = p.employee_id; row[jCol - 1] = p.job_id; row[sCol - 1] = status;
  c.appendRow(row);
  return { ok: true, added: true };
}

/* ---------------- assignments / notes (TodosConfig) ---------------- */
function addTodo_(p) {
  var c = tab_(CONFIG_ID, "TodosConfig");
  var id = nextId_(c, "todo_id", "T", 1);
  // TodosConfig: todo_id,title,description,assigned_employee_id,job_id,priority,status,employee_can_complete,due_date
  c.appendRow([id, p.title || "", p.description || "", p.assigned_employee_id || "",
    p.job_id || "", p.priority || "medium", "open",
    p.employee_can_complete === false ? "no" : "yes", p.due_date || ""]);
  return { ok: true, todo_id: id };
}
function deleteTodo_(p) {
  delRow_(tab_(CONFIG_ID, "TodosConfig"), "todo_id", p.todo_id);
  return { ok: true };
}

/* ---------------- generic row ops ---------------- */
function applyFields_(sheet, row, fields) {
  for (var k in fields) if (fields[k] !== undefined && fields[k] !== null)
    setField_(sheet, row, k, fields[k]);
}
function delRow_(sheet, header, value) {
  var r = rowOf_(sheet, header, value);
  if (r) sheet.deleteRow(r);
  return !!r;
}
function delAll_(sheet, header, value) {
  var r;
  while ((r = rowOf_(sheet, header, value))) sheet.deleteRow(r);
}
function randomToken_() {
  var c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789";
  var s = "";
  for (var i = 0; i < 32; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}
