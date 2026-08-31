import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  preview: {
    // Railway serves the app behind a generated *.up.railway.app domain,
    // so we can't know the exact host ahead of time.
    allowedHosts: true,
  },
});
