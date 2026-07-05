"use strict";
// Suivi de fréquentation minimal, respectueux de la vie privée :
// - Pas d'IP stockée en clair, pas de service tiers, pas de cookie de pub.
// - Un identifiant anonyme (tm_vid) permet de compter les visiteurs uniques
//   par jour ; aucune autre donnée n'est associée à cet identifiant.
const crypto = require("crypto");
const { withDb } = require("./db");

const VISITOR_COOKIE = "tm_vid";
const VISITOR_TTL_S = 60 * 60 * 24 * 365; // 1 an
const RETENTION_DAYS = 120; // on ne garde que les 120 derniers jours détaillés

const BOT_RE = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|curl|wget|python-requests|monitor/i;

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function dateKeyMinus(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return todayKey(d);
}

function shouldTrack(req, pathname) {
  if (req.method !== "GET") return false;
  if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return false;
  if (pathname === "/style.css" || pathname === "/app.js" || pathname === "/favicon.ico") return false;
  if (pathname.startsWith("/uploads") || pathname.startsWith("/tableau-de-bord/photo")) return false;
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return false;
  const ua = req.headers["user-agent"] || "";
  if (BOT_RE.test(ua)) return false;
  return true;
}

function parseCookieValue(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

// Ajoute un Set-Cookie sans écraser un éventuel autre Set-Cookie déjà posé
// sur la même réponse (ex. cookie de session lors d'une connexion).
function appendSetCookie(res, cookieStr) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieStr);
  } else if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookieStr]);
  } else {
    res.setHeader("Set-Cookie", [existing, cookieStr]);
  }
}

function pruneOldDays(stats) {
  const cutoff = dateKeyMinus(RETENTION_DAYS);
  for (const key of Object.keys(stats.days)) {
    if (key < cutoff) delete stats.days[key];
  }
}

// À appeler tôt dans le traitement de chaque requête (pages publiques/candidat
// uniquement — jamais sur l'espace admin ni les appels API).
function trackVisit(req, res, pathname) {
  try {
    if (!shouldTrack(req, pathname)) return;
    let vid = parseCookieValue(req, VISITOR_COOKIE);
    let isNewVisitor = false;
    if (!vid) {
      vid = crypto.randomBytes(12).toString("hex");
      isNewVisitor = true;
      appendSetCookie(res, `${VISITOR_COOKIE}=${vid}; Path=/; Max-Age=${VISITOR_TTL_S}; SameSite=Lax`);
    }
    withDb((db) => {
      if (!db.visitStats || typeof db.visitStats !== "object" || Array.isArray(db.visitStats)) {
        db.visitStats = { lifetimeUniqueVisitors: 0, days: {} };
      }
      if (!db.visitStats.days) db.visitStats.days = {};
      if (typeof db.visitStats.lifetimeUniqueVisitors !== "number") db.visitStats.lifetimeUniqueVisitors = 0;

      const key = todayKey();
      if (!db.visitStats.days[key]) db.visitStats.days[key] = { views: 0, uniqueIds: [] };
      const day = db.visitStats.days[key];
      day.views += 1;
      if (!day.uniqueIds.includes(vid)) day.uniqueIds.push(vid);
      if (isNewVisitor) db.visitStats.lifetimeUniqueVisitors += 1;

      pruneOldDays(db.visitStats);
    });
  } catch (_) {
    // Le suivi de fréquentation ne doit jamais faire échouer une requête.
  }
}

function sumRange(stats, days) {
  let views = 0;
  const uniques = new Set();
  for (let i = 0; i < days; i++) {
    const key = dateKeyMinus(i);
    const d = stats.days[key];
    if (!d) continue;
    views += d.views;
    for (const id of d.uniqueIds) uniques.add(id);
  }
  return { views, unique: uniques.size };
}

function getVisitStats(db) {
  const stats = (db.visitStats && typeof db.visitStats === "object" && !Array.isArray(db.visitStats))
    ? db.visitStats
    : { lifetimeUniqueVisitors: 0, days: {} };
  const days = stats.days || {};

  const today = days[todayKey()] || { views: 0, uniqueIds: [] };
  const last7 = sumRange(stats, 7);
  const last30 = sumRange(stats, 30);

  let totalViews = 0;
  for (const key of Object.keys(days)) totalViews += days[key].views;

  const series = [];
  for (let i = 13; i >= 0; i--) {
    const key = dateKeyMinus(i);
    const d = days[key];
    series.push({ date: key, views: d ? d.views : 0 });
  }

  return {
    todayViews: today.views,
    todayUnique: today.uniqueIds.length,
    last7Views: last7.views,
    last7Unique: last7.unique,
    last30Views: last30.views,
    last30Unique: last30.unique,
    totalViews,
    lifetimeUniqueVisitors: stats.lifetimeUniqueVisitors || 0,
    series,
  };
}

module.exports = { trackVisit, getVisitStats, VISITOR_COOKIE };
