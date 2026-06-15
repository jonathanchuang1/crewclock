import { useEffect, useMemo, useState } from "react";
import { Button, Card, Badge, Select } from "../components/ui/primitives.jsx";
import { Logo } from "../components/Logo.jsx";
import {
  fetchAdminData,
  buildSegments,
  liveStatus,
  payroll,
  jobCost,
  approvalMap,
  annotate,
} from "./data.js";
import { buildEvent } from "../lib/events.js";
import { submitEvent, startSync } from "../lib/sync.js";

/* ---------- small helpers ---------- */
const LS = {
  sheet: "crewclock:adminSheetId",
  base: "crewclock:linkBase",
};
const DEFAULT_BASE = "https://jonathanchuang1.github.io/crewclock/";
const CONFIG_SHEET = "1YmVenmek1rsfc7EhIpCA5oBcsc2Pqhj_pWzgVvfKFwQ";
const configTabUrl = (gid) =>
  `https://docs.google.com/spreadsheets/d/${CONFIG_SHEET}/edit#gid=${gid}`;
const CONFIG_GID = { jobs: 1373808387, access: 944075018, todos: 1222125671 };
const shortId = (p) => p + Date.now().toString(36).slice(-5).toUpperCase();

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

function newToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sheetIdFrom(input) {
  const m = String(input).match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input.trim();
}

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";

