"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// --- petit chargeur de .env (aucune dépendance externe) ---
(function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const l = line.trim();
    if (!l || l.startsWith("#")) return;
    const idx = l.indexOf("=");
    if (idx === -1) return;
    const key = l.slice(0, idx).trim();
    let val = l.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  });
})();

const { load, withDb, uid, UPLOADS_DIR } = require("./src/db");
const {
  getCurrentUser, createSession, destroySession, setSessionCookie, clearSessionCookie, hashPassword,
} = require("./src/auth");

const pub = require("./src/pages/public");
const authPages = require("./src/pages/auth");
const onboarding = require("./src/pages/onboarding");
const dashboard = require("./src/pages/dashboard");
const admin = require("./src/pages/admin");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------- utilitaires HTTP ----------
function sendHtml(res, html, status = 200) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}
function sendJson(res, obj, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}
function notFound(res, user) {
  sendHtml(res, require("./src/render").layout({
    title: "Page introuvable", user, noindex: true,
    body: `<div class="section" style="text-align:center"><h2>Page introuvable</h2><p><a href="/">Retour à l'accueil</a></p></div>`,
  }), 404);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const MAX = 15 * 1024 * 1024; // 15 Mo (pièces d'identité / selfies en base64)
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

// ---------- sécurité : en-têtes + limitation de débit ----------
function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline';"
  );
}

const RATE_LIMIT = new Map(); // ip -> { count, resetAt }
function rateLimited(req, key, max, windowMs) {
  const ip = (req.socket && req.socket.remoteAddress) || "unknown";
  const k = `${key}:${ip}`;
  const now = Date.now();
  const entry = RATE_LIMIT.get(k);
  if (!entry || entry.resetAt < now) {
    RATE_LIMIT.set(k, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  if (entry.count > max) return true;
  return false;
}

function sameOriginOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // navigations directes / clients sans en-tête Origin
  const host = req.headers.host;
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch (_) {
    return false;
  }
}

// ---------- fichiers statiques ----------
const MIME = {
  ".css": "text/css", ".js": "application/javascript", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon",
};
function serveStatic(req, res, pathname) {
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "public, max-age=3600" });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

