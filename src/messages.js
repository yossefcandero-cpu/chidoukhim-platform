"use strict";
// Messagerie interne — un seul canal possible : administrateur <-> membre.
// Il n'existe aucune fonction permettant à deux membres de s'écrire entre eux.
const { load, withDb, uid } = require("./db");
const { clampStr } = require("./validators");
const { createNotification } = require("./notifications");

// Messages rapides pré-rédigés, proposés à l'administrateur depuis une fiche.
const QUICK_MESSAGES = [
  "Merci d'ajouter une photo plus récente.",
  "Merci de compléter votre dossier.",
  "Merci de corriger votre numéro de téléphone.",
  "Votre dossier a été validé.",
  "Votre dossier est en attente d'informations complémentaires.",
];

function threadForUser(userId) {
  const db = load();
  return [...db.messages.filter((m) => m.userId === userId)].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
}

// Envoyé par un administrateur vers un membre (jamais l'inverse entre membres).
function sendFromAdmin(admin, targetUserId, body) {
  const text = clampStr((body.text || "").trim(), 3000);
  if (!text) return { error: "Le message ne peut pas être vide." };
  const db = load();
  const target = db.users.find((u) => u.id === targetUserId && u.role === "candidate");
  if (!target) return { error: "Membre introuvable." };

  const msg = withDb((db2) => {
    const m = {
      id: uid("msg"),
      userId: targetUserId,
      from: "admin",
      authorAdminId: admin.id,
      text,
      readByUser: false,
      createdAt: new Date().toISOString(),
    };
    db2.messages.push(m);
    return m;
  });

  createNotification(targetUserId, {
    type: "message",
    title: "Nouveau message de l'équipe",
    body: text.slice(0, 140),
    link: "/tableau-de-bord/messages",
    toEmail: target.email,
    emailSubject: "Nouveau message concernant votre dossier",
    emailBody: text,
  });

  return { ok: true, message: msg };
}

// Envoyé par le membre en réponse à l'équipe — jamais visible par un autre membre.
function sendFromUser(user, body) {
  const text = clampStr((body.text || "").trim(), 3000);
  if (!text) return { error: "Le message ne peut pas être vide." };
  const msg = withDb((db) => {
    const m = {
      id: uid("msg"),
      userId: user.id,
      from: "user",
      authorAdminId: null,
      text,
      readByUser: true,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(m);
    return m;
  });
  return { ok: true, message: msg };
}

function markThreadRead(userId) {
  withDb((db) => {
    db.messages.forEach((m) => { if (m.userId === userId && m.from === "admin") m.readByUser = true; });
  });
}

function unreadCountForUser(db, userId) {
  return db.messages.filter((m) => m.userId === userId && m.from === "admin" && !m.readByUser).length;
}

module.exports = {
  QUICK_MESSAGES, threadForUser, sendFromAdmin, sendFromUser, markThreadRead, unreadCountForUser,
};
