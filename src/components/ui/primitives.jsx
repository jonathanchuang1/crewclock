import { cn } from "../../lib/cn.js";

/* Button ------------------------------------------------------------------ */
const variants = {
  primary:
    "bg-accent text-white hover:bg-accent-hover active:scale-[0.98] shadow-glow",
  success:
    "bg-success text-black hover:brightness-110 active:scale-[0.98]",
  danger: "bg-danger text-white hover:brightness-110 active:scale-[0.98]",
  surface:
    "bg-surface-2 text-white border border-border hover:bg-surface active:scale-[0.98]",
  ghost: "bg-transparent text-muted hover:text-white hover:bg-surface-2",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}) {
  const sizes = {
    md: "h-12 px-5 text-base rounded-xl",
    lg: "h-16 text-lg rounded-2xl",
    sm: "h-10 px-3 text-sm rounded-lg",
  };
  return (
    <button
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 font-semibold",
        "transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none",
        "select-none touch-manipulation",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

/* Card -------------------------------------------------------------------- */
export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface shadow-card",
        className
      )}
      {...props}
    />
  );
}

/* Badge ------------------------------------------------------------------- */
const badgeTones = {
  success: "bg-success/15 text-success border-success/30",
  muted: "bg-surface-2 text-muted border-border",
  warning: "bg-warning/15 text-warning border-warning/30",
  accent: "bg-accent/15 text-accent border-accent/30",
};
export function Badge({ tone = "muted", className, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        badgeTones[tone],
        className
      )}
      {...props}
    />
  );
}

/* Textarea ---------------------------------------------------------------- */
export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-xl border border-border bg-surface-2 p-3.5",
        "text-white placeholder:text-muted outline-none",
        "focus:border-accent focus:ring-2 focus:ring-accent/30 transition",
        className
      )}
      {...props}
    />
  );
}

/* Native select styled to match (reliable on mobile) --------------------- */
export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select
        className={cn(
          "w-full appearance-none rounded-xl border border-border bg-surface-2 px-4 py-3.5 pr-10",
          "text-white outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 transition",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
