(function () {
  "use strict";

  // ---------- notifications discrètes (remplace window.alert) ----------
  function ensureToastStack() {
    let stack = document.getElementById("toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }
  window.toast = function toast(message, type) {
    if (!message) return;
    const stack = ensureToastStack();
    const el = document.createElement("div");
    el.className = "toast" + (type === "error" ? " toast-error" : type === "success" ? " toast-success" : "");
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add("toast-out");
      setTimeout(() => el.remove(), 260);
    }, 3600);
  };

  // ---------- animation des anneaux de score de compatibilité ----------
  function animateScoreRings() {
    document.querySelectorAll(".score-ring svg").forEach((svg) => {
      const circles = svg.querySelectorAll("circle");
      const fg = circles[1];
      if (!fg) return;
      const target = fg.getAttribute("stroke-dashoffset");
      const full = fg.getAttribute("stroke-dasharray");
      fg.style.transition = "none";
      fg.setAttribute("stroke-dashoffset", full);
      requestAnimationFrame(() => {
        fg.style.transition = "stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)";
        requestAnimationFrame(() => fg.setAttribute("stroke-dashoffset", target));
      });
    });
  }
  window.animateScoreRings = animateScoreRings;
  document.addEventListener("DOMContentLoaded", animateScoreRings);

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function serializeForm(form) {
    const data = {};
    const els = Array.from(form.elements).filter((el) => el.name);
    for (const el of els) {
      if (el.type === "file") {
        if (el.files && el.files[0]) {
          const dataUrl = await fileToDataUrl(el.files[0]);
          data[el.name] = { dataUrl, name: el.files[0].name, type: el.files[0].type };
        }
      } else if (el.type === "checkbox") {
        if (form.querySelectorAll(`[name="${el.name}"]`).length > 1) {
          data[el.name] = data[el.name] || [];
          if (el.checked) data[el.name].push(el.value);
        } else {
          data[el.name] = el.checked;
        }
      } else if (el.type === "radio") {
        if (el.checked) data[el.name] = el.value;
      } else {
        data[el.name] = el.value;
      }
    }
    return data;
  }

  function showError(form, message) {
    let box = form.querySelector(".js-form-error");
    if (!box) {
      box = document.createElement("div");
      box.className = "form-error js-form-error";
      form.prepend(box);
    }
    box.textContent = message;
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleSubmit(e) {
    const form = e.target;
    if (!form.classList.contains("js-form")) return;
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const endpoint = form.dataset.endpoint || form.action;
    const method = form.dataset.method || "POST";
    try {
      if (btn) { btn.disabled = true; btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = "Envoi en cours…"; }
      const payload = await serializeForm(form);
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) {
        showError(form, json.error || "Une erreur est survenue. Merci de réessayer.");
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label; }
        return;
      }
      if (json.redirect) {
        window.location.href = json.redirect;
      } else if (form.dataset.redirect) {
        window.location.href = form.dataset.redirect;
      } else {
        window.location.reload();
      }
    } catch (err) {
      showError(form, "Impossible de contacter le serveur. Vérifiez votre connexion.");
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label; }
    }
  }

  document.addEventListener("submit", handleSubmit);

  // Aperçu de fichier sélectionné (zones "file-drop")
  document.addEventListener("change", (e) => {
    const input = e.target;
    if (input.type === "file" && input.closest(".file-drop")) {
      const wrap = input.closest(".file-drop");
      const label = wrap.querySelector(".fname");
      if (label && input.files && input.files[0]) {
        label.textContent = "Fichier sélectionné : " + input.files[0].name;
      }
    }
  });

  // Confirmation avant actions sensibles côté admin
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-confirm]");
    if (el && !confirm(el.dataset.confirm)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // ---------- courant religieux "Autre" -> révèle le champ texte ----------
  window.initCourantAutre = function initCourantAutre() {
    const field = document.getElementById("courant-autre-field");
    if (!field) return;
    const boxes = document.querySelectorAll('input[name="courantsReligieux"]');
    function sync() {
      const autreChecked = Array.from(boxes).some((b) => b.value === "autre" && b.checked);
      field.style.display = autreChecked ? "block" : "none";
    }
    boxes.forEach((b) => b.addEventListener("change", sync));
    sync();
  };

  // ---------- pays / villes : combobox recherchable, sans dépendance ----------
  function normalize(str) {
    return (str || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function setupCombo({ searchId, valueId, panelId, options, onPick, placeholder }) {
    const search = document.getElementById(searchId);
    const value = document.getElementById(valueId);
    const panel = document.getElementById(panelId);
    if (!search || !value || !panel) return null;

    function render(list) {
      panel.innerHTML = "";
      if (!list.length) {
        panel.innerHTML = '<div class="combo-empty">Aucun résultat.</div>';
      } else {
        list.slice(0, 60).forEach((item) => {
          const div = document.createElement("div");
          div.className = "combo-option";
          div.textContent = item.label;
          div.addEventListener("mousedown", (e) => {
            e.preventDefault();
            search.value = item.label;
            value.value = item.label;
            panel.classList.remove("open");
            if (onPick) onPick(item);
          });
          panel.appendChild(div);
        });
      }
      const autreDiv = document.createElement("div");
      autreDiv.className = "combo-option combo-autre";
      autreDiv.textContent = "Autre — saisir manuellement";
      autreDiv.addEventListener("mousedown", (e) => {
        e.preventDefault();
        panel.classList.remove("open");
        if (onPick) onPick({ code: "__AUTRE__", label: "" });
      });
      panel.appendChild(autreDiv);
    }

    function filterAndRender(q) {
      const nq = normalize(q);
      const list = options().filter((o) => !nq || normalize(o.label).includes(nq));
      render(list);
    }

    search.addEventListener("focus", () => { filterAndRender(search.value); panel.classList.add("open"); });
    search.addEventListener("input", () => { value.value = ""; filterAndRender(search.value); panel.classList.add("open"); });
    search.addEventListener("blur", () => { setTimeout(() => panel.classList.remove("open"), 120); });
    if (placeholder) search.placeholder = placeholder;

    return { refresh: filterAndRender };
  }

  window.initGeoCombos = function initGeoCombos() {
    const geo = window.TM_GEO;
    if (!geo) return;
    const villeAutreField = document.getElementById("ville-autre-field");
    const villeAutreInput = document.getElementById("ville-autre-input");
    const villeValue = document.getElementById("ville-value");
    const villeSearch = document.getElementById("ville-search");

    let currentCountryCode = null;
    // retrouver le code pays courant si un pays est déjà sélectionné (édition)
    const initialPaysLabel = (document.getElementById("pays-value") || {}).value;
    if (initialPaysLabel) {
      const found = geo.countries.find((c) => c[1] === initialPaysLabel);
      if (found) currentCountryCode = found[0];
    }

    function villeOptions() {
      const cities = (currentCountryCode && geo.cities[currentCountryCode]) || [];
      return cities.map((c) => ({ code: c, label: c }));
    }

    const villeCombo = setupCombo({
      searchId: "ville-search", valueId: "ville-value", panelId: "ville-panel",
      options: villeOptions,
      placeholder: "Rechercher une ville…",
      onPick: (item) => {
        if (item.code === "__AUTRE__") {
          villeSearch.value = "";
          villeValue.value = "";
          villeAutreField.style.display = "block";
          villeAutreInput.focus();
        } else {
          villeAutreField.style.display = "none";
        }
      },
    });

    setupCombo({
      searchId: "pays-search", valueId: "pays-value", panelId: "pays-panel",
      options: () => geo.countries.map((c) => ({ code: c[0], label: c[1] })),
      placeholder: "Rechercher un pays…",
      onPick: (item) => {
        currentCountryCode = item.code === "__AUTRE__" ? null : item.code;
        villeSearch.value = "";
        villeValue.value = "";
        villeAutreField.style.display = "none";
        const hasCities = currentCountryCode && geo.cities[currentCountryCode] && geo.cities[currentCountryCode].length;
        if (!hasCities) {
          villeAutreField.style.display = "block";
        }
        if (villeCombo) villeCombo.refresh("");
      },
    });

    if (villeAutreInput) {
      villeAutreInput.addEventListener("input", () => { villeValue.value = villeAutreInput.value; });
    }
  };

  // ---------- centre de notifications (cloche) ----------
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("notif-bell-btn");
    const dropdown = document.getElementById("notif-dropdown");
    if (!btn || !dropdown) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target) && e.target !== btn) dropdown.classList.remove("open");
    });
  });
})();
