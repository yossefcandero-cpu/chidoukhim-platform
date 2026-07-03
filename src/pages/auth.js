"use strict";
const crypto = require("crypto");
const { layout, esc } = require("../render");
const { load, withDb, uid } = require("../db");
const { hashPassword, verifyPassword, createSession, setSessionCookie } = require("../auth");
const { isEmail, isPhone, required } = require("../validators");
const { notify } = require("../notify");

const RESET_TTL_MS = 1000 * 60 * 60; // 1 heure

function authFrame(inner) {
  return `
  <div class="section" style="padding-top:56px;padding-bottom:56px">
    <div style="max-width:980px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-lg)" class="auth-split">
      <div style="background:linear-gradient(155deg,var(--brand-dark),var(--brand) 130%);color:#fff;padding:48px 40px;display:flex;flex-direction:column;justify-content:space-between" class="auth-side">
        <div>
          <span class="brand-mark">✦ Tipat Mazal</span>
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
      <div class="field">
        <label style="display:flex;justify-content:space-between;align-items:center">Mot de passe <a href="/mot-de-passe-oublie" class="tiny" style="font-weight:500">Mot de passe oublié ?</a></label>
        <input type="password" name="motDePasse" required />
      </div>
      <button type="submit" class="btn btn-primary btn-block btn-lg">Se connecter</button>
      <p class="muted" style="margin-top:16px;text-align:center">Pas encore de dossier ? <a href="/inscription">Créer un dossier</a></p>
    </form>`;
  return layout({ title: "Connexion", body: authFrame(inner), user, noindex: true });
}

// ---------- Mot de passe oublié ----------
function motDePasseOubliePage(user, sent, error) {
  const inner = sent
    ? `
      <div class="eyebrow">E-mail envoyé</div>
      <h2>Vérifiez votre boîte de réception</h2>
      <p class="muted">Si un compte existe avec cette adresse, un lien de réinitialisation valable 1 heure vient de lui être envoyé.</p>
      <a href="/connexion" class="btn btn-outline btn-block">Retour à la connexion</a>`
    : `
      <div class="eyebrow">Mot de passe oublié</div>
      <h2>Réinitialiser votre mot de passe</h2>
      <p class="muted">Indiquez l'adresse e-mail de votre dossier. Nous vous enverrons un lien sécurisé, valable une heure.</p>
      ${error ? `<div class="form-error">⚠ ${esc(error)}</div>` : ""}
      <form class="js-form" data-endpoint="/api/mot-de-passe-oublie" data-redirect="/mot-de-passe-oublie?envoye=1">
        <div class="field"><label>Adresse e-mail</label><input type="email" name="email" required /></div>
        <button type="submit" class="btn btn-primary btn-block btn-lg">Envoyer le lien</button>
        <p class="muted" style="margin-top:16px;text-align:center"><a href="/connexion">← Retour à la connexion</a></p>
      </form>`;
  return layout({ title: "Mot de passe oublié", body: authFrame(inner), user, noindex: true });
}

function reinitialiserMotDePassePage(user, token, invalid) {
  const inner = invalid
    ? `
      <div class="eyebrow">Lien invalide</div>
      <h2>Ce lien n'est plus valable</h2>
      <p class="muted">Le lien de réinitialisation est invalide, déjà utilisé, ou a expiré (validité d'une heure).</p>
      <a href="/mot-de-passe-oublie" class="btn btn-primary btn-block">Demander un nouveau lien</a>`
    : `
      <div class="eyebrow">Nouveau mot de passe</div>
      <h2>Choisissez un nouveau mot de passe</h2>
      <p class="muted">Au moins 8 caractères.</p>
      <form class="js-form" data-endpoint="/api/reinitialiser-mot-de-passe" data-redirect="/connexion">
        <input type="hidden" name="token" value="${esc(token)}" />
        <div class="field"><label>Nouveau mot de passe</label><input type="password" name="motDePasse" minlength="8" required /></div>
        <div class="field"><label>Confirmation</label><input type="password" name="motDePasseConfirmation" minlength="8" required /></div>
        <button type="submit" class="btn btn-primary btn-block btn-lg">Réinitialiser le mot de passe</button>
      </form>`;
  return layout({ title: "Réinitialiser le mot de passe", body: authFrame(inner), user, noindex: true });
}

function apiDemandeReset(body, baseUrl) {
  const missing = required(body, ["email"]);
  if (missing.length || !isEmail(body.email)) return { error: "Merci de renseigner une adresse e-mail valide." };
  const db = load();
  const found = db.users.find((u) => u.email.toLowerCase() === String(body.email).toLowerCase());
  // Réponse volontairement identique que le compte existe ou non (anti-énumération).
  if (found) {
    const token = crypto.randomBytes(32).toString("hex");
    withDb((db2) => {
      db2.passwordResets = db2.passwordResets.filter((r) => r.userId !== found.id || r.used);
      db2.passwordResets.push({
        id: uid("reset"),
        userId: found.id,
        token,
        expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
        used: false,
        createdAt: new Date().toISOString(),
      });
    });
    const link = `${baseUrl}/reinitialiser-mot-de-passe?token=${token}`;
    notify.email(found.email, "Réinitialisation de votre mot de passe", `Voici votre lien de réinitialisation sécurisé (valable 1 heure) : ${link}`);
  }
  return { ok: true };
}

function findValidResetToken(token) {
  if (!token) return null;
  const db = load();
  const reset = db.passwordResets.find((r) => r.token === token);
  if (!reset || reset.used) return null;
  if (new Date(reset.expiresAt).getTime() < Date.now()) return null;
  return reset;
}

function apiReinitialiser(body) {
  const missing = required(body, ["token", "motDePasse", "motDePasseConfirmation"]);
  if (missing.length) return { error: "Formulaire incomplet." };
  const reset = findValidResetToken(body.token);
  if (!reset) return { error: "Ce lien n'est plus valable. Merci de demander un nouveau lien." };
  if (String(body.motDePasse).length < 8) return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  if (body.motDePasse !== body.motDePasseConfirmation) return { error: "Les mots de passe ne correspondent pas." };
  withDb((db) => {
    const u = db.users.find((x) => x.id === reset.userId);
    if (u) u.passwordHash = hashPassword(body.motDePasse);
    const r = db.passwordResets.find((x) => x.id === reset.id);
    if (r) r.used = true;
  });
  return { ok: true };
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

  notify.email(newUser.email, "Bienvenue chez Tipat Mazal", `Bonjour ${newUser.prenom}, votre dossier a été créé. Merci de vérifier votre e-mail et votre téléphone.`);

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

module.exports = {
  inscriptionPage, connexionPage, apiInscription, apiConnexion, redirectForUser,
  motDePasseOubliePage, reinitialiserMotDePassePage, apiDemandeReset, apiReinitialiser, findValidResetToken,
};
