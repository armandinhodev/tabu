import { describe, expect, it } from "vitest";

import { parseHouseRules, readHouseRules } from "./house-rules";

describe("reglas de la casa", () => {
  it("parte el markdown en título, introducción y reglas", () => {
    const parsed = parseHouseRules(
      "# Reglas de la casa\n\nAcuerdos de la partida.\n\n- Primera regla.\n- Segunda regla.\n",
    );

    expect(parsed.title).toBe("Reglas de la casa");
    expect(parsed.intro).toBe("Acuerdos de la partida.");
    expect(parsed.rules).toEqual(["Primera regla.", "Segunda regla."]);
  });

  it("el archivo de la raíz trae las cinco reglas de la casa", () => {
    const rules = readHouseRules();

    expect(rules.title).toBe("Reglas de la casa");
    expect(rules.rules).toHaveLength(5);
    expect(rules.rules.join(" ")).toContain("abreviaturas");
    expect(rules.rules.join(" ")).toContain("onomatopeyas");
  });

  it("un archivo inexistente no rompe la partida", () => {
    expect(readHouseRules("no-existe.md").rules).toEqual([]);
  });
});
