"use strict";
const { layout, esc } = require("../render");
const { load, withDb, uid, UPLOADS_DIR } = require("../db");
const { genCode } = require("../auth");
const { notify } = require("../notify");
const { required, clampStr } = require("../validators");
const fs = require("fs");
const path = require("path");

function stepper(current) {
  const steps = ["Vérification", "Documents", "Mon profil", "Profil recherché"];
  const dots = steps
    .map((_, i) => {
      const n = i + 1;
      const cls = n < current ? "dot done" : n === current ? "dot current" : "dot";
      return `<div class="${cls}"></div>`;
    })
    .join("");
  return `<div class="step-label">Étape ${current} sur 4 — ${esc(steps[current - 1])}</div><div class="stepper">${dots}</div>`;
}

// ---------- Étape 1 : vérification ----------
function verificationPage(user) {
  const body = `
  <div class="auth-wrap fade-up" style="max-width:560px">
    ${stepper(1)}
    <h2>Vérifions votre identité de contact</h2>
    <p class="muted">Pour limiter les faux profils, nous vérifions votre e-mail et votre téléphone avant l'accès au questionnaire.</p>

    <div class="card" style="margin-bottom:18px">
      <h3>E-mail : ${esc(user.email)} ${user.emailVerified ? '<span class="status-pill status-valide">Vérifié</span>' : '<span class="status-pill status-en_attente_validation">Non vérifié</span>'}</h3>
      ${
        user.emailVerified
          ? ""
          : `<div id="email-verif">
              <button class="btn btn-outline btn-sm" id="btn-send-email" type="button">Envoyer le code par e-mail</button>
              <div id="email-code-zone" style="display:none;margin-top:14px">
                <div class="field"><label>Code reçu par e-mail</label><input type="text" id="email-code" maxlength="6" /></div>
                <button class="btn btn-primary btn-sm" id="btn-check-email" type="button">Valider</button>
              </div>
              <div id="email-demo-note" class="muted" style="margin-top:8px"></div>
            </div>`
      }
    </div>

    <div class="card" style="margin-bottom:18px">
      <h3>Téléphone : ${esc(user.telephone)} ${user.phoneVerified ? '<span class="status-pill status-valide">Vérifié</span>' : '<span class="status-pill status-en_attente_validation">Non vérifié</span>'}</h3>
      ${
        user.phoneVerified
          ? ""
          : `<div id="phone-verif">
              <button class="btn btn-outline btn-sm" id="btn-send-phone" type="button">Envoyer le code par SMS</button>
              <div id="phone-code-zone" style="display:none;margin-top:14px">
                <div class="field"><label>Code reçu par SMS</label><input type="text" id="phone-code" maxlength="6" /></div>
                <button class="btn btn-primary btn-sm" id="btn-check-phone" type="button">Valider</button>
              </div>
              <div id="phone-demo-note" class="muted" style="margin-top:8px"></div>
            </div>`
      }
    </div>

    <a href="/onboarding/documents" class="btn btn-primary btn-block" ${user.emailVerified && user.phoneVerified ? "" : "style=\"pointer-events:none;opacity:.5\""}>Continuer</a>
  </div>
  <script>
  async function sendCode(canal, btnId, zoneId, noteId) {
    const btn = document.getElementById(btnId);
    btn.disabled = true; btn.textContent = "Envoi…";
    const res = await fetch('/api/onboarding/envoyer-code', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({canal}) });
    const json = await res.json();
    document.getElementById(zoneId).style.display = 'block';
    const note = document.getElementById(noteId);
    if (json.devCode) { note.textContent = 'Mode démonstration (aucun fournisseur connecté) — code : ' + json.devCode; }
    else { note.textContent = 'Un code vous a été envoyé.'; }
    btn.disabled = false; btn.textContent = 'Renvoyer le code';
  }
  async function checkCode(canal, inputId) {
    const code = document.getElementById(inputId).value.trim();
    const res = await fetch('/api/onboarding/verifier-code', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({canal, code}) });
    const json = await res.json();
    if (json.ok) { window.location.reload(); } else { alert(json.error || 'Code invalide'); }
  }
  const be = document.getElementById('btn-send-email'); if (be) be.onclick = () => sendCode('email','btn-send-email','email-code-zone','email-demo-note');
  const bp = document.getElementById('btn-send-phone'); if (bp) bp.onclick = () => sendCode('telephone','btn-send-phone','phone-code-zone','phone-demo-note');
  const ce = document.getElementById('btn-check-email'); if (ce) ce.onclick = () => checkCode('email','email-code');
  const cp = document.getElementById('btn-check-phone'); if (cp) cp.onclick = () => checkCode('telephone','phone-code');
  </script>`;
  return layout({ title: "Vérification d'identité", body, user, noindex: true });
}

