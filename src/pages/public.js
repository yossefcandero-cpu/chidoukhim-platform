"use strict";
const { layout, esc } = require("../render");

function landingPage(user) {
  const body = `
  <section class="hero">
    <div class="hero-motif"></div>
    <div class="hero-inner">
      <div class="fade-up">
        <div class="eyebrow">Chidoukhim assistés par intelligence artificielle</div>
        <h1>Le Shadkhan retrouve<br /><span>sa place centrale.</span></h1>
        <p class="hero-lead">Une plateforme discrète où l'on ne parcourt pas des centaines de profils : vous déposez votre dossier, notre équipe et notre intelligence artificielle cherchent pour vous les compatibilités les plus sérieuses.</p>
        <div class="hero-actions">
          <a href="/inscription" class="btn btn-primary">Créer mon dossier — gratuit</a>
          <a href="#comment-ca-marche" class="btn btn-outline">Comment ça marche</a>
        </div>
      </div>
      <div class="hero-card fade-up delay-2">
        <h3>Aucun profil n'est jamais public</h3>
        <ul class="hero-steps">
          <li><span class="step-num">1</span><div><strong>Vous déposez votre dossier</strong><span>Informations, valeurs, aspirations — en toute confidentialité.</span></div></li>
          <li><span class="step-num">2</span><div><strong>Vérification d'identité</strong><span>Téléphone, e-mail, pièce d'identité et selfie contrôlés avant activation.</span></div></li>
          <li><span class="step-num">3</span><div><strong>Recherche par l'IA + l'administrateur</strong><span>Aucune recherche ni consultation de profils par les membres.</span></div></li>
          <li><span class="step-num">4</span><div><strong>Mise en relation décidée par l'équipe</strong><span>Vous êtes contacté uniquement pour une compatibilité sérieuse.</span></div></li>
        </ul>
      </div>
    </div>
  </section>

  <div class="value-band fade-up">
    <div><div class="num">100%</div><div class="label">Profils confidentiels</div></div>
    <div><div class="num">0</div><div class="label">Photo publique</div></div>
    <div><div class="num">2</div><div class="label">Questionnaires détaillés</div></div>
    <div><div class="num">1</div><div class="label">Décision humaine finale</div></div>
  </div>

  <section class="section" id="comment-ca-marche">
    <div class="section-head">
      <div class="eyebrow" style="justify-content:center">Comment ça marche</div>
      <h2>Une expérience pensée pour la sérénité, pas pour le défilement</h2>
      <p>Contrairement aux applications de rencontres classiques, personne ne consulte, ne recherche ni ne contacte de profils par lui-même. Toute la démarche passe par l'équipe et l'intelligence artificielle.</p>
    </div>
    <div class="timeline">
      <div class="timeline-item"><div><h3>Inscription gratuite et sécurisée</h3><p>Création du compte, vérification du numéro de téléphone et de l'e-mail.</p></div></div>
      <div class="timeline-item"><div><h3>Vérification d'identité</h3><p>Dépôt d'une pièce d'identité et d'un selfie, contrôlés avant toute activation. Ces documents restent strictement privés.</p></div></div>
      <div class="timeline-item"><div><h3>Deux questionnaires détaillés</h3><p>Votre profil complet, et le profil que vous recherchez — critères indispensables, secondaires et rédhibitoires.</p></div></div>
      <div class="timeline-item"><div><h3>Analyse par l'intelligence artificielle</h3><p>Un score de compatibilité expliqué est calculé avec chaque profil validé, jamais affiché publiquement.</p></div></div>
      <div class="timeline-item"><div><h3>Décision de l'administrateur</h3><p>Chaque proposition de compatibilité est validée par une personne avant toute mise en relation.</p></div></div>
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div class="eyebrow" style="justify-content:center">Nos engagements</div>
      <h2>Discrétion, sérieux, sécurité</h2>
    </div>
    <div class="grid-3">
      <div class="card fade-up"><div class="card-icon">🔒</div><h3>Confidentialité totale</h3><p>Aucun profil n'est jamais public. Aucune indexation par les moteurs de recherche. Les photos restent privées, consultées uniquement par l'administrateur.</p></div>
      <div class="card fade-up delay-1"><div class="card-icon">🛡️</div><h3>Vérification d'identité</h3><p>Téléphone, e-mail, pièce d'identité et selfie sont contrôlés avant toute activation du dossier, afin de limiter les faux profils.</p></div>
      <div class="card fade-up delay-2"><div class="card-icon">✨</div><h3>Intelligence artificielle explicable</h3><p>Chaque compatibilité proposée est accompagnée des raisons qui la justifient — jamais une boîte noire, toujours une décision humaine finale.</p></div>
      <div class="card fade-up"><div class="card-icon">🤝</div><h3>Le rôle du Shadkhan préservé</h3><p>La plateforme n'est pas un self-service : elle outille un accompagnement humain, dans le respect des usages et des valeurs religieuses.</p></div>
      <div class="card fade-up delay-1"><div class="card-icon">📋</div><h3>Un dossier complet et sincère</h3><p>Origine, communauté, minhag, niveau religieux, aspirations spirituelles : de quoi permettre une recherche fine et respectueuse.</p></div>
      <div class="card fade-up delay-2"><div class="card-icon">🕊️</div><h3>Aucune pression</h3><p>Pas de défilement de profils, pas de messagerie ouverte à tous : chaque mise en relation est le fruit d'une analyse sérieuse.</p></div>
    </div>
  </section>

  <section class="section">
    <div class="quote-block">« Ce n'est pas un site de rencontres où l'on choisit sur une photo. C'est un espace où l'on confie sa recherche à quelqu'un de confiance, aidé par une intelligence artificielle rigoureuse. »</div>
  </section>

  <section class="section" style="text-align:center">
    <h2>Prêt à confier votre recherche ?</h2>
    <p style="max-width:520px;margin:0 auto 26px">L'inscription est gratuite et ne prend que quelques minutes. Votre dossier ne sera examiné qu'après vérification de votre identité.</p>
    <a href="/inscription" class="btn btn-primary">Créer mon dossier</a>
  </section>

  <div class="section" aria-label="espace partenaire" style="max-width:720px">
    <div style="border:1px solid var(--line-soft);background:var(--bg-soft);border-radius:var(--radius);padding:14px 18px;text-align:center;color:var(--muted-2);font-size:0.72rem;text-transform:uppercase;letter-spacing:.08em">
      Espace partenaire — emplacement publicitaire discret
    </div>
  </div>
  `;
  return layout({ title: "Accueil", body, user, active: "home" });
}

function robotsTxt() {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /onboarding
Disallow: /tableau-de-bord
Disallow: /api

Sitemap: /sitemap.xml
`;
}

function sitemapXml(baseUrl) {
  const urls = ["/", "/inscription", "/connexion"];
  const items = urls
    .map((u) => `  <url><loc>${esc(baseUrl + u)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>`;
}

module.exports = { landingPage, robotsTxt, sitemapXml };
