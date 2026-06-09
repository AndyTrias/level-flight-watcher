/**
 * Decide qué precios son "ofertas" según el modelo de COSTO TOTAL:
 *   total = tarifa LEVEL (origen→BCN) + posicionamiento estimado (EZE→origen)
 * Es oferta si total <= targetTotal (y, si requireCampaignTag, tiene tag 'campaign').
 * Descarta fechas pasadas.
 *
 * @param {Array} prices  salida normalizada de scrape()
 * @param {Object} config
 * @returns {Array} ofertas ordenadas por costo total asc
 */
export function evaluate(prices, config) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { positioning = {}, targetTotal, requireCampaignTag } = config;
  const deals = [];

  for (const p of prices) {
    if (p.date < today) continue;

    const pos = positioning[p.origin] ?? 0;
    const total = p.price + pos;

    if (total > targetTotal) continue;
    if (requireCampaignTag && !p.tags.includes("campaign")) continue;

    deals.push({ ...p, positioning: pos, total });
  }

  deals.sort((a, b) => a.total - b.total);
  return deals;
}

/** Clave estable de una oferta para dedupe en el estado. */
export function dealKey(d) {
  return `${d.origin}-${d.triptype}-${d.date}`;
}
