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

/**
 * Submit one event to the database via the token-validated function.
 *   - resolves -> delivered (remove from queue)
 *   - throws   -> offline / transient error (keep in queue, retry later)
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
    if (r.error === "denied") return true; // bad token — don't retry forever
    throw new Error(r.error || "rejected");
  }
  return true;
}

/** Queue an event and immediately attempt to flush (UI already updated). */
export function submitEvent(event) {
  enqueue(event);
  flushQueue();
}

let flushing = false;

/** Try to send every pending event. Safe to call often; self-guards reentry. */
export async function flushQueue() {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  flushing = true;
  try {
    for (const item of getQueue()) {
      if (item.status === "sent") {
        removeFromQueue(item.event_id);
        continue;
      }
      try {
        await submitOne(item);
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
  } finally {
    flushing = false;
  }
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
