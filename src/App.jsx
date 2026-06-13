import { ToastProvider } from "./components/ui/Toast.jsx";
import { Employee } from "./pages/Employee.jsx";
import { TokenGate } from "./components/TokenGate.jsx";
import { DEMO_MODE } from "./config.js";

function getToken() {
  const params = new URLSearchParams(window.location.search);
  // Support /employee.html?t=TOKEN and #t=TOKEN
  const fromQuery = params.get("t") || params.get("token");
  if (fromQuery) {
    const t = fromQuery.trim();
    try {
      localStorage.setItem("crewclock:token", t);
    } catch {}
    return t;
  }
  const hash = window.location.hash.replace(/^#/, "");
  const hashParams = new URLSearchParams(hash);
  const fromHash = hashParams.get("t") || hashParams.get("token");
  if (fromHash) return fromHash.trim();
  // Remembered token (set last time on this device — used by the desktop app).
  try {
    const stored = localStorage.getItem("crewclock:token");
    if (stored) return stored.trim();
  } catch {}
  // In demo mode, auto-use the demo token so the app is explorable instantly.
  return DEMO_MODE ? "demo" : "";
}

export default function App() {
  const token = getToken();
  return (
    <ToastProvider>
      {token ? <Employee token={token} /> : <TokenGate />}
    </ToastProvider>
  );
}
