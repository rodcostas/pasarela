const $ = (sel, root = document) => root.querySelector(sel);

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

function uid() {
  return (crypto?.randomUUID?.() || `id-${Math.random().toString(16).slice(2)}`).slice(0, 24);
}

function toNumOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== "" ? n : null;
}

function normalize(p) {
  const price = p.price || {};
  const images = Array.isArray(p.images) ? p.images : (p.images ? [p.images] : []);

  return {
    id: p.id || uid(),
    collection: (p.collection || "").toString(),
    category: (p.category || "women").toString(), // women | men | accessory
    name: (p.name || "").toString(),
    subtitle: (p.subtitle || "").toString(),
    materials: (p.materials || "").toString(),
    sizes: (p.sizes || "").toString(),
    technique: (p.technique || "").toString(),
    status: (p.status === "loom" ? "loom" : "available"), // keep only available/loom in UI
    hours: typeof p.hours === "number" ? p.hours : (p.hours == null ? null : toNumOrNull(p.hours)),
    price: {
      mode: (price.mode === "visible" ? "visible" : "hidden"),
      value: typeof price.value === "number" ? price.value : (price.value == null ? null : toNumOrNull(price.value)),
      currency: (price.currency || "USD").toString() || "USD",
    },
    description: (p.description || "").toString(),
    images,
  };
}

function statusLabel(status, labels) {
  const map = {
    available: labels.available,
    loom: labels.loom,
  };
  return map[status] || status;
}

function categoryLabel(cat) {
  const map = {
    women: "Mujer",
    men: "Hombre",
    accessory: "Accesorio",
  };
  return map[cat] || cat;
}

function renderRow(p, labels) {
  const img = p.images?.[0] || "";
  const sub = p.subtitle || p.materials || "";
  const col = p.collection ? ` · ${p.collection}` : "";
  const cat = categoryLabel(p.category);

  return `
    <tr class="tr" data-id="${escapeHtml(p.id)}">
      <td style="width:72px">
        <div class="thumbsm">${img ? `<img src="${img}" alt="">` : ""}</div>
      </td>
      <td>
        <div style="font-weight:600">${escapeHtml(p.name || "Sin nombre")}</div>
        <div class="small muted">${escapeHtml(sub)}</div>
      </td>
      <td class="small muted" style="width:160px">${escapeHtml(cat + col)}</td>
      <td class="small muted" style="width:160px">${escapeHtml(statusLabel(p.status, labels))}</td>
      <td style="width:180px">
        <div class="actions">
          <button class="btn" data-action="edit">Editar</button>
          <button class="btn ghost" data-action="delete">Eliminar</button>
        </div>
      </td>
    </tr>
  `;
}

function download(filename, content, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-+/g, "-");
}

