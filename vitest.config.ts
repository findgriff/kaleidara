import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Tests must never inherit developer credentials from a local shell or .env file.
    env: {
      HF_API_KEY_ID: "",
      HF_API_KEY_SECRET: "",
    },
  },
});
