import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Two entry points:
//   index.html  → employee clock (deployed to the web; each employee opens ?t=TOKEN)
//   admin.html  → admin portal (loaded by the desktop app)
//
// GitHub Pages deploy sets VITE_BASE="/crewclock/"; Netlify/desktop leave "/".
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin.html", import.meta.url)),
      },
    },
  },
});
