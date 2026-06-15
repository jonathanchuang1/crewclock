import { useCallback, useEffect, useRef, useState } from "react";
import { APP } from "../config.js";
import { loadConfig, loadCached } from "../lib/loadConfig.js";
import { buildEvent } from "../lib/events.js";
import { submitEvent, startSync, flushQueue } from "../lib/sync.js";
import {
  getStatus,
  setStatus,
  getDoneTodos,
  markTodoDone as cacheTodoDone,
  getQueue,
} from "../lib/storage.js";

/**
 * Owns all employee state + actions. Optimistic by design: every action updates
 * local state and cache first, then queues the event for background submission.
 */
export function useTimeTracker(token) {
  const [config, setConfig] = useState(() => loadCached(token));
  const [status, setStatusState] = useState(() => getStatus(token));
  const [done, setDone] = useState(() => getDoneTodos(token));
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(!loadCached(token));
  const [pending, setPending] = useState(() => getQueue().length);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const onceLoaded = useRef(false);

  /* ---- background sync engine + connectivity + pending count ---- */
  useEffect(() => {
    const stop = startSync(APP.syncIntervalMs);
    const tick = setInterval(() => setPending(getQueue().length), 1500);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      stop();
      clearInterval(tick);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  /* ---- load + periodic refresh of employee config ---- */
  const refresh = useCallback(async () => {
    try {
      const result = await loadConfig(token);
      if (result.error) {
        setLoadError(result.error);
      } else {
        setConfig(result);
        setLoadError(null);
      }
    } catch {
      // Network failed — keep showing cached config if we have it.
      if (!loadCached(token)) setLoadError("network");
    } finally {
      setLoading(false);
      onceLoaded.current = true;
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, APP.refreshMs);
    return () => clearInterval(t);
  }, [refresh]);

  /* ---- helpers ---- */
  const persistStatus = useCallback(
    (next) => {
      setStatus(token, next);
      setStatusState(next);
    },
    [token]
  );

  const emit = useCallback(
    (extra) => {
      const event = buildEvent(config?.profile || { token }, extra);
      const result = submitEvent(event); // Promise<{ ok }>
      setPending(getQueue().length);
      result.finally(() => setPending(getQueue().length));
      return result;
    },
    [config, token]
  );

  /* ---- ACTIONS ---- */

  const clockIn = useCallback(
    (job, note = "") => {
      persistStatus({
        clockedIn: true,
        job,
        since: new Date().toISOString(),
      });
      return emit({
        event_type: "clock_in",
        job_id: job.job_id,
        job_name: job.job_name,
        job_address: job.job_address,
        note_text: note,
      });
    },
    [emit, persistStatus]
  );

  const clockOut = useCallback(
    (note = "") => {
      const job = status.job || {};
      persistStatus({ clockedIn: false, job: null, since: null });
      return emit({
        event_type: "clock_out",
        job_id: job.job_id || "",
        job_name: job.job_name || "",
        job_address: job.job_address || "",
        note_text: note,
      });
    },
    [emit, persistStatus, status.job]
  );

  const changeJob = useCallback(
    (job, note = "") => {
      persistStatus({ ...status, job });
      return emit({
        event_type: "change_job",
        job_id: job.job_id,
        job_name: job.job_name,
        job_address: job.job_address,
        note_text: note,
      });
    },
    [emit, persistStatus, status]
  );

  const addNote = useCallback(
    (note) => {
      const job = status.clockedIn ? status.job : {};
      return emit({
        event_type: "add_note",
        job_id: job?.job_id || "",
        job_name: job?.job_name || "",
        job_address: job?.job_address || "",
        note_text: note,
      });
    },
    [emit, status]
  );

  const completeTodo = useCallback(
    (todo, completionNote = "") => {
      cacheTodoDone(token, todo.todo_id);
      setDone(getDoneTodos(token));
      return emit({
        event_type: "todo_update",
        job_id: todo.job_id || "",
        todo_id: todo.todo_id,
        todo_status: "done",
        todo_completion_note: completionNote,
      });
    },
    [emit, token]
  );

  return {
    config,
    status,
    done,
    loading,
    loadError,
    online,
    pending,
    actions: { clockIn, clockOut, changeJob, addNote, completeTodo },
    forceSync: () => {
      flushQueue();
      setPending(getQueue().length);
    },
  };
}
