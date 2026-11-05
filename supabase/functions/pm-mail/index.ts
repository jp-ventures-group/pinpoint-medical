// Pinpoint Medical: Kunden-Mails über Resend
// Wird per Datenbank-Trigger (pg_net) mit { id } aufgerufen. Liest die Bestellung selbst und schickt
// je nach Status die Bestellbestätigung (bezahlt) bzw. Versandmail (versendet) – jede Mail genau einmal.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = Deno.env.get("PM_MAIL_FROM") || "Pinpoint Medical <bestellung@pinpointmedical.shop>";
const REPLY = "info@pinpointmedical.shop";
const SHOP = "https://pinpointmedical.shop";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const eur = (n: unknown) => Number(n || 0).toLocaleString("de-AT", { style: "currency", currency: "EUR" });
const vorname = (n: string) => (n || "").trim().split(/\s+/)[0] || "";
const tracking = (o: any) => `https://www.post.at/s/sendungssuche?snr=${encodeURIComponent(o.sendungsnummer)}`;

const C = { navy: "#1B3358", teal: "#3E8E8E", ink: "#1B2B40", muted: "#5B6878", line: "#E1E5EC", bg: "#F3F5F8", ok: "#1C7C4A" };
const FONT = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function rahmen(vorschau: string, inhalt: string) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Pinpoint Medical</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};color:${C.ink};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(vorschau)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 16px;font-family:Montserrat,${FONT};font-size:18px;font-weight:800;letter-spacing:.3px;color:${C.navy}">PINPOINT <span style="color:${C.teal}">MEDICAL</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${C.line};border-radius:14px;padding:28px 26px">${inhalt}</td></tr>
<tr><td style="padding:18px 6px;font-size:12px;line-height:1.6;color:${C.muted};text-align:center">
Fragen? Einfach auf diese Mail antworten oder an <a href="mailto:${REPLY}" style="color:${C.muted}">${REPLY}</a>.<br>
Pinpoint Medical · Jubal Pfister · Millöckergasse 39, 8010 Graz · <a href="${SHOP}" style="color:${C.muted}">pinpointmedical.shop</a></td></tr>
</table></td></tr></table></body></html>`;
}

function positionen(o: any) {
  const zeilen = (o.positionen || []).map((p: any) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:14px;line-height:1.4">${p.menge}× ${esc(p.name)}${p.variante ? `<br><span style="color:${C.muted};font-size:12px">${esc(p.variante)}</span>` : ""}</td>
<td align="right" style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:14px;white-space:nowrap">${eur(Number(p.preis) * Number(p.menge))}</td></tr>`).join("");
  const summe = (l: string, v: string, fett = false) => `<tr><td style="padding:6px 0 0;font-size:${fett ? 15 : 13}px;${fett ? "font-weight:700" : `color:${C.muted}`}">${l}</td><td align="right" style="padding:6px 0 0;font-size:${fett ? 15 : 13}px;${fett ? "font-weight:700" : `color:${C.muted}`}">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px">${zeilen}
${summe("Zwischensumme", eur(o.zwischensumme))}${summe("Versand", Number(o.versand) ? eur(o.versand) : "gratis")}${summe("Gesamt (bezahlt)", eur(o.gesamt), true)}</table>`;
}

const adresse = (o: any) => `<div style="margin-top:18px;padding:14px 16px;background:${C.bg};border-radius:10px;font-size:13px;line-height:1.55">
<div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${C.muted};margin-bottom:4px">Lieferadresse</div>
${esc(o.name)}<br>${esc(o.strasse)}<br>${esc(o.plz)} ${esc(o.ort)}, ${o.land === "DE" ? "Deutschland" : "Österreich"}</div>`;

