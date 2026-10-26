import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("combina clases simples", () => {
    expect(cn("p-4", "text-body")).toBe("p-4 text-body");
  });

  it("descarta valores falsy", () => {
    expect(cn("p-4", false, undefined, null, "text-body")).toBe("p-4 text-body");
  });

  it("resuelve conflictos dejando la última clase", () => {
    expect(cn("p-4", "p-6")).toBe("p-6");
    expect(cn("bg-surface", "bg-surface-2")).toBe("bg-surface-2");
  });

  it("resuelve conflictos entre variantes del mismo grupo", () => {
    expect(cn("rounded-sm", "rounded-lg")).toBe("rounded-lg");
  });
});
