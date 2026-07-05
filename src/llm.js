"use strict";
// Pont optionnel vers un vrai modèle de langage (Claude / Anthropic API),
// utilisé uniquement pour enrichir la partie narrative de l'Analyse IA
// (résumé, points forts/attention, conseils). Le calcul du score de
// compatibilité reste TOUJOURS déterministe (voir matching.js) : l'IA
// générative n'intervient jamais dans le score lui-même, afin de conserver
// une IA explicable et jamais une "boîte noire".
//
// Activation : définir la variable d'environnement ANTHROPIC_API_KEY sur
// Render (Environment). Sans cette clé, l'application continue de
// fonctionner avec le moteur heuristique local (aucune dépendance externe).
const https = require("https");

function isLlmEnabled() {
  return !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
}

function callClaude({ system, prompt, maxTokens = 700, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reject(new Error("ANTHROPIC_API_KEY manquante"));
    const body = JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    });
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-length": Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Anthropic API ${res.statusCode}: ${data.slice(0, 300)}`));
          }
          try {
            const json = JSON.parse(data);
            const text = (json.content || []).map((b) => b.text || "").join("\n").trim();
            resolve(text);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Délai dépassé (15s)")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Extrait un objet JSON d'une réponse texte, même si le modèle a ajouté
// un peu de texte autour (tolérance raisonnable, sans jamais planter).
function extractJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

module.exports = { isLlmEnabled, callClaude, extractJson };
