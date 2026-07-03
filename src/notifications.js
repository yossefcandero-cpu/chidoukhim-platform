"use strict";
// Centre de notifications — chaque membre dispose d'une icône de notification.
// Toute action de l'administrateur qui le concerne (message, changement de statut,
// demande d'information) génère une notification consultable, et si possible un
// e-mail (voir notify.js).
const { withDb, uid } = require("./db");
const { notify } = require("./notify");

function createNotification(userId, { type, title, body, link, emailSubject, emailBody, toEmail }) {
  const notif = withDb((db) => {
    const n = {
      id: uid("notif"),
      userId,
      type: type || "info",
      title,
      body: body || "",
      link: link || "/tableau-de-bord",
      read: false,
      createdAt: new Date().toISOString(),
    };
    db.notifications.push(n);
    return n;
  });
  if (toEmail) {
    notify.email(toEmail, emailSubject || title, emailBody || body || title);
  }
  return notif;
}

function unreadCount(db, userId) {
  return db.notifications.filter((n) => n.userId === userId && !n.read).length;
}

function recentForUser(db, userId, limit = 8) {
  return [...db.notifications]
    .filter((n) => n.userId === userId)
    .reverse()
    .slice(0, limit);
}

function markRead(userId, notifId) {
  return withDb((db) => {
    const n = db.notifications.find((x) => x.id === notifId && x.userId === userId);
    if (!n) return null;
    n.read = true;
    return n;
  });
}

function markAllRead(userId) {
  withDb((db) => {
    db.notifications.forEach((n) => { if (n.userId === userId) n.read = true; });
  });
}

module.exports = { createNotification, unreadCount, recentForUser, markRead, markAllRead };
