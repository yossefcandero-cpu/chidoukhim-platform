"use strict";
const { layout, esc } = require("../render");
const { load, withDb } = require("../db");
const { age } = require("../matching");

const STATUT_LABELS = {
  en_attente_verification: ["Vérification en cours", "Merci de compléter la vérification de votre identité (e-mail, téléphone, documents)."],
  en_attente_validation: ["Dossier en cours d'examen", "Votre dossier complet est entre les mains de notre équipe. Nous vous contacterons dès qu'il aura été validé."],
  valide: ["Dossier validé", "Votre dossier est actif. Notre équipe et notre intelligence artificielle recherchent pour vous les meilleures compatibilités."],
  refuse: ["Dossier non retenu", "Après examen, votre dossier n'a malheureusement pas pu être validé en l'état. Vous pouvez contacter l'équipe pour plus d'informations."],
  suspendu: ["Dossier suspendu", "Votre dossier est actuellement suspendu. Contactez l'administrateur pour plus d'informations."],
};

function teaser(profile) {
  if (!profile) return "Profil en cours de complétion";
  const a = age(profile.dateNaissance);
  return [
    a ? `${a} ans` : null,
    profile.ville,
    profile.communaute,
    profile.niveauReligieux,
  ].filter(Boolean).join(" · ");
}

function dashboardPage(user) {
  const db = load();
  const profile = db.profiles.find((p) => p.userId === user.id);
  const [label, desc] = STATUT_LABELS[user.status] || STATUT_LABELS.en_attente_verification;

  const needsOnboarding = !user.emailVerified || !user.phoneVerified;
  const propositions = db.propositions
    .filter((pr) => pr.userAId === user.id || pr.userBId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const propRows = propositions.map((pr) => {
    const isA = pr.userAId === user.id;
    const otherId = isA ? pr.userBId : pr.userAId;
    const otherProfile = db.profiles.find((p) => p.userId === otherId);
    const myResponse = isA ? pr.reponseA : pr.reponseB;
    const otherResponse = isA ? pr.reponseB : pr.reponseA;
    const photoShared = isA ? pr.photoSharedWithA : pr.photoSharedWithB;
    let actions = "";
    if (pr.status === "suspendue" || pr.status === "refusee") {
      actions = `<span class="status-pill status-${esc(pr.status)}">${pr.status === "refusee" ? "Proposition déclinée" : "Suspendue"}</span>`;
    } else if (!myResponse) {
      actions = `
        <div class="proposal-actions">
          <button class="btn btn-primary btn-sm" onclick="reagir('${pr.id}','interesse')">Intéressé(e)</button>
          <button class="btn btn-outline btn-sm" onclick="reagir('${pr.id}','pas_interesse')">Pas intéressé(e)</button>
        </div>`;
    } else if (myResponse === "pas_interesse") {
      actions = `<span class="status-pill status-refusee">Vous avez décliné</span>`;
    } else if (myResponse === "interesse" && otherResponse !== "interesse") {
      actions = `<span class="status-pill status-interet_a">En attente de la réponse de l'autre personne</span>`;
    } else if (myResponse === "interesse" && otherResponse === "interesse") {
      actions = `<span class="status-pill status-match_mutuel">Intérêt mutuel confirmé — l'administrateur va vous recontacter</span>`;
      if (photoShared) {
        actions += ` <a class="btn btn-gold btn-sm" href="/tableau-de-bord/photo/${pr.id}" target="_blank">Voir la photo</a>`;
      }
    }
    return `<div class="proposal-card fade-up">
      <div>
        <h3 style="margin-bottom:4px">Proposition de compatibilité</h3>
        <div class="proposal-meta">${esc(teaser(otherProfile))}</div>
        <div class="proposal-meta">Score de compatibilité estimé : <strong>${pr.score}%</strong></div>
      </div>
      ${actions}
    </div>`;
  }).join("") || `<div class="empty-state">Aucune proposition pour le moment. Dès qu'une compatibilité sérieuse sera identifiée, elle apparaîtra ici.</div>`;

  const body = `
  <div class="dash-wrap">
    <div class="status-banner fade-up">
      <span class="status-pill status-${esc(user.status)}">${esc(label)}</span>
      <h2 style="margin-top:14px">${esc(label)}</h2>
      <p>${esc(desc)}</p>
      ${needsOnboarding ? `<a href="/onboarding/verification" class="btn btn-primary">Terminer la vérification</a>` : ""}
      ${!needsOnboarding && !profile ? `<a href="/onboarding/documents" class="btn btn-primary">Compléter mon dossier</a>` : ""}
    </div>

    <div class="section-title-row"><h3>Propositions de compatibilité</h3></div>
    ${propRows}
  </div>
  <script>
  async function reagir(id, reponse) {
    const res = await fetch('/api/propositions/' + id + '/reagir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({reponse}) });
    const json = await res.json();
    if (json.ok) window.location.reload(); else alert(json.error || 'Erreur');
  }
  </script>`;
  return layout({ title: "Mon espace", body, user, active: "dashboard", noindex: true });
}

function apiReagir(user, propositionId, body) {
  if (!["interesse", "pas_interesse"].includes(body.reponse)) return { error: "Réponse invalide." };
  const db = load();
  const pr = db.propositions.find((p) => p.id === propositionId && (p.userAId === user.id || p.userBId === user.id));
  if (!pr) return { error: "Proposition introuvable." };
  withDb((db2) => {
    const p2 = db2.propositions.find((x) => x.id === propositionId);
    const isA = p2.userAId === user.id;
    if (isA) p2.reponseA = body.reponse; else p2.reponseB = body.reponse;
    if (body.reponse === "pas_interesse") {
      p2.status = "refusee";
    } else if (p2.reponseA === "interesse" && p2.reponseB === "interesse") {
      p2.status = "match_mutuel";
    } else {
      p2.status = isA ? "interet_a" : "interet_b";
    }
    p2.updatedAt = new Date().toISOString();
  });
  return { ok: true };
}

module.exports = { dashboardPage, apiReagir };
