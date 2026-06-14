import React from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { AdminApp } from "./AdminApp.jsx";

class ErrorBoundary extends React.Component {
  constructor(p) {
    super(p);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    // also surface to the inline boot-error pre, if present
    const out = document.getElementById("boot-error");
    if (out)
      out.textContent +=
        "RENDER ERROR: " + (err && err.stack ? err.stack : err) + "\n";
  }
  render() {
    if (this.state.err) {
      return (
        <pre
          style={{
            color: "#ff8888",
            background: "#0a0b0e",
            padding: 16,
            font: "12px ui-monospace, monospace",
            whiteSpace: "pre-wrap",
            minHeight: "100vh",
            margin: 0,
          }}
        >
          {"RENDER ERROR:\n" +
            (this.state.err && this.state.err.stack
              ? this.state.err.stack
              : String(this.state.err))}
        </pre>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <AdminApp />
  </ErrorBoundary>
);
