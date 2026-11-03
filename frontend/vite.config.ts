import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The release notes live in the repo's CHANGELOG.md. The web image builds from
// frontend/ alone, so the release job copies the file in; a dev build has none
// and shows no "What's new". The repo's file wins over the image-build copy.
const changelog = [path.resolve(__dirname, "../CHANGELOG.md"), path.resolve(__dirname, "CHANGELOG.md")].find(
  existsSync,
);

export default defineConfig({
  define: {
    __ATLAS_VERSION__: JSON.stringify(process.env.ATLAS_VERSION ?? ""),
    __ATLAS_CHANGELOG__: JSON.stringify(changelog ? readFileSync(changelog, "utf8") : ""),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    // `npm run dev` on the host talks to the containerised API.
    proxy: { "/api": "http://127.0.0.1:8187" },
  },
});
