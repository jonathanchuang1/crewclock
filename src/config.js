/**
 * CrewClock configuration — Supabase database backend.
 *
 * The publishable key is PUBLIC by design (safe in the browser): every table
 * has row-level security with no public policies, so this key can only call the
 * two token-validated employee functions. Admin power comes from a separate
 * secret that lives only in the desktop app, never here.
 */

export const APP = {
  name: "CrewClock",
  refreshMs: 5 * 60 * 1000,
  syncIntervalMs: 15 * 1000,
};

export const SUPABASE = {
  url: "https://dcikxatczyenngborkhv.supabase.co",
  key: "sb_publishable_6lq5okCTf9zaOnl6GLIScQ_G1ud9A0M",
};

export const DEMO_MODE = false;
