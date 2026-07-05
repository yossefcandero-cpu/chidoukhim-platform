"use strict";
// Générateur PDF minimal, écrit à la main, sans dépendance externe — cohérent
// avec le principe "aucune dépendance externe" du projet. Supporte : plusieurs
// pages, texte avec retour à la ligne automatique, gras, titres, séparateurs.
// Suffisant pour exporter proprement une fiche candidat.

function sanitizeLatin1(input) {
  let s = String(input == null ? "" : input);
  s = s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code <= 255 ? s[i] : "?";
  }
  return out;
}

function escapePdfText(str) {
  return sanitizeLatin1(str).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

class SimplePdf {
  constructor({ pageWidth = 595.28, pageHeight = 841.89, margin = 54 } = {}) {
    this.pageWidth = pageWidth;
    this.pageHeight = pageHeight;
    this.margin = margin;
    this.pages = [];
    this._newPage();
  }

  _newPage() {
    this.currentOps = [];
    this.pages.push(this.currentOps);
    this.cursorY = this.pageHeight - this.margin;
  }

  _ensureSpace(lineHeight) {
    if (this.cursorY - lineHeight < this.margin) this._newPage();
  }

  _wrapText(text, fontSize, maxWidth) {
    const avgCharWidth = fontSize * 0.52;
    const maxChars = Math.max(10, Math.floor(maxWidth / avgCharWidth));
    const raw = sanitizeLatin1(text);
    const paragraphs = raw.split(/\r?\n/);
    const lines = [];
    for (const para of paragraphs) {
      if (!para.trim()) { lines.push(""); continue; }
      const words = para.split(/\s+/).filter(Boolean);
      let line = "";
      for (const w of words) {
        const candidate = line ? line + " " + w : w;
        if (candidate.length > maxChars && line) {
          lines.push(line);
          line = w;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  heading(text, { size = 15 } = {}) {
    this.addText(text, { size, bold: true, gap: 10 });
  }

  subheading(text, { size = 12 } = {}) {
    this.addSpacer(4);
    this.addText(text, { size, bold: true, gap: 6 });
  }

  addText(text, { size = 10.5, bold = false, gap = 8 } = {}) {
    const font = bold ? "/F2" : "/F1";
    const lineHeight = size * 1.32;
    const maxWidth = this.pageWidth - this.margin * 2;
    const lines = this._wrapText(text, size, maxWidth);
    for (const line of lines) {
      this._ensureSpace(lineHeight);
      this.cursorY -= lineHeight;
      this.currentOps.push(
        `BT ${font} ${size} Tf 1 0 0 1 ${this.margin.toFixed(2)} ${this.cursorY.toFixed(2)} Tm (${escapePdfText(line)}) Tj ET`
      );
    }
    this.cursorY -= gap;
  }

  labelValue(label, value, opts = {}) {
    this.addText(`${label} : ${value && String(value).trim() ? value : "(non renseigné)"}`, { size: 10.5, gap: 4, ...opts });
  }

  addSpacer(h = 10) {
    this.cursorY -= h;
  }

  addRule() {
    this._ensureSpace(12);
    this.currentOps.push(
      `0.78 0.75 0.68 RG 0.8 w ${this.margin.toFixed(2)} ${this.cursorY.toFixed(2)} m ${(this.pageWidth - this.margin).toFixed(2)} ${this.cursorY.toFixed(2)} l S`
    );
    this.cursorY -= 14;
  }

  build() {
    const chunks = [];
    let offset = 0;
    const offsets = [null];

    function push(strOrBuf) {
      const buf = Buffer.isBuffer(strOrBuf) ? strOrBuf : Buffer.from(strOrBuf, "latin1");
      chunks.push(buf);
      offset += buf.length;
    }

    const P = this.pages.length;
    const catalogNum = 1;
    const pagesNum = 2;
    const fontRegularNum = 3;
    const fontBoldNum = 4;
    let nextNum = 5;
    const pageNums = [];
    const contentNums = [];
    for (let i = 0; i < P; i++) {
      pageNums.push(nextNum++);
      contentNums.push(nextNum++);
    }
    const totalObjs = nextNum - 1;

    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    offsets[catalogNum] = offset;
    push(`${catalogNum} 0 obj\n<< /Type /Catalog /Pages ${pagesNum} 0 R >>\nendobj\n`);

    offsets[pagesNum] = offset;
    push(`${pagesNum} 0 obj\n<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${P} >>\nendobj\n`);

    offsets[fontRegularNum] = offset;
    push(`${fontRegularNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);

    offsets[fontBoldNum] = offset;
    push(`${fontBoldNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`);

    for (let i = 0; i < P; i++) {
      offsets[pageNums[i]] = offset;
      push(
        `${pageNums[i]} 0 obj\n<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Resources << /Font << /F1 ${fontRegularNum} 0 R /F2 ${fontBoldNum} 0 R >> >> /Contents ${contentNums[i]} 0 R >>\nendobj\n`
      );

      const content = this.pages[i].join("\n");
      const contentBuf = Buffer.from(content, "latin1");
      offsets[contentNums[i]] = offset;
      push(`${contentNums[i]} 0 obj\n<< /Length ${contentBuf.length} >>\nstream\n`);
      push(contentBuf);
      push(`\nendstream\nendobj\n`);
    }

    const xrefStart = offset;
    push(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
    for (let n = 1; n <= totalObjs; n++) {
      push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
    }
    push(`trailer\n<< /Size ${totalObjs + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

    return Buffer.concat(chunks);
  }
}

module.exports = { SimplePdf };
