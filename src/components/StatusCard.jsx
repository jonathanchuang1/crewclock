import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Clock } from "lucide-react";
import { Card, Badge } from "./ui/primitives.jsx";

function useElapsed(since) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return "00:00:00";
  const ms = Date.now() - new Date(since).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function StatusCard({ status }) {
  const elapsed = useElapsed(status.clockedIn ? status.since : null);
  const on = status.clockedIn;

  return (
    <Card className="overflow-hidden">
      <div
        className={`px-5 pt-5 pb-4 ${
          on ? "bg-success/[0.06]" : "bg-surface-2/40"
        }`}
      >
        <div className="flex items-center justify-between">
          <Badge tone={on ? "success" : "muted"}>
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                on ? "bg-success animate-pulse" : "bg-muted"
              }`}
            />
            {on ? "Clocked In" : "Clocked Out"}
          </Badge>
          {on && (
            <div className="flex items-center gap-1.5 text-muted">
              <Clock size={15} />
              <motion.span
                key={elapsed}
                className="font-mono text-lg font-semibold tabular-nums text-white"
              >
                {elapsed}
              </motion.span>
            </div>
          )}
        </div>

        {on && status.job ? (
          <div className="mt-4">
            <div className="text-lg font-semibold leading-tight">
              {status.job.job_name}
            </div>
            <div className="mt-1 flex items-start gap-1.5 text-sm text-muted">
              <MapPin size={15} className="mt-0.5 shrink-0" />
              <span>{status.job.job_address}</span>
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-muted">
            You’re off the clock. Pick a job and clock in to start tracking time.
          </div>
        )}
      </div>
    </Card>
  );
}
