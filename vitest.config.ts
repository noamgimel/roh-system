import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // הבדיקות רצות מול DB אמיתי — סדרתי כדי למנוע התנגשויות
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
