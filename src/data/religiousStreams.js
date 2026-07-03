"use strict";
// Liste des courants / mouvements religieux — sélection multiple possible.
// "scale" est une échelle indicative de 1 (traditionaliste) à 6 (harédi / hassidique
// rigoureux), utilisée uniquement par le moteur de compatibilité pour estimer une
// proximité de pratique. Elle n'exprime aucun jugement de valeur : c'est un simple
// repère explicable, toujours doublé d'une décision humaine (le Shadkhan).
const STREAMS = [
  { code: "haredi", label: "Harédi", scale: 6 },
  { code: "litvish", label: "Litvish", scale: 5 },
  { code: "yeshivish", label: "Yeshivish", scale: 5 },
  { code: "hassidique", label: "Hassidique", scale: 6 },
  { code: "breslev", label: "Breslev", scale: 5 },
  { code: "loubavitch", label: "Loubavitch ('Habad)", scale: 5 },
  { code: "belz", label: "Belz", scale: 6 },
  { code: "gour", label: "Gour (Gur)", scale: 6 },
  { code: "vizhnitz", label: "Vizhnitz", scale: 6 },
  { code: "satmar", label: "Satmar", scale: 6 },
  { code: "sefarade_torah", label: "Séfarade Torah", scale: 5 },
  { code: "ben_torah", label: "Ben Torah", scale: 4 },
  { code: "dati_leoumi", label: "Dati Leoumi", scale: 3 },
  { code: "dati_leoumi_torani", label: "Dati Leoumi Torani", scale: 4 },
  { code: "torani", label: "Torani", scale: 4 },
  { code: "traditionaliste", label: "Traditionaliste", scale: 1 },
  { code: "massorti", label: "Massorti", scale: 1 },
  { code: "baal_techouva", label: "Baal Techouva", scale: 3 },
  { code: "converti", label: "Converti", scale: 3 },
  { code: "autre", label: "Autre", scale: 3 },
];

const STREAM_LABELS = Object.fromEntries(STREAMS.map((s) => [s.code, s.label]));
const STREAM_SCALE = Object.fromEntries(STREAMS.map((s) => [s.code, s.scale]));

function streamLabels(codes) {
  if (!Array.isArray(codes)) return [];
  return codes.map((c) => STREAM_LABELS[c] || c).filter(Boolean);
}

module.exports = { STREAMS, STREAM_LABELS, STREAM_SCALE, streamLabels };
