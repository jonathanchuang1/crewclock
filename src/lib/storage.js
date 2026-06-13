/**
 * localStorage-backed cache + offline queue, namespaced per employee token so
 * multiple employees on one device never collide.
 */

const ns = (token, key) => `cc:${token || "anon"}:${key}`;
const GLOBAL = (key) => `cc:_global:${key}`;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode — fail silently, app still works in-memory */
  }
}

/* ---------- Cached employee config (profile, jobs, todos) ---------- */

export function getCachedConfig(token) {
  return read(ns(token, "config"), null);
}
export function setCachedConfig(token, config) {
  write(ns(token, "config"), { ...config, cachedAt: Date.now() });
}

/* ---------- Current clock status (optimistic source of truth on device) ---------- */

const DEFAULT_STATUS = { clockedIn: false, job: null, since: null };

export function getStatus(token) {
  return read(ns(token, "status"), DEFAULT_STATUS);
}
export function setStatus(token, status) {
  write(ns(token, "status"), status);
}

/* ---------- Locally completed to-dos (optimistic) ---------- */

export function getDoneTodos(token) {
  return read(ns(token, "doneTodos"), {});
}
export function markTodoDone(token, todoId) {
  const map = getDoneTodos(token);
  map[todoId] = Date.now();
  write(ns(token, "doneTodos"), map);
}

/* ---------- Offline event queue ---------- */

export function getQueue() {
  return read(GLOBAL("queue"), []);
}
export function setQueue(queue) {
  write(GLOBAL("queue"), queue);
}
export function enqueue(event) {
  const q = getQueue();
  // Guard against accidental duplicate enqueue of the same event_id.
  if (q.some((e) => e.event_id === event.event_id)) return q;
  q.push({ ...event, attempts: 0, status: "pending", queuedAt: Date.now() });
  setQueue(q);
  return q;
}
export function updateQueueItem(eventId, patch) {
  const q = getQueue().map((e) =>
    e.event_id === eventId ? { ...e, ...patch } : e
  );
  setQueue(q);
  return q;
}
export function removeFromQueue(eventId) {
  const q = getQueue().filter((e) => e.event_id !== eventId);
  setQueue(q);
  return q;
}