const knopf = (href: string, text: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr><td style="background:${C.navy};border-radius:10px">
<a href="${href}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${text}</a></td></tr></table>`;

const badge = (farbe: string, text: string) => `<span style="display:inline-block;padding:4px 10px;border-radius:99px;background:${farbe}1A;color:${farbe};font-size:12px;font-weight:700">${text}</span>`;

function bestaetigung(o: any) {
  const n = vorname(o.name);
  const html = rahmen(`Danke für deine Bestellung #${o.code} – wir packen sie für dich.`, `
${badge(C.ok, "✓ Zahlung erhalten")}
<h1 style="margin:14px 0 8px;font-size:22px;line-height:1.3;color:${C.navy}">Danke${n ? `, ${esc(n)}` : ""}!</h1>
<p style="margin:0;font-size:15px;line-height:1.6">Deine Bestellung <b>#${esc(o.code)}</b> ist bezahlt und eingegangen. Wir verpacken sie diskret und schicken sie an Werktagen innerhalb von 24 Stunden ab. Sobald das Paket unterwegs ist, bekommst du eine Mail mit der Sendungsnummer.</p>
${positionen(o)}${adresse(o)}
${o.notiz ? `<p style="margin:14px 0 0;font-size:13px;color:${C.muted}">Deine Anmerkung: ${esc(o.notiz)}</p>` : ""}`);
  const text = `Danke${n ? `, ${n}` : ""}! Deine Bestellung #${o.code} ist bezahlt und eingegangen.\n\n` +
    (o.positionen || []).map((p: any) => `${p.menge}× ${p.name}${p.variante ? ` (${p.variante})` : ""} – ${eur(Number(p.preis) * Number(p.menge))}`).join("\n") +
    `\nVersand: ${Number(o.versand) ? eur(o.versand) : "gratis"}\nGesamt: ${eur(o.gesamt)}\n\nLieferadresse: ${o.name}, ${o.strasse}, ${o.plz} ${o.ort}\n\nSobald das Paket unterwegs ist, bekommst du die Sendungsnummer per Mail.\n\nPinpoint Medical · ${REPLY}`;
  return { subject: `Bestellbestätigung #${o.code} – Pinpoint Medical`, html, text };
}

function versand(o: any) {
  const n = vorname(o.name);
  const sn = o.sendungsnummer ? String(o.sendungsnummer) : "";
  const html = rahmen(`Deine Bestellung #${o.code} ist unterwegs${sn ? ` – Sendungsnummer ${sn}` : ""}.`, `
${badge(C.teal, "📦 Versendet")}
<h1 style="margin:14px 0 8px;font-size:22px;line-height:1.3;color:${C.navy}">Dein Paket ist unterwegs${n ? `, ${esc(n)}` : ""}!</h1>
<p style="margin:0;font-size:15px;line-height:1.6">Bestellung <b>#${esc(o.code)}</b> wurde heute verschickt.${o.land === "DE" ? " Nach Deutschland dauert die Zustellung meist 3–5 Werktage." : " Innerhalb Österreichs kommt sie meist in 1–3 Werktagen an."}</p>
${sn ? `<div style="margin-top:18px;padding:14px 16px;border:1px dashed ${C.teal};border-radius:10px">
<div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${C.muted}">Sendungsnummer</div>
<div style="margin-top:4px;font-size:17px;font-weight:700;letter-spacing:.5px;font-family:Menlo,Consolas,monospace">${esc(sn)}</div></div>
${knopf(tracking(o), "Sendung verfolgen")}` : ""}
${positionen(o)}${adresse(o)}`);
  const text = `Dein Paket ist unterwegs${n ? `, ${n}` : ""}! Bestellung #${o.code} wurde verschickt.\n` +
    (sn ? `\nSendungsnummer: ${sn}\nVerfolgen: ${tracking(o)}\n` : "") + `\nLieferadresse: ${o.name}, ${o.strasse}, ${o.plz} ${o.ort}\n\nPinpoint Medical · ${REPLY}`;
  return { subject: `Deine Bestellung #${o.code} ist unterwegs${sn ? ` (${sn})` : ""}`, html, text };
}

async function senden(o: any, art: "bestaetigung" | "versand") {
  const m = art === "bestaetigung" ? bestaetigung(o) : versand(o);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "Idempotency-Key": `pm-${art}-${o.id}` },
    body: JSON.stringify({ from: FROM, to: [o.email], reply_to: REPLY, subject: m.subject, html: m.html, text: m.text, tags: [{ name: "art", value: art }] }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST erwartet" }, 405);
  if (!KEY) return json({ error: "RESEND_API_KEY fehlt" }, 503);
  let body: any = {}; try { body = await req.json(); } catch { /* leer */ }
  const { data: o } = await db.from("pm_bestellungen").select("*").eq("id", String(body.id || "")).maybeSingle();
  if (!o || !o.email) return json({ error: "nicht gefunden" }, 404);
  const gesendet: string[] = [];
  try {
    // Bestellbestätigung: sobald bezahlt (auch wenn direkt versendet wurde)
    if (o.bezahlt && !o.mail_bestaetigung_am) {
      const { data } = await db.from("pm_bestellungen").update({ mail_bestaetigung_am: new Date().toISOString() }).eq("id", o.id).is("mail_bestaetigung_am", null).select("id");
      if (data?.length) {
        try { await senden(o, "bestaetigung"); gesendet.push("bestaetigung"); }
        catch (e) { await db.from("pm_bestellungen").update({ mail_bestaetigung_am: null }).eq("id", o.id); throw e; }
      }
    }
    if (o.status === "versendet" && !o.mail_versand_am) {
      const { data } = await db.from("pm_bestellungen").update({ mail_versand_am: new Date().toISOString() }).eq("id", o.id).is("mail_versand_am", null).select("id");
      if (data?.length) {
        try { await senden(o, "versand"); gesendet.push("versand"); }
        catch (e) { await db.from("pm_bestellungen").update({ mail_versand_am: null }).eq("id", o.id); throw e; }
      }
    }
    return json({ ok: true, gesendet });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 502);
  }
});
