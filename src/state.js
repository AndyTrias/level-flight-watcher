import { readFile, writeFile } from "node:fs/promises";
import { dealKey } from "./evaluator.js";

const EMPTY = { deals: {}, lastRunDate: null, blockedStreak: 0 };

/** Carga state.json; si no existe o está corrupto, devuelve estado vacío. */
export async function loadState(path) {
  try {
    const txt = await readFile(path, "utf8");
    const s = JSON.parse(txt);
    return {
      deals: s.deals || {},
      lastRunDate: s.lastRunDate || null,
      blockedStreak: s.blockedStreak || 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveState(path, state) {
  await writeFile(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/**
 * Compara las ofertas actuales contra las ya avisadas.
 * Devuelve las que son NUEVAS o que BAJARON de precio respecto al estado previo.
 */
export function diffDeals(currentDeals, prevDealsMap) {
  const fresh = [];
  for (const d of currentDeals) {
    const key = dealKey(d);
    const prevPrice = prevDealsMap[key];
    if (prevPrice === undefined || d.price < prevPrice) {
      fresh.push(d);
    }
  }
  return fresh;
}

/** Construye el mapa { key: price } a partir de las ofertas vigentes. */
export function dealsToMap(deals) {
  const map = {};
  for (const d of deals) map[dealKey(d)] = d.price;
  return map;
}
