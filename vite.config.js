import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" => chemins relatifs, compatibles GitHub Pages, Netlify, Vercel…
export default defineConfig({
  base: "./",
  plugins: [react()],
});
