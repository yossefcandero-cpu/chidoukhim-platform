"use strict";
const crypto = require("crypto");
const { load, save, withDb, uid } = require("./db");

const SESSION_COOKIE = "chidoukh_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 jours

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function genCode(digits = 6) {
  const max = 10 ** digits;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(digits, "0");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function createSession(userId) {
  return withDb((db) => {
    const session = {
      id: uid("sess"),
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };
    db.sessions.push(session);
    return session;
  });
}

function destroySession(sessionId) {
  withDb((db) => {
    db.sessions = db.sessions.filter((s) => s.id !== sessionId);
  });
}

function setSessionCookie(res, sessionId) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${sessionId}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  );
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return null;
  const db = load();
  const session = db.sessions.find((s) => s.id === sid);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) return null;
  return { user, sessionId: sid };
}

function logAudit(adminId, action, targetId, details) {
  withDb((db) => {
    db.auditLogs.push({
      id: uid("log"),
      adminId,
      action,
      targetId: targetId || null,
      details: details || "",
      createdAt: new Date().toISOString(),
    });
  });
}

module.exports = {
  hashPassword,
  verifyPassword,
  genCode,
  parseCookies,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  getCurrentUser,
  logAudit,
  SESSION_COOKIE,
};