// ---------- routeur ----------
async function handle(req, res) {
  applySecurityHeaders(res);
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = parsedUrl.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  if (req.method === "GET" && (pathname === "/style.css" || pathname === "/app.js" || pathname === "/favicon.ico")) {
    if (serveStatic(req, res, pathname)) return;
  }

  const auth = getCurrentUser(req);
  const user = auth ? auth.user : null;

  const requireAuth = (roles) => {
    if (!user) return false;
    if (roles && !roles.includes(user.role)) return false;
    return true;
  };

  try {
    // ---------- pages publiques ----------
    if (req.method === "GET" && pathname === "/") return sendHtml(res, pub.landingPage(user));
    if (req.method === "GET" && pathname === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end(pub.robotsTxt());
    }
    if (req.method === "GET" && pathname === "/sitemap.xml") {
      res.writeHead(200, { "Content-Type": "application/xml" });
      return res.end(pub.sitemapXml(`http://${req.headers.host}`));
    }

    // ---------- auth ----------
    if (req.method === "GET" && pathname === "/inscription") {
      if (user) return redirect(res, authPages.redirectForUser(user));
      return sendHtml(res, authPages.inscriptionPage(user));
    }
    if (req.method === "POST" && pathname === "/api/inscription") {
      if (rateLimited(req, "inscription", 8, 10 * 60 * 1000)) return sendJson(res, { ok: false, error: "Trop de tentatives, réessayez plus tard." }, 429);
      if (!sameOriginOk(req)) return sendJson(res, { ok: false, error: "Origine invalide." }, 403);
      const body = await readJsonBody(req);
      const result = authPages.apiInscription(body);
      if (result.error) return sendJson(res, { ok: false, error: result.error }, 400);
      setSessionCookie(res, result.session.id);
      return sendJson(res, { ok: true, redirect: "/onboarding/verification" });
    }
    if (req.method === "GET" && pathname === "/connexion") {
      if (user) return redirect(res, authPages.redirectForUser(user));
      return sendHtml(res, authPages.connexionPage(user));
    }
    if (req.method === "POST" && pathname === "/api/connexion") {
      if (rateLimited(req, "connexion", 12, 10 * 60 * 1000)) return sendJson(res, { ok: false, error: "Trop de tentatives, réessayez plus tard." }, 429);
      if (!sameOriginOk(req)) return sendJson(res, { ok: false, error: "Origine invalide." }, 403);
      const body = await readJsonBody(req);
      const result = authPages.apiConnexion(body);
      if (result.error) return sendJson(res, { ok: false, error: result.error }, 400);
      setSessionCookie(res, result.session.id);
      return sendJson(res, { ok: true, redirect: authPages.redirectForUser(result.user) });
    }
    if (pathname === "/deconnexion") {
      if (auth) destroySession(auth.sessionId);
      clearSessionCookie(res);
      return redirect(res, "/");
    }

    // ---------- onboarding (candidat connecté) ----------
    if (pathname.startsWith("/onboarding") || pathname.startsWith("/api/onboarding")) {
      if (!requireAuth(["candidate"])) return redirect(res, "/connexion");

      if (req.method === "GET" && pathname === "/onboarding/verification") return sendHtml(res, onboarding.verificationPage(user));
      if (req.method === "POST" && pathname === "/api/onboarding/envoyer-code") {
        if (rateLimited(req, "otp-send", 10, 10 * 60 * 1000)) return sendJson(res, { ok: false, error: "Trop de demandes, réessayez plus tard." }, 429);
        const body = await readJsonBody(req);
        return sendJson(res, onboarding.apiEnvoyerCode(user, body));
      }
      if (req.method === "POST" && pathname === "/api/onboarding/verifier-code") {
        if (rateLimited(req, "otp-check", 20, 10 * 60 * 1000)) return sendJson(res, { ok: false, error: "Trop de tentatives, réessayez plus tard." }, 429);
        const body = await readJsonBody(req);
        const result = onboarding.apiVerifierCode(user, body);
        return sendJson(res, result.error ? { ok: false, error: result.error } : { ok: true });
      }

      if (req.method === "GET" && pathname === "/onboarding/documents") {
        if (!user.emailVerified || !user.phoneVerified) return redirect(res, "/onboarding/verification");
        return sendHtml(res, onboarding.documentsPage(user));
      }
      if (req.method === "POST" && pathname === "/api/onboarding/documents") {
        const body = await readJsonBody(req);
        const result = onboarding.apiDocuments(user, body);
        return sendJson(res, result.error ? { ok: false, error: result.error } : { ok: true, redirect: "/onboarding/profil" });
      }

      if (req.method === "GET" && pathname === "/onboarding/profil") {
        const db = load();
        const profile = db.profiles.find((p) => p.userId === user.id);
        return sendHtml(res, onboarding.profilPage(user, profile));
      }
      if (req.method === "POST" && pathname === "/api/onboarding/profil") {
        const body = await readJsonBody(req);
        const result = onboarding.apiProfil(user, body);
        return sendJson(res, result.error ? { ok: false, error: result.error } : { ok: true, redirect: "/onboarding/recherche" });
      }

      if (req.method === "GET" && pathname === "/onboarding/recherche") {
        const db = load();
        const criteria = db.criteria.find((c) => c.userId === user.id);
        return sendHtml(res, onboarding.recherchePage(user, criteria));
      }
      if (req.method === "POST" && pathname === "/api/onboarding/recherche") {
        const body = await readJsonBody(req);
        const result = onboarding.apiRecherche(user, body);
        return sendJson(res, result.error ? { ok: false, error: result.error } : { ok: true, redirect: "/onboarding/termine" });
      }

      if (req.method === "GET" && pathname === "/onboarding/termine") return sendHtml(res, onboarding.terminePage(user));
    }

    // ---------- espace candidat ----------
    if (pathname === "/tableau-de-bord" && req.method === "GET") {
      if (!requireAuth(["candidate"])) return redirect(res, "/connexion");
      return sendHtml(res, dashboard.dashboardPage(user));
    }
    if (pathname.startsWith("/api/propositions/") && pathname.endsWith("/reagir") && req.method === "POST") {
      if (!requireAuth(["candidate"])) return sendJson(res, { ok: false, error: "Non autorisé." }, 401);
      const id = pathname.split("/")[3];
      const body = await readJsonBody(req);
      const result = dashboard.apiReagir(user, id, body);
      return sendJson(res, result.error ? { ok: false, error: result.error } : { ok: true });
    }
    if (pathname.startsWith("/tableau-de-bord/photo/") && req.method === "GET") {
      if (!requireAuth(["candidate"])) return redirect(res, "/connexion");
      const propId = pathname.split("/")[3];
      const db = load();
      const prop = db.propositions.find((p) => p.id === propId && (p.userAId === user.id || p.userBId === user.id));
      if (!prop) return notFound(res, user);
      const isA = prop.userAId === user.id;
      const shared = isA ? prop.photoSharedWithA : prop.photoSharedWithB;
      if (!shared) return sendHtml(res, `<p style="padding:40px;text-align:center">Cette photo n'a pas (encore) été partagée par l'administrateur.</p>`, 403);
      const otherId = isA ? prop.userBId : prop.userAId;
      const photoDoc = [...db.documents].reverse().find((d) => d.userId === otherId && d.type === "photo");
      if (!photoDoc) return sendHtml(res, `<p style="padding:40px;text-align:center">Photo indisponible.</p>`, 404);
      const filePath = path.join(UPLOADS_DIR, photoDoc.filename);
      if (!fs.existsSync(filePath)) return notFound(res, user);
      res.writeHead(200, { "Content-Type": photoDoc.mimeType || "image/jpeg", "Cache-Control": "no-store" });
      return fs.createReadStream(filePath).pipe(res);
    }

    // ---------- administration ----------
    if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
      if (!requireAuth(["admin"])) return pathname.startsWith("/api") ? sendJson(res, { ok: false, error: "Non autorisé." }, 401) : redirect(res, "/connexion");

      if (req.method === "GET" && pathname === "/admin") return sendHtml(res, admin.adminDashboardPage(user));
      if (req.method === "GET" && pathname === "/admin/profils") return sendHtml(res, admin.adminProfilsPage(user, query));
      if (req.method === "GET" && pathname === "/admin/propositions") return sendHtml(res, admin.adminPropositionsPage(user, query));

      if (req.method === "GET" && pathname.startsWith("/admin/profils/")) {
        const id = pathname.split("/")[3];
        const db = load();
        const target = db.users.find((u) => u.id === id && u.role === "candidate");
        if (!target) return notFound(res, user);
        const profile = db.profiles.find((p) => p.userId === id);
        const criteria = db.criteria.find((c) => c.userId === id);
        const documents = db.documents.filter((d) => d.userId === id);
        const notes = [...db.notes.filter((n) => n.userId === id)].reverse();
        const suggestions = admin.buildSuggestions(target, id);
        return sendHtml(res, admin.adminProfilDetailPage(user, target, profile, criteria, documents, notes, suggestions));
      }

      if (req.method === "GET" && pathname.startsWith("/admin/documents/")) {
        const docId = pathname.split("/")[3];
        const db = load();
        const doc = db.documents.find((d) => d.id === docId);
        if (!doc) return notFound(res, user);
        const filePath = path.join(UPLOADS_DIR, doc.filename);
        if (!fs.existsSync(filePath)) return notFound(res, user);
        res.writeHead(200, { "Content-Type": doc.mimeType || "application/octet-stream", "Cache-Control": "no-store" });
        return fs.createReadStream(filePath).pipe(res);
      }

      if (req.method === "POST" && /\/api\/admin\/profils\/[^/]+\/statut$/.test(pathname)) {
        const id = pathname.split("/")[4];
        const body = await readJsonBody(req);
        const result = admin.apiChangerStatut(user, id, body);
        return sendJson(res, result.error ? { ok: false, error: result.error } : { ok: true });
      }
      if (req.method === "POST" && /\/api\/admin\/profils\/[^/]+\/notes$/.test(pathname)) {
        const id = pathname.split("/")[4];
        const body = await readJsonBody(req);
        const result = admin.apiAjouterNote(user, id, body);
        return sendJson(res, result.error ? { ok: false, error: result.error } : { ok: true });
      }
      if (req.method === "POST" && pathname === "/api/admin/propositions") {
        const body = await readJsonBody(req);
        const result = admin.apiCreerProposition(user, body);
        return sendJson(res, result.error ? { ok: false, error: result.error } : { ok: true });
      }
      if (req.method === "POST" && /\/api\/admin\/propositions\/[^/]+\/statut$/.test(pathname)) {
        const id = pathname.split("/")[4];
        const body = await readJsonBody(req);
        const result = admin.apiChangerStatutProposition(user, id, body);
        return sendJson(res, result.error ? { ok: false, error: result.error } : { ok: true });
      }
      if (req.method === "POST" && /\/api\/admin\/propositions\/[^/]+\/photo$/.test(pathname)) {
        const id = pathname.split("/")[4];
        const body = await readJsonBody(req);
        const result = admin.apiPartagerPhoto(user, id, body);
        return sendJson(res, result.error ? { ok: false, error: result.error } : { ok: true });
      }
    }

    return notFound(res, user);
  } catch (err) {
    if (err && err.message === "PAYLOAD_TOO_LARGE") return sendJson(res, { ok: false, error: "Fichier trop volumineux." }, 413);
    if (err && err.message === "INVALID_JSON") return sendJson(res, { ok: false, error: "Requête invalide." }, 400);
    console.error(err);
    return sendJson(res, { ok: false, error: "Erreur interne du serveur." }, 500);
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) sendJson(res, { ok: false, error: "Erreur interne du serveur." }, 500);
  });
});

