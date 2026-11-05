# Pinpoint Medical

Online-Shop für Medizinbedarf (bakteriostatisches Wasser, Insulinspritzen, Alkoholtupfer). Statische Seite auf Cloudflare Workers (Static Assets), Daten in Supabase, Zahlung ausschließlich online über SumUp.

## Anpassen
- `CONFIG` oben im `<script>` von `index.html`: Kontakt-E-Mail, Impressum (vor Livegang ausfüllen)
- Produkte, Preise, Bestand: Supabase-Tabelle `pm_produkte` (`bestand` leer = unbegrenzt, `aktiv` = sichtbar)
- Versandkosten / Gratis-ab / Shop pausieren: Tabelle `pm_einstellungen`
- Bestellungen: Tabelle `pm_bestellungen` (Status `offen` → `bezahlt` → `versendet`)

## Zahlung
Edge Function `pm-zahlung` erstellt den SumUp-Checkout (gleiches SumUp-Konto wie AlkExpress) und prüft die Zahlung serverseitig. Preise berechnet die Datenbank, nicht der Browser.
