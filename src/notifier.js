const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const TG_LIMIT = 3800; // margen bajo el límite de 4096 de Telegram

function tripLabel(triptype) {
  return triptype === "RT" ? "ida y vuelta" : "solo ida";
}

function bookingLink(d, config) {
  return (config.routePages && config.routePages[d.origin]) || "https://www.flylevel.com/";
}

/** Una línea por oferta, en Markdown (sirve para Telegram y Slack mrkdwn). */
function dealLine(d, config) {
  const name = (config.routeNames && config.routeNames[d.origin]) || d.origin;
  const cur = config.currency || "USD";
  const link = bookingLink(d, config);
  const datePart = d.triptype === "RT" ? `salida ${d.date}` : d.date;
  return `✈️ *${name} → Barcelona* · ${tripLabel(d.triptype)} · ${datePart} · *${cur}$${d.price}* (≤${d.threshold}) → [reservar](${link})`;
}

// Máximo de ofertas a listar en un aviso (las más baratas primero). El resto se
// resume para no mandar mensajes gigantes (igual quedan registradas en el estado).
const MAX_LINES = 25;

export function formatDeals(deals, config) {
  const header =
    deals.length === 1
      ? "🔥 *1 tarifa LEVEL bajo tu umbral*"
      : `🔥 *${deals.length} tarifas LEVEL bajo tu umbral*`;
  const shown = deals.slice(0, MAX_LINES);
  const lines = shown.map((d) => dealLine(d, config));
  if (deals.length > MAX_LINES) {
    lines.push(`… y *${deals.length - MAX_LINES}* ofertas más bajo umbral.`);
  }
  return [header, "", ...lines].join("\n");
}

/** Parte un texto largo en varios mensajes respetando saltos de línea. */
function chunk(text, limit = TG_LIMIT) {
  if (text.length <= limit) return [text];
  const parts = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if ((cur + "\n" + line).length > limit) {
      if (cur) parts.push(cur);
      cur = line;
    } else {
      cur = cur ? cur + "\n" + line : line;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    return { channel: "telegram", skipped: "faltan TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID" };
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  for (const part of chunk(text)) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: part,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { channel: "telegram", ok: false, status: res.status, body };
    }
  }
  return { channel: "telegram", ok: true };
}

async function sendSlack(text) {
  if (!SLACK_WEBHOOK_URL) {
    return { channel: "slack", skipped: "falta SLACK_WEBHOOK_URL" };
  }
  // Slack mrkdwn usa <url|texto> y *negrita*; convertimos los links Markdown.
  const slackText = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: slackText }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { channel: "slack", ok: false, status: res.status, body };
  }
  return { channel: "slack", ok: true };
}

/** Manda un texto a ambos canales; un fallo no bloquea al otro. */
export async function sendAll(text) {
  const results = await Promise.allSettled([sendTelegram(text), sendSlack(text)]);
  return results.map((r) => (r.status === "fulfilled" ? r.value : { ok: false, error: String(r.reason) }));
}

export async function notifyDeals(deals, config) {
  return sendAll(formatDeals(deals, config));
}

export async function testNotify() {
  return sendAll(
    "✅ *LEVEL Flight Watcher* — mensaje de prueba.\nSi ves esto, las notificaciones funcionan. ✈️"
  );
}

export async function notifyHealth(message) {
  return sendAll(`⚠️ *LEVEL Flight Watcher* — ${message}`);
}
