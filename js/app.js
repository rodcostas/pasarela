const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

async function loadJSON(path){
  const res = await fetch(path, {cache: "no-store"});
  if(!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

function statusBadge(status, labels){
  const map = {
    available: {cls:"", text: labels.available},
    loom: {cls:"loom", text: labels.loom},
    archived: {cls:"archived", text: labels.archived}
  };
  const v = map[status] || map.available;
  return `<span class="badge ${v.cls}"><span class="badge-dot"></span>${escapeHtml(v.text)}</span>`;
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function contactUrl(product, config){
  const mode = config.contact?.mode || "whatsapp";
  if(mode === "instagram"){
    const handle = config.contact?.instagram?.handle || "";
    // prefer deep link for app; web fallback
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
  const labels = config.labels || {available:"Disponible", loom:"En Telar", archived:"Archivo"};

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
  const [config, products] = await Promise.all([
    loadJSON("/data/config.json"),
    loadJSON("/data/products.json")
  ]);

  // title
  const brand = $("#brandName");
  const subtitle = $("#brandSubtitle");
  if(brand) brand.textContent = config.brandName || "Showroom";
  if(subtitle) subtitle.textContent = config.runwayTitle || "";

  // hero image optional
  const heroImg = $("#heroImg");
  if(heroImg && config.heroImage) heroImg.src = config.heroImage;

  const labels = config.labels || {available:"Disponible", loom:"En Telar", archived:"Archivo"};

  // filter control
  const filter = $("#statusFilter");
  const grid = $("#grid");
  const list = products.slice();

  function apply(){
    const v = filter?.value || "all";
    const shown = v === "all" ? list : list.filter(p => p.status === v);
    grid.innerHTML = shown.map(p => renderCard(p, labels)).join("");
    // attach handlers
    $$(".card", grid).forEach(card => {
      const id = card.getAttribute("data-id");
      const p = list.find(x => x.id === id);
      const open = () => openModal(p, config);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if(e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); }
      });
    });
  }

  if(filter){
    filter.addEventListener("change", apply);
  }
  apply();

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
