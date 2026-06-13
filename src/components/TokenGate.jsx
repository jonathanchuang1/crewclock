import { useState } from "react";
import { Button } from "./ui/primitives.jsx";
import { Logo } from "./Logo.jsx";

/**
 * Shown when the app is opened without a token (e.g. the desktop/portable app,
 * or someone visiting the bare URL). Accepts either a raw token or a full
 * employee link, remembers it on this device, and reloads into the app.
 */
export function TokenGate() {
  const [value, setValue] = useState("");

  const open = () => {
    const raw = value.trim();
    if (!raw) return;
    // Accept a pasted full link (…?t=XXX or #t=XXX) or a bare token.
    let token = raw;
    const m = raw.match(/[?#&](?:t|token)=([^&]+)/);
    if (m) token = decodeURIComponent(m[1]);
    token = token.trim();
    if (!token) return;
    try {
      localStorage.setItem("crewclock:token", token);
    } catch {}
    // Reload into the app with the token in the query string.
    const base = window.location.pathname;
    window.location.replace(`${base}?t=${encodeURIComponent(token)}`);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
      <Logo size={40} className="mb-3" />
      <h1 className="text-xl font-semibold text-white">CrewClock</h1>
      <p className="mt-1 mb-8 text-center text-sm text-muted">
        Enter your personal link or token to clock in.
      </p>

      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && open()}
        placeholder="Paste your link or token…"
        className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3.5 text-white placeholder:text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition"
      />
      <Button className="mt-4" onClick={open} disabled={!value.trim()}>
        Open CrewClock
      </Button>

      <p className="mt-6 text-center text-xs text-muted">
        Your token is saved on this device, so the app remembers you next time.
        Ask your admin if you don’t have a link.
      </p>
    </div>
  );
}
