import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["packages/*/__tests__/**/*.test.ts"],
    exclude: ["**/integration.test.ts", "**/node_modules/**"],
    testTimeout: 30000,
  },
})
