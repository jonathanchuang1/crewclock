import { useEffect, useMemo, useState } from "react";
import { Button, Card, Badge, Select } from "../components/ui/primitives.jsx";
import { Logo } from "../components/Logo.jsx";
import {
  getAdminData,
  adminWrite,
  buildSegments,
  liveStatus,
  payroll,
  jobCost,
  approvalMap,
  annotate,
} from "./data.js";

/* ---------- small helpers ---------- */
const LS = { secret: "crewclock:adminSecret", base: "crewclock:linkBase" };
const DEFAULT_BASE = "https://jonathanchuang1.github.io/crewclock/";

const get = (k, d = "") => {
  try {
    return localStorage.getItem(k) || d;
  } catch {
    return d;
  }
};

function hours(h) {
  const whole = Math.floor(h);
  const m = Math.round((h - whole) * 60);
  return `${whole}h ${String(m).padStart(2, "0")}m`;
}
const money = (n) =>
  "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isActive = (s) => /^(active|yes|1|true)$/i.test(String(s));
const isRevoked = (s) => /^(yes|true|1)$/i.test(String(s));

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";

function ago(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function download(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Copy({ text, label = "Copy", small }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="surface"
      size={small ? "sm" : "md"}
      className="w-auto"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {}
      }}
    >
      {done ? "Copied ✓" : label}
    </Button>
  );
}

function Inp({ label, value, set, type = "text", placeholder }) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1 block text-muted">{label}</span>}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
        className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-white outline-none focus:border-accent"
      />
    </label>
  );
}

const TABS = ["Time", "Live", "Employees", "Jobs", "To-Dos", "Payroll", "Job Cost", "Settings"];

/** The desktop app passes the admin key in its launch URL (#key=… / ?key=…); the
 *  public web build ships none, so opening it bare just shows the unlock screen. */
function initialSecret() {
  try {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("key");
    const q = new URLSearchParams(window.location.search).get("key");
    const u = (h || q || "").trim();
    if (u) {
      localStorage.setItem(LS.secret, u);
      return u;
    }
  } catch {}
  return get(LS.secret);
}

