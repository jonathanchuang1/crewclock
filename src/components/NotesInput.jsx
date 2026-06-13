import { useState } from "react";
import { StickyNote, Send } from "lucide-react";
import { Card, Button, Textarea } from "./ui/primitives.jsx";

export function NotesInput({ onAdd, clockedIn }) {
  const [note, setNote] = useState("");

  function submit() {
    const text = note.trim();
    if (!text) return;
    onAdd(text);
    setNote("");
  }

  return (
    <Card className="p-4">
      <div className="mb-2.5 flex items-center gap-2 text-sm font-medium text-muted">
        <StickyNote size={16} />
        Quick note
        <span className="ml-auto text-xs">
          {clockedIn ? "attaches to current job" : "general note"}
        </span>
      </div>
      <Textarea
        rows={2}
        placeholder="What's happening on site?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        className="mt-3"
        variant="surface"
        disabled={!note.trim()}
        onClick={submit}
      >
        <Send size={16} /> Add Note
      </Button>
    </Card>
  );
}
