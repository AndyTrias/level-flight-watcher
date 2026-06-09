# LEVEL Flight Watcher ✈️

Monitorea los precios de **LEVEL** hacia **Barcelona** desde varias rutas de
América y te **avisa por Telegram y Slack** cuando aparece una tarifa barata
(tag `campaign` + por debajo de un umbral por ruta). Corre gratis en **GitHub
Actions** cada ~10 minutos.

> **Expectativa honesta:** los asientos a US$9 son poquísimos y se agotan en
> segundos. Esto **no** garantiza cazar ese asiento exacto: maximiza tus chances
> avisándote rápido de tarifas baratas. Para poder reservar la promo, **suscribite
> al newsletter de LEVEL** con tu mail.

## Cómo funciona

1. `scraper.js` abre flylevel.com con un navegador real (Playwright) para pasar el
   anti-bot Akamai y consulta la API pública del calendario de precios.
2. `evaluator.js` marca como "oferta" los días con tag `campaign` y precio ≤ umbral.
3. `state.js` recuerda lo ya avisado para no spamear (avisa solo lo nuevo o más barato).
4. `notifier.js` manda el aviso a Telegram y Slack con link de reserva.

Configurá rutas y umbrales en [`config.json`](./config.json).

## Probar localmente

```bash
pnpm install
pnpm exec playwright install chromium

# Ver qué ofertas detecta, sin notificar ni guardar estado:
pnpm run dry-run

# Probar que las notificaciones llegan (necesita variables de entorno, ver abajo):
pnpm run test-notify
```

> El scraper corre el navegador **con ventana** (headful) porque el anti-bot de
> LEVEL bloquea el modo headless. En Linux/CI se corre bajo `xvfb` (ya configurado
> en el workflow). En tu compu vas a ver abrirse una ventana de Chromium un momento.

### Variables de entorno (para pruebas locales)

El proyecto lee las credenciales de variables de entorno (sin dotenv). Para
probar localmente, exportalas en la terminal antes de correr:

```bash
export TELEGRAM_BOT_TOKEN="123456:ABC..."
export TELEGRAM_CHAT_ID="11223344"
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/XXX/YYY/ZZZ"
```

| Variable | Para qué |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram |
| `TELEGRAM_CHAT_ID` | Tu chat con el bot |
| `SLACK_WEBHOOK_URL` | Incoming Webhook de Slack |

(Si falta una credencial, ese canal se omite sin romper el otro.)

## Setup de notificaciones

### Telegram
1. Abrí [@BotFather](https://t.me/BotFather) → `/newbot` → seguí los pasos →
   copiá el **token** → `TELEGRAM_BOT_TOKEN`.
2. Mandale cualquier mensaje a tu bot nuevo (para "abrir" el chat).
3. Obtené tu `chat_id`: abrí
   `https://api.telegram.org/bot<TOKEN>/getUpdates` en el navegador y buscá
   `"chat":{"id":...}`. Ese número es `TELEGRAM_CHAT_ID`.
   (Alternativa: hablale a [@userinfobot](https://t.me/userinfobot)).

### Slack
1. Creá un canal, ej. `#vuelos-level`.
2. Creá un **Incoming Webhook**:
   <https://api.slack.com/messaging/webhooks> → "Create your Slack app" →
   activá *Incoming Webhooks* → *Add New Webhook to Workspace* → elegí el canal →
   copiá la URL → `SLACK_WEBHOOK_URL`.
   - Si tu Slack de **trabajo** no permite instalar apps, usá un workspace propio
     (gratis) o quedate solo con Telegram.

## Deploy en GitHub Actions (gratis)

1. Creá un repositorio (recomendado **público**: Actions es gratis e ilimitado en
   repos públicos; el código no tiene secretos).
2. Subí este proyecto.
3. En el repo: **Settings → Secrets and variables → Actions → New repository
   secret** y cargá: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SLACK_WEBHOOK_URL`.
4. **Actions → LEVEL flight watcher → Run workflow** para una corrida manual de
   prueba. Después el cron `*/10 * * * *` corre solo.

El workflow commitea `state.json` cuando cambian las ofertas (y una vez por día),
lo que además mantiene el repo activo para que GitHub no deshabilite el cron por
inactividad.

> El cron de GitHub Actions es *best-effort*: puede retrasarse algunos minutos
> bajo carga. Si necesitás timing más fino, se puede migrar a un worker
> siempre-prendido (Fly.io / VPS / VM Always-Free de Oracle).

## Ajustar qué te avisa

Editá [`config.json`](./config.json):
- `routes`: códigos IATA de origen (destino fijo `BCN`).
- `thresholds`: precio máximo por ruta y tipo (`OW` solo ida, `RT` ida y vuelta), en USD.
- `requireCampaignTag`: `true` exige tag de promo; `false` avisa solo por precio.
- `monthsAhead`: cuántos meses hacia adelante escanear.
