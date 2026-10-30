/**
 * Límites reales de los datos de un mazo administrable (S13).
 *
 * Son valores puros: los usan por igual la capa de aplicación, la frontera
 * HTTP y el panel, así que el editor y el servidor cuentan con la misma
 * medida. El formulario de creación conserva su validación histórica
 * (100/500) para no cambiar los mensajes ya publicados.
 */

/** Longitud máxima del nombre de un mazo administrable. */
export const MAX_DECK_NAME_LENGTH = 80;

/** Longitud máxima de la temática de un mazo administrable. */
export const MAX_DECK_THEME_LENGTH = 200;

/** Maximum length of optional forbidden-word generation instructions. */
export const MAX_DECK_RULES_LENGTH = 500;

/** Maximum length of an objective or forbidden term entered manually. */
export const MAX_CARD_TEXT_LENGTH = 200;
