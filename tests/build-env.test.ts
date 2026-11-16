import { afterAll, expect, it, vi } from "vitest";
import { build } from "vite";
afterAll(() => vi.unstubAllEnvs());
it("production build embeds the Supabase URL and publishable key", async () => {
  const url = "https://build-regression.supabase.co";
  const key = "sb_publishable_build_regression_only";
  vi.stubEnv("VITE_SUPABASE_URL", url);
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", key);
  const result = await build({
    configFile: false,
    envDir: false,
    mode: "production",
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: { entry: "src/api.ts", formats: ["es"] },
      rollupOptions: { external: ["@supabase/supabase-js"] },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const code = outputs.flatMap(r => "output" in r ? r.output : []).filter(c => c.type === "chunk").map(c => c.code).join("\n");
  expect(code).toContain(url);
  expect(code).toContain(key);
});