function ago(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m ago`;
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

/* ---------- tabs ---------- */
const TABS = ["Time", "Live", "Links", "Manage", "Payroll", "Job Cost", "Settings"];

/**
 * Resolve the sheet id at startup: a baked-in value passed by the desktop app
 * (admin.html#sheet=ID or ?sheet=ID) wins and is remembered; otherwise fall
 * back to whatever this device saved before. The public web page ships no id,
 * so opening it without the param just shows onboarding.
 */
function initialSheet() {
  try {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("sheet");
    const q = new URLSearchParams(window.location.search).get("sheet");
    const fromUrl = (h || q || "").trim();
    if (fromUrl) {
      localStorage.setItem(LS.sheet, fromUrl);
      return fromUrl;
    }
  } catch {}
  return get(LS.sheet);
}

export function AdminApp() {
  const [sheetId, setSheetId] = useState(initialSheet);
  const [linkBase, setLinkBase] = useState(get(LS.base, DEFAULT_BASE));
  const [tab, setTab] = useState("Time");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // optimistic approve/deny decisions not yet round-tripped to the sheet
  const [localApprovals, setLocalApprovals] = useState({});

  const load = async (id = sheetId) => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const d = await fetchAdminData(id);
      setData(d);
      // keep optimistic approvals; annotate() merges latest-wins with the sheet
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sheetId) load(sheetId);
    const stop = startSync(15000); // flush queued approval events
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh so the board reflects clock-ins/outs without manual Refresh.
  useEffect(() => {
    if (!sheetId) return;
    const id = setInterval(() => load(sheetId), 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  const segments = useMemo(() => {
    if (!data) return [];
    return annotate(buildSegments(data.events), approvalMap(data.events), localApprovals);
  }, [data, localApprovals]);

  const decide = (seg, action, hours) => {
    submitEvent(
      buildEvent(
        { employee_id: seg.employee_id, employee_name: seg.employee_name, token: "admin" },
        {
          event_type: "time_approval",
          job_id: seg.job_id,
          job_name: seg.job_name,
          job_address: seg.job_address,
          todo_id: seg.id,
          todo_status: action, // "approved" | "denied"
          todo_completion_note:
            action === "approved" ? String(Number(hours).toFixed(2)) : "",
        }
      )
    );
    setLocalApprovals((p) => ({
      ...p,
      [seg.id]: {
        action,
        hours: action === "approved" ? Number(hours) : NaN,
        at: Date.now(),
      },
    }));
  };

  if (!sheetId) {
    return (
      <Shell tab="Settings" setTab={() => {}} onlySettings>
        <Onboarding
          onSave={(id) => {
            const clean = sheetIdFrom(id);
            localStorage.setItem(LS.sheet, clean);
            setSheetId(clean);
            load(clean);
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell
      tab={tab}
      setTab={setTab}
      loading={loading}
      fetchedAt={data?.fetchedAt}
      onReload={() => load()}
    >
      {error && (
        <Card className="mb-4 border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </Card>
      )}
      {!data && loading && <p className="text-muted">Loading your data…</p>}
      {data && tab === "Time" && <TimeTab segments={segments} onDecide={decide} />}
      {data && tab === "Live" && <LiveTab data={data} />}
      {data && tab === "Links" && (
        <LinksTab data={data} linkBase={linkBase} />
      )}
      {data && tab === "Manage" && <ManageTab data={data} />}
      {data && tab === "Payroll" && (
        <PayrollTab data={data} segments={segments} />
      )}
      {data && tab === "Job Cost" && (
        <JobCostTab data={data} segments={segments} />
      )}
      {tab === "Settings" && (
        <SettingsTab
          sheetId={sheetId}
          linkBase={linkBase}
          onSave={(id, base) => {
            const clean = sheetIdFrom(id);
            localStorage.setItem(LS.sheet, clean);
            localStorage.setItem(LS.base, base);
            setSheetId(clean);
            setLinkBase(base);
            load(clean);
          }}
        />
      )}
    </Shell>
  );
}

/* ---------- shell / chrome ---------- */
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
              <Button
                variant="surface"
                size="sm"
                className="w-auto"
                onClick={onReload}
                disabled={loading}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </Button>
            )}
          </div>
        </div>
        {!onlySettings && (
          <nav className="mx-auto flex max-w-5xl gap-1 px-4 pb-2">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                  (tab === t
                    ? "bg-accent text-white"
                    : "text-muted hover:bg-surface-2 hover:text-white")
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
            <div className="ml-auto text-right text-sm text-muted">
              since {ago(r.since)}
            </div>
          </Card>
        ))}
      </Section>
      <Section title={`Off the clock (${out.length})`}>
        {out.map((r) => (
          <div
            key={r.employee_id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted/50" />
            <span className="text-muted">{r.employee_name}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

/* ---------- Links ---------- */
function LinksTab({ data, linkBase }) {
  const base = linkBase.endsWith("/") ? linkBase : linkBase + "/";
  const [name, setName] = useState("");
  const [tok, setTok] = useState("");

  return (
    <div className="space-y-6">
      <Section title="Send each person their link">
        {data.employees.map((e) => {
          const link = `${base}?t=${encodeURIComponent(e.employee_token)}`;
          const msg = `Hi ${e.employee_name}, here's your CrewClock time-clock link — open it to clock in/out and add "to home screen":\n${link}`;
          const revoked = /^(yes|true|1)$/i.test(e.employee_token_revoked || "");
          const inactive = !/^(active|yes|1|true)$/i.test(e.active_status || "");
          return (
            <Card key={e.employee_id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.employee_name}</span>
                {inactive && <Badge tone="warning">inactive</Badge>}
                {revoked && <Badge tone="warning">token revoked</Badge>}
                {!e.employee_token && <Badge tone="warning">no token</Badge>}
              </div>
              {e.employee_token && (
                <>
                  <div className="mt-2 break-all rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
                    {link}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Copy text={link} label="Copy link" small />
                    <Copy text={msg} label="Copy text message" small />
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </Section>

      <Section title="Add a new employee">
        <Card className="space-y-3 p-4">
          <p className="text-sm text-muted">
            Generate a unique token, then paste the rows into your sheets. The
            new link works the moment the row hits the EmployeesConfig tab.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-white outline-none focus:border-accent"
              placeholder="Employee name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              className="w-auto"
              onClick={() => setTok(newToken())}
              disabled={!name.trim()}
            >
              Generate token + link
            </Button>
          </div>
          {tok && (
            <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-3 text-sm">
              <Field label="Personal link">
                <code className="break-all text-xs text-accent">
                  {base}?t={tok}
                </code>
                <Copy text={`${base}?t=${tok}`} label="Copy" small />
              </Field>
              <Field label="Paste into Admin sheet → Employees (new row)">
                <Copy
                  small
                  label="Copy row"
                  text={`\t${name}\t${tok}\tno\t\tactive`}
                />
              </Field>
              <Field label="Paste into Config sheet → EmployeesConfig (new row)">
                <Copy
                  small
                  label="Copy row"
                  text={`\t${name}\t${tok}\tno\tactive\t`}
                />
              </Field>
              <p className="text-xs text-muted">
                Fill the blank employee_id (e.g. E004) and hourly_rate in the
                Admin sheet. Rows are tab-separated — paste pastes across columns.
              </p>
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}

/* ---------- Payroll ---------- */
function useRange() {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const [start, setStart] = useState(fmt(new Date(Date.now() - 13 * 864e5)));
  const [end, setEnd] = useState(fmt(new Date()));
  const startMs = new Date(start + "T00:00:00").getTime();
  const endMs = new Date(end + "T23:59:59").getTime();
  return { start, end, setStart, setEnd, startMs, endMs };
}

function RangeBar({ r }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="text-sm text-muted">
        From
        <input
          type="date"
          value={r.start}
          onChange={(e) => r.setStart(e.target.value)}
          className="ml-2 rounded-lg border border-border bg-surface-2 px-2 py-1 text-white"
        />
      </label>
      <label className="text-sm text-muted">
        To
        <input
          type="date"
          value={r.end}
          onChange={(e) => r.setEnd(e.target.value)}
          className="ml-2 rounded-lg border border-border bg-surface-2 px-2 py-1 text-white"
        />
      </label>
    </div>
  );
}

function PayrollTab({ data, segments }) {
  const r = useRange();
  const rows = payroll(segments, data.employees, r.startMs, r.endMs);
  const totalHours = rows.reduce((s, x) => s + x.hours, 0);
  const totalPay = rows.reduce((s, x) => s + x.pay, 0);
  const totalPending = rows.reduce((s, x) => s + x.pendingHours, 0);
  const tsv = [
    "employee\tapproved_hours\trate\tgross_pay",
    ...rows.map((x) => `${x.employee_name}\t${x.hours.toFixed(2)}\t${x.rate}\t${x.pay.toFixed(2)}`),
  ].join("\n");

  return (
    <div>
      <RangeBar r={r} />
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Stat label="Approved hours" value={hours(totalHours)} />
        <Stat label="Gross pay (approved)" value={money(totalPay)} tone="accent" />
      </div>
      {totalPending > 0.01 && (
        <Card className="mb-4 border-warning/30 bg-warning/10 p-3 text-sm text-warning/90">
          {hours(totalPending)} of worked time is still <b>pending review</b> and
          isn't being paid yet. Approve it on the <b>Time</b> tab.
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
      <div className="mt-4">
        <Copy text={tsv} label="Copy for payroll" small />
      </div>
      <p className="mt-2 text-xs text-muted">
        Only <b>approved</b> time is paid. Uses each employee's current hourly
        rate from your sheet.
      </p>
    </div>
  );
}

/* ---------- Time (approve / deny / modify) ---------- */
function TimeTab({ segments, onDecide }) {
  const closed = segments
    .filter((s) => !s.open)
    .sort((a, b) => new Date(b.start) - new Date(a.start));
  const open = segments.filter((s) => s.open);
  const pending = closed.filter((s) => s.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Needs review" value={pending} tone={pending ? "accent" : undefined} />
        <Stat label="Approved" value={closed.filter((s) => s.status === "approved").length} tone="success" />
        <Stat label="On the clock" value={open.length} />
      </div>

      {open.map((s) => (
        <Card key={s.id} className="flex items-center gap-3 p-4">
          <span className="h-2.5 w-2.5 rounded-full bg-success" />
          <div>
            <div className="font-medium">{s.employee_name}</div>
            <div className="text-sm text-muted">
              {s.job_name} · clocked in {fmtTime(s.start)} (in progress)
            </div>
          </div>
        </Card>
      ))}

      <Section title="Shifts to review">
        {closed.length === 0 && <Empty>No completed shifts yet.</Empty>}
        {closed.map((s) => (
          <SegmentRow key={s.id} s={s} onDecide={onDecide} />
        ))}
      </Section>
    </div>
  );
}

function SegmentRow({ s, onDecide }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState((s.effHours || s.hours).toFixed(2));

  const tone =
    s.status === "approved" ? "success" : s.status === "denied" ? "warning" : "muted";
  const label =
    s.status === "approved"
      ? s.edited
        ? "approved (edited)"
        : "approved"
      : s.status === "denied"
      ? "denied"
      : "pending";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{s.employee_name}</span>
        <Badge tone={tone}>{label}</Badge>
        <span className="ml-auto text-sm text-muted">{fmtDate(s.start)}</span>
      </div>
      <div className="mt-1 text-sm text-muted">
        {s.job_name} · {fmtTime(s.start)} – {fmtTime(s.end)} ·{" "}
        <span className="text-white">{hours(s.hours)}</span>
        {s.status === "approved" && s.edited && (
          <span className="text-success"> → paid {hours(s.payHours)}</span>
        )}
      </div>

      {editing ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-muted">Paid hours</span>
          <input
            type="number"
            step="0.25"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1 text-white"
          />
          <Button
            size="sm"
            className="w-auto"
            onClick={() => {
              onDecide(s, "approved", parseFloat(val) || 0);
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button variant="ghost" size="sm" className="w-auto" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            variant="success"
            size="sm"
            className="w-auto"
            onClick={() => onDecide(s, "approved", s.hours)}
          >
            Approve
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="w-auto"
            onClick={() => onDecide(s, "denied")}
          >
            Deny
          </Button>
          <Button
            variant="surface"
            size="sm"
            className="w-auto"
            onClick={() => {
              setVal((s.effHours || s.hours).toFixed(2));
              setEditing(true);
            }}
          >
            Modify
          </Button>
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

/* ---------- Settings / Onboarding ---------- */
function SettingsTab({ sheetId, linkBase, onSave }) {
  const [id, setId] = useState(sheetId);
  const [base, setBase] = useState(linkBase);
  return (
    <div className="max-w-2xl space-y-5">
      <Section title="Data source">
        <p className="text-sm text-muted">
          Paste the link (or ID) of your private <b>CrewClock — Admin</b>{" "}
          spreadsheet. It must be shared <b>Anyone with the link → Viewer</b> so
          this app can read it. The ID is stored only on this computer.
        </p>
        <input
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-white outline-none focus:border-accent"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/…"
        />
        <label className="block text-sm text-muted">
          Employee link base
          <input
            className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-white outline-none focus:border-accent"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          />
        </label>
        <Button className="w-auto" onClick={() => onSave(id, base)} disabled={!id.trim()}>
          Save & load
        </Button>
      </Section>
      <Card className="border-warning/30 bg-warning/10 p-4 text-sm text-warning/90">
        <b>Privacy note:</b> sharing the Admin sheet “anyone with the link”
        means anyone who has that long URL could view pay rates. Keep the URL
        and this app private. A locked-down version can be added later.
      </Card>
    </div>
  );
}

function Onboarding({ onSave }) {
  const [id, setId] = useState("");
  return (
    <div className="mx-auto max-w-xl space-y-4 py-10">
      <h1 className="text-xl font-semibold">Welcome to CrewClock Admin</h1>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
        <li>
          Open your <b>CrewClock — Admin</b> Google Sheet → <b>Share</b> →
          General access → <b>Anyone with the link</b> → <b>Viewer</b>.
        </li>
        <li>Copy the sheet's URL and paste it below.</li>
      </ol>
      <input
        className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-white outline-none focus:border-accent"
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="https://docs.google.com/spreadsheets/d/…"
      />
      <Button className="w-auto" onClick={() => onSave(id)} disabled={!id.trim()}>
        Connect
      </Button>
    </div>
  );
}

/* ---------- Manage (assignments / notes / projects) ---------- */
function ManageTab({ data }) {
  return (
    <div className="space-y-6">
      <Card className="border-accent/30 bg-accent/10 p-3 text-sm text-white/90">
        Fill a form, click <b>Copy row</b>, then <b>Open the tab</b> and paste it as
        a new row (Ctrl+V fills across columns). Crew see it within a few minutes.
      </Card>
      <AssignmentForm data={data} />
      <NoteForm data={data} />
      <ProjectForm data={data} />
    </div>
  );
}

function Inp({ label, value, set, type = "text", placeholder }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
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

function WhoWhere({ data, emp, setEmp, job, setJob }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Assign to</span>
        <Select value={emp} onChange={(e) => setEmp(e.target.value)}>
          <option value="">— anyone —</option>
          {data.employees.map((e) => (
            <option key={e.employee_id} value={e.employee_id}>
              {e.employee_name}
            </option>
          ))}
        </Select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Job (optional)</span>
        <Select value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">— none —</option>
          {data.jobs.map((j) => (
            <option key={j.job_id} value={j.job_id}>
              {j.job_name}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}

function AssignmentForm({ data }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [emp, setEmp] = useState("");
  const [job, setJob] = useState("");
  const [priority, setPriority] = useState("medium");
  const [due, setDue] = useState("");
  const [canComplete, setCanComplete] = useState(true);
  // TodosConfig: todo_id,title,description,assigned_employee_id,job_id,priority,status,employee_can_complete,due_date
  const row = [shortId("T"), title, desc, emp, job, priority, "open", canComplete ? "yes" : "no", due].join("\t");

  return (
    <Card className="space-y-3 p-4">
      <h3 className="font-semibold">📋 New assignment (to-do)</h3>
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
      <div className="flex gap-2">
        <Copy text={row} label="Copy row" small />
        <a href={configTabUrl(CONFIG_GID.todos)} target="_blank" rel="noreferrer">
          <Button variant="surface" size="sm" className="w-auto">Open TodosConfig tab ↗</Button>
        </a>
      </div>
    </Card>
  );
}

function NoteForm({ data }) {
  const [text, setText] = useState("");
  const [emp, setEmp] = useState("");
  const [job, setJob] = useState("");
  // A note = a read-only to-do (employee_can_complete=no) so it shows in their list.
  const row = [shortId("N"), text, "", emp, job, "low", "open", "no", ""].join("\t");

  return (
    <Card className="space-y-3 p-4">
      <h3 className="font-semibold">📣 Send a note</h3>
      <Inp label="Note" value={text} set={setText} placeholder="e.g. Bring extra fans to Maple St today" />
      <WhoWhere data={data} emp={emp} setEmp={setEmp} job={job} setJob={setJob} />
      <p className="text-xs text-muted">Shows in the crew's to-do list as a read-only note.</p>
      <div className="flex gap-2">
        <Copy text={row} label="Copy row" small />
        <a href={configTabUrl(CONFIG_GID.todos)} target="_blank" rel="noreferrer">
          <Button variant="surface" size="sm" className="w-auto">Open TodosConfig tab ↗</Button>
        </a>
      </div>
    </Card>
  );
}

function ProjectForm({ data }) {
  const [name, setName] = useState("");
  const [addr, setAddr] = useState("");
  const [cust, setCust] = useState("");
  const [jobId] = useState(() => shortId("J"));
  // JobsConfig: job_id,job_name,job_address,customer_name,active_status
  const jobRow = [jobId, name, addr, cust, "active"].join("\t");
  // AccessConfig: employee_id,job_id,enabled_status  (one row per active employee)
  const accessRows = data.employees
    .filter((e) => /^(active|yes|1|true)$/i.test(e.active_status || ""))
    .map((e) => [e.employee_id, jobId, "enabled"].join("\t"))
    .join("\n");

  return (
    <Card className="space-y-3 p-4">
      <h3 className="font-semibold">🏗️ New project (job)</h3>
      <Inp label="Job name" value={name} set={setName} placeholder="e.g. Elm St Water Damage" />
      <Inp label="Address" value={addr} set={setAddr} />
      <Inp label="Customer (optional)" value={cust} set={setCust} />
      <div className="space-y-2">
        <div className="flex gap-2">
          <Copy text={jobRow} label="1. Copy job row" small />
          <a href={configTabUrl(CONFIG_GID.jobs)} target="_blank" rel="noreferrer">
            <Button variant="surface" size="sm" className="w-auto">Open JobsConfig ↗</Button>
          </a>
        </div>
        <div className="flex gap-2">
          <Copy text={accessRows} label="2. Copy access rows" small />
          <a href={configTabUrl(CONFIG_GID.access)} target="_blank" rel="noreferrer">
            <Button variant="surface" size="sm" className="w-auto">Open AccessConfig ↗</Button>
          </a>
        </div>
      </div>
      <p className="text-xs text-muted">
        Step 1 creates the job; step 2 lets your crew clock into it (delete rows for
        anyone who shouldn't). Same job id is used for both.
      </p>
    </Card>
  );
}

/* ---------- tiny presentational bits ---------- */
function Stat({ label, value, tone }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-muted">{label}</div>
      <div
        className={
          "mt-1 text-2xl font-semibold " +
          (tone === "success" ? "text-success" : tone === "accent" ? "text-accent" : "text-white")
        }
      >
        {value}
      </div>
    </Card>
  );
}
function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}
function Table({ head, children }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-muted">
          {head.map((h) => (
            <th key={h} className="pb-2 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
function Field({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
function Empty({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
      {children}
    </div>
  );
}
