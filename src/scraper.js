import { chromium } from "playwright";

const HOME = "https://www.flylevel.com/";
const SORRY_HOST = "sorry.flylevel.com";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Próximos N meses como [{month, year}] empezando por el mes actual. */
function nextMonths(n) {
  const out = [];
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1; // 1-12
  for (let i = 0; i < n; i++) {
    out.push({ month: m, year: y });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * Scrapea el calendario de LEVEL para todas las rutas/tipos/meses de la config.
 * Devuelve { blocked: boolean, prices: [{origin,dest,triptype,date,price,tags,minimumPriceGroup}] }.
 */
export async function scrape(config) {
  const { routes, tripTypes, destination, currency, monthsAhead } = config;
  const months = nextMonths(monthsAhead);

  // Combos a consultar (una llamada API = un mes/ruta/tipo).
  const combos = [];
  for (const origin of routes) {
    for (const triptype of tripTypes) {
      for (const { month, year } of months) {
        combos.push({ origin, dest: destination, triptype, month, year });
      }
    }
  }

  // IMPORTANTE: Akamai bloquea todos los modos headless (403). Solo pasa el
  // navegador "con ventana" (headful). En CI/Linux esto se corre bajo xvfb.
  // Se puede forzar headless con PW_HEADLESS=1 (no recomendado, dará bloqueo).
  const browser = await chromium.launch({
    headless: process.env.PW_HEADLESS === "1",
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      userAgent: UA,
      locale: "es-ES",
      viewport: { width: 1366, height: 900 },
      timezoneId: "America/Argentina/Buenos_Aires",
    });
    const page = await context.newPage();

    // Calentar cookies de Akamai. Reintenta 1 vez si cae en la página "sorry".
    let warmed = false;
    for (let attempt = 0; attempt < 2 && !warmed; attempt++) {
      if (attempt > 0) await sleep(4000);
      try {
        await page.goto(HOME, { waitUntil: "domcontentloaded", timeout: 45000 });
      } catch {
        continue;
      }
      if (!page.url().includes(SORRY_HOST)) warmed = true;
    }

    if (!warmed) {
      return { blocked: true, prices: [] };
    }

    // Dar tiempo a que Akamai setee cookies (_abck, bm_sz, etc.).
    await sleep(2500);

    // Hacer todos los fetch desde el contexto de la página (mismo origen).
    const raw = await page.evaluate(
      async ({ combos, currency }) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const results = [];
        for (const c of combos) {
          const url =
            `/nwe/flights/api/calendar/?triptype=${c.triptype}` +
            `&origin=${c.origin}&destination=${c.dest}` +
            `&month=${c.month}&year=${c.year}&currencyCode=${currency}`;
          try {
            const r = await fetch(url, { headers: { Accept: "application/json" } });
            const ct = r.headers.get("content-type") || "";
            if (r.status !== 200 || !ct.includes("application/json")) {
              results.push({ combo: c, ok: false, status: r.status });
            } else {
              const j = await r.json();
              const days = (j && j.data && j.data.dayPrices) || [];
              results.push({ combo: c, ok: true, days });
            }
          } catch (e) {
            results.push({ combo: c, ok: false, error: String(e) });
          }
          // delay con jitter para no gatillar el rate-limiter
          await sleep(120 + Math.floor(Math.random() * 130));
        }
        return results;
      },
      { combos, currency }
    );

    // Normalizar + deduplicar por (origin,triptype,date) quedándose con el menor precio.
    const byKey = new Map();
    let okCount = 0;
    for (const res of raw) {
      if (!res.ok) continue;
      okCount++;
      const { origin, dest, triptype } = res.combo;
      for (const d of res.days) {
        if (typeof d.price !== "number" || !d.date) continue;
        const key = `${origin}-${triptype}-${d.date}`;
        const rec = {
          origin,
          dest,
          triptype,
          date: d.date,
          price: d.price,
          tags: Array.isArray(d.tags) ? d.tags : [],
          minimumPriceGroup: d.minimumPriceGroup,
        };
        const prev = byKey.get(key);
        if (!prev || rec.price < prev.price) byKey.set(key, rec);
      }
    }

    const prices = [...byKey.values()];
    // Si NINGÚN combo respondió OK, lo tratamos como bloqueo (scraper ciego).
    const blocked = okCount === 0;
    return { blocked, prices, okCombos: okCount, totalCombos: combos.length };
  } finally {
    await browser.close();
  }
}
