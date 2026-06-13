import { Cloud, CloudOff, RefreshCw, CheckCheck } from "lucide-react";

/** Tiny connection + pending-sync indicator. */
export function SyncBar({ online, pending, onSync }) {
  if (online && pending === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <CheckCheck size={14} className="text-success" /> Synced
      </div>
    );
  }
  if (!online) {
    return (
      <button
        onClick={onSync}
        className="flex items-center gap-1.5 text-xs text-warning"
      >
        <CloudOff size={14} />
        Offline · {pending} saved on device
      </button>
    );
  }
  return (
    <button
      onClick={onSync}
      className="flex items-center gap-1.5 text-xs text-accent"
    >
      <RefreshCw size={14} className="animate-spin" />
      Syncing {pending}…
    </button>
  );
}
