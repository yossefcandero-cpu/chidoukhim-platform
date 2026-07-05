"use strict";
// Relances automatiques des dossiers incomplets ou non vérifiés depuis
// plusieurs jours. Espacées dans le temps (pas de spam), déclenchées soit
// automatiquement (tâche périodique dans server.js), soit manuellement par
// l'administrateur depuis le tableau de bord.
const { load } = require("./db");
const { createNotification } = require("./notifications");
const { logAudit } = require("./auth");

const STALE_AFTER_DAYS = 3; // ancienneté minimale du dossier avant une première relance
const REMINDER_COOLDOWN_DAYS = 7; // délai minimal entre deux relances pour un même membre
const REMINDER_TYPE = "relance_dossier";

function daysAgo(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function reasonFor(user, db) {
  if (!user.emailVerified || !user.phoneVerified) {
    return "Votre inscription n'est pas terminée : merci de vérifier votre e-mail et votre téléphone.";
  }
  const hasProfile = db.profiles.some((p) => p.userId === user.id && p.personnalite);
  if (!hasProfile) {
    return "Il ne vous reste qu'à compléter votre dossier personnel pour que nous puissions étudier votre profil.";
  }
  const hasCriteria = db.criteria.some((c) => c.userId === user.id);
  if (!hasCriteria) {
    return "Une dernière étape : indiquez le profil que vous recherchez pour finaliser votre inscription.";
  }
  return "Votre dossier est toujours à l'étude — n'hésitez pas à le compléter si des informations manquent.";
}

function needsReminder(user, db) {
  if (user.role !== "candidate") return false;
  if (["valide", "refuse", "suspendu"].includes(user.status)) return false;
  if (daysAgo(user.createdAt) < STALE_AFTER_DAYS) return false;
  const lastReminder = [...db.notifications]
    .filter((n) => n.userId === user.id && n.type === REMINDER_TYPE)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (lastReminder && daysAgo(lastReminder.createdAt) < REMINDER_COOLDOWN_DAYS) return false;
  return true;
}

// Exécute une passe de relance sur l'ensemble des dossiers candidats.
// Retourne la liste des membres relancés (pour affichage/audit).
function runReminderSweep(adminId) {
  const db = load();
  const candidats = db.users.filter((u) => u.role === "candidate");
  const reminded = [];
  for (const u of candidats) {
    if (!needsReminder(u, db)) continue;
    const body = reasonFor(u, db);
    createNotification(u.id, {
      type: REMINDER_TYPE,
      title: "Votre dossier a besoin d'un complément",
      body,
      link: !u.emailVerified || !u.phoneVerified ? "/onboarding/verification" : "/tableau-de-bord",
      emailSubject: "Tipat Mazal — votre dossier vous attend",
      emailBody: `${body}\n\nConnectez-vous pour continuer : ${process.env.APP_URL || ""}`,
      toEmail: u.email,
    });
    reminded.push({ id: u.id, prenom: u.prenom, email: u.email });
  }
  if (reminded.length && adminId) {
    logAudit(adminId, "Relance automatique de dossiers incomplets", null, `${reminded.length} membre(s) relancé(s)`);
  } else if (reminded.length) {
    logAudit("system", "Relance automatique de dossiers incomplets", null, `${reminded.length} membre(s) relancé(s)`);
  }
  return reminded;
}

module.exports = { runReminderSweep, needsReminder, STALE_AFTER_DAYS, REMINDER_COOLDOWN_DAYS };
