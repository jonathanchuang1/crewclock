import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// If deploying to GitHub Pages under a repo subpath (https://user.github.io/repo/),
// the deploy workflow sets VITE_BASE to "/repo/". For Netlify / Cloudflare Pages /
// custom domain, leave "/".
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
