"use strict";
// Analyse IA par profil — moteur heuristique et explicable (aucune IA générative
// externe n'est branchée ; ce module ne remplace jamais le Shadkhan, il l'outille).
// Chaque conclusion est directement traçable aux données du dossier, pour rester
// auditable par l'administrateur.
const { age, tokenize, streamLabelList, streamCodes } = require("./matching");
const { load } = require("./db");
const { rankCandidates } = require("./matching");
const { isLlmEnabled, callClaude, extractJson } = require("./llm");

const POSITIVE_HINTS = [
  ["calme", "Semble apprécier la sérénité et l'équilibre"],
  ["souriant", "Tempérament chaleureux et ouvert"],
  ["genereux", "Sens du don et de l'attention à l'autre"],
  ["patient", "Capacité d'écoute et de patience"],
  ["ambitieux", "Motivation et sens du projet"],
  ["famille", "Attachement fort aux valeurs familiales"],
  ["humour", "Sens de l'humour affirmé"],
  ["ecoute", "Qualité d'écoute mise en avant"],
  ["drole", "Sens de l'humour affirmé"],
  ["altruiste", "Tourné(e) vers les autres"],
  ["organise", "Sens de l'organisation"],
  ["spirituel", "Vie spirituelle affirmée"],
];

const ATTENTION_HINTS = [
  ["impatient", "Peut se montrer impatient(e) — à mentionner avec tact"],
  ["timide", "Réservé(e) dans les premiers échanges"],
  ["reserve", "Réservé(e) dans les premiers échanges"],
  ["stress", "Sensibilité au stress à prendre en compte"],
  ["deuil", "Situation personnelle délicate mentionnée — vérifier avant toute proposition"],
  ["maladie", "État de santé à examiner attentivement avant proposition"],
  ["divorce", "Situation familiale à aborder avec délicatesse"],
];

function extractHints(text, dictionary) {
  const toks = new Set(tokenize(text || ""));
  const found = [];
  dictionary.forEach(([key, label]) => {
    if ([...toks].some((t) => t.includes(key))) found.push(label);
  });
  return [...new Set(found)];
}

function completionScore(profile, criteria) {
  const fields = [
    "dateNaissance", "taille", "langues", "ville", "pays", "profession", "personnalite",
    "qualites", "centresInteret", "objectifsVie", "aspirationsSpirituelles",
  ];
  const filled = fields.filter((f) => profile && profile[f] && String(profile[f]).trim()).length;
  const critFilled = criteria && criteria.criteresIndispensables ? 1 : 0;
  return Math.round(((filled / fields.length) * 0.85 + critFilled * 0.15) * 100);
}

function personalitySummary(profile) {
  if (!profile || !profile.personnalite) {
    return "Dossier encore incomplet sur le plan de la personnalité — les champs libres (personnalité, qualités, aspirations) ne sont pas encore renseignés.";
  }
  const a = age(profile.dateNaissance);
  const streams = streamLabelList(streamCodes(profile));
  const parts = [];
  parts.push(`${profile.prenom || "Ce profil"}${a ? `, ${a} ans,` : ""} se présente comme : « ${String(profile.personnalite).slice(0, 220)}${profile.personnalite.length > 220 ? "…" : ""} »`);
  if (streams.length) parts.push(`Courant religieux déclaré : ${streams.join(", ")}.`);
  if (profile.objectifsVie) parts.push(`Objectifs de vie exprimés : ${String(profile.objectifsVie).slice(0, 160)}${profile.objectifsVie.length > 160 ? "…" : ""}`);
  return parts.join(" ");
}

function buildHeuristicAnalysis(targetUserId) {
  const db = load();
  const target = db.users.find((u) => u.id === targetUserId);
  const profile = db.profiles.find((p) => p.userId === targetUserId);
  const criteria = db.criteria.find((c) => c.userId === targetUserId);

  if (!target) return null;

  const strengths = profile ? [
    ...extractHints(profile.personnalite, POSITIVE_HINTS),
    ...extractHints(profile.qualites, POSITIVE_HINTS),
  ] : [];
  const attention = profile ? [
    ...extractHints(profile.defauts, ATTENTION_HINTS),
    ...extractHints(profile.etatSante, ATTENTION_HINTS),
    ...extractHints(profile.personnalite, ATTENTION_HINTS),
  ] : [];

  if (profile && !profile.personnalite) attention.push("Le champ « personnalité » n'est pas rempli — recommandé de recontacter le membre.");
  if (!criteria || !criteria.criteresIndispensables) attention.push("Aucun critère indispensable renseigné — la recherche de compatibilité sera moins précise.");
  if (profile && profile.courantsReligieux && profile.courantsReligieux.length > 3) {
    attention.push("Plusieurs courants religieux cochés à la fois — un appel de clarification peut être utile.");
  }

  const completion = completionScore(profile, criteria);

  let suggestions = [];
  if (profile) {
    const pool = db.users
      .filter((u) => u.role === "candidate" && u.status === "valide" && u.id !== targetUserId && u.sexe !== target.sexe)
      .map((u) => ({
        profile: { ...(db.profiles.find((p) => p.userId === u.id) || {}), userId: u.id, prenom: u.prenom },
        criteria: db.criteria.find((c) => c.userId === u.id) || {},
      }))
      .filter((x) => x.profile && x.profile.dateNaissance);
    suggestions = rankCandidates({ ...profile, userId: targetUserId }, criteria || {}, pool, 5);
  }

  const advice = [];
  if (completion < 50) advice.push("Dossier peu détaillé : recommandé de recontacter le membre avant toute mise en compatibilité sérieuse.");
  if (suggestions.length === 0) advice.push("Aucune compatibilité de sexe opposé validée n'est disponible pour l'instant dans la base.");
  if (suggestions.length && suggestions[0].score >= 75) advice.push(`Compatibilité forte identifiée avec ${suggestions[0].profile.prenom} (${suggestions[0].score}%) — à examiner en priorité.`);
  if (target.status === "en_attente_validation") advice.push("Ce dossier est prêt à être validé si les documents d'identité sont conformes.");
  if (!advice.length) advice.push("Aucune alerte particulière : dossier globalement complet et exploitable pour le matching.");

  return {
    completion,
    summary: personalitySummary(profile),
    strengths: strengths.length ? strengths : ["Pas assez d'éléments textuels pour dégager des points forts automatiquement — à explorer lors d'un entretien."],
    attention,
    suggestions,
    advice,
    llmEnhanced: false,
    profile,
  };
}

