# 📈 TSLA Signal — v1.2.0

Eine installierbare **iPhone-Web-App (PWA)**, die technische Analyse- und **Muster-Signale** für die **Tesla-Aktie (TSLA)** berechnet — aus der kompletten Kurshistorie.

![version](https://img.shields.io/badge/version-1.2.0-blue)
![type](https://img.shields.io/badge/type-PWA-16c784)
![license](https://img.shields.io/badge/license-MIT-lightgrey)
![advice](https://img.shields.io/badge/Anlageberatung-nein-ea3943)

> ⚠️ **Keine Anlageberatung.** Reines Analyse- und Lernwerkzeug. Kein Indikator kann Höchst- oder Tiefstpunkte zuverlässig vorhersagen.
> **SpaceX** ist nicht enthalten — es ist nicht börsennotiert und hat keine handelbaren Kursdaten.

---

## Funktionen

| Bereich | Inhalt |
|---|---|
| **Signal** | Ampel-Score −100…+100 aus **7 Faktoren**: RSI, Bollinger %B, Trend vs. SMA200, MACD-Momentum, Golden/Death-Cross, Drawdown vom ATH und **wiederkehrende Muster** — mit transparenter Aufschlüsselung jedes Beitrags. |
| **Muster** 🔁 | **Analog-Matching**: vergleicht die aktuelle Kursform mit der gesamten Historie und mittelt, was danach geschah (Ø-Bewegung + Aufwärts-Wahrscheinlichkeit + Ø-Pfad-Chart). **Bedingte Muster**: was folgte historisch auf RSI<30, Golden Cross, neue 52W-Tiefs, tiefe Drawdowns u. a. — inkl. Trefferquote und „jetzt aktiv"-Markierung. |
| **Charts** | Kurs + SMA 50/200 + Bollinger-Bänder, RSI, MACD (offline gezeichnet). |
| **Fibonacci** | Retracements + Extensions aus dem Swing des gewählten Zeitraums — als Linien im Chart, mit nächstem Kursziel ↑ und nächster Unterstützung ↓. |
| **Saison** | Ø-Rendite je Kalendermonat über die gesamte Historie. |
| **Earnings** | Kursreaktion am Tag nach jedem Quartalsbericht + Aufwärts-Quote. |
| **Backtest** | Signal-Strategie vs. Buy & Hold (CAGR, Max-Drawdown, Trefferquote). |

---

## Auf dem iPhone installieren & starten

### Schritt 1 — kostenlosen API-Key holen (einmalig)
- **Twelve Data** (empfohlen): [twelvedata.com](https://twelvedata.com) → registrieren → Dashboard → API-Key. Gratis, 800 Abfragen/Tag, **volle Kurshistorie** (bei Tesla die komplette Historie seit dem Börsengang).
- Alternative **Alpha Vantage**: [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key) — liefert im Gratis-Tarif inzwischen nur noch ~100 Tage (volle Historie = Premium), daher für dieses Dashboard **nicht empfohlen**.

### Schritt 2 — App öffnen (HTTPS, direkt über GitHub Pages)
Auf dem iPhone in **Safari** öffnen:

```
https://siegfriedrapp-bot.github.io/tsla-signal/
```

### Schritt 3 — als App auf den Home-Bildschirm
1. In Safari unten das **Teilen-Symbol** ⬆️ tippen.
2. **„Zum Home-Bildschirm"** wählen → **Hinzufügen**.
3. Die App startet ab jetzt im **Vollbild** mit eigenem Icon — wie eine echte App.

### Schritt 4 — Key eintragen & loslegen
App öffnen → Reiter **Setup ⚙︎** → API-Key einfügen → **„Speichern & Laden"**.
Fertig — Signal, Muster, Charts, Backtest werden berechnet.

> Nach dem ersten Laden funktioniert die App auch **offline** (Kursdaten werden lokal zwischengespeichert).

---

## Lokal auf dem PC testen

```bash
node server.js
# → http://localhost:5178
```

## Grenzen / Hinweise
- Die Signale sind **Heuristiken**, kein Orakel. Bei Tesla schlug im Backtest historisch oft Buy & Hold die Strategie — die App zeigt das ehrlich an.
- Backtests sind rückblickend optimistisch (kein Slippage, keine Steuern/Gebühren).
- Nutze die App als *eine* Informationsquelle, niemals als alleinige Entscheidungsgrundlage.

## Dateien
| Datei | Zweck |
|---|---|
| `index.html`, `styles.css`, `app.js` | die App |
| `manifest.webmanifest`, `sw.js`, `icon.svg` | PWA (Home-Screen, Offline, Icon) |
| `server.js` | lokaler Testserver |

## Lizenz
MIT — siehe [LICENSE](LICENSE).
