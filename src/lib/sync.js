import { FORM, DEMO_MODE } from "../config.js";
import {
  getQueue,
  enqueue,
  removeFromQueue,
  updateQueueItem,
} from "./storage.js";

/**
 * In demo mode every "submission" lands here so you can inspect what WOULD be
 * sent to the Google Form. Visible in the console as `window.__ccDemoLog`.
 */
const demoLog = [];
if (typeof window !== "undefined") window.__ccDemoLog = demoLog;

/** Encode an event object into application/x-www-form-urlencoded for the Form. */
function encodeForm(event) {
  const body = new URLSearchParams();
  for (const [col, entryId] of Object.entries(FORM.fields)) {
    if (event[col] != null && event[col] !== "") {
      body.append(entryId, String(event[col]));
    }
  }
  return body.toString();
}

/**
 * Submit one event to Google Forms.
 *
 * Google Forms does not send CORS headers, so we POST with `mode: "no-cors"`.
 * The response is "opaque": we cannot read its status. The contract we rely on:
 *   - fetch RESOLVES  -> the request left the device (treat as delivered).
 *   - fetch REJECTS   -> offline / blocked (keep in queue, retry later).
 * Duplicate rows that slip through are reconciled in the Sheet via event_id.
 */
async function submitOne(event) {
  if (DEMO_MODE) {
    demoLog.push({ ...event, _demoSubmittedAt: new Date().toISOString() });
    return true;
  }
  await fetch(FORM.actionUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeForm(event),
  });
  return true;
}

/**
 * Queue an event and immediately attempt to flush. Returns nothing — callers
 * already updated the UI optimistically before calling this.
 */
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
        // Stop early; we're probably offline. We'll retry on next tick / online.
        break;
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
