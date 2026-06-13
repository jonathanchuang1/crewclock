/**
 * CrewClock — ONE-TIME SETUP SCRIPT
 * =================================================================
 * This is NOT part of the running app. It is a scaffolding tool you run
 * exactly once. It builds everything in YOUR Google account for you:
 *
 *   1. "CrewClock — Admin" spreadsheet  (private: rates, all 10 tabs, sample data)
 *   2. "CrewClock — App Config" spreadsheet (sanitized, employee-safe, link-shared)
 *   3. "CrewClock Events" Google Form  (18 questions, linked to ClockEvents)
 *
 * Then it PRINTS everything the app needs (form action URL, all entry IDs,
 * the config spreadsheet id + tab gids) so the app can be wired up in seconds.
 *
 * HOW TO RUN  (about 2 minutes)
 * ---------------------------------------------------------------
 *   1. Go to  https://script.google.com  →  New project
 *   2. Delete the empty Code.gs contents, paste THIS WHOLE FILE in.
 *   3. Click  Run  (the ▶ button) with `setupCrewClock` selected.
 *   4. Click  "Review permissions" → choose your account → Advanced →
 *      "Go to project (unsafe)" → Allow.  (It's your own script touching
 *      your own Drive — the warning is standard for personal scripts.)
 *   5. Open  View → Logs  (or the "Execution log" panel). Copy the entire
 *      block between  ===== COPY BELOW =====  and  ===== COPY ABOVE =====
 *      and paste it back to Claude. Done.
 *
 * The one thing this script CANNOT do (Google has no API for it):
 *   toggle "Publish to web" on the config sheet. It prints a 2-click
 *   instruction for that at the end.
 * =================================================================
 */

