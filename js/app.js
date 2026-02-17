const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${path} (HTTP ${res.status})`);
  }
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

function statusBadge(status, labels) {
  const map = {
    available: { cls: "", text: labels.available || "Disponible" },
    loom: { cls: "loom", text: labels.loom || "Hecho a pedido" },
    archived: { cls: "archived", text: labels.archived || "Archivo" },
  };
  const v = map[status] || map.available;
  return `<span class="badge ${v.cls}"><span class="badge-dot"></span>${escapeHtml(v.text)}</span>`;
}

function contactUrl(product, config) {
  const mode = config.contact?.mode || "whatsapp";

  if (mode === "instagram") {
    const handle = (config.contact?.instagram?.handle || "").replace(/^@/, "");
    return `https://instagram.com/${encodeURIComponent(handle)}`;
  }

  const phone = (config.contact?.whatsapp?.phoneE164 || "").replace(/[^\d+]/g, "");
  const tpl = config.contact?.whatsapp?.prefill || "Hola, me interesa: {name}";
  const msg = tpl.replace("{name}", product.name || "");
  const text = encodeURIComponent(msg);
  const digits = phone.startsWith("+") ? phone.slice(1) : phone;
  return `https://wa.me/${digits}?text=${text}`;
}

function normalizeCategory(cat) {
  const v = String(cat || "").toLowerCase().trim();
  if (v === "accessories") return "accessory"; // tolerate old plural
  return v; // women | men | accessory
}

function renderCard(p, labels) {
  const img = p.images?.[0] || "";
  const sub = p.subtitle || p.collection || p.materials || "";
  const sizes = p.sizes || "";

  return `
    <article class="card" data-id="${escapeHtml(p.id)}" role="button" tabindex="0"
      aria-label="Ver ${escapeHtml(p.name)}">
      <div class="thumb">${img ? `<img src="${img}" alt="${escapeHtml(p.name)}">` : ""}</div>
      <div class="body">
        <h4 class="name">${escapeHtml(p.name)}</h4>
        <p class="sub">${escapeHtml(sub)}</p>
        <div class="meta">
          ${statusBadge(p.status, labels)}
          <span class="small muted">${escapeHtml(sizes)}</span>
        </div>
      </div>
    </article>
  `;
}

function openModal(p, config) {
  const backdrop = $("#modalBackdrop");
  const media = $("#modalMedia");
  const panel = $("#modalPanel");
  const labels = config.labels || { available: "Disponible", loom: "Hecho a pedido", archived: "Archivo" };

  const img = p.images?.[0] || "";
  media.innerHTML = img ? `<img src="${img}" alt="${escapeHtml(p.name)}">` : "";

  const contact = contactUrl(p, config);

  // Price logic
  let priceLine = "";
  if (p.price?.mode === "visible" && typeof p.price.value === "number") {
    priceLine = `<span class="pill">${escapeHtml(p.price.currency || "USD")} ${p.price.value}</span>`;
  } else {
    priceLine = `<span class="pill">Precio: bajo consulta</span>`;
  }

  // Optional extra pills
  const pills = [];
  pills.push(statusBadge(p.status, labels));
  if (p.collection) pills.push(`<span class="pill">${escapeHtml(p.collection)}</span>`);
  if (p.technique) pills.push(`<span class="pill">${escapeHtml(p.technique)}</span>`);
  if (p.materials) pills.push(`<span class="pill">${escapeHtml(p.materials)}</span>`);
  if (p.sizes) pills.push(`<span class="pill">${escapeHtml(p.sizes)}</span>`);
  if (typeof p.hours === "number" && p.hours > 0) pills.push(`<span class="pill">${p.hours} horas</span>`);
  pills.push(priceLine);

  panel.innerHTML = `
    <h4>${escapeHtml(p.name)}</h4>
    <p>${escapeHtml(p.description || "")}</p>
    <div class="field">${pills.join("")}</div>
    <div class="modal-actions">
      <a class="btn primary" href="${contact}" target="_blank" rel="noopener">Contactar</a>
      <button class="btn" id="closeModalBtn" type="button">Cerrar</button>
    </div>
  `;

  backdrop.style.display = "flex";
  backdrop.setAttribute("aria-hidden", "false");
  setTimeout(() => $("#closeModalBtn")?.focus(), 0);
}

function closeModal() {
  const backdrop = $("#modalBackdrop");
  backdrop.style.display = "none";
  backdrop.setAttribute("aria-hidden", "true");
}

async function initRunway() {
  const [config, productsRaw] = await Promise.all([
    loadJSON("./data/config.json"),
    loadJSON("./data/products.json"),
  ]);

  // Header
  const brand = $("#brandName");
  const subtitle = $("#brandSubtitle");
  if (brand) brand.textContent = config.brandName || "Showroom";
  if (subtitle) subtitle.textContent = config.runwayTitle || "Digital Showroom";

  // Hero
  const heroImg = $("#heroImg");
  if (heroImg && config.heroImage) heroImg.src = config.heroImage;

  const labels = config.labels || { available: "Disponible", loom: "Hecho a pedido", archived: "Archivo" };

  // Data
  const products = (productsRaw || []).map((p) => ({
    ...p,
    category: normalizeCategory(p.category),
  }));

  const grid = $("#grid");
  const categoryFilter = $("#categoryFilter");

  function render() {
    const cat = categoryFilter?.value || "all";
    const shown =
      cat === "all"
        ? products
        : products.filter((p) => normalizeCategory(p.category) === cat);

    grid.innerHTML = shown.map((p) => renderCard(p, labels)).join("");

    $$(".card", grid).forEach((card) => {
      const id = card.getAttribute("data-id");
      const p = products.find((x) => x.id === id);
      const open = () => openModal(p, config);

      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });
  }

  categoryFilter?.addEventListener("change", render);
  render();

  // Modal handlers
  $("#modalBackdrop")?.addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "closeModalBtn") closeModal();
  });

  // CTA
  const cta = $("#primaryCTA");
  if (cta) cta.href = contactUrl({ name: "una pieza" }, config);
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.getAttribute("data-page");
  if (page !== "runway") return;

  initRunway().catch((err) => {
    console.error("RUNWAY INIT ERROR:", err);
    const grid = $("#grid");
    if (grid) {
      grid.innerHTML = `
        <p class="muted">
          No se pudo cargar el catálogo. Revisa <strong>/data/products.json</strong> y la consola.
        </p>
      `;
    }
  });
});
