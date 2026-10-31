/** @vitest-environment node */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

describe("app fonts", () => {
  it("never downloads fonts while building", () => {
    expect(layout).not.toContain("next/font/google");
  });

  it("loads the three project families from files in the repository", () => {
    expect(layout).toContain("next/font/local");

    for (const variable of ["--font-outfit", "--font-inter", "--font-jetbrains-mono"]) {
      expect(layout).toContain(variable);
    }

    for (const file of ["outfit.woff2", "inter.woff2", "jetbrains-mono.woff2"]) {
      expect(existsSync(join(process.cwd(), "src/app/fonts", file))).toBe(true);
    }
  });
});
