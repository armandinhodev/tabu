import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reglas de la casa: el archivo `REGLAS.md` de la raíz es la fuente editable
 * (se toca y se redeploya, sin tocar código). Acá solo se lo lee y se lo
 * parte en título, introducción y lista de reglas.
 */
export interface HouseRules {
  readonly title: string;
  readonly intro: string;
  readonly rules: readonly string[];
}

const FALLBACK: HouseRules = {
  title: "Reglas de la casa",
  intro: "",
  rules: [],
};

/** Convierte el markdown de la casa en las partes que muestra el modal. */
export function parseHouseRules(markdown: string): HouseRules {
  const lines = markdown.split(/\r?\n/);
  const title = lines.find((line) => line.startsWith("# "))?.slice(2).trim();
  const rules = lines
    .filter((line) => line.trimStart().startsWith("- "))
    .map((line) => line.trimStart().slice(2).trim())
    .filter((rule) => rule !== "");
  const intro = lines
    .filter((line) => !line.startsWith("# ") && !line.trimStart().startsWith("- ") && line.trim() !== "")
    .map((line) => line.trim())
    .join(" ");

  return {
    title: title === undefined || title === "" ? FALLBACK.title : title,
    intro,
    rules,
  };
}

/** Lee el archivo de la casa; si no está, la partida sigue igual. */
export function readHouseRules(file = path.join(process.cwd(), "REGLAS.md")): HouseRules {
  try {
    return parseHouseRules(readFileSync(file, "utf8"));
  } catch {
    return FALLBACK;
  }
}
