/**
 * Decide qué precios son "ofertas" según la config.
 * Regla: (price <= umbral[origin][triptype]) Y (si requireCampaignTag, tag 'campaign').
 * Descarta fechas pasadas.
 *
 * @param {Array} prices  salida normalizada de scrape()
 * @param {Object} config
 * @returns {Array} ofertas ordenadas por precio asc
 */
export function evaluate(prices, config) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { thresholds, requireCampaignTag } = config;
  const deals = [];

  for (const p of prices) {
    if (p.date < today) continue;

    const t = thresholds[p.origin];
    if (!t || typeof t[p.triptype] !== "number") continue;
    const limit = t[p.triptype];

    if (p.price > limit) continue;
    if (requireCampaignTag && !p.tags.includes("campaign")) continue;

    deals.push({ ...p, threshold: limit });
  }

  deals.sort((a, b) => a.price - b.price);
  return deals;
}

/** Clave estable de una oferta para dedupe en el estado. */
export function dealKey(d) {
  return `${d.origin}-${d.triptype}-${d.date}`;
}
