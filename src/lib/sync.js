import { DEMO_MODE } from "../config.js";
import { rpc } from "./supabase.js";
import {
  getQueue,
  enqueue,
  removeFromQueue,
  updateQueueItem,
} from "./storage.js";

const demoLog = [];
if (typeof window !== "undefined") window.__ccDemoLog = demoLog;

// Per-event outcome so submitEvent can report delivered vs. permanently refused.
const results = new Map();

/**
 * Submit one event.
 *   returns true            -> delivered
 *   returns { refused, error } -> server refused (e.g. job closed) — don't retry
 *   throws                  -> offline / transient — keep & retry
 */
async function submitOne(event) {
  if (DEMO_MODE) {
    demoLog.push({ ...event, _demoSubmittedAt: new Date().toISOString() });
    return true;
  }
  const r = await rpc("submit_event", {
    p_token: event._token || "",
    p_event_type: event.event_type,
    p_job_id: event.job_id || "",
    p_job_name: event.job_name || "",
    p_job_address: event.job_address || "",
    p_note: event.note_text || "",
    p_device: event.device_info || "",
  });
  if (r && r.ok === false) {
    if (r.error === "denied" || r.error === "job_closed") {
      return { refused: true, error: r.error };
    }
    throw new Error(r.error || "rejected");
  }
  return true;
}

const queued = (id) => getQueue().some((e) => e.event_id === id);

/** Queue + deliver an event. Resolves { ok, refused, error }. */
export async function submitEvent(event) {
  enqueue(event);
  await flushQueue();
  if (queued(event.event_id) && (typeof navigator === "undefined" || navigator.onLine !== false)) {
    await flushQueue();
  }
  if (queued(event.event_id)) return { ok: false }; // saved locally, will retry
  const r = results.get(event.event_id);
  results.delete(event.event_id);
  return r && r.refused ? { ok: false, refused: true, error: r.error } : { ok: true };
}

let flushing = null;

/** Flush the queue. Returns a shared promise so concurrent callers await one run. */
export function flushQueue() {
  if (flushing) return flushing;
  flushing = (async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    for (const item of getQueue()) {
      try {
        const res = await submitOne(item);
        if (res && res.refused) results.set(item.event_id, res);
        removeFromQueue(item.event_id);
      } catch {
        updateQueueItem(item.event_id, {
          attempts: (item.attempts || 0) + 1,
          status: "pending",
          lastError: Date.now(),
        });
        break; // probably offline — retry on next tick / online
      }
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Wire up automatic retries: on interval, on regaining connectivity, on focus. */
export function startSync(intervalMs) {
  flushQueue();
  const timer = setInterval(flushQueue, intervalMs);
  const onOnline = () => flushQueue();
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onOnline);
  return () => {
    clearInterval(timer);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onOnline);
  };
}