// Prépare un prompt strictement borné aux données réellement présentes dans
// le dossier — aucune invention, jamais de photo ni de donnée d'identité
// (nom/prénom/coordonnées) envoyée au modèle, uniquement le contenu textuel
// du dossier utile à une analyse de personnalité.
function buildLlmPrompt(profile, heuristic) {
  const fields = [
    ["Personnalité", profile.personnalite],
    ["Qualités", profile.qualites],
    ["Défauts", profile.defauts],
    ["Centres d'intérêt", profile.centresInteret],
    ["Objectifs de vie", profile.objectifsVie],
    ["Aspirations spirituelles", profile.aspirationsSpirituelles],
    ["Parcours (question ouverte 1)", profile.questionOuverte1],
    ["Attentes du mariage (question ouverte 2)", profile.questionOuverte2],
  ].filter(([, v]) => v && String(v).trim());

  if (!fields.length) return null;

  const dossier = fields.map(([label, v]) => `${label} : ${v}`).join(String.fromCharCode(10));

  return `Tu assistes un Shadkhan (marieur/marieuse) au sein d'une plateforme de rencontres matrimoniales sérieuse (Tipat Mazal), respectueuse des valeurs religieuses juives. Tu n'es jamais montré aux membres : tes conclusions n'aident QUE l'administrateur humain, qui garde toujours la décision finale.

Voici les réponses textuelles d'un dossier candidat (aucune donnée d'identité ne t'est communiquée) :
${dossier}

Analyse uniquement ce texte, sans rien inventer ni supposer au-delà de ce qui est écrit. Réponds UNIQUEMENT avec un objet JSON valide (rien autour), avec exactement ces clés :
{
  "summary": "résumé de personnalité en 2-3 phrases, en français, ton neutre et bienveillant",
  "strengths": ["point fort 1", "point fort 2", "..."],
  "attention": ["point de vigilance 1 (ton factuel, jamais jugeant)", "..."],
  "advice": ["conseil concret pour le Shadkhan 1", "..."]
}
Limite chaque tableau à 4 éléments maximum. N'invente aucun fait non présent dans le texte fourni.`;
}

async function buildProfileAnalysis(targetUserId) {
  const heuristic = buildHeuristicAnalysis(targetUserId);
  if (!heuristic) return null;
  if (!heuristic.profile || !isLlmEnabled()) {
    delete heuristic.profile;
    return heuristic;
  }

  try {
    const prompt = buildLlmPrompt(heuristic.profile, heuristic);
    if (!prompt) {
      delete heuristic.profile;
      return heuristic;
    }
    const text = await callClaude({
      system: "Tu réponds strictement en JSON valide, sans aucun texte avant ou après. Tu ne remplaces jamais la décision humaine du Shadkhan, tu l'assistes seulement.",
      prompt,
      maxTokens: 700,
    });
    const parsed = extractJson(text);
    delete heuristic.profile;
    if (!parsed || typeof parsed !== "object") return heuristic;

    return {
      ...heuristic,
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : heuristic.summary,
      strengths: Array.isArray(parsed.strengths) && parsed.strengths.length ? parsed.strengths.slice(0, 4) : heuristic.strengths,
      attention: Array.isArray(parsed.attention) && parsed.attention.length ? parsed.attention.slice(0, 4) : heuristic.attention,
      advice: Array.isArray(parsed.advice) && parsed.advice.length ? parsed.advice.slice(0, 4) : heuristic.advice,
      llmEnhanced: true,
    };
  } catch (err) {
    // Ne casse jamais la page : repli silencieux sur l'analyse heuristique.
    delete heuristic.profile;
    heuristic.llmError = String((err && err.message) || err).slice(0, 160);
    return heuristic;
  }
}

module.exports = { buildProfileAnalysis };