function setupCrewClock() {
  var out = [];
  var log = function (s) { out.push(s == null ? '' : String(s)); };

  // ---------- 1. ADMIN SPREADSHEET ----------
  var admin = SpreadsheetApp.create('CrewClock — Admin');
  var adminId = admin.getId();

  // Replace the default "Sheet1" as we go.
  var first = admin.getSheets()[0];

  setTab(admin, first, 'Employees',
    ['employee_id','employee_name','employee_token','employee_token_revoked','hourly_rate','active_status','phone','email','notes','created_at','updated_at'],
    SAMPLE.employees);

  setTab(admin, null, 'Jobs',
    ['job_id','job_name','job_address','customer_name','active_status','notes','quickbooks_customer_id','quickbooks_project_id','quickbooks_display_name','sync_source','last_synced_at','created_at','updated_at'],
    SAMPLE.jobs);

  setTab(admin, null, 'EmployeeJobAccess',
    ['access_id','employee_id','employee_name','job_id','job_name','enabled_status','created_at','updated_at'],
    SAMPLE.access);

  setTab(admin, null, 'Todos',
    ['todo_id','title','description','assigned_employee_id','assigned_employee_name','job_id','job_name','priority','status','due_date','employee_can_complete','created_by','created_at','completed_at','completion_note','admin_notes'],
    SAMPLE.todos);

  // Empty calculated / log tabs (headers only).
  setTab(admin, null, 'TimeSegments',
    ['segment_id','employee_id','employee_name','job_id','job_name','job_address','segment_start_time','segment_end_time','total_hours','hourly_rate_at_time','labor_cost','status','source_start_event_id','source_end_event_id','admin_corrected','admin_notes'], []);
  setTab(admin, null, 'PayrollReport',
    ['employee_id','employee_name','date_range_start','date_range_end','total_hours','hourly_rate','gross_pay','missing_clock_out_count','admin_adjustments','final_payroll_hours','final_gross_pay'], []);
  setTab(admin, null, 'JobCostReport',
    ['job_id','job_name','job_address','date_range_start','date_range_end','total_labor_hours','total_labor_cost','employees_worked','notes_count','open_todos','completed_todos'], []);
  setTab(admin, null, 'AdminCorrections',
    ['correction_id','corrected_by','correction_type','employee_id','job_id','original_value','corrected_value','reason','created_at'], []);
  setTab(admin, null, 'AuditLog',
    ['audit_id','actor_type','actor_id','action','details','timestamp','device_info'], []);

  // ---------- 2. CONFIG SPREADSHEET (sanitized, employee-safe) ----------
  var config = SpreadsheetApp.create('CrewClock — App Config');
  var configId = config.getId();
  var cFirst = config.getSheets()[0];

  setTab(config, cFirst, 'EmployeesConfig',
    ['employee_id','employee_name','employee_token','employee_token_revoked','active_status','timezone'],
    SAMPLE.employeesConfig);
  setTab(config, null, 'JobsConfig',
    ['job_id','job_name','job_address','customer_name','active_status'],
    SAMPLE.jobsConfig);
  setTab(config, null, 'AccessConfig',
    ['employee_id','job_id','enabled_status'],
    SAMPLE.accessConfig);
  setTab(config, null, 'TodosConfig',
    ['todo_id','title','description','assigned_employee_id','job_id','priority','status','employee_can_complete','due_date'],
    SAMPLE.todosConfig);

  // Make the config sheet readable by "anyone with the link" (helps the app read it).
  try {
    DriveApp.getFileById(configId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) { /* ignore if org policy blocks */ }

  // Collect tab gids for the config sheet (needed to build the CSV URLs).
  var gids = {};
  config.getSheets().forEach(function (sh) { gids[sh.getName()] = sh.getSheetId(); });

  // ---------- 3. GOOGLE FORM (the write endpoint) ----------
  var FIELDS = ['event_id','employee_id','employee_name','employee_token_identifier','event_type',
    'job_id','job_name','job_address','note_text','todo_id','todo_status','todo_completion_note',
    'timestamp_local','timestamp_utc','timezone','device_info','user_agent','duplicate_check_key'];

  var form = FormApp.create('CrewClock Events');
  try { form.setCollectEmailAddress(false); } catch (e) {}
  try { form.setLimitOneResponsePerUser(false); } catch (e) {}
  try { form.setAcceptingResponses(true); } catch (e) {}
  form.setDescription('Hidden write endpoint for the CrewClock app. Do not share.');

  FIELDS.forEach(function (name) {
    if (name === 'note_text' || name === 'todo_completion_note') {
      form.addParagraphTextItem().setTitle(name);
    } else {
      form.addTextItem().setTitle(name);
    }
  });

  // IMPORTANT: the real submission ids (entry.NNN used by formResponse) are NOT
  // the same as FormItem.getId(). They must be read from the published form's
  // FB_PUBLIC_LOAD_DATA_ blob, or submissions silently drop every field.
  var entryMap = readEntryIds_(form, FIELDS);

  // Link form responses into the Admin spreadsheet, then rename that tab to ClockEvents.
  form.setDestination(FormApp.DestinationType.SPREADSHEET, adminId);
  SpreadsheetApp.flush();
  try {
    var reopened = SpreadsheetApp.openById(adminId);
    reopened.getSheets().forEach(function (sh) {
      var n = sh.getName();
      if (n.indexOf('Form Responses') === 0 || n.indexOf('Form responses') === 0) {
        sh.setName('ClockEvents');
      }
    });
  } catch (e) { /* if rename fails, the tab stays "Form Responses 1" — fine */ }

  // Build the form action (submit) URL from the public form URL.
  var formAction = form.getPublishedUrl().replace('/viewform', '/formResponse');

  // ---------- 4. PRINT EVERYTHING ----------
  log('');
  log('===== COPY BELOW =====');
  log('// --- paste this whole block back to Claude ---');
  log('FORM_ACTION_URL = ' + formAction);
  log('FORM_FIELDS = ' + JSON.stringify(entryMap, null, 2));
  log('CONFIG_SPREADSHEET_ID = ' + configId);
  log('CONFIG_TAB_GIDS = ' + JSON.stringify(gids, null, 2));
  log('ADMIN_SPREADSHEET_URL = ' + admin.getUrl());
  log('CONFIG_SPREADSHEET_URL = ' + config.getUrl());
  log('FORM_EDIT_URL = ' + form.getEditUrl());
  log('===== COPY ABOVE =====');
  log('');
  log('LAST STEP YOU MUST DO BY HAND (2 clicks — Google has no API for it):');
  log('  1. Open the CONFIG spreadsheet:  ' + config.getUrl());
  log('  2. File → Share → Publish to web → "Publish" (whole document) → confirm.');
  log('  3. In that dialog, switch the dropdown to a tab (e.g. EmployeesConfig) and');
  log('     choose "Comma-separated values (.csv)". Copy that ONE link and paste it');
  log('     to Claude. Claude builds the other 3 URLs from the gids above.');
  log('');
  log('Sample employee test tokens (already in the config sheet):');
  SAMPLE.employeesConfig.forEach(function (r) {
    log('  ' + r[1] + '  →  ?t=' + r[2] + (r[3] === 'yes' ? '  (revoked test)' : ''));
  });

  Logger.log(out.join('\n'));
  return out.join('\n');
}

/**
 * Read the REAL form entry ids (the ones formResponse expects) from the
 * published form HTML. Maps each question title -> "entry.NNN".
 */
function readEntryIds_(form, fields) {
  var html = UrlFetchApp.fetch(form.getPublishedUrl()).getContentText();
  var m = html.match(/FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);<\/script>/);
  var map = {};
  if (m) {
    var items = JSON.parse(m[1])[1][1];
    items.forEach(function (it) {
      if (it[4] && it[4][0] && it[4][0][0] != null) {
        map[it[1]] = 'entry.' + it[4][0][0];
      }
    });
  }
  fields.forEach(function (f) { if (!map[f]) map[f] = 'MISSING_CHECK_FORM'; });
  return map;
}

