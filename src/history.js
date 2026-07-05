"use strict";
// Historique des modifications de dossier (profil personnel / profil recherché).
// Permet à l'administrateur de voir ce qui a changé, quand, sans avoir à deviner.
const { withDb, uid } = require("./db");

const FIELD_LABELS = {
  dateNaissance: "Date de naissance", taille: "Taille", poids: "Poids", langues: "Langues parlées",
  ville: "Ville", pays: "Pays", origine: "Origine", communaute: "Communauté", minhag: "Minhag",
  profession: "Profession", etudes: "Études", yeshiva: "Yéchiva / séminaire", ravReference: "Rav de référence",
  situationFamiliale: "Situation familiale", enfants: "Enfants", etatSante: "État de santé",
  demenagement: "Volonté de déménager", personnalite: "Personnalité", qualites: "Qualités", defauts: "Défauts",
  centresInteret: "Centres d'intérêt", objectifsVie: "Objectifs de vie", aspirationsSpirituelles: "Aspirations spirituelles",
  questionOuverte1: "Question ouverte 1", questionOuverte2: "Question ouverte 2", courantAutre: "Courant (précision)",
  courantsReligieux: "Courant(s) religieux",
  ageMin: "Âge minimum souhaité", ageMax: "Âge maximum souhaité", tailleMin: "Taille minimum souhaitée",
  tailleMax: "Taille maximum souhaitée", traitsRecherches: "Traits recherchés",
  criteresIndispensables: "Critères indispensables", criteresSecondaires: "Critères secondaires",
  criteresRedhibitoires: "Critères rédhibitoires",
};

function fieldLabel(f) {
  return FIELD_LABELS[f] || f;
}

function normalizeForCompare(v) {
  if (Array.isArray(v)) return v.slice().sort().join(", ");
  if (v == null) return "";
  return String(v).trim();
}

// Compare `before`/`after` sur la liste de champs donnée et enregistre un
// événement d'historique s'il y a au moins une différence.
function recordChanges(userId, section, before, after, fields) {
  const changes = [];
  for (const f of fields) {
    const oldStr = normalizeForCompare(before ? before[f] : undefined);
    const newStr = normalizeForCompare(after ? after[f] : undefined);
    if (oldStr !== newStr) {
      changes.push({ field: f, oldValue: oldStr, newValue: newStr });
    }
  }
  if (!changes.length) return;
  withDb((db) => {
    if (!Array.isArray(db.profileHistory)) db.profileHistory = [];
    db.profileHistory.push({
      id: uid("hist"),
      userId,
      section,
      changes,
      changedAt: new Date().toISOString(),
    });
    const forUser = db.profileHistory.filter((h) => h.userId === userId);
    if (forUser.length > 200) {
      const toDrop = new Set(forUser.slice(0, forUser.length - 200).map((h) => h.id));
      db.profileHistory = db.profileHistory.filter((h) => !toDrop.has(h.id));
    }
  });
}

function historyForUser(db, userId, limit = 30) {
  return (db.profileHistory || [])
    .filter((h) => h.userId === userId)
    .slice()
    .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
    .slice(0, limit);
}

module.exports = { recordChanges, historyForUser, normalizeForCompare, fieldLabel };