async function initAdmin() {
  const [config, products0] = await Promise.all([
    loadJSON("./data/config.json"),
    loadJSON("./data/products.json"),
  ]);

  // Labels: IMPORTANT — make loom = "Hecho a pedido"
  const labels = config.labels || {
    available: "Disponible",
    loom: "Hecho a pedido",
  };

  const brandName = config.brandName || "Showroom";
  $("#brandName") && ($("#brandName").textContent = brandName);

  let products = (products0 || []).map(normalize);
  let editingId = null;

  const tableBody = $("#tableBody");

  function refresh() {
    tableBody.innerHTML = products.map((p) => renderRow(p, labels)).join("");
  }

  function openEditor(p) {
    editingId = p?.id || null;
    $("#edTitle").textContent = editingId ? "Editar prenda" : "Nueva prenda";

    $("#f_id").value = p?.id || "";

    // NEW fields
    if ($("#f_collection")) $("#f_collection").value = p?.collection || "";
    if ($("#f_category")) $("#f_category").value = p?.category || "women";
    if ($("#f_technique")) $("#f_technique").value = p?.technique || "";
    if ($("#f_hours")) $("#f_hours").value = (p?.hours ?? "") === null ? "" : String(p?.hours ?? "");

    // Existing fields
    $("#f_name").value = p?.name || "";
    $("#f_subtitle").value = p?.subtitle || "";
    $("#f_materials").value = p?.materials || "";
    $("#f_sizes").value = p?.sizes || "";
    $("#f_status").value = p?.status || "available";

    $("#f_price_mode").value = p?.price?.mode || "hidden";
    $("#f_price_value").value = typeof p?.price?.value === "number" ? p.price.value : (p?.price?.value ?? 0);
    $("#f_price_currency").value = p?.price?.currency || "USD";

    $("#f_images").value = (p?.images || []).join("\n");
    $("#f_description").value = p?.description || "";

    $("#editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function upsertFromForm() {
    const id = $("#f_id").value.trim() || (editingId || uid());

    const p = normalize({
      id,

      // NEW fields
      collection: $("#f_collection") ? $("#f_collection").value.trim() : "",
      category: $("#f_category") ? $("#f_category").value : "women",
      technique: $("#f_technique") ? $("#f_technique").value.trim() : "",
      hours: $("#f_hours") ? toNumOrNull($("#f_hours").value) : null,

      // Existing
      name: $("#f_name").value.trim(),
      subtitle: $("#f_subtitle").value.trim(),
      materials: $("#f_materials").value.trim(),
      sizes: $("#f_sizes").value.trim(),
      status: $("#f_status").value, // available | loom
      price: {
        mode: $("#f_price_mode").value, // hidden | visible
        value: $("#f_price_mode").value === "hidden"
          ? (toNumOrNull($("#f_price_value").value) ?? null) // keep if you want, but not shown
          : (toNumOrNull($("#f_price_value").value) ?? 0),
        currency: $("#f_price_currency").value.trim() || "USD",
      },
      images: $("#f_images").value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      description: $("#f_description").value.trim(),
    });

    const idx = products.findIndex((x) => x.id === p.id);
    if (idx >= 0) products[idx] = p;
    else products.unshift(p);

    editingId = p.id;
    refresh();
  }

  // Table actions
  tableBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const tr = e.target.closest("tr");
    const id = tr?.getAttribute("data-id");
    const p = products.find((x) => x.id === id);
    const act = btn.getAttribute("data-action");

    if (act === "edit") openEditor(p);

    if (act === "delete") {
      if (confirm(`Eliminar "${p?.name || id}"?`)) {
        products = products.filter((x) => x.id !== id);
        if (editingId === id) editingId = null;
        refresh();
      }
    }
  });

  $("#newBtn")?.addEventListener("click", () => openEditor(null));
  $("#saveBtn")?.addEventListener("click", () => upsertFromForm());
  $("#downloadBtn")?.addEventListener("click", () => {
    download("products.json", JSON.stringify(products, null, 2));
  });

  // ===== Uploader wiring =====
  const dropzone = $("#dropzone");
  const pickFiles = $("#pickFiles");
  const filePicker = $("#filePicker");
  const fileList = $("#fileList");
  const downloadImagesBtn = $("#downloadImagesBtn");
  const imagesTextarea = $("#f_images");

  let picked = []; // [{file, path}]

  function renderPicked() {
    if (!fileList) return;

    if (!picked.length) {
      fileList.innerHTML = `<div class="small muted">No hay fotos seleccionadas todavía.</div>`;
      return;
    }

    fileList.innerHTML = `
      <div class="upload-list">
        ${picked.map((x, i) => `
          <div class="upload-item">
            <div>
              <div style="font-weight:600">${escapeHtml(x.file.name)}</div>
              <code>${escapeHtml(x.path)}</code>
            </div>
            <button class="btn ghost" type="button" data-rm="${i}">Quitar</button>
          </div>
        `).join("")}
      </div>
    `;

    imagesTextarea.value = picked.map((x) => x.path).join("\n");
  }

  function addFiles(files) {
    const arr = Array.from(files || []);
    if (!arr.length) return;

    for (const f of arr) {
      const safe = sanitizeFilename(f.name);
      const path = `assets/images/${safe}`;
      if (!picked.some((x) => x.path === path)) {
        picked.push({ file: f, path });
      }
    }
    renderPicked();
  }

  function openPicker() {
    filePicker?.click();
  }

  pickFiles?.addEventListener("click", (e) => {
    e.preventDefault();
    openPicker();
  });

  dropzone?.addEventListener("click", () => openPicker());

  filePicker?.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });

  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone?.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    addFiles(e.dataTransfer.files);
  });

  fileList?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-rm]");
    if (!btn) return;
    const idx = Number(btn.getAttribute("data-rm"));
    picked.splice(idx, 1);
    renderPicked();
  });

  downloadImagesBtn?.addEventListener("click", async () => {
    if (!picked.length) {
      alert("Primero selecciona una o más fotos.");
      return;
    }
    if (!window.JSZip) {
      alert("JSZip no cargó. Revisa tu conexión o el script del CDN.");
      return;
    }
    const zip = new JSZip();
    for (const x of picked) {
      const buf = await x.file.arrayBuffer();
      zip.file(x.path.replace("assets/images/", ""), buf);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pasarela-images.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  });

  renderPicked();

  // initial
  refresh();
  openEditor(products[0] || null);
}

document.addEventListener("DOMContentLoaded", () => {
  initAdmin().catch((err) => {
    console.error(err);
    const tb = document.querySelector("#tableBody");
    if (tb) tb.innerHTML = `<tr><td colspan="5" class="muted">No se pudo cargar /data/products.json</td></tr>`;
    alert("Error cargando Backstage. Abre la consola para ver detalles.");
  });
});
