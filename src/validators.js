"use strict";

function isEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function isPhone(v) {
  return typeof v === "string" && /^\+?[0-9 ()-]{6,20}$/.test(v);
}
function required(obj, fields) {
  const missing = fields.filter((f) => obj[f] == null || String(obj[f]).trim() === "");
  return missing;
}
function clampStr(v, max = 4000) {
  if (v == null) return "";
  return String(v).slice(0, max);
}

module.exports = { isEmail, isPhone, required, clampStr };