function apiEnvoyerCode(user, body) {
  if (!["email", "telephone"].includes(body.canal)) return { error: "Canal invalide." };
  const code = genCode(6);
  withDb((db) => {
    db.otps = db.otps.filter((o) => !(o.userId === user.id && o.channel === body.canal));
    db.otps.push({
      id: uid("otp"),
      userId: user.id,
      channel: body.canal,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      used: false,
    });
  });
  const noProviderEmail = !process.env.EMAIL_PROVIDER_API_KEY;
  const noProviderSms = !process.env.SMS_PROVIDER_API_KEY;
  if (body.canal === "email") {
    notify.email(user.email, "Votre code de vérification", `Votre code : ${code} (valable 10 minutes)`);
    return { ok: true, devCode: noProviderEmail ? code : undefined };
  } else {
    notify.sms(user.telephone, "Code Chidoukhim", `Votre code : ${code} (valable 10 minutes)`);
    return { ok: true, devCode: noProviderSms ? code : undefined };
  }
}

function apiVerifierCode(user, body) {
  if (!["email", "telephone"].includes(body.canal)) return { error: "Canal invalide." };
  const db = load();
  const otp = db.otps.find((o) => o.userId === user.id && o.channel === body.canal && !o.used);
  if (!otp) return { error: "Aucun code en attente. Demandez un nouvel envoi." };
  if (new Date(otp.expiresAt).getTime() < Date.now()) return { error: "Code expiré, demandez un nouvel envoi." };
  if (String(body.code).trim() !== otp.code) return { error: "Code incorrect." };
  withDb((db2) => {
    const o = db2.otps.find((x) => x.id === otp.id);
    if (o) o.used = true;
    const u = db2.users.find((x) => x.id === user.id);
    if (body.canal === "email") u.emailVerified = true;
    else u.phoneVerified = true;
  });
  return { ok: true };
}

// ---------- Étape 2 : documents ----------
function documentsPage(user, error) {
  const body = `
  <div class="auth-wrap fade-up" style="max-width:560px">
    ${stepper(2)}
    <h2>Documents d'identité</h2>
    <p class="muted">Ces documents restent strictement privés et ne sont consultés que par l'administrateur, pour confirmer votre identité.</p>
    ${error ? `<div class="form-error">${esc(error)}</div>` : ""}
    <form class="js-form" data-endpoint="/api/onboarding/documents" data-redirect="/onboarding/profil">
      <div class="field">
        <label>Pièce d'identité (carte d'identité, passeport)</label>
        <label class="file-drop">
          <input type="file" name="pieceIdentite" accept="image/*,.pdf" required />
          <span>Cliquez pour sélectionner un fichier</span>
          <div class="fname"></div>
        </label>
      </div>
      <div class="field">
        <label>Selfie (visage bien visible, pour confirmer que vous correspondez au document)</label>
        <label class="file-drop">
          <input type="file" name="selfie" accept="image/*" required />
          <span>Cliquez pour sélectionner un fichier</span>
          <div class="fname"></div>
        </label>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Continuer</button>
    </form>
  </div>`;
  return layout({ title: "Documents d'identité", body, user, noindex: true });
}

