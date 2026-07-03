"use strict";
const { layout, esc, timeAgo } = require("../render");
const { load, withDb, uid } = require("../db");
const { logAudit } = require("../auth");
const { age, computeCompatibility, rankCandidates, streamLabelList, streamCodes } = require("../matching");
const { notify } = require("../notify");
const { clampStr } = require("../validators");
const { STREAMS } = require("../data/religiousStreams");
const { buildProfileAnalysis } = require("../aiAnalysis");
const { QUICK_MESSAGES, threadForUser, sendFromAdmin } = require("../messages");
const { createNotification } = require("../notifications");

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const STATUT_ADMIN_LABELS = {
  en_attente_verification: "Vérification en cours",
  en_attente_validation: "À valider",
  valide: "Validé",
  refuse: "Refusé",
  suspendu: "Suspendu",
};

const STATUT_NOTIF_MESSAGES = {
  valide: "Bonne nouvelle : votre dossier a été validé par notre équipe.",
  refuse: "Votre dossier a été examiné. Contactez l'équipe pour plus d'informations.",
  suspendu: "Votre dossier a été temporairement suspendu par l'équipe.",
  en_attente_validation: "Votre dossier a été repassé en attente de validation.",
};

function statusBadge(status, labels) {
  const map = labels || STATUT_ADMIN_LABELS;
  return `<span class="status-pill status-${esc(status)}">${esc(map[status] || status)}</span>`;
}

