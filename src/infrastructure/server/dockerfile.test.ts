/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  packageManager: string;
};

function runtimeStage(source: string): string {
  const marker = source.indexOf("FROM base AS runtime");
  expect(marker).toBeGreaterThan(-1);
  return source.slice(marker);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("Dockerfile", () => {
  it("copies everything the runtime server reads, including public assets", () => {
    const runtime = runtimeStage(dockerfile);

    for (const sourceCopied of [
      ["/app/public", "./public"],
      ["/app/node_modules", "./node_modules"],
      ["/app/.next", "./.next"],
      ["/app/src", "./src"],
    ] as const) {
      const [from, to] = sourceCopied;
      const line = new RegExp(
        `^COPY --from=build --chown=node:node ${escapeRegExp(from)} ${escapeRegExp(to)}$`,
        "m",
      );

      expect(runtime).toMatch(line);
    }

    expect(runtime).toMatch(
      /^COPY --from=build --chown=node:node \/app\/server\.ts \/app\/package\.json \/app\/tsconfig\.json \/app\/next\.config\.ts \.\/$/m,
    );
  });

  it("pins the Node and pnpm versions used by the project", () => {
    expect(dockerfile).toContain("FROM node:22-bookworm-slim AS base");
    expect(dockerfile).toContain(`corepack prepare ${packageJson.packageManager} --activate`);
  });

  it("runs the custom TypeScript server as an unprivileged user", () => {
    const runtime = runtimeStage(dockerfile);

    expect(runtime).toContain("USER node");
    expect(runtime).toContain('CMD ["node", "--import", "tsx", "server.ts"]');
  });
});
