"use strict";
// Petit moteur de gabarit HTML (pas de dépendance externe).
const { load } = require("./db");
const { unreadCount: notifUnread, recentForUser } = require("./notifications");
const { unreadCountForUser: msgUnread } = require("./messages");

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

const ADMIN_NAV = [
  { key: "admin", href: "/admin", label: "Tableau de bord", icon: "◧" },
  { key: "profils", href: "/admin/profils", label: "Profils", icon: "◎" },
  { key: "propositions", href: "/admin/propositions", label: "Compatibilités", icon: "✦" },
  { key: "messages", href: "/admin/messages", label: "Messagerie", icon: "✉" },
];

const BRAND_ICON = `<svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M24 6 L26.2 15.8 L36 18 L26.2 20.2 L24 30 L21.8 20.2 L12 18 L21.8 15.8 Z" fill="url(#tm-star)"/>
  <path d="M24 42c-7-4.6-13-9.7-13-16.4C11 20.6 14.7 17 19.3 17c2.3 0 4.4 1.1 5.7 2.9C26.3 18.1 28.4 17 30.7 17 35.3 17 39 20.6 39 25.6 39 32.3 31 37.4 24 42Z" fill="url(#tm-heart)"/>
  <defs>
    <linearGradient id="tm-star" x1="12" y1="6" x2="36" y2="30" gradientUnits="userSpaceOnUse">
      <stop stop-color="#E9C767"/><stop offset="1" stop-color="#B8912F"/>
    </linearGradient>
    <linearGradient id="tm-heart" x1="11" y1="17" x2="39" y2="42" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0D5B46"/><stop offset="1" stop-color="#123F32"/>
    </linearGradient>
  </defs>
</svg>`;

const FAVICON = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#0F1B2E"/><path d="M24 8 L26 16 L34 18 L26 20 L24 28 L22 20 L14 18 L22 16 Z" fill="#D4AF37"/><path d="M24 40c-6-4-11-8.4-11-14 0-4.2 3.1-7.3 7-7.3 2 0 3.8 1 4.9 2.5 1.1-1.5 2.9-2.5 4.9-2.5 3.9 0 7 3.1 7 7.3 0 5.6-5 10-11 14Z" fill="#0D5B46"/></svg>`
);

function headFragment(title, description, noindex) {
  return `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Tipat Mazal</title>
<meta name="description" content="${esc(description || "Tipat Mazal — l'intelligence artificielle au service du Shadkhan. Une plateforme discrète de chidoukhim, entièrement pilotée par un accompagnement humain.")}" />
${noindex ? '<meta name="robots" content="noindex, nofollow" />' : ""}
<link rel="icon" href="${FAVICON}" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700;800&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css" />`;
}

function notifBellFragment(user) {
  if (!user || user.role !== "candidate") return "";
  const db = load();
  const count = notifUnread(db, user.id);
  const recent = recentForUser(db, user.id, 6);
  const items = recent.map((n) => `
    <a href="/api/notifications/${n.id}/ouvrir" class="notif-item ${n.read ? "" : "unread"}">
      <div class="notif-item-title">${esc(n.title)}</div>
      ${n.body ? `<div class="notif-item-body">${esc(n.body)}</div>` : ""}
      <div class="notif-item-time">${esc(timeAgo(n.createdAt))}</div>
    </a>`).join("") || `<div class="notif-empty">Aucune notification pour le moment.</div>`;

  return `
  <div class="notif-bell-wrap">
    <button type="button" class="notif-bell" id="notif-bell-btn" aria-label="Notifications">
      <span class="ic">🔔</span>
      ${count > 0 ? `<span class="notif-count">${count > 9 ? "9+" : count}</span>` : ""}
    </button>
    <div class="notif-dropdown" id="notif-dropdown">
      <div class="notif-dropdown-head">Notifications</div>
      <div class="notif-list">${items}</div>
      <a href="/tableau-de-bord/messages" class="notif-dropdown-foot">Voir la messagerie →</a>
    </div>
  </div>`;
}

function publicShell({ title, description, body, user, active, noindex }) {
  let nav;
  if (user && user.role === "admin") {
    nav = `<a href="/admin">Administration</a><a href="/deconnexion">Déconnexion</a>`;
  } else if (user) {
    const db = load();
    const mCount = msgUnread(db, user.id);
    nav = `
        <a href="/tableau-de-bord" class="${active === "dashboard" ? "nav-active" : ""}">Mon espace</a>
        <a href="/tableau-de-bord/messages" class="${active === "messages" ? "nav-active" : ""}" style="position:relative">Messages${mCount ? `<span class="badge-count" style="position:absolute;top:-8px;right:-16px;background:var(--danger);color:#fff">${mCount}</span>` : ""}</a>
        ${notifBellFragment(user)}
        <a href="/deconnexion">Déconnexion</a>`;
  } else {
    nav = `
        <a href="/connexion">Connexion</a>
        <a href="/inscription" class="nav-cta">Créer un dossier</a>`;
  }

  return `<!doctype html>
<html lang="fr">
<head>
${headFragment(title, description, noindex)}
</head>
<body>
<header class="site-header">
  <a href="/" class="brand">
    ${BRAND_ICON}
    <span class="brand-name">Tipat Mazal</span>
  </a>
  <nav class="site-nav">${nav}</nav>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <p>Tipat Mazal — l'intelligence artificielle au service du Shadkhan. Aucune photo ni aucun profil n'est jamais public.</p>
</footer>
<script src="/app.js"></script>
</body>
</html>`;
}

function adminShell({ title, description, body, user, active, noindex }) {
  const navLinks = ADMIN_NAV.map(
    (item) => `<a href="${item.href}" class="${active === item.key ? "nav-active" : ""}"><span class="ic">${item.icon}</span>${esc(item.label)}</a>`
  ).join("");

  const pageTitle = ADMIN_NAV.find((n) => n.key === active)?.label || "Administration";

  return `<!doctype html>
<html lang="fr">
<head>
${headFragment(title, description, noindex)}
</head>
<body>
<div class="app-shell">
  <aside class="app-sidebar">
    <a href="/admin" class="brand">
      ${BRAND_ICON}
      <span class="brand-name">Tipat Mazal</span>
    </a>
    <nav class="app-nav">
      <div class="nav-section-label">Pilotage</div>
      ${navLinks}
    </nav>
    <div class="app-sidebar-foot">
      <a href="/" target="_blank"><span class="ic">↗</span>Voir le site public</a>
      <a href="/deconnexion"><span class="ic">⎋</span>Déconnexion</a>
    </div>
  </aside>
  <div class="app-main">
    <header class="app-topbar">
      <h1>${esc(pageTitle)}</h1>
      <div class="muted tiny">${esc(user.prenom || "Administrateur")}</div>
    </header>
    <div class="app-content">
${body}
    </div>
  </div>
</div>
<script src="/app.js"></script>
</body>
</html>`;
}

function layout({ title, description, body, user, active, noindex }) {
  const isAdminShell = user && user.role === "admin" && ["admin", "profils", "propositions", "messages"].includes(active);
  if (isAdminShell) {
    return adminShell({ title, description, body, user, active, noindex });
  }
  return publicShell({ title, description, body, user, active, noindex });
}

module.exports = { esc, layout, timeAgo };
