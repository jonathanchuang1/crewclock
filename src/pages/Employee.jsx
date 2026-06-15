import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  LogIn,
  LogOut,
  Repeat,
  User,
  ListTodo,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  CloudOff,
} from "lucide-react";
import { DEMO_MODE } from "../config.js";
import { useTimeTracker } from "../hooks/useTimeTracker.js";
import { Button, Card } from "../components/ui/primitives.jsx";
import { StatusCard } from "../components/StatusCard.jsx";
import { JobSheet } from "../components/JobSheet.jsx";
import { NotesInput } from "../components/NotesInput.jsx";
import { TodoList } from "../components/TodoList.jsx";
import { SyncBar } from "../components/SyncBar.jsx";
import { Logo } from "../components/Logo.jsx";

const ERRORS = {
  missing: "No employee link found. Open the secure link your admin sent you.",
  unknown: "This link isn’t recognized. Ask your admin for a new one.",
  revoked: "This link has been revoked. Contact your admin.",
  inactive: "Your account is inactive. Contact your admin.",
  network: "Couldn’t reach the server and no saved data is on this device.",
};

function FullScreen({ children }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}

export function Employee({ token }) {
  const {
    config,
    status,
    done,
    loading,
    loadError,
    online,
    pending,
    actions,
    forceSync,
  } = useTimeTracker(token);

  const [clockInOpen, setClockInOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // { label, state: sending|synced|pending }

  // Job to-dos for the job the employee is currently clocked into.
  const currentJobTodos = useMemo(() => {
    if (!status.clockedIn || !status.job || !config) return [];
    return config.jobTodos.filter((t) => t.job_id === status.job.job_id);
  }, [status, config]);

  if (!token) {
    return (
      <FullScreen>
        <ErrorBlock message={ERRORS.missing} />
      </FullScreen>
    );
  }

  if (loadError && !config) {
    return (
      <FullScreen>
        <ErrorBlock message={ERRORS[loadError] || ERRORS.network} />
      </FullScreen>
    );
  }

  if (loading && !config) {
    return (
      <FullScreen>
        <Logo className="mb-6 animate-pulse" />
        <p className="text-muted">Loading your shift…</p>
      </FullScreen>
    );
  }

  const { profile, jobs, myTodos } = config;

  /* ---- action handlers: wait for the server, then confirm ---- */
  const run = async (label, fn) => {
    setConfirm({ label, state: "sending" });
    let ok = false;
    try {
      const r = await fn();
      ok = !!(r && r.ok);
    } catch {
      ok = false;
    }
    setConfirm({ label, state: ok ? "synced" : "pending" });
  };
  const handleClockIn = (job, note) => {
    setClockInOpen(false);
    run(`Clocked in · ${job.job_name}`, () => actions.clockIn(job, note));
  };
  const handleClockOut = () => run("Clocked out", () => actions.clockOut());
  const handleChange = (job, note) => {
    setChangeOpen(false);
    run(`Switched to ${job.job_name}`, () => actions.changeJob(job, note));
  };
  const handleNote = (text) => run("Note added", () => actions.addNote(text));
  const handleTodo = (todo, note) =>
    run("To-do completed", () => actions.completeTodo(todo, note));

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-4">
      {/* Header */}
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <div className="leading-tight">
            <div className="flex items-center gap-1.5 text-sm text-muted">
              <User size={13} /> {profile.employee_name}
            </div>
            {DEMO_MODE && (
              <span className="text-[11px] font-medium text-warning">
                Demo mode
              </span>
            )}
          </div>
        </div>
        <SyncBar online={online} pending={pending} onSync={forceSync} />
      </header>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <StatusCard status={status} />

        {/* Primary actions */}
        {status.clockedIn ? (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="surface" size="lg" onClick={() => setChangeOpen(true)}>
              <Repeat size={20} /> Change Job
            </Button>
            <Button variant="danger" size="lg" onClick={handleClockOut}>
              <LogOut size={20} /> Clock Out
            </Button>
          </div>
        ) : (
          <Button size="lg" onClick={() => setClockInOpen(true)}>
            <LogIn size={22} /> Clock In
          </Button>
        )}

        <NotesInput onAdd={handleNote} clockedIn={status.clockedIn} />

        {currentJobTodos.length > 0 && (
          <TodoList
            title="Current Job To-Dos"
            icon={Briefcase}
            todos={currentJobTodos}
            done={done}
            onComplete={handleTodo}
          />
        )}

        <TodoList
          title="My To-Dos"
          icon={ListTodo}
          todos={myTodos}
          done={done}
          onComplete={handleTodo}
        />
      </motion.div>

      {/* Sheets */}
      <JobSheet
        open={clockInOpen}
        onClose={() => setClockInOpen(false)}
        title="Choose a job to clock in"
        confirmLabel="Clock In"
        confirmVariant="success"
        jobs={jobs}
        onConfirm={handleClockIn}
      />
      <JobSheet
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        title="Switch job address"
        confirmLabel="Change Job"
        jobs={jobs}
        excludeJobId={status.job?.job_id}
        onConfirm={handleChange}
      />

      <SyncConfirm confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

/** Full-screen confirmation: sending → sent & synced (or saved, will sync). */
function SyncConfirm({ confirm, onClose }) {
  // auto-dismiss the success state after a moment
  useEffect(() => {
    if (confirm?.state === "synced") {
      const t = setTimeout(onClose, 1800);
      return () => clearTimeout(t);
    }
  }, [confirm, onClose]);

  if (!confirm) return null;
  const { label, state } = confirm;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
      onClick={state === "sending" ? undefined : onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="p-7 text-center">
          {state === "sending" && (
            <>
              <Loader2 size={44} className="mx-auto mb-4 animate-spin text-accent" />
              <p className="text-lg font-semibold">{label}</p>
              <p className="mt-1 text-sm text-muted">Sending to the office…</p>
            </>
          )}
          {state === "synced" && (
            <>
              <CheckCircle2 size={52} className="mx-auto mb-3 text-success" />
              <p className="text-lg font-semibold">{label}</p>
              <p className="mt-1 text-sm font-medium text-success">Sent &amp; synced ✓</p>
              <Button className="mt-5" onClick={onClose}>
                Done
              </Button>
            </>
          )}
          {state === "pending" && (
            <>
              <CloudOff size={48} className="mx-auto mb-3 text-warning" />
              <p className="text-lg font-semibold">{label}</p>
              <p className="mt-1 text-sm text-muted">
                Saved on this device. It’ll sync automatically once you’re back
                online — your punch isn’t lost.
              </p>
              <Button variant="surface" className="mt-5" onClick={onClose}>
                OK
              </Button>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

function ErrorBlock({ message }) {
  return (
    <Card className="w-full p-6">
      <AlertTriangle className="mx-auto mb-3 text-warning" size={32} />
      <p className="text-sm text-muted">{message}</p>
    </Card>
  );
}
