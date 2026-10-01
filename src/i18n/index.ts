/* Translation dictionaries, keyed by the Portuguese source string.
   Each area of the app has its own file in ./parts (en + fr side by side).
   Check with: npx tsx --tsconfig tsconfig.json scripts/i18n-check.ts [--suspects] */
import type { Part } from "./types";
import core from "./parts/core";
import registo from "./parts/registo";
import jogo from "./parts/jogo";
import preparacao from "./parts/preparacao";
import epoca from "./parts/epoca";
import treino from "./parts/treino";
import contas from "./parts/contas";
import v011 from "./parts/v011";

// later parts win on duplicate keys; core is last so shared words stay consistent
const PARTS: Part[] = [registo, jogo, preparacao, epoca, treino, contas, v011, core];

export const DICT: { en: Record<string, string>; fr: Record<string, string> } = { en: {}, fr: {} };
for (const p of PARTS) {
  Object.assign(DICT.en, p.en);
  Object.assign(DICT.fr, p.fr);
}
