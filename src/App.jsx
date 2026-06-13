import { ToastProvider } from "./components/ui/Toast.jsx";
import { Employee } from "./pages/Employee.jsx";
import { DEMO_MODE } from "./config.js";

function getToken() {
  const params = new URLSearchParams(window.location.search);
  // Support /employee.html?t=TOKEN and #t=TOKEN
  const fromQuery = params.get("t") || params.get("token");
  if (fromQuery) return fromQuery.trim();
  const hash = window.location.hash.replace(/^#/, "");
  const hashParams = new URLSearchParams(hash);
  const fromHash = hashParams.get("t") || hashParams.get("token");
  if (fromHash) return fromHash.trim();
  // In demo mode, auto-use the demo token so the app is explorable instantly.
  return DEMO_MODE ? "demo" : "";
}

export default function App() {
  const token = getToken();
  return (
    <ToastProvider>
      <Employee token={token} />
    </ToastProvider>
  );
}
