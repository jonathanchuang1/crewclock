import { twMerge } from "tailwind-merge";

/** Join class names and let later Tailwind utilities win (e.g. w-auto over w-full). */
export function cn(...parts) {
  return twMerge(parts.filter(Boolean).join(" "));
}
