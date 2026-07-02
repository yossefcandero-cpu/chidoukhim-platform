"use strict";
// Couche de notification. Sans clé API configurée, les notifications sont
// simplement journalisées (console + data/notifications.log) afin que la
// démo reste utilisable sans fournisseur externe. En production, brancher :
//  - EMAIL_PROVIDER_API_KEY  -> Resend / Postmark / SendGrid…
//  - SMS_PROVIDER_API_KEY    -> Twilio / Vonage…
//  - WHATSAPP_API_TOKEN      -> WhatsApp Business Cloud API (Meta)
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./db");

const LOG_FILE = path.join(DATA_DIR, "notifications.log");

function send(channel, to, subject, body) {
  const line = `[${new Date().toISOString()}] (${channel}) -> ${to} | ${subject} | ${body}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (_) { /* dossier data pas encore créé au tout premier appel */ }
  console.log(line.trim());
  return true;
}

const notify = {
  email: (to, subject, body) => send("email", to, subject, body),
  sms: (to, subject, body) => send("sms", to, subject, body),
  whatsapp: (to, subject, body) => send("whatsapp", to, subject, body),
};

module.exports = { notify };
