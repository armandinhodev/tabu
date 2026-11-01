import type { HouseRules } from "@/infrastructure/content/house-rules";

/** Reglas de la casa para las pruebas: mismo contrato que las de `REGLAS.md`. */
export const TEST_HOUSE_RULES: HouseRules = {
  title: "Reglas de la casa",
  intro: "Acuerdos de la partida para que todos descripten igual.",
  rules: [
    "No digas abreviaturas.",
    "No uses diminutivos ni aumentativos.",
    "No digas la palabra en otro idioma.",
    "No digas con qué letra empieza.",
    "No hagas onomatopeyas.",
  ],
};
