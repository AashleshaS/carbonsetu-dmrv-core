import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), tsconfigPaths(), tanstackStart(), viteReact()],
  server: {
    // Keep port fixed so Google OAuth PKCE verifier in localStorage still matches after redirect
    port: 5173,
    strictPort: true,
  },
});