function saveUploadedFile(userId, type, fileObj) {
  if (!fileObj || !fileObj.dataUrl) return null;
  const match = /^data:(.+?);base64,(.*)$/.exec(fileObj.dataUrl);
  if (!match) return null;
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const MAX = 8 * 1024 * 1024;
  if (buffer.length > MAX) return { tooLarge: true };
  const id = uid("doc");
  const ext = (fileObj.name && path.extname(fileObj.name)) || "";
  const filename = `${id}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  const doc = withDb((db) => {
    const d = {
      id,
      userId,
      type,
      filename,
      mimeType,
      originalName: fileObj.name || "",
      createdAt: new Date().toISOString(),
    };
    db.documents.push(d);
    return d;
  });
  return doc;
}

function apiDocuments(user, body) {
  if (!body.pieceIdentite || !body.selfie) return { error: "Merci de fournir la pièce d'identité et le selfie." };
  const doc1 = saveUploadedFile(user.id, "piece_identite", body.pieceIdentite);
  const doc2 = saveUploadedFile(user.id, "selfie", body.selfie);
  if (!doc1 || doc1.tooLarge) return { error: "Le fichier de la pièce d'identité est invalide ou trop volumineux (8 Mo max)." };
  if (!doc2 || doc2.tooLarge) return { error: "Le fichier du selfie est invalide ou trop volumineux (8 Mo max)." };
  return { ok: true };
}

// ---------- Étape 3 : profil personnel ----------
const NIVEAUX = [
  ["traditionaliste", "Traditionaliste"],
  ["pratiquant", "Pratiquant"],
  ["dati_leumi", "Dati leumi"],
  ["pratiquant_engage", "Pratiquant engagé"],
  ["litvish", "Litvish"],
  ["hassidique", "Hassidique"],
  ["loubavitch", "Loubavitch"],
  ["haredi", "Harédi"],
  ["autre", "Autre"],
];

function selectOptions(list, selected) {
  return list.map(([v, l]) => `<option value="${esc(v)}" ${selected === v ? "selected" : ""}>${esc(l)}</option>`).join("");
}

function profilPage(user, profile, error) {
  const p = profile || {};
  const body = `
  <div class="form-wide fade-up">
    ${stepper(3)}
    <h2>Votre dossier personnel</h2>
    <p class="muted">Soyez sincère et précis : c'est ce qui permettra à l'administrateur et à l'intelligence artificielle de trouver les meilleures compatibilités pour vous.</p>
    ${error ? `<div class="form-error">${esc(error)}</div>` : ""}
    <form class="js-form" data-endpoint="/api/onboarding/profil" data-redirect="/onboarding/recherche">
      <h3>Informations générales</h3>
      <div class="field-row">
        <div class="field"><label>Date de naissance</label><input type="date" name="dateNaissance" value="${esc(p.dateNaissance)}" required /></div>
        <div class="field"><label>Taille (cm)</label><input type="number" name="taille" min="120" max="220" value="${esc(p.taille)}" required /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Poids (kg) <span class="hint">optionnel</span></label><input type="number" name="poids" min="30" max="250" value="${esc(p.poids)}" /></div>
        <div class="field"><label>Langue(s) parlée(s)</label><input type="text" name="langues" value="${esc(p.langues)}" placeholder="Français, hébreu, anglais…" required /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Ville</label><input type="text" name="ville" value="${esc(p.ville)}" required /></div>
        <div class="field"><label>Pays</label><input type="text" name="pays" value="${esc(p.pays)}" required /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Origine</label><input type="text" name="origine" value="${esc(p.origine)}" placeholder="Ashkénaze, séfarade…" /></div>
        <div class="field"><label>Communauté</label><input type="text" name="communaute" value="${esc(p.communaute)}" /></div>
      </div>
      <div class="field"><label>Minhag</label><input type="text" name="minhag" value="${esc(p.minhag)}" /></div>

      <h3>Parcours</h3>
      <div class="field-row">
        <div class="field"><label>Profession</label><input type="text" name="profession" value="${esc(p.profession)}" required /></div>
        <div class="field"><label>Études</label><input type="text" name="etudes" value="${esc(p.etudes)}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Niveau religieux</label><select name="niveauReligieux" required><option value="">— Choisir —</option>${selectOptions(NIVEAUX, p.niveauReligieux)}</select></div>
        <div class="field"><label>Yéchiva / séminaire</label><input type="text" name="yeshiva" value="${esc(p.yeshiva)}" /></div>
      </div>
      <div class="field"><label>Rav de référence</label><input type="text" name="ravReference" value="${esc(p.ravReference)}" /></div>

      <h3>Situation familiale</h3>
      <div class="field-row">
        <div class="field"><label>Situation familiale</label>
          <select name="situationFamiliale" required>
            <option value="">— Choisir —</option>
            <option value="celibataire" ${p.situationFamiliale === "celibataire" ? "selected" : ""}>Célibataire</option>
            <option value="divorce" ${p.situationFamiliale === "divorce" ? "selected" : ""}>Divorcé(e)</option>
            <option value="veuf" ${p.situationFamiliale === "veuf" ? "selected" : ""}>Veuf / veuve</option>
          </select>
        </div>
        <div class="field"><label>Enfants</label><input type="text" name="enfants" value="${esc(p.enfants)}" placeholder="Aucun, 2 enfants…" /></div>
      </div>
      <div class="field"><label>État de santé <span class="hint">optionnel</span></label><textarea name="etatSante">${esc(p.etatSante)}</textarea></div>
      <div class="field">
        <label>Volonté de déménager</label>
        <div class="radio-group">
          <label class="radio-pill"><input type="radio" name="demenagement" value="oui" ${p.demenagement === "oui" ? "checked" : ""} required /><span>Oui</span></label>
          <label class="radio-pill"><input type="radio" name="demenagement" value="non" ${p.demenagement === "non" ? "checked" : ""} /><span>Non</span></label>
          <label class="radio-pill"><input type="radio" name="demenagement" value="peut_etre" ${p.demenagement === "peut_etre" ? "checked" : ""} /><span>Peut-être</span></label>
        </div>
      </div>

      <h3>Personnalité</h3>
      <div class="field"><label>Décrivez votre personnalité</label><textarea name="personnalite" required>${esc(p.personnalite)}</textarea></div>
      <div class="field-row">
        <div class="field"><label>Vos qualités</label><textarea name="qualites">${esc(p.qualites)}</textarea></div>
        <div class="field"><label>Vos défauts</label><textarea name="defauts">${esc(p.defauts)}</textarea></div>
      </div>
      <div class="field"><label>Centres d'intérêt</label><textarea name="centresInteret">${esc(p.centresInteret)}</textarea></div>
      <div class="field"><label>Objectifs de vie</label><textarea name="objectifsVie">${esc(p.objectifsVie)}</textarea></div>
      <div class="field"><label>Aspirations spirituelles</label><textarea name="aspirationsSpirituelles">${esc(p.aspirationsSpirituelles)}</textarea></div>

      <h3>Questions ouvertes</h3>
      <div class="field"><label>Parlez-nous de vous, de votre parcours, de ce qui vous définit</label><textarea name="questionOuverte1">${esc(p.questionOuverte1)}</textarea></div>
      <div class="field"><label>Qu'attendez-vous du mariage et de la vie de famille ?</label><textarea name="questionOuverte2">${esc(p.questionOuverte2)}</textarea></div>

      <button type="submit" class="btn btn-primary btn-block">Continuer</button>
    </form>
  </div>`;
  return layout({ title: "Mon profil", body, user, noindex: true });
}

const PROFIL_FIELDS = [
  "dateNaissance", "taille", "poids", "langues", "ville", "pays", "origine", "communaute", "minhag",
  "profession", "etudes", "niveauReligieux", "yeshiva", "ravReference", "situationFamiliale", "enfants",
  "etatSante", "demenagement", "personnalite", "qualites", "defauts", "centresInteret", "objectifsVie",
  "aspirationsSpirituelles", "questionOuverte1", "questionOuverte2",
];

function apiProfil(user, body) {
  const obligatoires = ["dateNaissance", "taille", "langues", "ville", "pays", "profession", "niveauReligieux", "situationFamiliale", "demenagement", "personnalite"];
  const missing = required(body, obligatoires);
  if (missing.length) return { error: "Merci de compléter tous les champs obligatoires du questionnaire." };

  withDb((db) => {
    let profile = db.profiles.find((p) => p.userId === user.id);
    if (!profile) {
      profile = { userId: user.id, prenom: user.prenom, sexe: user.sexe };
      db.profiles.push(profile);
    }
    for (const f of PROFIL_FIELDS) {
      profile[f] = clampStr(body[f], 3000);
    }
    profile.updatedAt = new Date().toISOString();
  });
  return { ok: true };
}

// ---------- Étape 4 : profil recherché ----------
function recherchePage(user, criteria, error) {
  const c = criteria || {};
  const body = `
  <div class="form-wide fade-up">
    ${stepper(4)}
    <h2>Le profil que vous recherchez</h2>
    <p class="muted">Ces informations aident l'IA et l'administrateur à cibler les compatibilités les plus pertinentes.</p>
    ${error ? `<div class="form-error">${esc(error)}</div>` : ""}
    <form class="js-form" data-endpoint="/api/onboarding/recherche" data-redirect="/onboarding/termine">
      <div class="field-row">
        <div class="field"><label>Âge minimum</label><input type="number" name="ageMin" min="18" max="99" value="${esc(c.ageMin)}" required /></div>
        <div class="field"><label>Âge maximum</label><input type="number" name="ageMax" min="18" max="99" value="${esc(c.ageMax)}" required /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Taille minimum (cm) <span class="hint">optionnel</span></label><input type="number" name="tailleMin" value="${esc(c.tailleMin)}" /></div>
        <div class="field"><label>Taille maximum (cm) <span class="hint">optionnel</span></label><input type="number" name="tailleMax" value="${esc(c.tailleMax)}" /></div>
      </div>
      <div class="field"><label>Niveau religieux souhaité</label><select name="niveauReligieux" required><option value="">— Choisir —</option>${selectOptions(NIVEAUX, c.niveauReligieux)}</select></div>
      <div class="field-row">
        <div class="field"><label>Origine souhaitée <span class="hint">optionnel</span></label><input type="text" name="origine" value="${esc(c.origine)}" /></div>
        <div class="field"><label>Communauté souhaitée <span class="hint">optionnel</span></label><input type="text" name="communaute" value="${esc(c.communaute)}" /></div>
      </div>
      <div class="field">
        <label>Volonté de déménager acceptée</label>
        <div class="radio-group">
          <label class="radio-pill"><input type="radio" name="demenagement" value="peu_importe" ${!c.demenagement || c.demenagement === "peu_importe" ? "checked" : ""} /><span>Peu importe</span></label>
          <label class="radio-pill"><input type="radio" name="demenagement" value="oui" ${c.demenagement === "oui" ? "checked" : ""} /><span>Doit être prêt(e) à déménager</span></label>
          <label class="radio-pill"><input type="radio" name="demenagement" value="non" ${c.demenagement === "non" ? "checked" : ""} /><span>Ne doit pas déménager</span></label>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Profession recherchée <span class="hint">optionnel</span></label><input type="text" name="profession" value="${esc(c.profession)}" /></div>
        <div class="field"><label>Études recherchées <span class="hint">optionnel</span></label><input type="text" name="etudes" value="${esc(c.etudes)}" /></div>
      </div>
      <div class="field"><label>Traits de caractère recherchés</label><textarea name="traitsRecherches">${esc(c.traitsRecherches)}</textarea></div>
      <div class="field"><label>Critères indispensables <span class="hint">un critère par ligne</span></label><textarea name="criteresIndispensables" placeholder="Ex : souhaite fonder une famille&#10;Pratique religieuse quotidienne">${esc(c.criteresIndispensables)}</textarea></div>
      <div class="field"><label>Critères secondaires <span class="hint">un critère par ligne</span></label><textarea name="criteresSecondaires">${esc(c.criteresSecondaires)}</textarea></div>
      <div class="field"><label>Critères rédhibitoires <span class="hint">un critère par ligne — ce que vous ne pouvez absolument pas accepter</span></label><textarea name="criteresRedhibitoires">${esc(c.criteresRedhibitoires)}</textarea></div>

      <button type="submit" class="btn btn-primary btn-block">Envoyer mon dossier pour validation</button>
    </form>
  </div>`;
  return layout({ title: "Profil recherché", body, user, noindex: true });
}

const CRITERIA_FIELDS = [
  "ageMin", "ageMax", "tailleMin", "tailleMax", "niveauReligieux", "origine", "communaute", "demenagement",
  "profession", "etudes", "traitsRecherches", "criteresIndispensables", "criteresSecondaires", "criteresRedhibitoires",
];

function apiRecherche(user, body) {
  const missing = required(body, ["ageMin", "ageMax", "niveauReligieux"]);
  if (missing.length) return { error: "Merci de compléter au moins la tranche d'âge et le niveau religieux souhaités." };

  withDb((db) => {
    let crit = db.criteria.find((c) => c.userId === user.id);
    if (!crit) {
      crit = { userId: user.id };
      db.criteria.push(crit);
    }
    for (const f of CRITERIA_FIELDS) {
      crit[f] = clampStr(body[f], 3000);
    }
    const u = db.users.find((x) => x.id === user.id);
    if (u && u.status !== "valide" && u.status !== "refuse" && u.status !== "suspendu") {
      u.status = "en_attente_validation";
    }
  });
  notify.email("admin", "Nouveau dossier complet à valider", `Le dossier de ${user.prenom} ${user.nom} est complet et attend une validation.`);
  return { ok: true };
}

function terminePage(user) {
  const body = `
  <div class="auth-wrap fade-up" style="max-width:520px;text-align:center">
    <div class="card-icon" style="margin:0 auto 18px">✓</div>
    <h2>Merci, votre dossier est complet</h2>
    <p>Il est maintenant entre les mains de notre équipe. Vous serez averti par e-mail dès qu'il aura été examiné.</p>
    <a href="/tableau-de-bord" class="btn btn-primary">Accéder à mon espace</a>
  </div>`;
  return layout({ title: "Dossier envoyé", body, user, noindex: true });
}

module.exports = {
  verificationPage, apiEnvoyerCode, apiVerifierCode,
  documentsPage, apiDocuments, saveUploadedFile,
  profilPage, apiProfil,
  recherchePage, apiRecherche,
  terminePage,
  NIVEAUX,
};
