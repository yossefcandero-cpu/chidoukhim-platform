"use strict";
// Moteur de compatibilité — scoring transparent et explicable (pas de "boîte noire").
// Chaque score est accompagné des raisons qui le justifient, pour que l'administrateur
// garde la décision finale. Voir README section "Intelligence artificielle" pour le
// principe et la piste d'amélioration (embeddings sémantiques / LLM).

const NIVEAU_RELIGIEUX_ECHELLE = {
  traditionaliste: 1,
  pratiquant: 2,
  dati_leumi: 3,
  pratiquant_engage: 3,
  litvish: 4,
  hassidique: 4,
  loubavitch: 4,
  haredi: 5,
  autre: 2.5,
};

const NIVEAU_RELIGIEUX_LABELS = {
  traditionaliste: "Traditionaliste",
  pratiquant: "Pratiquant",
  dati_leumi: "Dati leumi",
  pratiquant_engage: "Pratiquant engagé",
  litvish: "Litvish",
  hassidique: "Hassidique",
  loubavitch: "Loubavitch",
  haredi: "Harédi",
  autre: "Autre",
};

const STOPWORDS = new Set([
  "le","la","les","de","des","du","un","une","et","est","ou","a","au","aux",
  "pour","avec","que","qui","je","tu","il","elle","nous","vous","ils","elles",
  "mon","ma","mes","ton","ta","tes","son","sa","ses","ce","cette","ces","dans",
  "en","sur","par","plus","tres","très","bien","être","avoir","j'aime","aime",
  "aimer","d'un","d'une","l'un","l'une","être.",
]);