export function AdminApp() {
  const [secret, setSecret] = useState(initialSecret);
  const [linkBase, setLinkBase] = useState(get(LS.base, DEFAULT_BASE));
  const [tab, setTab] = useState("Time");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [localApprovals, setLocalApprovals] = useState({});

  const load = async (key = secret) => {
    if (!key) return;
    setLoading(true);
    setError("");
    try {
      setData(await getAdminData(key));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (secret) load(secret);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!secret) return;
    const id = setInterval(() => load(secret), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  const segments = useMemo(() => {
    if (!data) return [];
    return annotate(buildSegments(data.events), approvalMap(data.approvals), localApprovals);
  }, [data, localApprovals]);

  /* ---- writes (all gated server-side by the secret) ---- */
  const run = async (fn, params) => {
    try {
      await adminWrite(secret, fn, params);
      await load();
      return true;
    } catch (e) {
      setError(e.message || String(e));
      return false;
    }
  };

  const decide = (seg, action, h) => {
    setLocalApprovals((p) => ({
      ...p,
      [seg.id]: { action, hours: action === "approved" ? Number(h) : NaN, at: Date.now() },
    }));
    run("admin_approval_set", {
      p_shift_id: seg.id,
      p_employee_id: seg.employee_id,
      p_action: action,
      p_hours: action === "approved" ? Number(h) : null,
      p_note: "",
    });
  };

  if (!secret) {
    return (
      <Shell tab="Settings" setTab={() => {}} onlySettings>
        <Unlock
          onSave={(k) => {
            localStorage.setItem(LS.secret, k.trim());
            setSecret(k.trim());
            load(k.trim());
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell tab={tab} setTab={setTab} loading={loading} fetchedAt={data?.fetchedAt} onReload={() => load()}>
      {error && (
        <Card className="mb-4 border-danger/40 bg-danger/10 p-4 text-sm text-danger">{error}</Card>
      )}
      {!data && loading && <p className="text-muted">Loading your data…</p>}
      {data && tab === "Time" && <TimeTab segments={segments} onDecide={decide} />}
      {data && tab === "Live" && <LiveTab data={data} />}
      {data && tab === "Employees" && (
        <EmployeesTab data={data} linkBase={linkBase} run={run} />
      )}
      {data && tab === "Jobs" && <JobsTab data={data} run={run} />}
      {data && tab === "To-Dos" && <AssignTab data={data} run={run} />}
      {data && tab === "Payroll" && <PayrollTab data={data} segments={segments} />}
      {data && tab === "Job Cost" && <JobCostTab data={data} segments={segments} />}
      {tab === "Settings" && (
        <SettingsTab
          linkBase={linkBase}
          data={data}
          segments={segments}
          onSaveBase={(b) => {
            localStorage.setItem(LS.base, b);
            setLinkBase(b);
          }}
          onSignOut={() => {
            localStorage.removeItem(LS.secret);
            setSecret("");
            setData(null);
          }}
        />
      )}
    </Shell>
  );
}

/* ---------- shell ---------- */
function Shell({ tab, setTab, children, loading, fetchedAt, onReload, onlySettings }) {
  return (
    <div className="min-h-screen bg-bg text-white">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
          <Logo size={26} />
          <span className="text-lg font-semibold">CrewClock Admin</span>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted">
            {fetchedAt && <span>updated {ago(fetchedAt.toISOString())}</span>}
            {onReload && (
              <Button variant="surface" size="sm" className="w-auto" onClick={onReload} disabled={loading}>
                {loading ? "Refreshing…" : "Refresh"}
              </Button>
            )}
          </div>
        </div>
        {!onlySettings && (
          <nav className="mx-auto flex max-w-5xl flex-wrap gap-1 px-4 pb-2">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                  (tab === t ? "bg-accent text-white" : "text-muted hover:bg-surface-2 hover:text-white")
                }
              >
                {t}
              </button>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-6 py-6">{children}</main>
    </div>
  );
}

/* ---------- Live ---------- */
function LiveTab({ data }) {
  const rows = liveStatus(data.events, data.employees);
  const inNow = rows.filter((r) => r.clockedIn);
  const out = rows.filter((r) => !r.clockedIn);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Clocked in now" value={inNow.length} tone="success" />
        <Stat label="Employees" value={rows.length} />
      </div>
      <Section title={`On the clock (${inNow.length})`}>
        {inNow.length === 0 && <Empty>Nobody is clocked in right now.</Empty>}
        {inNow.map((r) => (
          <Card key={r.employee_id} className="flex items-center gap-3 p-4">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success shadow-[0_0_8px] shadow-success" />
            <div className="min-w-0">
              <div className="font-medium">{r.employee_name}</div>
              <div className="truncate text-sm text-muted">
                {r.job_name || "—"}
                {r.job_address ? ` · ${r.job_address}` : ""}
              </div>
            </div>
            <div className="ml-auto text-right text-sm text-muted">since {ago(r.since)}</div>
          </Card>
        ))}
      </Section>
      <Section title={`Off the clock (${out.length})`}>
        {out.map((r) => (
          <div key={r.employee_id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted/50" />
            <span className="text-muted">{r.employee_name}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

/* ---------- Employees (CRUD + links) ---------- */
function EmployeesTab({ data, linkBase, run }) {
  const base = linkBase.endsWith("/") ? linkBase : linkBase + "/";
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [phone, setPhone] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    const ok = await run("admin_employee_save", {
      p_id: "", p_name: name.trim(), p_rate: parseFloat(rate) || 0,
      p_active: true, p_phone: phone, p_email: "", p_revoked: null,
    });
    if (ok) { setName(""); setRate(""); setPhone(""); }
  };

  return (
    <div className="space-y-6">
      <Section title="Add employee">
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-3 gap-3">
            <Inp label="Name" value={name} set={setName} placeholder="Full name" />
            <Inp label="Hourly rate" value={rate} set={setRate} type="number" placeholder="28.50" />
            <Inp label="Phone (optional)" value={phone} set={setPhone} />
          </div>
          <Button className="w-auto" onClick={add} disabled={!name.trim()}>
            Add employee (creates their link)
          </Button>
        </Card>
      </Section>
      <Section title={`Crew (${data.employees.length})`}>
        {data.employees.map((e) => (
          <EmployeeRow key={e.employee_id} e={e} base={base} run={run} />
        ))}
      </Section>
    </div>
  );
}

function EmployeeRow({ e, base, run }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(e.employee_name);
  const [rate, setRate] = useState(String(e.hourly_rate ?? ""));
  const active = isActive(e.active_status);
  const revoked = isRevoked(e.employee_token_revoked);
  const link = `${base}?t=${encodeURIComponent(e.employee_token)}`;
  const msg = `Hi ${e.employee_name}, here's your CrewClock time-clock link — open it to clock in/out and "add to home screen":\n${link}`;

  const save = (extra) =>
    run("admin_employee_save", {
      p_id: e.employee_id, p_name: name, p_rate: parseFloat(rate) || 0,
      p_active: null, p_phone: null, p_email: null, p_revoked: null, ...extra,
    });

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{e.employee_name}</span>
        {!active && <Badge tone="warning">inactive</Badge>}
        {revoked && <Badge tone="warning">link revoked</Badge>}
        <span className="ml-auto text-sm text-muted">${e.hourly_rate}/hr</span>
      </div>
      {e.employee_token && !revoked && active && (
        <div className="mt-2 break-all rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          {link}
        </div>
      )}
      {edit ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Inp label="Name" value={name} set={setName} />
          <Inp label="Rate" value={rate} set={setRate} type="number" />
          <Button size="sm" className="w-auto" onClick={() => { save(); setEdit(false); }}>Save</Button>
          <Button variant="ghost" size="sm" className="w-auto" onClick={() => setEdit(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Copy text={link} label="Copy link" small />
          <Copy text={msg} label="Copy text" small />
          <Button variant="surface" size="sm" className="w-auto" onClick={() => setEdit(true)}>Edit</Button>
          <Button variant="surface" size="sm" className="w-auto" onClick={() => save({ p_active: !active })}>
            {active ? "Deactivate" : "Activate"}
          </Button>
          <Button variant="surface" size="sm" className="w-auto" onClick={() => save({ p_revoked: !revoked })}>
            {revoked ? "Un-revoke link" : "Revoke link"}
          </Button>
          <Button variant="danger" size="sm" className="w-auto"
            onClick={() => { if (confirm(`Delete ${e.employee_name}?`)) run("admin_employee_delete", { p_id: e.employee_id }); }}>
            Delete
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ---------- Jobs (CRUD + active + access) ---------- */
function JobsTab({ data, run }) {
  const [name, setName] = useState("");
  const [addr, setAddr] = useState("");
  const [cust, setCust] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    const ok = await run("admin_job_save", {
      p_id: "", p_name: name.trim(), p_address: addr, p_customer: cust, p_active: true,
    });
    if (ok) { setName(""); setAddr(""); setCust(""); }
  };

  return (
    <div className="space-y-6">
      <Section title="Add job / project">
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-3 gap-3">
            <Inp label="Job name" value={name} set={setName} placeholder="Elm St Water Damage" />
            <Inp label="Address" value={addr} set={setAddr} />
            <Inp label="Customer (optional)" value={cust} set={setCust} />
          </div>
          <Button className="w-auto" onClick={add} disabled={!name.trim()}>Add job</Button>
        </Card>
      </Section>
      <Section title={`Jobs (${data.jobs.length})`}>
        {data.jobs.map((j) => (
          <JobRow key={j.job_id} j={j} data={data} run={run} />
        ))}
      </Section>
    </div>
  );
}

function JobRow({ j, run }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(j.job_name);
  const [addr, setAddr] = useState(j.job_address);
  const [cust, setCust] = useState(j.customer_name);
  const active = isActive(j.active_status);

  const save = (extra) =>
    run("admin_job_save", { p_id: j.job_id, p_name: name, p_address: addr, p_customer: cust, p_active: null, ...extra });

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{j.job_name}</span>
        {active ? <Badge tone="success">active</Badge> : <Badge tone="warning">inactive</Badge>}
        <span className="ml-auto text-sm text-muted">{j.job_address}</span>
      </div>
      {edit ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Inp label="Name" value={name} set={setName} />
          <Inp label="Address" value={addr} set={setAddr} />
          <Inp label="Customer" value={cust} set={setCust} />
          <div className="col-span-3 flex gap-2">
            <Button size="sm" className="w-auto" onClick={() => { save(); setEdit(false); }}>Save</Button>
            <Button variant="ghost" size="sm" className="w-auto" onClick={() => setEdit(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="surface" size="sm" className="w-auto" onClick={() => setEdit(true)}>Edit</Button>
          <Button variant="surface" size="sm" className="w-auto" onClick={() => save({ p_active: !active })}>
            {active ? "Deactivate" : "Activate"}
          </Button>
          <Button variant="danger" size="sm" className="w-auto"
            onClick={() => { if (confirm(`Delete job "${j.job_name}"?`)) run("admin_job_delete", { p_id: j.job_id }); }}>
            Delete
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ---------- Assign (assignments + notes, one click) ---------- */
function AssignTab({ data, run }) {
  const [adding, setAdding] = useState(false);
  const empName = (id) => data.employees.find((e) => e.employee_id === id)?.employee_name;
  const jobName = (id) => data.jobs.find((j) => j.job_id === id)?.job_name;
  return (
    <div className="space-y-6">
      <Section title={`Current to-do list (${data.todos.length})`}>
        {data.todos.length === 0 && <Empty>Nothing on the list. Add one below.</Empty>}
        {data.todos.map((t) => (
          <Card key={t.id} className="flex items-center gap-3 p-3">
            <span className={"h-2 w-2 shrink-0 rounded-full " + (t.can_complete ? "bg-accent" : "bg-muted/60")} />
            <div className="min-w-0">
              <div className="font-medium">{t.title}</div>
              <div className="text-xs text-muted">
                {empName(t.assigned_employee_id) || "anyone"}
                {t.job_id ? ` · ${jobName(t.job_id) || t.job_id}` : ""} ·{" "}
                {t.can_complete ? `to-do${t.priority ? ` (${t.priority})` : ""}` : "note"}
                {t.due_date ? ` · due ${t.due_date}` : ""}
              </div>
            </div>
            <Button variant="danger" size="sm" className="ml-auto w-auto"
              onClick={() => run("admin_todo_delete", { p_id: t.id })}>Remove</Button>
          </Card>
        ))}
      </Section>

      {adding ? (
        <>
          <AssignmentForm data={data} run={run} />
          <NoteForm data={data} run={run} />
        </>
      ) : (
        <Button className="w-auto" onClick={() => setAdding(true)}>+ Add to-do or note</Button>
      )}
    </div>
  );
}

function WhoWhere({ data, emp, setEmp, job, setJob }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Assign to</span>
        <Select value={emp} onChange={(e) => setEmp(e.target.value)}>
          <option value="">— anyone —</option>
          {data.employees.map((e) => (
            <option key={e.employee_id} value={e.employee_id}>{e.employee_name}</option>
          ))}
        </Select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Job (optional)</span>
        <Select value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">— none —</option>
          {data.jobs.map((j) => (
            <option key={j.job_id} value={j.job_id}>{j.job_name}</option>
          ))}
        </Select>
      </label>
    </div>
  );
}

function AssignmentForm({ data, run }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [emp, setEmp] = useState("");
  const [job, setJob] = useState("");
  const [priority, setPriority] = useState("medium");
  const [due, setDue] = useState("");
  const [canComplete, setCanComplete] = useState(true);

  const send = async () => {
    if (!title.trim()) return;
    const ok = await run("admin_todo_save", {
      p_id: "", p_title: title.trim(), p_description: desc, p_assigned_employee_id: emp,
      p_job_id: job, p_priority: priority, p_can_complete: canComplete, p_due_date: due,
    });
    if (ok) { setTitle(""); setDesc(""); setDue(""); }
  };

  return (
    <Card className="space-y-3 p-4">
      <h3 className="font-semibold">📋 New assignment</h3>
      <Inp label="Task" value={title} set={setTitle} placeholder="e.g. Set up 3 air movers" />
      <Inp label="Details (optional)" value={desc} set={setDesc} />
      <WhoWhere data={data} emp={emp} setEmp={setEmp} job={job} setJob={setJob} />
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Priority</span>
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </label>
        <Inp label="Due date (optional)" value={due} set={setDue} type="date" />
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={canComplete} onChange={(e) => setCanComplete(e.target.checked)} />
        Let the employee mark it done
      </label>
      <Button className="w-auto" onClick={send} disabled={!title.trim()}>Send assignment</Button>
    </Card>
  );
}

function NoteForm({ data, run }) {
  const [text, setText] = useState("");
  const [emp, setEmp] = useState("");
  const [job, setJob] = useState("");
  const send = async () => {
    if (!text.trim()) return;
    const ok = await run("admin_todo_save", {
      p_id: "", p_title: text.trim(), p_description: "", p_assigned_employee_id: emp,
      p_job_id: job, p_priority: "low", p_can_complete: false, p_due_date: "",
    });
    if (ok) setText("");
  };
  return (
    <Card className="space-y-3 p-4">
      <h3 className="font-semibold">📣 Send a note</h3>
      <Inp label="Note" value={text} set={setText} placeholder="e.g. Bring extra fans to Maple St today" />
      <WhoWhere data={data} emp={emp} setEmp={setEmp} job={job} setJob={setJob} />
      <p className="text-xs text-muted">Shows in the crew's list as a read-only note.</p>
      <Button className="w-auto" onClick={send} disabled={!text.trim()}>Send note</Button>
    </Card>
  );
}

/* ---------- Payroll ---------- */
function useRange() {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const [start, setStart] = useState(fmt(new Date(Date.now() - 13 * 864e5)));
  const [end, setEnd] = useState(fmt(new Date()));
  return {
    start, end, setStart, setEnd,
    startMs: new Date(start + "T00:00:00").getTime(),
    endMs: new Date(end + "T23:59:59").getTime(),
  };
}
function RangeBar({ r }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="text-sm text-muted">From
        <input type="date" value={r.start} onChange={(e) => r.setStart(e.target.value)}
          className="ml-2 rounded-lg border border-border bg-surface-2 px-2 py-1 text-white" /></label>
      <label className="text-sm text-muted">To
        <input type="date" value={r.end} onChange={(e) => r.setEnd(e.target.value)}
          className="ml-2 rounded-lg border border-border bg-surface-2 px-2 py-1 text-white" /></label>
    </div>
  );
}

function PayrollTab({ data, segments }) {
  const r = useRange();
  const rows = payroll(segments, data.employees, r.startMs, r.endMs);
  const totalHours = rows.reduce((s, x) => s + x.hours, 0);
  const totalPay = rows.reduce((s, x) => s + x.pay, 0);
  const totalPending = rows.reduce((s, x) => s + x.pendingHours, 0);
  const tsv = ["employee\tapproved_hours\trate\tgross_pay",
    ...rows.map((x) => `${x.employee_name}\t${x.hours.toFixed(2)}\t${x.rate}\t${x.pay.toFixed(2)}`)].join("\n");
  return (
    <div>
      <RangeBar r={r} />
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Stat label="Approved hours" value={hours(totalHours)} />
        <Stat label="Gross pay (approved)" value={money(totalPay)} tone="accent" />
      </div>
      {totalPending > 0.01 && (
        <Card className="mb-4 border-warning/30 bg-warning/10 p-3 text-sm text-warning/90">
          {hours(totalPending)} of worked time is still <b>pending review</b> — approve it on the <b>Time</b> tab.
        </Card>
      )}
      <Table head={["Employee", "Approved", "Pending", "Rate", "Gross pay"]}>
        {rows.map((x) => (
          <tr key={x.employee_id} className="border-t border-border">
            <td className="py-2">{x.employee_name}</td>
            <td>{hours(x.hours)}</td>
            <td className={x.pendingHours > 0.01 ? "text-warning" : "text-muted"}>
              {x.pendingHours > 0.01 ? hours(x.pendingHours) : "—"}
            </td>
            <td>{money(x.rate)}</td>
            <td className="font-medium">{money(x.pay)}</td>
          </tr>
        ))}
      </Table>
      {rows.length === 0 && <Empty>No worked time in this range.</Empty>}
      <div className="mt-4"><Copy text={tsv} label="Copy for payroll" small /></div>
      <p className="mt-2 text-xs text-muted">Only <b>approved</b> time is paid.</p>
    </div>
  );
}

/* ---------- Time (approve / deny / modify) ---------- */
function TimeTab({ segments, onDecide }) {
  const [showReviewed, setShowReviewed] = useState(false);
  const closed = segments.filter((s) => !s.open).sort((a, b) => new Date(b.start) - new Date(a.start));
  const open = segments.filter((s) => s.open);
  const pending = closed.filter((s) => s.status === "pending");
  const reviewed = closed.filter((s) => s.status !== "pending");
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Needs review" value={pending.length} tone={pending.length ? "accent" : undefined} />
        <Stat label="Approved" value={closed.filter((s) => s.status === "approved").length} tone="success" />
        <Stat label="On the clock" value={open.length} />
      </div>
      {open.map((s) => (
        <Card key={s.id} className="flex items-center gap-3 p-4">
          <span className="h-2.5 w-2.5 rounded-full bg-success" />
          <div>
            <div className="font-medium">{s.employee_name}</div>
            <div className="text-sm text-muted">{s.job_name} · clocked in {fmtTime(s.start)} (in progress)</div>
          </div>
        </Card>
      ))}
      <Section title="Shifts to review">
        {pending.length === 0 && <Empty>All caught up — nothing to review.</Empty>}
        {pending.map((s) => <SegmentRow key={s.id} s={s} onDecide={onDecide} />)}
      </Section>
      {reviewed.length > 0 && (
        <Section title={`Reviewed (${reviewed.length})`}>
          <Button variant="surface" size="sm" className="w-auto" onClick={() => setShowReviewed((v) => !v)}>
            {showReviewed ? "Hide" : "Show"} reviewed shifts
          </Button>
          {showReviewed && reviewed.map((s) => <SegmentRow key={s.id} s={s} onDecide={onDecide} />)}
        </Section>
      )}
    </div>
  );
}

function SegmentRow({ s, onDecide }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState((s.effHours || s.hours).toFixed(2));
  const tone = s.status === "approved" ? "success" : s.status === "denied" ? "warning" : "muted";
  const label = s.status === "approved" ? (s.edited ? "approved (edited)" : "approved")
    : s.status === "denied" ? "denied" : "pending";
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{s.employee_name}</span>
        <Badge tone={tone}>{label}</Badge>
        <span className="ml-auto text-sm text-muted">{fmtDate(s.start)}</span>
      </div>
      <div className="mt-1 text-sm text-muted">
        {s.job_name} · {fmtTime(s.start)} – {fmtTime(s.end)} · <span className="text-white">{hours(s.hours)}</span>
        {s.status === "approved" && s.edited && <span className="text-success"> → paid {hours(s.payHours)}</span>}
      </div>
      {editing ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-muted">Paid hours</span>
          <input type="number" step="0.25" value={val} onChange={(e) => setVal(e.target.value)}
            className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1 text-white" />
          <Button size="sm" className="w-auto" onClick={() => { onDecide(s, "approved", parseFloat(val) || 0); setEditing(false); }}>Save</Button>
          <Button variant="ghost" size="sm" className="w-auto" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button variant="success" size="sm" className="w-auto" onClick={() => onDecide(s, "approved", s.hours)}>Approve</Button>
          <Button variant="danger" size="sm" className="w-auto" onClick={() => onDecide(s, "denied")}>Deny</Button>
          <Button variant="surface" size="sm" className="w-auto"
            onClick={() => { setVal((s.effHours || s.hours).toFixed(2)); setEditing(true); }}>Modify</Button>
        </div>
      )}
    </Card>
  );
}

/* ---------- Job Cost ---------- */
function JobCostTab({ data, segments }) {
  const r = useRange();
  const rows = jobCost(segments, data.jobs, data.employees, r.startMs, r.endMs);
  const totalCost = rows.reduce((s, x) => s + x.cost, 0);
  return (
    <div>
      <RangeBar r={r} />
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Stat label="Jobs with labor" value={rows.length} />
        <Stat label="Total labor cost" value={money(totalCost)} tone="accent" />
      </div>
      <Table head={["Job", "Hours", "Labor cost", "Crew"]}>
        {rows.map((x) => (
          <tr key={x.job_id || x.job_name} className="border-t border-border align-top">
            <td className="py-2">
              <div className="font-medium">{x.job_name}</div>
              <div className="text-xs text-muted">{x.job_address}</div>
            </td>
            <td>{hours(x.hours)}</td>
            <td className="font-medium">{money(x.cost)}</td>
            <td className="text-sm text-muted">{x.workers.join(", ")}</td>
          </tr>
        ))}
      </Table>
      {rows.length === 0 && <Empty>No labor logged to jobs in this range.</Empty>}
    </div>
  );
}

/* ---------- Settings ---------- */
function SettingsTab({ linkBase, data, segments, onSaveBase, onSignOut }) {
  const [base, setBase] = useState(linkBase);

  const exportCsv = () => {
    const rows = [["employee", "job", "date", "start", "end", "hours", "status", "paid_hours"]];
    (segments || []).filter((s) => !s.open).forEach((s) =>
      rows.push([s.employee_name, s.job_name, fmtDate(s.start), s.start, s.end || "",
        s.hours.toFixed(2), s.status, (s.payHours || 0).toFixed(2)]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    download(`crewclock-timesheet-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="max-w-2xl space-y-5">
      <Section title="Export">
        <Card className="space-y-3 p-4">
          <p className="text-sm text-muted">Download every completed shift as a spreadsheet (CSV) — opens in Excel or Google Sheets.</p>
          <Button className="w-auto" onClick={exportCsv} disabled={!segments?.length}>Export timesheet to spreadsheet</Button>
        </Card>
      </Section>
      <Section title="Employee link base">
        <Card className="space-y-3 p-4">
          <Inp value={base} set={setBase} />
          <Button className="w-auto" onClick={() => onSaveBase(base)}>Save</Button>
        </Card>
      </Section>
      <Section title="Account">
        <Card className="space-y-2 p-4 text-sm text-muted">
          <div>Connected to your CrewClock database{data ? ` — ${data.employees.length} employees, ${data.jobs.length} jobs.` : "."}</div>
          <Button variant="surface" className="w-auto" onClick={onSignOut}>Sign out of admin</Button>
        </Card>
      </Section>
    </div>
  );
}

function Unlock({ onSave }) {
  const [k, setK] = useState("");
  return (
    <div className="mx-auto max-w-xl space-y-4 py-10">
      <h1 className="text-xl font-semibold">Welcome to CrewClock Admin</h1>
      <p className="text-sm text-muted">
        Enter your admin access key to unlock the control center. (The desktop app
        carries this for you automatically — you only need it here on the web.)
      </p>
      <Inp label="Admin access key" value={k} set={setK} placeholder="paste your key" />
      <Button className="w-auto" onClick={() => onSave(k)} disabled={!k.trim()}>Unlock</Button>
    </div>
  );
}

/* ---------- tiny presentational bits ---------- */
function Stat({ label, value, tone }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={"mt-1 text-2xl font-semibold " +
        (tone === "success" ? "text-success" : tone === "accent" ? "text-accent" : "text-white")}>
        {value}
      </div>
    </Card>
  );
}
function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}
function Table({ head, children }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-muted">
          {head.map((h) => <th key={h} className="pb-2 font-medium">{h}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
function Empty({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
      {children}
    </div>
  );
}
