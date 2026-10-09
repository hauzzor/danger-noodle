import { defineConfig } from "vite";

export default defineConfig({
  base: "/danger-noodle/",
  server: { host: true },
  build: { target: "es2022", sourcemap: true },
});
