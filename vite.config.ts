/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base + hash routing: works on a project site (/<repo>/) or a custom domain without changes.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: { include: ["src/**/*.test.ts"] },
});
