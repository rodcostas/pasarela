const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

async function loadJSON(path){
  const res = await fetch(path, {cache: "no-store"});
  if(!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/**
 * Normalize legacy fields so old data keeps working.
 * - status: loom -> made_to_order
 * - category: default women if missing
 */
function normalizeProduct(p){
  const status = (p.status === "loom") ? "made_to_order" : (p.status || "available");
  const category = p.category || "women"; // women | men | accessories
  return { ...p, status, category };
}

function statusBadge(status, labels){
  const map = {
    available: {cls:"", text: labels.available},
    made_to_order: {cls:"made", text: labels.made_to_order},
    // keep archived supported for later; not shown unless used
    archived: {cls:"archived", text: labels.archived}
  };
  const v = map[status] || map.available;
  return `<span class="badge ${v.cls}"><span class="badge-dot"></span>${escapeHtml(v.text)}</span>`;
}

function contactUrl(product, config){
  const mode = config.contact?.mode || "whatsapp";
  if(mode === "instagram"){
    const handle = config.contact?.instagram?.handle || "";
    return `https://instagram.com/${encodeURIComponent(handle)}`;
  }
  const phone = (config.contact?.whatsapp?.phoneE164 || "").replace(/[^\d+]/g, "");
  const tpl = config.contact?.whatsapp?.prefill || "Hola, me interesa: {name}";
  const msg = tpl.replace("{name}", product.name || "");
  const text = encodeURIComponent(msg);
  const digits = phone.startsWith("+") ? phone.slice(1) : phone;
  return `https://wa.me/${digits}?text=${text}`;
}

function renderCard(p, labels){
  const img = p.images?.[0] || "";
  const sub = p.subtitle || p.materials || "";
  return `
    <article class="card" data-id="${escapeHtml(p.id)}" role="button" tabindex="0" aria-label="Ver ${escapeHtml(p.name)}">
      <div class="thumb">${img ? `<img src="${img}" alt="${escapeHtml(p.name)}">` : ""}</div>
      <div class="body">
        <h4 class="name">${escapeHtml(p.name)}</h4>
        <p class="sub">${escapeHtml(sub)}</p>
        <div class="meta">
          ${statusBadge(p.status, labels)}
          <span class="small muted">${escapeHtml(p.sizes || "")}</span>
        </div>
      </div>
    </article>
  `;
}

function openModal(p, config){
  const backdrop = $("#modalBackdrop");
  const media = $("#modalMedia");
  const panel = $("#modalPanel");

  const labels = config.labels || {
    available: "Disponible",
    made_to_order: "Hecho a pedido",
    archived: "Archivo"
  };

  const img = p.images?.[0] || "";
  media.innerHTML = img ? `<img src="${img}" alt="${escapeHtml(p.name)}">` : "";
  const contact = contactUrl(p, config);

  // price display logic
  let priceLine = "";
  if(p.price?.mode === "visible" && typeof p.price.value === "number"){
    priceLine = `<span class="pill">${escapeHtml(p.price.currency || "USD")} ${p.price.value}</span>`;
  }else if(p.price?.mode === "hidden"){
    priceLine = `<span class="pill">Precio: bajo consulta</span>`;
  }

  panel.innerHTML = `
    <h4>${escapeHtml(p.name)}</h4>
    <p>${escapeHtml(p.description || "")}</p>
    <div class="field">
      ${statusBadge(p.status, labels)}
      ${p.materials ? `<span class="pill">${escapeHtml(p.materials)}</span>` : ""}
      ${p.sizes ? `<span class="pill">${escapeHtml(p.sizes)}</span>` : ""}
      ${priceLine}
    </div>
    <div class="modal-actions">
      <a class="btn primary" href="${contact}" target="_blank" rel="noopener">Contactar</a>
      <button class="btn" id="closeModalBtn" type="button">Cerrar</button>
    </div>
  `;

  backdrop.style.display = "flex";
  backdrop.setAttribute("aria-hidden", "false");
  setTimeout(() => $("#closeModalBtn")?.focus(), 0);
}

function closeModal(){
  const backdrop = $("#modalBackdrop");
  backdrop.style.display = "none";
  backdrop.setAttribute("aria-hidden", "true");
}

async function initRunway(){
  const [config, productsRaw] = await Promise.all([
    loadJSON("./data/config.json"),
    loadJSON("./data/products.json")
  ]);

  // Title (if you still use these IDs elsewhere)
  const brand = $("#brandName");
  const subtitle = $("#brandSubtitle");
  if(brand) brand.textContent = config.brandName || "Kathia Galindo";
  if(subtitle) subtitle.textContent = config.runwayTitle || "";

  // hero image optional
  const heroImg = $("#heroImg");
  if(heroImg && config.heroImage) heroImg.src = config.heroImage;

  // labels (new)
  const labels = config.labels || {
    available: "Disponible",
    made_to_order: "Hecho a pedido",
    archived: "Archivo"
  };

  const filter = $("#statusFilter");
  const grid = $("#grid");

  // Normalize legacy products
  const list = productsRaw.map(normalizeProduct);

  // Category pills (from index.html)
  const pills = $$(".pill");
  let activeCategory = document.body.dataset.category || "women";

  function setActiveCategory(cat){
    activeCategory = cat || "women";
    document.body.dataset.category = activeCategory;

    // update aria states (if pills exist)
    pills.forEach(p => {
      const on = p.dataset.category === activeCategory;
      p.classList.toggle("active", on);
      p.setAttribute("aria-selected", on ? "true" : "false");
    });

    apply();
  }

  // Listen to pill clicks
  if(pills.length){
    pills.forEach(btn => {
      btn.addEventListener("click", () => setActiveCategory(btn.dataset.category));
    });
    // ensure one is active on load
    const initial = pills.find(p => p.dataset.category === activeCategory) || pills[0];
    if(initial) setActiveCategory(initial.dataset.category);
  }

  function apply(){
    const v = filter?.value || "all";

    // first: category filter
    let shown = list.filter(p => p.category === activeCategory);

    // second: status filter
    if(v !== "all"){
      shown = shown.filter(p => p.status === v);
    }

    grid.innerHTML = shown.map(p => renderCard(p, labels)).join("");

    // attach handlers
    $$(".card", grid).forEach(card => {
      const id = card.getAttribute("data-id");
      const p = shown.find(x => x.id === id) || list.find(x => x.id === id);
      if(!p) return;

      const open = () => openModal(p, config);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if(e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); }
      });
    });

    if(shown.length === 0){
      grid.innerHTML = `<p class="muted">No hay piezas para esta selección.</p>`;
    }
  }

  if(filter){
    // Ensure your dropdown values match: all | available | made_to_order
    filter.addEventListener("change", apply);
  }

  // initial render (if pills didn’t already call apply)
  if(!pills.length) apply();

  // modal handlers
  $("#modalBackdrop")?.addEventListener("click", (e) => {
    if(e.target.id === "modalBackdrop") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape") closeModal();
  });
  document.addEventListener("click", (e) => {
    if(e.target && e.target.id === "closeModalBtn") closeModal();
  });

  // primary CTA
  const cta = $("#primaryCTA");
  if(cta){
    cta.href = contactUrl({name:"una pieza"}, config);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.getAttribute("data-page");
  if(page === "runway") initRunway().catch(err => {
    console.error(err);
    $("#grid").innerHTML = `<p class="muted">No se pudo cargar el catálogo. Revisa /data/products.json</p>`;
  });
});
