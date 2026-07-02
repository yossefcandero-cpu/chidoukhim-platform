(function () {
  "use strict";

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
})();
