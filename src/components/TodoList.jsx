import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Circle, Lock, Flag } from "lucide-react";
import { Card, Badge, Button, Textarea } from "./ui/primitives.jsx";
import { Sheet } from "./ui/Sheet.jsx";

const priorityTone = { high: "warning", medium: "accent", low: "muted" };

function TodoRow({ todo, done, onComplete }) {
  const isDone = !!done[todo.todo_id];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 border-b border-border/60 py-3 last:border-0"
    >
      <button
        disabled={!todo.can_complete || isDone}
        onClick={() => onComplete(todo)}
        className="mt-0.5 shrink-0 disabled:opacity-100"
        aria-label="Complete to-do"
      >
        {isDone ? (
          <CheckCircle2 size={22} className="text-success" />
        ) : todo.can_complete ? (
          <Circle size={22} className="text-muted hover:text-accent" />
        ) : (
          <Lock size={20} className="text-muted/60" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={`font-medium leading-snug ${
            isDone ? "text-muted line-through" : ""
          }`}
        >
          {todo.title}
        </div>
        {todo.description && (
          <div className="mt-0.5 text-sm text-muted">{todo.description}</div>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <Badge tone={priorityTone[todo.priority] || "muted"}>
            <Flag size={11} /> {todo.priority}
          </Badge>
          {todo.due_date && (
            <span className="text-xs text-muted">due {todo.due_date}</span>
          )}
          {!todo.can_complete && (
            <span className="text-xs text-muted">admin-verified</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function TodoList({ title, icon: Icon, todos, done, onComplete }) {
  const [target, setTarget] = useState(null);
  const [note, setNote] = useState("");

  const visible = todos.filter((t) => !done[t.todo_id]);

  function confirm() {
    onComplete(target, note.trim());
    setTarget(null);
    setNote("");
  }

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
        {Icon && <Icon size={16} />}
        {title}
        <span className="ml-auto text-xs">{visible.length} open</span>
      </div>
      {todos.length === 0 ? (
        <p className="py-3 text-sm text-muted">Nothing here right now. 🎉</p>
      ) : (
        <AnimatePresence initial={false}>
          {todos.map((t) => (
            <TodoRow
              key={t.todo_id}
              todo={t}
              done={done}
              onComplete={(todo) => setTarget(todo)}
            />
          ))}
        </AnimatePresence>
      )}

      <Sheet
        open={!!target}
        onClose={() => setTarget(null)}
        title="Complete to-do"
      >
        <p className="mb-3 font-medium">{target?.title}</p>
        <Textarea
          rows={3}
          placeholder="Completion note (optional)…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button className="mt-4" size="lg" variant="success" onClick={confirm}>
          <CheckCircle2 size={18} /> Mark Done
        </Button>
      </Sheet>
    </Card>
  );
}
