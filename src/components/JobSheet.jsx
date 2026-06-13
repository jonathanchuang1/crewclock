import { useState } from "react";
import { MapPin } from "lucide-react";
import { Sheet } from "./ui/Sheet.jsx";
import { Button, Textarea } from "./ui/primitives.jsx";

/**
 * Job picker used for both Clock In and Change Job. Big tap targets, optional
 * note. `excludeJobId` hides the current job when changing.
 */
export function JobSheet({
  open,
  onClose,
  title,
  confirmLabel,
  confirmVariant = "primary",
  jobs,
  excludeJobId,
  onConfirm,
}) {
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");

  const list = jobs.filter((j) => j.job_id !== excludeJobId);

  function reset() {
    setSelected(null);
    setNote("");
  }
  function handleClose() {
    reset();
    onClose();
  }
  function handleConfirm() {
    if (!selected) return;
    onConfirm(selected, note.trim());
    reset();
  }

  return (
    <Sheet open={open} onClose={handleClose} title={title}>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          No active jobs available to you. Ask your admin to grant access.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {list.map((job) => {
              const active = selected?.job_id === job.job_id;
              return (
                <button
                  key={job.job_id}
                  onClick={() => setSelected(job)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                    active
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface-2 hover:border-muted"
                  }`}
                >
                  <MapPin
                    size={18}
                    className={`mt-0.5 shrink-0 ${
                      active ? "text-accent" : "text-muted"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">{job.job_name}</span>
                    <span className="block truncate text-sm text-muted">
                      {job.job_address}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <Textarea
            className="mt-4"
            rows={2}
            placeholder="Add a note (optional)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <Button
            className="mt-4"
            size="lg"
            variant={confirmVariant}
            disabled={!selected}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      )}
    </Sheet>
  );
}
