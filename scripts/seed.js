"use strict";
// Crée (ou met à jour) le compte administrateur initial à partir des variables
// d'environnement ADMIN_EMAIL / ADMIN_PASSWORD (voir .env.example).
const path = require("path");
const fs = require("fs");

(function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const l = line.trim();
    if (!l || l.startsWith("#")) return;
    const idx = l.indexOf("=");
    if (idx === -1) return;
    const key = l.slice(0, idx).trim();
    let val = l.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  });
})();

const { withDb, uid } = require("../src/db");
const { hashPassword } = require("../src/auth");

const email = (process.env.ADMIN_EMAIL || "admin@chidoukhim.example").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "change-moi-mot-de-passe-fort";

withDb((db) => {
  let admin = db.users.find((u) => u.email === email);
  if (admin) {
    admin.passwordHash = hashPassword(password);
    admin.role = "admin";
    console.log(`Compte administrateur mis à jour : ${email}`);
  } else {
    db.users.push({
      id: uid("user"),
      role: "admin",
      prenom: "Administrateur",
      nom: "Tipat Mazal",
      sexe: "H",
      email,
      telephone: "",
      passwordHash: hashPassword(password),
      status: "valide",
      emailVerified: true,
      phoneVerified: true,
      createdAt: new Date().toISOString(),
    });
    console.log(`Compte administrateur créé : ${email}`);
  }
});
console.log("Mot de passe : (celui défini dans .env — ADMIN_PASSWORD)");
