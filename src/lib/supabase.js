import { SUPABASE } from "../config.js";

/**
 * Minimal Supabase RPC client (no SDK — keeps the bundle tiny).
 * Calls a Postgres function over the auto-generated REST API.
 */
export async function rpc(fn, params) {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE.key,
      Authorization: `Bearer ${SUPABASE.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params || {}),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.message || j.error || j.hint || msg;
    } catch {}
    throw new Error(`${fn}: ${msg}`);
  }
  return res.json();
}
