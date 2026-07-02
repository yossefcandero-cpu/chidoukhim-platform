"use strict";
const { layout, esc } = require("../render");
const { load, withDb, uid } = require("../db");
const { hashPassword, verifyPassword, createSession, setSessionCookie } = require("../auth");
const { isEmail, isPhone, required } = require("../validators");
const { notify } = require("../notify");

function authFrame(inner) {
  return `
  <div class="section" style="padding-top:56px;padding-bottom:56px">
    <div style="max-width:980px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-lg)" class="auth-split">
      <div style="background:linear-gradient(155deg,var(--brand-dark),var(--brand) 130%);color:#fff;padding:48px 40px;display:flex;flex-direction:column;justify-content:space-between" class="auth-side">
        <div>
          <span class="brand-mark" style="background:rgba(255,255,255,.12);color:#f0d9ab">שידוכים</span>
          <h2 style="color:#fff;margin-top:22px">Une recherche confiée, jamais exposée.</h2>
          <p style="color:rgba(255,255,255,.72)">Aucun profil public, aucune recherche libre. Chaque compatibilité est examinée par le Shadkhan avant toute mise en relation.</p>
        </div>
        <ul style="list-style:none;margin:0;padding:0;display:grid;gap:14px">
          <li style="display:flex;gap:10px;align-items:center;color:rgba(255,255,255,.85);font-size:.88rem"><span style="color:#f0d9ab">✓</span> Identité vérifiée avant activation</li>
          <li style="display:flex;gap:10px;align-items:center;color:rgba(255,255,255,.85);font-size:.88rem"><span style="color:#f0d9ab">✓</span> Photos strictement privées</li>
          <li style="display:flex;gap:10px;align-items:center;color:rgba(255,255,255,.85);font-size:.88rem"><span style="color:#f0d9ab">✓</span> Décision humaine finale</li>
        </ul>
      </div>
      <div style="padding:48px 40px" class="fade-up">
        ${inner}
      </div>
    </div>
  </div>
  <style>@media (max-width:760px){ .auth-split{grid-template-columns:1fr !important} .auth-side{display:none !important} }</style>`;
}

function inscriptionPage(user, error) {
  const inner = `
    <div class="eyebrow">Nouveau dossier</div>
    <h2>Créer votre dossier</h2>
    <p class="muted">Gratuit. Votre dossier restera privé et ne sera examiné qu'après vérification de votre identité.</p>
    ${error ? `<div class="form-error">⚠ ${esc(error)}</div>` : ""}
    <form class="js-form" data-endpoint="/api/inscription" data-redirect="/onboarding/verification">
      <div class="field-row">
        <div class="field"><label>Prénom</label><input type="text" name="prenom" required /></div>
        <div class="field"><label>Nom <span class="hint">(visible uniquement par l'administrateur)</span></label><input type="text" name="nom" required /></div>
      </div>
      <div class="field">
        <label>Vous êtes</label>
        <div class="radio-group">
          <label class="radio-pill"><input type="radio" name="sexe" value="H" required /><span>Un homme</span></label>
          <label class="radio-pill"><input type="radio" name="sexe" value="F" /><span>Une femme</span></label>
        </div>
      </div>
      <div class="field"><label>Adresse e-mail</label><input type="email" name="email" required /></div>
      <div class="field"><label>Téléphone</label><input type="tel" name="telephone" placeholder="+33 6 12 34 56 78" required /></div>
      <div class="field-row">
        <div class="field"><label>Mot de passe</label><input type="password" name="motDePasse" minlength="8" required /></div>
        <div class="field"><label>Confirmation</label><input type="password" name="motDePasseConfirmation" minlength="8" required /></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block btn-lg">Créer mon dossier</button>
      <p class="muted" style="margin-top:16px;text-align:center">Déjà inscrit ? <a href="/connexion">Se connecter</a></p>
    </form>`;
  return layout({ title: "Créer un dossier", body: authFrame(inner), user, noindex: true });
}

function connexionPage(user, error) {
  const inner = `
    <div class="eyebrow">Espace membre</div>
    <h2>Connexion</h2>
    ${error ? `<div class="form-error">⚠ ${esc(error)}</div>` : ""}
    <form class="js-form" data-endpoint="/api/connexion">
      <div class="field"><label>Adresse e-mail</label><input type="email" name="email" required /></div>
      <div class="field"><label>Mot de passe</label><input type="password" name="motDePasse" required /></div>
      <button type="submit" class="btn btn-primary btn-block btn-lg">Se connecter</button>
      <p class="muted" style="margin-top:16px;text-align:center">Pas encore de dossier ? <a href="/inscription">Créer un dossier</a></p>
    </form>`;
  return layout({ title: "Connexion", body: authFrame(inner), user, noindex: true });
}

function apiInscription(body) {
  const missing = required(body, ["prenom", "nom", "sexe", "email", "telephone", "motDePasse", "motDePasseConfirmation"]);
  if (missing.length) return { error: "Merci de compléter tous les champs obligatoires." };
  if (!isEmail(body.email)) return { error: "Adresse e-mail invalide." };
  if (!isPhone(body.telephone)) return { error: "Numéro de téléphone invalide." };
  if (!["H", "F"].includes(body.sexe)) return { error: "Merci de préciser votre sexe." };
  if (String(body.motDePasse).length < 8) return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  if (body.motDePasse !== body.motDePasseConfirmation) return { error: "Les mots de passe ne correspondent pas." };

  const db = load();
  if (db.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase())) {
    return { error: "Un compte existe déjà avec cette adresse e-mail." };
  }

  const newUser = withDb((db2) => {
    const u = {
      id: uid("user"),
      role: "candidate",
      prenom: body.prenom.trim(),
      nom: body.nom.trim(),
      sexe: body.sexe,
      email: body.email.trim().toLowerCase(),
      telephone: body.telephone.trim(),
      passwordHash: hashPassword(body.motDePasse),
      status: "en_attente_verification",
      emailVerified: false,
      phoneVerified: false,
      createdAt: new Date().toISOString(),
    };
    db2.users.push(u);
    return u;
  });

  notify.email(newUser.email, "Bienvenue", `Bonjour ${newUser.prenom}, votre dossier a été créé. Merci de vérifier votre e-mail et votre téléphone.`);

  const session = createSession(newUser.id);
  return { session, user: newUser };
}

function apiConnexion(body) {
  const missing = required(body, ["email", "motDePasse"]);
  if (missing.length) return { error: "Merci de renseigner votre e-mail et votre mot de passe." };
  const db = load();
  const found = db.users.find((u) => u.email.toLowerCase() === String(body.email).toLowerCase());
  if (!found || !verifyPassword(body.motDePasse, found.passwordHash)) {
    return { error: "Adresse e-mail ou mot de passe incorrect." };
  }
  if (found.status === "suspendu") {
    return { error: "Votre dossier est actuellement suspendu. Contactez l'administrateur." };
  }
  const session = createSession(found.id);
  return { session, user: found };
}

function redirectForUser(user) {
  if (user.role === "admin") return "/admin";
  if (!user.emailVerified || !user.phoneVerified) return "/onboarding/verification";
  if (user.status === "en_attente_verification" || user.status === "brouillon") {
    return "/onboarding/documents";
  }
  return "/tableau-de-bord";
}

module.exports = { inscriptionPage, connexionPage, apiInscription, apiConnexion, redirectForUser };
