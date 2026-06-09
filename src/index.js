import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { scrape } from "./scraper.js";
import { evaluate } from "./evaluator.js";
import { loadState, saveState, diffDeals, dealsToMap } from "./state.js";
import { notifyDeals, testNotify, notifyHealth } from "./notifier.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONFIG_PATH = join(ROOT, "config.json");
const STATE_PATH = join(ROOT, "state.json");

// Cuántas corridas bloqueadas seguidas antes de avisar "scraper ciego".
const BLOCKED_ALERT_AT = 6;

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has("--dry-run");
const TEST_NOTIFY = argv.has("--test-notify");

async function loadConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

function logDeals(title, deals, currency) {
  console.log(`\n${title} (${deals.length}):`);
  for (const d of deals) {
    console.log(
      `  ${d.origin}->${d.dest} ${d.triptype} ${d.date}  ${currency}$${d.price}` +
        ` (<=${d.threshold})  [${d.tags.join(",")}]`
    );
  }
}

async function main() {
  if (TEST_NOTIFY) {
    console.log("Enviando mensaje de prueba a Telegram y Slack...");
    console.log(JSON.stringify(await testNotify(), null, 2));
    return;
  }

  const config = await loadConfig();
  const state = await loadState(STATE_PATH);
  const today = new Date().toISOString().slice(0, 10);

  console.log(
    `[${new Date().toISOString()}] Escaneando ${config.routes.length} rutas x ` +
      `${config.tripTypes.length} tipos x ${config.monthsAhead} meses...`
  );

  const { blocked, prices, okCombos, totalCombos } = await scrape(config);

  if (blocked) {
    state.blockedStreak = (state.blockedStreak || 0) + 1;
    console.warn(`⚠️  Scraper BLOQUEADO (racha: ${state.blockedStreak}).`);
    if (state.blockedStreak === BLOCKED_ALERT_AT && !DRY_RUN) {
      await notifyHealth(
        `el scraper no pudo leer precios en las últimas ${BLOCKED_ALERT_AT} corridas ` +
          `(posible bloqueo anti-bot). Revisá el workflow.`
      );
    }
    state.lastRunDate = today;
    if (!DRY_RUN) await saveState(STATE_PATH, state);
    return;
  }

  console.log(`Combos OK: ${okCombos}/${totalCombos}. Precios recolectados: ${prices.length}.`);
  state.blockedStreak = 0;

  const deals = evaluate(prices, config);
  const fresh = diffDeals(deals, state.deals);

  if (DRY_RUN) {
    logDeals("Ofertas vigentes bajo umbral", deals, config.currency);
    logDeals("Ofertas NUEVAS/más baratas (se notificarían)", fresh, config.currency);
    console.log("\n[dry-run] No se notifica ni se guarda estado.");
    return;
  }

  if (fresh.length > 0) {
    console.log(`Notificando ${fresh.length} oferta(s) nueva(s)/más barata(s)...`);
    console.log(JSON.stringify(await notifyDeals(fresh, config), null, 2));
  } else {
    console.log("Sin novedades para notificar.");
  }

  // Snapshot de ofertas vigentes para el dedupe de la próxima corrida.
  state.deals = dealsToMap(deals);
  state.lastRunDate = today;
  await saveState(STATE_PATH, state);
  console.log("Estado guardado.");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