function age(dateNaissance) {
  if (!dateNaissance) return null;
  const d = new Date(dateNaissance);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9']+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

function splitLines(text) {
  if (!text) return [];
  return text
    .split(/\n|;|,(?=\s*[A-ZÀ-Ý])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function textContainsAny(haystack, needleTokens) {
  const hay = tokenize(haystack).join(" ");
  return needleTokens.some((t) => hay.includes(t));
}

// Évalue à quel point `profile` (+ ses infos) satisfait les critères `criteria`
// exprimés par l'autre partie. Retourne un sous-score 0-100 et des explications.
function scoreOneDirection(profile, criteria, otherLabel) {
  const notes = [];
  const warnings = [];
  let points = 0;
  let maxPoints = 0;

  // --- Âge ---
  maxPoints += 15;
  const a = age(profile.dateNaissance);
  if (a != null && (criteria.ageMin || criteria.ageMax)) {
    const min = Number(criteria.ageMin) || 0;
    const max = Number(criteria.ageMax) || 120;
    if (a >= min && a <= max) {
      points += 15;
      notes.push(`Âge (${a} ans) dans la tranche recherchée (${min}-${max} ans).`);
    } else {
      const ecart = a < min ? min - a : a - max;
      if (ecart <= 2) {
        points += 8;
        notes.push(`Âge (${a} ans) légèrement hors tranche recherchée (${min}-${max} ans), écart de ${ecart} an(s).`);
      } else {
        warnings.push(`Âge (${a} ans) hors de la tranche recherchée (${min}-${max} ans).`);
      }
    }
  } else {
    points += 10; // pas de critère précisé
  }

  // --- Taille ---
  maxPoints += 8;
  if (profile.taille && (criteria.tailleMin || criteria.tailleMax)) {
    const t = Number(profile.taille);
    const min = Number(criteria.tailleMin) || 0;
    const max = Number(criteria.tailleMax) || 300;
    if (t >= min && t <= max) {
      points += 8;
      notes.push(`Taille (${t} cm) conforme au souhait (${min}-${max} cm).`);
    } else {
      warnings.push(`Taille (${t} cm) hors du souhait (${min}-${max} cm).`);
    }
  } else {
    points += 6;
  }

  // --- Niveau religieux ---
  maxPoints += 20;
  if (profile.niveauReligieux && criteria.niveauReligieux) {
    const na = NIVEAU_RELIGIEUX_ECHELLE[profile.niveauReligieux] ?? 2.5;
    const nb = NIVEAU_RELIGIEUX_ECHELLE[criteria.niveauReligieux] ?? 2.5;
    const dist = Math.abs(na - nb);
    if (dist === 0) {
      points += 20;
      notes.push(`Niveau religieux identique (${NIVEAU_RELIGIEUX_LABELS[profile.niveauReligieux] || profile.niveauReligieux}).`);
    } else if (dist <= 1) {
      points += 13;
      notes.push(`Niveau religieux proche (${NIVEAU_RELIGIEUX_LABELS[profile.niveauReligieux] || profile.niveauReligieux} / ${NIVEAU_RELIGIEUX_LABELS[criteria.niveauReligieux] || criteria.niveauReligieux}).`);
    } else {
      warnings.push(`Écart de niveau religieux notable (${NIVEAU_RELIGIEUX_LABELS[profile.niveauReligieux] || profile.niveauReligieux} / ${NIVEAU_RELIGIEUX_LABELS[criteria.niveauReligieux] || criteria.niveauReligieux}).`);
    }
  } else {
    points += 10;
  }

  // --- Communauté / origine ---
  maxPoints += 10;
  if (criteria.communaute) {
    if ((profile.communaute || "").toLowerCase().trim() === criteria.communaute.toLowerCase().trim()) {
      points += 10;
      notes.push(`Même communauté (${profile.communaute}).`);
    } else {
      points += 3;
    }
  } else {
    points += 7;
  }
  if (criteria.origine) {
    maxPoints += 5;
    if ((profile.origine || "").toLowerCase().trim() === criteria.origine.toLowerCase().trim()) {
      points += 5;
      notes.push(`Origine correspondante (${profile.origine}).`);
    }
  }

  // --- Déménagement ---
  maxPoints += 7;
  if (criteria.demenagement && criteria.demenagement !== "peu_importe") {
    if (profile.demenagement === criteria.demenagement || profile.demenagement === "peut_etre") {
      points += 7;
      notes.push("Compatibilité sur la question du déménagement.");
    } else {
      warnings.push("Divergence sur la volonté de déménager.");
    }
  } else {
    points += 5;
  }

  // --- Critères indispensables (texte libre, correspondance best-effort) ---
  const indispensables = splitLines(criteria.criteresIndispensables);
  if (indispensables.length) {
    maxPoints += 20;
    const profileText = [
      profile.personnalite, profile.qualites, profile.centresInteret, profile.objectifsVie,
      profile.aspirationsSpirituelles, profile.profession, profile.etudes, profile.situationFamiliale,
      profile.niveauReligieux, profile.communaute, profile.villeText,
    ].filter(Boolean).join(" ");
    let satisfied = 0;
    indispensables.forEach((crit) => {
      const toks = tokenize(crit);
      if (toks.length && textContainsAny(profileText, toks)) {
        satisfied++;
      } else {
        warnings.push(`Critère indispensable à vérifier manuellement : « ${crit} ».`);
      }
    });
    points += Math.round((satisfied / indispensables.length) * 20);
    if (satisfied > 0) notes.push(`${satisfied}/${indispensables.length} critère(s) indispensable(s) détecté(s) automatiquement dans le dossier.`);
  }

  // --- Critères rédhibitoires ---
  const redhibitoires = splitLines(criteria.criteresRedhibitoires);
  if (redhibitoires.length) {
    const profileText = [
      profile.personnalite, profile.defauts, profile.situationFamiliale, profile.enfants,
      profile.etatSante, profile.niveauReligieux,
    ].filter(Boolean).join(" ");
    redhibitoires.forEach((crit) => {
      const toks = tokenize(crit);
      if (toks.length && textContainsAny(profileText, toks)) {
        points -= 25;
        warnings.push(`⚠️ Point potentiellement rédhibitoire détecté : « ${crit} » — à vérifier impérativement avant toute proposition.`);
      }
    });
  }

  // --- Critères secondaires (bonus) ---
  const secondaires = splitLines(criteria.criteresSecondaires);
  if (secondaires.length) {
    maxPoints += 10;
    const profileText = [
      profile.personnalite, profile.qualites, profile.centresInteret, profile.objectifsVie,
      profile.profession, profile.etudes,
    ].filter(Boolean).join(" ");
    let satisfied = 0;
    secondaires.forEach((crit) => {
      const toks = tokenize(crit);
      if (toks.length && textContainsAny(profileText, toks)) satisfied++;
    });
    points += Math.round((satisfied / secondaires.length) * 10);
    if (satisfied > 0) notes.push(`${satisfied}/${secondaires.length} critère(s) secondaire(s) retrouvé(s).`);
  }

  const pct = maxPoints > 0 ? Math.max(0, Math.min(100, Math.round((points / maxPoints) * 100))) : 50;
  return { pct, notes, warnings };
}

// Affinité de personnalité par recoupement des textes libres (indépendante du sens de lecture)
function personalityAffinity(profileA, profileB) {
  const textA = [profileA.personnalite, profileA.qualites, profileA.centresInteret, profileA.objectifsVie, profileA.aspirationsSpirituelles].filter(Boolean).join(" ");
  const textB = [profileB.personnalite, profileB.qualites, profileB.centresInteret, profileB.objectifsVie, profileB.aspirationsSpirituelles].filter(Boolean).join(" ");
  const sim = jaccard(tokenize(textA), tokenize(textB));
  const commonTokens = tokenize(textA).filter((t) => tokenize(textB).includes(t));
  const uniqueCommon = [...new Set(commonTokens)].slice(0, 8);
  return { sim, uniqueCommon };
}

/**
 * Calcule la compatibilité mutuelle entre deux dossiers.
 * @returns {{score:number, explanation:string[], warnings:string[]}}
 */
function computeCompatibility(profileA, criteriaA, profileB, criteriaB) {
  if (!profileA || !profileB) return { score: 0, explanation: [], warnings: ["Dossier incomplet."] };
  if (profileA.sexe && profileB.sexe && profileA.sexe === profileB.sexe) {
    return { score: 0, explanation: [], warnings: ["Les deux profils ne sont pas de sexe opposé."] };
  }

  const aWantsB = scoreOneDirection(profileB, criteriaA || {}, "B");
  const bWantsA = scoreOneDirection(profileA, criteriaB || {}, "A");
  const { sim, uniqueCommon } = personalityAffinity(profileA, profileB);

  const baseScore = Math.round((aWantsB.pct * 0.45 + bWantsA.pct * 0.45 + sim * 100 * 0.10));
  const score = Math.max(0, Math.min(100, baseScore));

  const explanation = [
    ...aWantsB.notes.map((n) => `• ${n}`),
    ...bWantsA.notes.map((n) => `• ${n}`),
  ];
  if (uniqueCommon.length) {
    explanation.push(`• Points communs relevés dans les descriptions libres : ${uniqueCommon.join(", ")}.`);
  }
  const warnings = [...aWantsB.warnings, ...bWantsA.warnings];

  return { score, explanation, warnings };
}

// Classe toutes les candidates/candidats compatibles avec un profil donné.
function rankCandidates(target, targetCriteria, pool /* [{profile, criteria}] */, limit = 5) {
  const results = pool
    .map(({ profile, criteria }) => ({
      profile,
      ...computeCompatibility(target, targetCriteria, profile, criteria),
    }))
    .filter((r) => r.profile.userId !== target.userId)
    .sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

module.exports = {
  age,
  computeCompatibility,
  rankCandidates,
  NIVEAU_RELIGIEUX_LABELS,
  NIVEAU_RELIGIEUX_ECHELLE,
};
