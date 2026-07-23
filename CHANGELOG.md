# Changelog

## [1.1.1] — 2026-07-23
### Behoben / Geändert
- **Twelve Data ist jetzt Standard-Anbieter** — liefert gratis die volle Kurshistorie (CORS-fähig).
  Grund: Alpha Vantage hat `outputsize=full` zur Premium-Funktion gemacht, der Gratis-Tarif
  gab nur noch ~100 Tage (zu wenig für SMA200, Saison, Muster, Backtest).
- Alpha Vantage: erkennt die Premium-Sperre, weicht auf `compact` aus und zeigt einen klaren
  Warnhinweis mit Empfehlung, auf Twelve Data zu wechseln.
- Erfolgsmeldung zeigt jetzt die Anzahl geladener Handelstage.

## [1.1.0] — 2026-07-23
### Neu
- **Muster-Erkennung** (Reiter „Muster" 🔁):
  - **Analog-Matching**: vergleicht die aktuelle Kursform (letzte 20 Tage, z-normierte Log-Renditen)
    mit allen Vergangenheitsfenstern und mittelt die Bewegung der 20 Tage danach
    (Ø-Bewegung, Aufwärts-Wahrscheinlichkeit, Ø-Pfad-Chart, Top-Analogien).
  - **Bedingte Muster**: historische Vorwärts-Rendite (20 T) und Trefferquote für
    RSI<30/>70, Bollinger-Durchbrüche, Golden/Death-Cross, Drawdown>30%, neue 52W-Hochs/Tiefs,
    3 rote Tage — inkl. „jetzt aktiv"-Markierung.
- Gesamt-Score nutzt jetzt **7 Faktoren** (Muster-Signal ergänzt).
- Versionsanzeige im Header, versionierter Service-Worker-Cache.

## [1.0.0] — 2026-07-23
- Erste Version: Signal-Ampel (6 Faktoren), Charts (Kurs/SMA/Bollinger, RSI, MACD),
  Saisonalität, Earnings-Reaktion, Backtest, PWA-Installierbarkeit,
  Alpha-Vantage-/Twelve-Data-Anbindung.
