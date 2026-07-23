# TSLA Signal — Anleitung

Eine mobile Web-App (PWA), die technische Analyse-Signale für **Tesla (TSLA)** berechnet.
**Kein SpaceX** — SpaceX ist nicht börsennotiert, dafür gibt es keine handelbaren Kursdaten.
**Keine Anlageberatung.** Reines Analyse-/Lernwerkzeug.

## 1. Kostenlosen API-Key holen (einmalig)
- **Alpha Vantage** (empfohlen): https://www.alphavantage.co/support/#api-key → E-Mail eingeben → Key wird sofort angezeigt. Gratis, 25 Abfragen/Tag (die App speichert lokal zwischen, das reicht locker).
- Alternative **Twelve Data**: https://twelvedata.com → registrieren → Dashboard → API-Key. Gratis, 800 Abfragen/Tag.

## 2. Auf dem PC testen
Der Testserver läuft evtl. schon. Sonst im Ordner `tesla`:
```
node server.js
```
Dann im Browser: http://localhost:5178 → Reiter **Setup (⚙︎)** → Key einfügen → **Speichern & Laden**.

## 3. Aufs iPhone bringen — drei Wege

### A) Schnell im gleichen WLAN (PC muss an sein)
1. PC-IP herausfinden: `ipconfig` → IPv4-Adresse (z. B. 192.168.0.42).
2. Auf dem iPhone in Safari: `http://192.168.0.42:5178`
3. Teilen ⬆️ → **Zum Home-Bildschirm**.
   (Hinweis: Ohne HTTPS läuft die App, aber der Offline-Modus/Service-Worker ist inaktiv.)

### B) Dauerhaft & offline-fähig (empfohlen) — kostenlos hosten
Damit die App wie eine echte App läuft (HTTPS, Offline, App-Icon), lade den Ordner auf einen
kostenlosen Static-Host:
- **Netlify Drop**: https://app.netlify.com/drop → den `tesla`-Ordner reinziehen → fertige HTTPS-URL.
- oder **Cloudflare Pages** / **GitHub Pages**.
Danach die URL auf dem iPhone in Safari öffnen → **Zum Home-Bildschirm**.

## Was die App zeigt
- **Signal**: Ampel-Score (−100…+100) aus 6 Bausteinen (RSI, Bollinger %B, Trend vs. SMA200,
  MACD-Momentum, Golden/Death-Cross, Drawdown vom Allzeithoch) + transparente Aufschlüsselung.
- **Charts**: Kurs mit SMA 50/200 & Bollinger-Bändern, RSI, MACD.
- **Saison**: durchschnittliche Rendite je Kalendermonat über die gesamte Historie.
- **Earnings**: Kursreaktion am Tag nach den Quartalszahlen (nur Alpha Vantage).
- **Backtest**: einfache Signal-Strategie vs. Buy & Hold (CAGR, Max-Drawdown, Trefferquote).

## Wichtig / Grenzen
- Kein Modell kann Tops/Bottoms zuverlässig vorhersagen. Die Signale sind **Heuristiken**.
- Backtests sind rückblickend optimistisch (kein Slippage, keine Steuern/Gebühren).
- Nutze die App als *eine* Informationsquelle, nicht als alleinige Entscheidungsgrundlage.

## Dateien
- `index.html`, `styles.css`, `app.js` — die App
- `manifest.webmanifest`, `sw.js`, `icon.svg` — PWA (Home-Screen, Offline, Icon)
- `server.js` — lokaler Testserver (nur zum Ausprobieren auf dem PC)
