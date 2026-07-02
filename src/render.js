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

function layout({ title, description, body, user, active, noindex }) {
  const nav = user
    ? user.role === "admin"
      ? `
        <a href="/admin" class="${active === "admin" ? "nav-active" : ""}">Tableau de bord</a>
        <a href="/admin/profils" class="${active === "profils" ? "nav-active" : ""}">Profils</a>
        <a href="/admin/propositions" class="${active === "propositions" ? "nav-active" : ""}">Compatibilités</a>
        <a href="/deconnexion">Déconnexion</a>`
      : `
        <a href="/tableau-de-bord" class="${active === "dashboard" ? "nav-active" : ""}">Mon espace</a>
        <a href="/deconnexion">Déconnexion</a>`
    : `
        <a href="/connexion">Connexion</a>
        <a href="/inscription" class="nav-cta">Créer un dossier</a>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Chidoukhim</title>
<meta name="description" content="${esc(description || "Plateforme discrète de Chidoukhim, accompagnée par un Shadkhan et une intelligence artificielle.")}" />
${noindex ? '<meta name="robots" content="noindex, nofollow" />' : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css" />
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

module.exports = { esc, layout };
