# Changelog

## [1.2.0] — 2026-07-23
### Neu
- **Fibonacci-Zonen** im Charts-Reiter:
  - Automatischer Swing aus Hoch/Tief des gewählten Zeitraums (6M/1J/3J/Max).
  - Retracements (23,6 / 38,2 / 50 / 61,8 / 78,6 %) + Extensions (127,2 / 161,8 %) als Ziele.
  - Als gestrichelte Linien direkt im Kurschart eingezeichnet.
  - Karte mit **nächstem Ziel ↑** und **nächster Unterstützung ↓** relativ zum aktuellen Kurs,
    plus vollständige Level-Tabelle mit Preis und Abstand.

## [1.1.2] — 2026-07-23
### Behoben
- **Earnings funktioniert jetzt auch mit Twelve Data** (Endpoint `/earnings`, gratis) — kein
  zweiter API-Key mehr nötig. Alpha Vantage bleibt weiter unterstützt.
- Kursreaktion wird jetzt korrekt als Bewegung am **1. Handelstag nach dem Bericht** berechnet
  (Tesla berichtet nach Börsenschluss), statt am Berichtstag selbst.
- Earnings-Tabelle zeigt zusätzlich die **EPS-Überraschung** je Quartal.

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