// Crée (ou promeut) automatiquement le compte administrateur au démarrage,
// à partir de ADMIN_EMAIL / ADMIN_PASSWORD (voir .env.example). Nécessaire
// car les hébergeurs gratuits (Render, etc.) ne permettent pas toujours de
// lancer `npm run seed` séparément après le déploiement.
function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || !password) return;
  withDb((db) => {
    let account = db.users.find((u) => u.email === email);
    if (account) {
      if (account.role !== "admin") {
        account.role = "admin";
        account.status = "valide";
        account.emailVerified = true;
        account.phoneVerified = true;
        account.passwordHash = hashPassword(password);
        console.log(`Compte existant promu administrateur : ${email}`);
      }
    } else {
      db.users.push({
        id: uid("user"),
        role: "admin",
        prenom: "Administrateur",
        nom: "Chidoukhim",
        sexe: "H",
        email,
        telephone: "",
        passwordHash: hashPassword(password),
        status: "valide",
        emailVerified: true,
        phoneVerified: true,
        createdAt: new Date().toISOString(),
      });
      console.log(`Compte administrateur créé automatiquement : ${email}`);
    }
  });
}
ensureAdmin();

server.listen(PORT, () => {
  console.log(`Chidoukhim — serveur démarré sur http://localhost:${PORT}`);
});
