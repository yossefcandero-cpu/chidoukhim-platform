"use strict";
// Petit moteur de gabarit HTML (pas de dépendance externe).

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ADMIN_NAV = [
  { key: "admin", href: "/admin", label: "Tableau de bord", icon: "◧" },
  { key: "profils", href: "/admin/profils", label: "Profils", icon: "◎" },
  { key: "propositions", href: "/admin/propositions", label: "Compatibilités", icon: "✦" },
];

function headFragment(title, description, noindex) {
  return `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Chidoukhim</title>
<meta name="description" content="${esc(description || "Plateforme discrète de Chidoukhim, accompagnée par un Shadkhan et une intelligence artificielle.")}" />
${noindex ? '<meta name="robots" content="noindex, nofollow" />' : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css" />`;
}

function publicShell({ title, description, body, user, active, noindex }) {
  const nav = user
    ? user.role === "admin"
      ? `<a href="/admin">Administration</a><a href="/deconnexion">Déconnexion</a>`
      : `
        <a href="/tableau-de-bord" class="${active === "dashboard" ? "nav-active" : ""}">Mon espace</a>
        <a href="/deconnexion">Déconnexion</a>`
    : `
        <a href="/connexion">Connexion</a>
        <a href="/inscription" class="nav-cta">Créer un dossier</a>`;

  return `<!doctype html>
<html lang="fr">
<head>
${headFragment(title, description, noindex)}
</head>
<body>
<header class="site-header">
  <a href="/" class="brand">
    <span class="brand-mark">שידוכים</span>
    <span class="brand-name">Chidoukhim</span>
  </a>
  <nav class="site-nav">${nav}</nav>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <p>Chidoukhim — une plateforme discrète, au service du Shadkhan. Aucune photo ni aucun profil n'est jamais public.</p>
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
      <span class="brand-mark">שידוכים</span>
      <span class="brand-name">Chidoukhim</span>
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
  const isAdminShell = user && user.role === "admin" && ["admin", "profils", "propositions"].includes(active);
  if (isAdminShell) {
    return adminShell({ title, description, body, user, active, noindex });
  }
  return publicShell({ title, description, body, user, active, noindex });
}

module.exports = { esc, layout };
