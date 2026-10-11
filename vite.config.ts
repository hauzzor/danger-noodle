import { defineConfig } from "vite";

export default defineConfig({
  base: "/danger-noodle/",
  server: { host: true, strictPort: true },
  build: { target: "es2022", sourcemap: true },
});
