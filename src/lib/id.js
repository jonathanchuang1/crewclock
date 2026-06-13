/** Stable unique id for each event (used for duplicate prevention). */
export function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for very old browsers.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Deterministic duplicate-check key. The Sheet can use this to detect rows that
 * represent the same logical action submitted twice (e.g. retry after a flaky
 * network). event_id already guarantees row-level uniqueness; this adds a
 * human-readable secondary guard.
 */
export function duplicateKey({ employee_id, event_type, job_id, timestamp_utc }) {
  return [employee_id, event_type, job_id || "-", timestamp_utc].join("|");
}