/** Create or repurpose a tab with a header row + optional sample rows. */
function setTab(ss, existing, name, headers, rows) {
  var sh = existing || ss.insertSheet(name);
  sh.setName(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (rows && rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sh.setFrozenRows(1);
  return sh;
}

/* =================================================================
 * SAMPLE DATA — three real working tokens are baked in so you can test
 * immediately, then replace these rows with your real crew & jobs.
 * ================================================================= */
var TOK = {
  E001: '1AF75ymkw8ASGmQY37QwiDTYwsAtSYmd',
  E002: 'z9OY5Sb2-eBYzArXiTs9UEJwl5x1qC7j',
  E003: 'mB1aatyz14eGG31dczo4P2TxlXaDFAOh'
};
var NOW = '2026-06-13';

var SAMPLE = {
  employees: [
    ['E001','Alex Rivera',TOK.E001,'no',28.5,'active','555-0101','alex@example.com','Lead tech',NOW,NOW],
    ['E002','Sam Carter',TOK.E002,'no',24,'active','555-0102','sam@example.com','',NOW,NOW],
    ['E003','Jordan Lee',TOK.E003,'yes',22,'inactive','555-0103','jordan@example.com','Revoked example',NOW,NOW]
  ],
  jobs: [
    ['J100','Maple St Water Damage','412 Maple St, Springfield','Janet Cole','active','Cat 2 water','','','','manual','',NOW,NOW],
    ['J101','Oak Ave Mold Remediation','88 Oak Ave, Springfield','Rodriguez Family','active','Containment','','','','manual','',NOW,NOW],
    ['J102','Downtown Office Fire','1200 Center Blvd, Suite 4','Hartwell LLC','active','Smoke + soot','','','','manual','',NOW,NOW],
    ['J103','Riverside Storage Flood','5 River Rd','Acme Storage','inactive','Closed out','','','','manual','',NOW,NOW]
  ],
  access: [
    ['A1','E001','Alex Rivera','J100','Maple St Water Damage','enabled',NOW,NOW],
    ['A2','E001','Alex Rivera','J101','Oak Ave Mold Remediation','enabled',NOW,NOW],
    ['A3','E001','Alex Rivera','J102','Downtown Office Fire','disabled',NOW,NOW],
    ['A4','E002','Sam Carter','J100','Maple St Water Damage','enabled',NOW,NOW],
    ['A5','E002','Sam Carter','J102','Downtown Office Fire','enabled',NOW,NOW]
  ],
  todos: [
    ['T1','Photograph all affected rooms','Wide + detail shots before extraction.','E001','Alex Rivera','J100','Maple St Water Damage','high','open','2026-06-14','yes','admin',NOW,'','',''],
    ['T2','Set up 3 air movers in basement','','','','J100','Maple St Water Damage','medium','open','','yes','admin',NOW,'','',''],
    ['T3','Confirm moisture readings logged','Admin will verify.','E001','Alex Rivera','','','low','open','','no','admin',NOW,'','',''],
    ['T4','Order replacement drywall','','E002','Sam Carter','J102','Downtown Office Fire','medium','open','2026-06-16','yes','admin',NOW,'','','']
  ],
  // --- sanitized config versions (no rates / PII) ---
  employeesConfig: [
    ['E001','Alex Rivera',TOK.E001,'no','active','America/Chicago'],
    ['E002','Sam Carter',TOK.E002,'no','active','America/Chicago'],
    ['E003','Jordan Lee',TOK.E003,'yes','inactive','America/Chicago']
  ],
  jobsConfig: [
    ['J100','Maple St Water Damage','412 Maple St, Springfield','Janet Cole','active'],
    ['J101','Oak Ave Mold Remediation','88 Oak Ave, Springfield','Rodriguez Family','active'],
    ['J102','Downtown Office Fire','1200 Center Blvd, Suite 4','Hartwell LLC','active'],
    ['J103','Riverside Storage Flood','5 River Rd','Acme Storage','inactive']
  ],
  accessConfig: [
    ['E001','J100','enabled'],['E001','J101','enabled'],['E001','J102','disabled'],
    ['E002','J100','enabled'],['E002','J102','enabled']
  ],
  todosConfig: [
    ['T1','Photograph all affected rooms','Wide + detail shots before extraction.','E001','J100','high','open','yes','2026-06-14'],
    ['T2','Set up 3 air movers in basement','','','J100','medium','open','yes',''],
    ['T3','Confirm moisture readings logged','Admin will verify.','E001','','low','open','no',''],
    ['T4','Order replacement drywall','','E002','J102','medium','open','yes','2026-06-16']
  ]
};
