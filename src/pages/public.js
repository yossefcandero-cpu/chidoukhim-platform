"use strict";
const { layout, esc } = require("../render");

const FAQ = [
  ["Est-ce un site de rencontres ?", "Non. Aucun profil n'est jamais visible par les autres membres, aucune recherche libre n'est possible, et aucun contact direct entre membres n'existe. Chaque mise en relation est décidée par l'équipe, avec l'appui de l'intelligence artificielle."],
  ["Comment l'intelligence artificielle est-elle utilisée ?", "Elle calcule un score de compatibilité explicable entre deux dossiers validés (âge, courant religieux, critères indispensables et rédhibitoires, affinités de personnalité…) et fournit un résumé, des points forts et des points d'attention à l'administrateur. Elle ne décide jamais seule : chaque proposition est validée par une personne."],
  ["Qui peut voir mes documents et ma photo ?", "Uniquement l'administrateur, pour vérifier votre identité. Vos photos ne sont jamais publiées et ne sont partagées avec une autre personne qu'après votre accord implicite, dans le cadre d'une compatibilité mutuelle validée."],
  ["Combien de temps prend la vérification ?", "La vérification de l'e-mail et du téléphone est immédiate. La validation du dossier complet par l'équipe intervient généralement sous quelques jours."],
  ["Puis-je contacter un autre membre directement ?", "Non, et cela restera toujours impossible. Toute communication passe par l'administrateur, qui reste seul décisionnaire des mises en relation."],
  ["Comment modifier mon dossier ou signaler un problème ?", "Utilisez la messagerie intégrée à votre espace : l'équipe vous répond directement et peut mettre à jour votre dossier."],
];

function landingPage(user) {
  const body = `
  <section class="hero">
    <div class="hero-motif"></div>
    <div class="hero-inner">
      <div class="fade-up">
        <div class="eyebrow">L'intelligence artificielle au service du Shadkhan</div>
        <h1>Le Shadkhan retrouve<br /><span>sa place centrale.</span></h1>
        <p class="hero-lead">Tipat Mazal n'est pas un site de rencontres. C'est une plateforme discrète où l'on ne parcourt pas des centaines de profils : vous déposez votre dossier, notre équipe et notre intelligence artificielle cherchent pour vous les compatibilités les plus sérieuses.</p>
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
      <div class="timeline-item"><div><h3>Un parcours guidé, pas un formulaire</h3><p>Votre profil complet, et le profil que vous recherchez — courant religieux, critères indispensables, secondaires et rédhibitoires, avec aides et exemples à chaque étape.</p></div></div>
      <div class="timeline-item"><div><h3>Analyse par l'intelligence artificielle</h3><p>Un score de compatibilité expliqué est calculé avec chaque profil validé, jamais affiché publiquement.</p></div></div>
      <div class="timeline-item"><div><h3>Décision de l'administrateur</h3><p>Chaque proposition de compatibilité est validée par une personne avant toute mise en relation.</p></div></div>
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div class="eyebrow" style="justify-content:center">Notre intelligence artificielle</div>
      <h2>Une IA explicable, jamais une boîte noire</h2>
      <p>Chaque score de compatibilité est accompagné des raisons précises qui le justifient : âge, courant religieux, critères indispensables et rédhibitoires, affinités de personnalité. L'administrateur voit toujours le détail du calcul et garde la décision finale — l'IA outille le Shadkhan, elle ne le remplace jamais.</p>
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
      <div class="card fade-up delay-1"><div class="card-icon">📋</div><h3>Un dossier complet et sincère</h3><p>Origine, communauté, minhag, courant religieux, aspirations spirituelles : de quoi permettre une recherche fine et respectueuse.</p></div>
      <div class="card fade-up delay-2"><div class="card-icon">🕊️</div><h3>Aucune pression</h3><p>Pas de défilement de profils, pas de messagerie ouverte à tous : chaque mise en relation est le fruit d'une analyse sérieuse.</p></div>
    </div>
  </section>

  <section class="section">
    <div class="quote-block">« Ce n'est pas un site de rencontres où l'on choisit sur une photo. C'est un espace où l'on confie sa recherche à quelqu'un de confiance, aidé par une intelligence artificielle rigoureuse. »</div>
  </section>

  <section class="section" id="faq">
    <div class="section-head">
      <div class="eyebrow" style="justify-content:center">Questions fréquentes</div>
      <h2>Ce qu'il faut savoir avant de commencer</h2>
    </div>
    <div class="faq-list">
      ${FAQ.map(([q, a], i) => `
      <details class="faq-item fade-up ${i % 3 === 1 ? "delay-1" : i % 3 === 2 ? "delay-2" : ""}">
        <summary>${esc(q)}<span class="faq-chevron">⌄</span></summary>
        <p>${esc(a)}</p>
      </details>`).join("")}
    </div>
  </section>

  <section class="section" style="text-align:center">
    <h2>Prêt à confier votre recherche ?</h2>
    <p style="max-width:520px;margin:0 auto 26px">L'inscription est gratuite et ne prend que quelques minutes. Votre dossier ne sera examiné qu'après vérification de votre identité.</p>
    <a href="/inscription" class="btn btn-primary">Créer mon dossier</a>
  </section>
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