// ---------- Tableau de bord ----------
function adminDashboardPage(user) {
  const db = load();
  const candidats = db.users.filter((u) => u.role === "candidate");
  const counts = {};
  candidats.forEach((u) => { counts[u.status] = (counts[u.status] || 0) + 1; });
  const hommes = candidats.filter((u) => u.sexe === "H").length;
  const femmes = candidats.filter((u) => u.sexe === "F").length;
  const propositions = db.propositions;
  const matchs = propositions.filter((p) => p.status === "match_mutuel").length;

  const recentLogs = [...db.auditLogs].reverse().slice(0, 12);

  // ---- Analyse IA agrégée ----
  const scores = propositions.map((p) => p.score).filter((s) => typeof s === "number");
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const highScore = scores.filter((s) => s >= 75).length;
  const mutualRate = propositions.length ? Math.round((matchs / propositions.length) * 100) : 0;
  const validesPretsAuMatching = candidats.filter((u) => u.status === "valide").length;

  const statCards = [
    { icon: "◎", num: candidats.length, label: "Dossiers créés" },
    { icon: "⏳", num: counts.en_attente_validation || 0, label: "À valider" },
    { icon: "✓", num: counts.valide || 0, label: "Validés" },
    { icon: "⚥", num: `${hommes} / ${femmes}`, label: "Hommes / Femmes" },
    { icon: "✦", num: matchs, label: "Intérêts mutuels" },
  ];

  const body = `
  <div class="stat-grid fade-up">
    ${statCards.map((s) => `<div class="stat-card"><div class="card-icon" style="margin-bottom:10px">${s.icon}</div><div class="num">${s.num}</div><div class="label">${esc(s.label)}</div></div>`).join("")}
  </div>

  <div class="ai-panel fade-up delay-1" style="margin-bottom:32px">
    <span class="ai-badge">✦ Analyse IA</span>
    <h3>Le moteur de compatibilité en un coup d'œil</h3>
    <p>Synthèse des scores calculés par le moteur explicable sur l'ensemble des compatibilités proposées. L'intelligence artificielle assiste le Shadkhan — elle ne décide jamais à sa place.</p>
    <div class="ai-metric-grid">
      <div class="ai-metric"><div class="num">${avgScore}%</div><div class="lbl">Score moyen</div></div>
      <div class="ai-metric"><div class="num">${highScore}</div><div class="lbl">Compatibilités ≥ 75%</div></div>
      <div class="ai-metric"><div class="num">${mutualRate}%</div><div class="lbl">Taux d'intérêt mutuel</div></div>
      <div class="ai-metric"><div class="num">${validesPretsAuMatching}</div><div class="lbl">Profils prêts au matching</div></div>
      <div class="ai-metric"><div class="num">${propositions.length}</div><div class="lbl">Compatibilités générées</div></div>
      <div class="ai-metric"><div class="num">${db.documents.filter(d=>d.type==="piece_identite").length}</div><div class="lbl">Identités vérifiées</div></div>
    </div>
  </div>

  <div class="detail-grid">
    <div>
      <div class="section-title-row"><h3 style="margin:0">Dossiers à traiter en priorité</h3><a href="/admin/profils?statut=en_attente_validation">Voir tout →</a></div>
      <table class="data-table">
        <thead><tr><th>Prénom</th><th>Âge</th><th>Ville</th><th>Statut</th><th>Créé le</th><th></th></tr></thead>
        <tbody>
        ${candidats.filter(u => u.status === "en_attente_validation").slice(0,8).map((u) => {
          const p = db.profiles.find((pr) => pr.userId === u.id);
          return `<tr>
            <td>${esc(u.prenom)}</td>
            <td>${p ? (age(p.dateNaissance) || "—") : "—"}</td>
            <td>${p ? esc(p.ville) : "—"}</td>
            <td>${statusBadge(u.status)}</td>
            <td>${fmtDate(u.createdAt)}</td>
            <td><a href="/admin/profils/${u.id}" class="btn btn-sm btn-outline">Ouvrir</a></td>
          </tr>`;
        }).join("") || `<tr><td colspan="6" class="muted">Aucun dossier en attente.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div>
      <h3>Journal des actions récentes</h3>
      <div class="card">
        ${recentLogs.map((l) => `<div class="note-item"><div>${esc(l.action)}</div><div class="meta">${fmtDate(l.createdAt)} · ${esc(l.details || "")}</div></div>`).join("") || '<p class="muted">Aucune action enregistrée.</p>'}
      </div>
    </div>
  </div>`;
  return layout({ title: "Administration", body, user, active: "admin", noindex: true });
}

// ---------- Liste des profils ----------
function adminProfilsPage(user, query) {
  const db = load();
  let candidats = db.users.filter((u) => u.role === "candidate");
  const q = (query.q || "").toLowerCase().trim();
  if (q) {
    candidats = candidats.filter((u) =>
      (u.prenom + " " + u.nom + " " + u.email).toLowerCase().includes(q)
    );
  }
  if (query.statut) candidats = candidats.filter((u) => u.status === query.statut);
  if (query.sexe) candidats = candidats.filter((u) => u.sexe === query.sexe);
  candidats.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const options = Object.entries(STATUT_ADMIN_LABELS)
    .map(([v, l]) => `<option value="${v}" ${query.statut === v ? "selected" : ""}>${esc(l)}</option>`).join("");

  const rows = candidats.map((u) => {
    const p = db.profiles.find((pr) => pr.userId === u.id);
    return `<tr>
      <td>${esc(u.prenom)} ${esc(u.nom)}</td>
      <td>${u.sexe === "H" ? "Homme" : "Femme"}</td>
      <td>${p ? (age(p.dateNaissance) || "—") : "—"}</td>
      <td>${p ? esc(p.ville) : "—"}</td>
      <td>${p ? esc(streamLabelList(streamCodes(p)).join(", ")) : "—"}</td>
      <td>${statusBadge(u.status)}</td>
      <td>${fmtDate(u.createdAt)}</td>
      <td><a href="/admin/profils/${u.id}" class="btn btn-sm btn-outline">Ouvrir</a></td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" class="muted" style="text-align:center;padding:30px">Aucun résultat.</td></tr>`;

  const body = `
  <div class="admin-toolbar fade-up">
    <h2 style="margin:0">Profils <span class="muted" style="font-weight:500">(${candidats.length})</span></h2>
    <form method="GET" class="admin-toolbar" style="gap:10px">
      <div class="admin-search"><input type="text" name="q" placeholder="Rechercher un nom, e-mail…" value="${esc(query.q || "")}" /></div>
      <select name="statut" onchange="this.form.submit()"><option value="">Tous les statuts</option>${options}</select>
      <select name="sexe" onchange="this.form.submit()">
        <option value="">Tous</option>
        <option value="H" ${query.sexe === "H" ? "selected" : ""}>Hommes</option>
        <option value="F" ${query.sexe === "F" ? "selected" : ""}>Femmes</option>
      </select>
      <button class="btn btn-sm btn-outline" type="submit">Filtrer</button>
    </form>
  </div>
  <table class="data-table fade-up delay-1">
    <thead><tr><th>Nom</th><th>Sexe</th><th>Âge</th><th>Ville</th><th>Courant(s)</th><th>Statut</th><th>Créé le</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  return layout({ title: "Profils", body, user, active: "profils", noindex: true });
}

// ---------- Détail d'un profil ----------
function infoItem(k, v) {
  return `<div class="info-item"><div class="k">${esc(k)}</div><div class="v">${esc(v) || "—"}</div></div>`;
}

function renderAnalysisPanel(target, analysis) {
  if (!analysis) return '<p class="muted">Dossier incomplet — analyse indisponible.</p>';
  const ringCirc = 2 * Math.PI * 24;
  const suggestionsHtml = analysis.suggestions.map((s) => `
    <div class="candidate-row">
      <div class="score-ring">
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle class="bg" cx="28" cy="28" r="24" fill="none" stroke-width="5"></circle>
          <circle class="fg" cx="28" cy="28" r="24" fill="none" stroke-width="5" stroke-dasharray="${ringCirc.toFixed(1)}" stroke-dashoffset="${(ringCirc * (1 - s.score / 100)).toFixed(1)}"></circle>
        </svg>
        <div class="val">${s.score}%</div>
      </div>
      <div style="flex:1">
        <strong>${esc(s.profile.prenom)}</strong> · ${age(s.profile.dateNaissance) || "—"} ans · ${esc(s.profile.ville)} · ${esc(streamLabelList(streamCodes(s.profile)).join(", "))}
        <ul class="explanation-list">
          ${s.explanation.slice(0, 4).map((e) => `<li>${esc(e)}</li>`).join("")}
          ${s.warnings.slice(0, 2).map((w) => `<li class="warning-list">${esc(w)}</li>`).join("")}
        </ul>
      </div>
      <div style="text-align:right">
        <button class="btn btn-gold btn-sm" onclick="proposer('${s.profile.userId}')">Proposer</button>
      </div>
    </div>`).join("") || '<p class="muted">Aucun profil validé de sexe opposé à comparer pour le moment.</p>';

  return `
    <div class="ai-inline-block">
      <div class="ai-completion"><div class="ai-completion-bar"><div style="width:${analysis.completion}%"></div></div><span>${analysis.completion}% du dossier exploité par l'IA</span></div>
      <h4>Résumé de personnalité</h4>
      <p>${esc(analysis.summary)}</p>
      <div class="ai-cols">
        <div>
          <h4>✓ Points forts</h4>
          <ul class="explanation-list">${analysis.strengths.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        </div>
        <div>
          <h4>⚠ Points d'attention</h4>
          <ul class="explanation-list warning-list">${analysis.attention.length ? analysis.attention.map((s) => `<li>${esc(s)}</li>`).join("") : '<li style="list-style:none;padding-left:0">Aucune alerte particulière.</li>'}</ul>
        </div>
      </div>
      <h4>Conseils pour le Shadkhan</h4>
      <ul class="explanation-list">${analysis.advice.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    </div>
    <div class="divider"></div>
    <h4 style="margin-bottom:14px">Compatibilités recommandées</h4>
    ${suggestionsHtml}`;
}

function adminProfilDetailPage(user, target, profile, criteria, documents, notes, analysis) {
  const p = profile || {};
  const c = criteria || {};

  const docThumbs = documents.map((d) => {
    const label = d.type === "piece_identite" ? "Pièce d'identité" : d.type === "selfie" ? "Selfie" : "Photo";
    const isImg = (d.mimeType || "").startsWith("image/");
    return `<div>
      <div class="doc-thumb">${isImg ? `<img src="/admin/documents/${d.id}" alt="${esc(label)}" />` : `<div style="padding:30px;text-align:center" class="muted">Document (${esc(d.mimeType)})</div>`}</div>
      <div class="muted" style="font-size:.78rem;margin-bottom:14px">${esc(label)} · <a href="/admin/documents/${d.id}" target="_blank">ouvrir</a></div>
    </div>`;
  }).join("") || '<p class="muted">Aucun document déposé.</p>';

  const notesHtml = notes.map((n) => `
    <div class="note-item">
      ${n.tag ? `<span class="tag-chip">${esc(n.tag)}</span>` : ""}
      <div>${esc(n.text)}</div>
      <div class="meta">${fmtDate(n.createdAt)}</div>
    </div>`).join("") || '<p class="muted">Aucune note pour le moment.</p>';

  const thread = threadForUser(target.id);
  const threadHtml = thread.map((m) => `
    <div class="msg-bubble ${m.from === "admin" ? "msg-out" : "msg-in"}" style="max-width:100%">
      <div class="msg-text">${esc(m.text)}</div>
      <div class="msg-time">${m.from === "admin" ? "Vous" : esc(target.prenom)} · ${esc(timeAgo(m.createdAt))}</div>
    </div>`).join("") || '<p class="muted">Aucun échange pour le moment.</p>';

  const quickOptions = QUICK_MESSAGES.map((q) => `<option value="${esc(q)}">${esc(q)}</option>`).join("");

  const body = `
    <div class="section-title-row fade-up">
      <h2 style="margin:0">${esc(target.prenom)} ${esc(target.nom)} ${statusBadge(target.status)}</h2>
      <a href="/admin/profils" class="muted">← Retour à la liste</a>
    </div>

    <div class="detail-grid fade-up delay-1">
      <div>
        <div class="card" style="margin-bottom:22px">
          <h3>Identité &amp; contact</h3>
          <div class="info-list">
            ${infoItem("Prénom", target.prenom)}
            ${infoItem("Nom", target.nom)}
            ${infoItem("Sexe", target.sexe === "H" ? "Homme" : "Femme")}
            ${infoItem("E-mail", target.email)}
            ${infoItem("Téléphone", target.telephone)}
            ${infoItem("E-mail vérifié", target.emailVerified ? "Oui" : "Non")}
            ${infoItem("Téléphone vérifié", target.phoneVerified ? "Oui" : "Non")}
            ${infoItem("Inscrit le", fmtDate(target.createdAt))}
          </div>
        </div>

        <div class="card" style="margin-bottom:22px">
          <h3>Dossier personnel</h3>
          <div class="info-list">
            ${infoItem("Âge", age(p.dateNaissance) ? age(p.dateNaissance) + " ans" : "—")}
            ${infoItem("Taille", p.taille ? p.taille + " cm" : "—")}
            ${infoItem("Poids", p.poids ? p.poids + " kg" : "—")}
            ${infoItem("Ville / Pays", [p.ville, p.pays].filter(Boolean).join(" / "))}
            ${infoItem("Langues", p.langues)}
            ${infoItem("Origine", p.origine)}
            ${infoItem("Communauté", p.communaute)}
            ${infoItem("Minhag", p.minhag)}
            ${infoItem("Profession", p.profession)}
            ${infoItem("Études", p.etudes)}
            ${infoItem("Courant(s) religieux", streamLabelList(streamCodes(p)).join(", ") + (p.courantAutre ? ` (${p.courantAutre})` : ""))}
            ${infoItem("Yéchiva / séminaire", p.yeshiva)}
            ${infoItem("Rav de référence", p.ravReference)}
            ${infoItem("Situation familiale", p.situationFamiliale)}
            ${infoItem("Enfants", p.enfants)}
            ${infoItem("État de santé", p.etatSante)}
            ${infoItem("Volonté de déménager", p.demenagement)}
          </div>
          <div style="margin-top:16px">
            ${infoItem("Personnalité", p.personnalite)}
            ${infoItem("Qualités", p.qualites)}
            ${infoItem("Défauts", p.defauts)}
            ${infoItem("Centres d'intérêt", p.centresInteret)}
            ${infoItem("Objectifs de vie", p.objectifsVie)}
            ${infoItem("Aspirations spirituelles", p.aspirationsSpirituelles)}
            ${infoItem("Question ouverte 1", p.questionOuverte1)}
            ${infoItem("Question ouverte 2", p.questionOuverte2)}
          </div>
        </div>

        <div class="card" style="margin-bottom:22px">
          <h3>Profil recherché</h3>
          <div class="info-list">
            ${infoItem("Âge souhaité", [c.ageMin, c.ageMax].filter(Boolean).join(" - "))}
            ${infoItem("Taille souhaitée", [c.tailleMin, c.tailleMax].filter(Boolean).join(" - "))}
            ${infoItem("Courant(s) souhaité(s)", streamLabelList(streamCodes(c)).join(", ") || "Peu importe")}
            ${infoItem("Origine souhaitée", c.origine)}
            ${infoItem("Communauté souhaitée", c.communaute)}
            ${infoItem("Déménagement accepté", c.demenagement)}
            ${infoItem("Profession recherchée", c.profession)}
            ${infoItem("Études recherchées", c.etudes)}
          </div>
          <div style="margin-top:16px">
            ${infoItem("Traits recherchés", c.traitsRecherches)}
            ${infoItem("Critères indispensables", c.criteresIndispensables)}
            ${infoItem("Critères secondaires", c.criteresSecondaires)}
            ${infoItem("Critères rédhibitoires", c.criteresRedhibitoires)}
          </div>
        </div>

        <div class="card" id="analyse-ia">
          <div class="section-title-row" style="margin-bottom:18px">
            <h3 style="margin:0"><span class="sec-ic" style="display:inline-flex;vertical-align:middle;margin-right:8px">✦</span>Analyse IA</h3>
            <button class="btn btn-gold btn-sm" id="btn-analyser" onclick="lancerAnalyse()">Trouver les meilleures compatibilités</button>
          </div>
          <div id="analyse-container">${renderAnalysisPanel(target, analysis)}</div>
        </div>
      </div>

      <div>
        <div class="card" style="margin-bottom:22px">
          <h3>Décision</h3>
          <div style="display:grid;gap:10px">
            <button class="btn btn-primary btn-sm" data-confirm="Valider ce dossier ?" onclick="changerStatut('valide')">✓ Valider le dossier</button>
            <button class="btn btn-outline btn-sm" data-confirm="Refuser ce dossier ?" onclick="changerStatut('refuse')">✕ Refuser</button>
            <button class="btn btn-outline btn-sm" data-confirm="Suspendre ce dossier ?" onclick="changerStatut('suspendu')">⏸ Suspendre</button>
            ${target.status !== "en_attente_validation" ? `<button class="btn btn-outline btn-sm" onclick="changerStatut('en_attente_validation')">↺ Repasser en attente</button>` : ""}
          </div>
        </div>

        <div class="card" style="margin-bottom:22px" id="messagerie">
          <h3>✉ Message au membre</h3>
          <p class="muted tiny" style="margin-top:-6px">Seul l'administrateur peut écrire à un membre — jamais l'inverse entre deux membres.</p>
          <div class="msg-thread" style="max-height:240px;margin-bottom:14px">${threadHtml}</div>
          <form class="js-form" data-endpoint="/api/admin/profils/${target.id}/message" data-redirect="/admin/profils/${target.id}#messagerie">
            <div class="field">
              <label>Message rapide</label>
              <select id="quick-select" onchange="document.querySelector('#messagerie textarea[name=text]').value=this.value">
                <option value="">— Choisir un message type —</option>
                ${quickOptions}
              </select>
            </div>
            <div class="field"><textarea name="text" placeholder="Votre message…" required></textarea></div>
            <button type="submit" class="btn btn-primary btn-sm btn-block">Envoyer le message</button>
          </form>
        </div>

        <div class="card" style="margin-bottom:22px">
          <h3>Documents privés</h3>
          ${docThumbs}
        </div>

        <div class="card">
          <h3>Notes privées (admin uniquement)</h3>
          <form class="js-form" data-endpoint="/api/admin/profils/${target.id}/notes" data-redirect="/admin/profils/${target.id}">
            <div class="field">
              <label>Étiquette</label>
              <select name="tag">
                <option value="Appelé">Appelé</option>
                <option value="En attente">En attente</option>
                <option value="Rav contacté">Rav contacté</option>
                <option value="Famille intéressée">Famille intéressée</option>
                <option value="Second rendez-vous">Second rendez-vous</option>
                <option value="Dossier suspendu">Dossier suspendu</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
            <div class="field"><textarea name="text" placeholder="Note privée…" required></textarea></div>
            <button type="submit" class="btn btn-outline btn-sm btn-block">Ajouter la note</button>
          </form>
          <div style="margin-top:16px">${notesHtml}</div>
        </div>
      </div>
    </div>
  <script>
  async function changerStatut(statut) {
    const res = await fetch('/api/admin/profils/${target.id}/statut', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({statut}) });
    const json = await res.json();
    if (json.ok) window.location.reload(); else toast(json.error || 'Erreur', 'error');
  }
  async function proposer(autreId) {
    const res = await fetch('/api/admin/propositions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({userAId:'${target.id}', userBId: autreId}) });
    const json = await res.json();
    if (json.ok) { toast('Proposition créée.', 'success'); window.location.href = '/admin/propositions'; } else toast(json.error || 'Erreur', 'error');
  }
  async function lancerAnalyse() {
    const btn = document.getElementById('btn-analyser');
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Analyse en cours…';
    try {
      const res = await fetch('/api/admin/profils/${target.id}/analyse', { method:'POST' });
      const json = await res.json();
      if (json.ok) { document.getElementById('analyse-container').innerHTML = json.html; if (window.animateScoreRings) window.animateScoreRings(); toast('Analyse mise à jour.', 'success'); }
      else toast(json.error || 'Erreur', 'error');
    } finally { btn.disabled = false; btn.textContent = label; }
  }
  </script>`;
  return layout({ title: `${target.prenom} ${target.nom}`, body, user, active: "profils", noindex: true });
}

function apiChangerStatut(admin, targetUserId, body) {
  const valid = ["valide", "refuse", "suspendu", "en_attente_validation"];
  if (!valid.includes(body.statut)) return { error: "Statut invalide." };
  const db = load();
  const target = db.users.find((u) => u.id === targetUserId && u.role === "candidate");
  if (!target) return { error: "Dossier introuvable." };
  withDb((db2) => {
    const t = db2.users.find((u) => u.id === targetUserId);
    t.status = body.statut;
  });
  logAudit(admin.id, `Statut du dossier changé en "${body.statut}"`, targetUserId, `${target.prenom} ${target.nom}`);
  createNotification(targetUserId, {
    type: "statut",
    title: "Mise à jour de votre dossier",
    body: STATUT_NOTIF_MESSAGES[body.statut] || `Le statut de votre dossier a changé : ${body.statut}.`,
    link: "/tableau-de-bord",
    toEmail: target.email,
    emailSubject: "Mise à jour de votre dossier Tipat Mazal",
    emailBody: STATUT_NOTIF_MESSAGES[body.statut] || `Le statut de votre dossier a changé : ${body.statut}.`,
  });
  return { ok: true };
}

function apiAjouterNote(admin, targetUserId, body) {
  if (!body.text || !String(body.text).trim()) return { error: "La note ne peut pas être vide." };
  withDb((db) => {
    db.notes.push({
      id: uid("note"),
      userId: targetUserId,
      authorAdminId: admin.id,
      text: clampStr(body.text, 2000),
      tag: body.tag || "",
      createdAt: new Date().toISOString(),
    });
  });
  logAudit(admin.id, "Note privée ajoutée", targetUserId, body.tag || "");
  return { ok: true };
}

function apiEnvoyerMessageAdmin(admin, targetUserId, body) {
  const result = sendFromAdmin(admin, targetUserId, body);
  if (!result.error) logAudit(admin.id, "Message envoyé au membre", targetUserId, (body.text || "").slice(0, 80));
  return result;
}

function apiAnalyserProfil(admin, targetUserId) {
  const db = load();
  const target = db.users.find((u) => u.id === targetUserId && u.role === "candidate");
  if (!target) return { error: "Dossier introuvable." };
  const analysis = buildProfileAnalysis(targetUserId);
  logAudit(admin.id, "Analyse IA relancée", targetUserId, "");
  return { ok: true, html: renderAnalysisPanel(target, analysis) };
}

function apiCreerProposition(admin, body) {
  const db = load();
  const userA = db.users.find((u) => u.id === body.userAId);
  const userB = db.users.find((u) => u.id === body.userBId);
  if (!userA || !userB) return { error: "Profil introuvable." };
  const profileA = db.profiles.find((p) => p.userId === userA.id);
  const profileB = db.profiles.find((p) => p.userId === userB.id);
  const criteriaA = db.criteria.find((c) => c.userId === userA.id);
  const criteriaB = db.criteria.find((c) => c.userId === userB.id);
  const result = computeCompatibility(profileA, criteriaA, profileB, criteriaB);

  const existing = db.propositions.find((p) =>
    (p.userAId === userA.id && p.userBId === userB.id) || (p.userAId === userB.id && p.userBId === userA.id)
  );
  if (existing) return { error: "Une proposition existe déjà entre ces deux personnes." };

  const prop = withDb((db2) => {
    const p = {
      id: uid("prop"),
      userAId: userA.id,
      userBId: userB.id,
      score: result.score,
      explanation: result.explanation,
      warnings: result.warnings,
      status: "proposee",
      reponseA: null,
      reponseB: null,
      photoSharedWithA: false,
      photoSharedWithB: false,
      adminNotes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db2.propositions.push(p);
    return p;
  });
  logAudit(admin.id, "Proposition de compatibilité créée", prop.id, `${userA.prenom} × ${userB.prenom} (${result.score}%)`);
  [userA, userB].forEach((u) => {
    createNotification(u.id, {
      type: "proposition",
      title: "Nouvelle proposition de compatibilité",
      body: `Une compatibilité (${result.score}%) a été identifiée pour vous.`,
      link: "/tableau-de-bord",
      toEmail: u.email,
      emailSubject: "Nouvelle proposition de compatibilité",
      emailBody: `Une nouvelle proposition de compatibilité (${result.score}%) est disponible dans votre espace.`,
    });
  });
  return { ok: true, proposition: prop };
}

// ---------- Compatibilités (liste) ----------
const PROP_LABELS = {
  proposee: "Proposée",
  interet_a: "Intérêt d'un côté",
  interet_b: "Intérêt d'un côté",
  match_mutuel: "Intérêt mutuel",
  refusee: "Déclinée",
  rdv: "Rendez-vous",
  suspendue: "Suspendue",
};

function scoreArc(score) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const offset = (circ * (1 - score / 100)).toFixed(1);
  const color = score >= 75 ? "var(--success)" : score >= 50 ? "var(--gold)" : "var(--muted-2)";
  return `<div class="score-ring" style="width:52px;height:52px">
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle class="bg" cx="26" cy="26" r="${r}" fill="none" stroke-width="5"></circle>
      <circle cx="26" cy="26" r="${r}" fill="none" stroke-width="5" stroke="${color}" stroke-linecap="round"
        stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset}" style="transition:stroke-dashoffset 1s var(--ease)"></circle>
    </svg>
    <div class="val">${score}%</div>
  </div>`;
}

function adminPropositionsPage(user, query) {
  const db = load();
  let props = [...db.propositions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (query.statut) props = props.filter((p) => p.status === query.statut);

  const options = Object.entries(PROP_LABELS)
    .map(([v, l]) => `<option value="${v}" ${query.statut === v ? "selected" : ""}>${esc(l)}</option>`).join("");

  const cards = props.map((pr) => {
    const a = db.users.find((u) => u.id === pr.userAId);
    const b = db.users.find((u) => u.id === pr.userBId);
    if (!a || !b) return "";
    return `<div class="card card-hover fade-up" style="display:flex;align-items:center;gap:22px;flex-wrap:wrap;margin-bottom:14px">
      ${scoreArc(pr.score)}
      <div style="flex:1;min-width:220px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <strong>${esc(a.prenom)} ${esc(a.nom)}</strong>
          <span class="muted">×</span>
          <strong>${esc(b.prenom)} ${esc(b.nom)}</strong>
          ${statusBadge(pr.status, PROP_LABELS)}
        </div>
        <div class="muted tiny" style="margin-top:6px">Créée le ${fmtDate(pr.createdAt)}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn btn-sm btn-outline" onclick="statut('${pr.id}','rdv')">📅 RDV</button>
        <button class="btn btn-sm btn-outline" data-confirm="Suspendre cette proposition ?" onclick="statut('${pr.id}','suspendue')">⏸ Suspendre</button>
        <button class="btn btn-sm btn-gold" onclick="partager('${pr.id}','A')">📷 → ${esc(a.prenom)}</button>
        <button class="btn btn-sm btn-gold" onclick="partager('${pr.id}','B')">📷 → ${esc(b.prenom)}</button>
      </div>
    </div>`;
  }).join("") || `<div class="empty-state"><div class="ei">✦</div>Aucune proposition pour ce filtre.</div>`;

  const body = `
  <div class="admin-toolbar fade-up">
    <h2 style="margin:0">Compatibilités proposées <span class="muted" style="font-weight:500">(${props.length})</span></h2>
    <form method="GET">
      <select name="statut" onchange="this.form.submit()"><option value="">Tous les statuts</option>${options}</select>
    </form>
  </div>
  ${cards}
  <script>
  async function statut(id, statut) {
    const res = await fetch('/api/admin/propositions/' + id + '/statut', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({statut}) });
    const json = await res.json();
    if (json.ok) window.location.reload(); else toast(json.error || 'Erreur', 'error');
  }
  async function partager(id, cote) {
    const res = await fetch('/api/admin/propositions/' + id + '/photo', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({cote}) });
    const json = await res.json();
    if (json.ok) { toast('Photo partagée.', 'success'); } else toast(json.error || 'Erreur', 'error');
  }
  </script>`;
  return layout({ title: "Compatibilités", body, user, active: "propositions", noindex: true });
}

function apiChangerStatutProposition(admin, propId, body) {
  const valid = ["proposee", "rdv", "suspendue", "refusee", "match_mutuel"];
  if (!valid.includes(body.statut)) return { error: "Statut invalide." };
  const db = load();
  const prop = db.propositions.find((p) => p.id === propId);
  if (!prop) return { error: "Proposition introuvable." };
  withDb((db2) => {
    const p2 = db2.propositions.find((x) => x.id === propId);
    p2.status = body.statut;
    p2.updatedAt = new Date().toISOString();
  });
  logAudit(admin.id, `Statut de la proposition changé en "${body.statut}"`, propId, "");
  return { ok: true };
}

function apiPartagerPhoto(admin, propId, body) {
  if (!["A", "B"].includes(body.cote)) return { error: "Côté invalide." };
  const db = load();
  const prop = db.propositions.find((p) => p.id === propId);
  if (!prop) return { error: "Proposition introuvable." };
  const targetUserId = body.cote === "A" ? prop.userAId : prop.userBId;
  const otherUserId = body.cote === "A" ? prop.userBId : prop.userAId;
  const otherHasPhoto = db.documents.some((d) => d.userId === otherUserId && d.type === "photo");
  if (!otherHasPhoto) return { error: "La personne concernée n'a pas encore déposé de photo privée à partager." };
  withDb((db2) => {
    const p2 = db2.propositions.find((x) => x.id === propId);
    if (body.cote === "A") p2.photoSharedWithA = true; else p2.photoSharedWithB = true;
  });
  logAudit(admin.id, `Photo partagée avec le côté ${body.cote}`, propId, "");
  return { ok: true };
}

// ---------- Messagerie (vue d'ensemble admin) ----------
function adminMessagesPage(user) {
  const db = load();
  const candidats = db.users.filter((u) => u.role === "candidate");
  const rows = candidats
    .map((u) => {
      const thread = threadForUser(u.id);
      if (!thread.length) return null;
      const last = thread[thread.length - 1];
      const unread = thread.filter((m) => m.from === "user").length; // simple indicateur d'activité membre
      return { u, last, count: thread.length, unread };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.last.createdAt) - new Date(a.last.createdAt));

  const items = rows.map(({ u, last, count }) => `
    <a href="/admin/profils/${u.id}#messagerie" class="card card-hover fade-up" style="display:flex;gap:16px;align-items:center;margin-bottom:12px">
      <div class="card-icon" style="margin-bottom:0">✉</div>
      <div style="flex:1;min-width:0">
        <strong>${esc(u.prenom)} ${esc(u.nom)}</strong>
        <div class="muted tiny" style="margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${last.from === "admin" ? "Vous : " : ""}${esc(last.text)}</div>
      </div>
      <div class="muted tiny">${count} message${count > 1 ? "s" : ""} · ${esc(timeAgo(last.createdAt))}</div>
    </a>`).join("") || `<div class="empty-state"><div class="ei">✉</div>Aucune conversation pour le moment. Écrivez depuis la fiche d'un membre.</div>`;

  const body = `
  <div class="section-title-row fade-up"><h2 style="margin:0">Messagerie</h2></div>
  <p class="muted" style="margin-top:-10px">Seul l'administrateur peut initier une conversation avec un membre. Les membres ne peuvent jamais s'écrire entre eux.</p>
  ${items}`;
  return layout({ title: "Messagerie", body, user, active: "messages", noindex: true });
}

function buildSuggestions(target, targetUserId) {
  const analysis = buildProfileAnalysis(targetUserId);
  return analysis ? analysis.suggestions : [];
}

module.exports = {
  adminDashboardPage, adminProfilsPage, adminProfilDetailPage,
  apiChangerStatut, apiAjouterNote, apiCreerProposition,
  adminPropositionsPage, apiChangerStatutProposition, apiPartagerPhoto,
  buildSuggestions, apiEnvoyerMessageAdmin, apiAnalyserProfil, adminMessagesPage,
  renderAnalysisPanel,
};
