// Petite base de données JSON persistée sur disque.
// Suffisant pour une démo / un premier déploiement à échelle modeste.
// Pour la montée en charge (voir README), remplacer par PostgreSQL/MySQL
// en conservant EXACTEMENT le même schéma de collections/champs.
"use strict";
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

function emptyDb() {
  return {
    users: [],        // comptes (candidats + admin)
    profiles: [],      // dossier personnel détaillé
    criteria: [],       // profil recherché
    documents: [],      // pièce d'identité / selfie / photos privées
    notes: [],           // notes privées admin sur un profil
    propositions: [],     // compatibilités proposées par l'IA / l'admin
    auditLogs: [],         // journal des actions admin
    otps: [],                // codes de vérification email/téléphone
    sessions: [],              // sessions de connexion
  };
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(emptyDb(), null, 2));
  }
}

let cache = null;

function load() {
  ensureStore();
  if (!cache) {
    cache = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    // migration douce : s'assurer que toutes les collections existent
    const base = emptyDb();
    for (const key of Object.keys(base)) {
      if (!Array.isArray(cache[key])) cache[key] = base[key];
    }
  }
  return cache;
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
}

function withDb(fn) {
  const db = load();
  const result = fn(db);
  save();
  return result;
}

function uid(prefix) {
  const id = require("crypto").randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

module.exports = { load, save, withDb, uid, UPLOADS_DIR, DATA_DIR };
