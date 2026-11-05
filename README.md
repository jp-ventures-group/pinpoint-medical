# Pinpoint Medical

Online-Shop für Medizinbedarf (bakteriostatisches Wasser, Insulinspritzen, Alkoholtupfer). Statische Seite auf Cloudflare Workers (Static Assets), Daten in Supabase, Zahlung ausschließlich online über SumUp.

## Anpassen
- `CONFIG` oben im `<script>` von `index.html`: Kontakt-E-Mail, Impressum (vor Livegang ausfüllen)
- Produkte, Preise, Bestand: Supabase-Tabelle `pm_produkte` (`bestand` leer = unbegrenzt, `aktiv` = sichtbar)
- Versandkosten / Gratis-ab / Shop pausieren: Tabelle `pm_einstellungen`
- Bestellungen: Tabelle `pm_bestellungen` (Status `offen` → `bezahlt` → `versendet`)

## Zahlung
Edge Function `pm-zahlung` erstellt den SumUp-Checkout (gleiches SumUp-Konto wie AlkExpress) und prüft die Zahlung serverseitig. Preise berechnet die Datenbank, nicht der Browser.

## Hosting
Cloudflare Workers (Static Assets), Konfiguration in `wrangler.jsonc`. Push auf `main` = Deploy. `.assetsignore` hält README, `supabase/` usw. aus der öffentlichen Seite raus. Schriften liegen selbst gehostet in `fonts/` (keine Verbindung zu Google).

## Automatik (Supabase)
- pg_cron `pm-offene-stornieren`: unbezahlte Bestellungen nach 60 Min. → `storniert`
- Trigger `pm_mail` → Edge Function `pm-mail` (Quelle in `supabase/functions/pm-mail`): Bestellbestätigung bei `bezahlt`, Versandmail mit Sendungsnummer bei `versendet` (Resend, Absender bestellung@pinpointmedical.shop, Secret `RESEND_API_KEY`)

