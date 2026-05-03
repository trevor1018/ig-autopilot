import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` is the path the site is served from on the production host.
// GitHub Pages serves us at https://trevor1018.github.io/ig-autopilot/
// → all built asset URLs need that prefix.
//
// In dev (`npm run dev`) we want plain `/` so http://localhost:5173/ works
// without the subpath nonsense.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/ig-autopilot/" : "/",
  plugins: [react()],
  server: { port: 5173 },
}));
