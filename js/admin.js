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

function uid(){
  return (crypto?.randomUUID?.() || `id-${Math.random().toString(16).slice(2)}`).slice(0, 24);
}

function normalize(p){
  return {
    id: p.id || uid(),
    name: p.name || "",
    subtitle: p.subtitle || "",
    materials: p.materials || "",
    sizes: p.sizes || "",
    status: p.status || "available",
    price: p.price || {mode:"hidden", value:0, currency:"USD"},
    description: p.description || "",
    images: Array.isArray(p.images) ? p.images : (p.images ? [p.images] : [])
  };
}

function statusLabel(status, labels){
  const map = {available: labels.available, loom: labels.loom, archived: labels.archived};
  return map[status] || status;
}

function renderRow(p, labels){
  const img = p.images?.[0] || "";
  const sub = p.subtitle || p.materials || "";
  const price = p.price?.mode === "visible" ? `${p.price.currency || "USD"} ${p.price.value}` : "Bajo consulta";
  return `
    <tr class="tr" data-id="${escapeHtml(p.id)}">
      <td style="width:72px">
        <div class="thumbsm">${img ? `<img src="${img}" alt="">` : ""}</div>
      </td>
      <td>
        <div style="font-weight:600">${escapeHtml(p.name || "Sin nombre")}</div>
        <div class="small muted">${escapeHtml(sub)}</div>
      </td>
      <td class="small muted" style="width:160px">${escapeHtml(statusLabel(p.status, labels))}</td>
      <td class="small muted" style="width:160px">${escapeHtml(price)}</td>
      <td style="width:160px">
        <div class="actions">
          <button class="btn" data-action="edit">Editar</button>
          <button class="btn ghost" data-action="delete">Eliminar</button>
        </div>
      </td>
    </tr>
  `;
}

function download(filename, content, mime="application/json"){
  const blob = new Blob([content], {type: mime});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

async function initAdmin(){
  const [config, products0] = await Promise.all([
    loadJSON("/data/config.json"),
    loadJSON("/data/products.json")
  ]);

  const labels = config.labels || {available:"Disponible", loom:"En Telar", archived:"Archivo"};
  $("#brandName") && ($("#brandName").textContent = config.brandName || "Showroom");

  let products = products0.map(normalize);
  let editingId = null;

  const tableBody = $("#tableBody");
  const editor = $("#editor");
  const codebox = $("#jsonBox");

  function refresh(){
    tableBody.innerHTML = products.map(p => renderRow(p, labels)).join("");
    codebox.value = JSON.stringify(products, null, 2);
  }

  function openEditor(p){
    editingId = p?.id || null;
    $("#edTitle").textContent = editingId ? "Editar prenda" : "Nueva prenda";
    $("#f_id").value = p?.id || "";
    $("#f_name").value = p?.name || "";
    $("#f_subtitle").value = p?.subtitle || "";
    $("#f_materials").value = p?.materials || "";
    $("#f_sizes").value = p?.sizes || "";
    $("#f_status").value = p?.status || "available";
    $("#f_price_mode").value = p?.price?.mode || "hidden";
    $("#f_price_value").value = typeof p?.price?.value === "number" ? p.price.value : 0;
    $("#f_price_currency").value = p?.price?.currency || "USD";
    $("#f_images").value = (p?.images || []).join("\n");
    $("#f_description").value = p?.description || "";
    editor.scrollIntoView({behavior:"smooth", block:"start"});
  }

  function upsertFromForm(){
    const p = normalize({
      id: $("#f_id").value.trim() || (editingId || uid()),
      name: $("#f_name").value.trim(),
      subtitle: $("#f_subtitle").value.trim(),
      materials: $("#f_materials").value.trim(),
      sizes: $("#f_sizes").value.trim(),
      status: $("#f_status").value,
      price: {
        mode: $("#f_price_mode").value,
        value: Number($("#f_price_value").value || 0),
        currency: $("#f_price_currency").value.trim() || "USD"
      },
      images: $("#f_images").value.split("\n").map(s => s.trim()).filter(Boolean),
      description: $("#f_description").value.trim()
    });

    const idx = products.findIndex(x => x.id === p.id);
    if(idx >= 0) products[idx] = p;
    else products.unshift(p);

    editingId = p.id;
    refresh();
  }

  // table actions
  tableBody.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if(!btn) return;
    const tr = e.target.closest("tr");
    const id = tr?.getAttribute("data-id");
    const p = products.find(x => x.id === id);
    const act = btn.getAttribute("data-action");
    if(act === "edit") openEditor(p);
    if(act === "delete"){
      if(confirm(`Eliminar "${p?.name || id}"?`)){
        products = products.filter(x => x.id !== id);
        if(editingId === id) editingId = null;
        refresh();
      }
    }
  });

  $("#newBtn").addEventListener("click", () => openEditor(null));
  $("#saveBtn").addEventListener("click", () => upsertFromForm());
  $("#downloadBtn").addEventListener("click", () => {
    download("products.json", JSON.stringify(products, null, 2));
  });

  $("#replaceFromJsonBtn").addEventListener("click", () => {
    try{
      const parsed = JSON.parse(codebox.value);
      if(!Array.isArray(parsed)) throw new Error("products.json debe ser un arreglo []");
      products = parsed.map(normalize);
      editingId = null;
      refresh();
      alert("Listo. Ahora descarga products.json y reemplázalo en /data.");
    }catch(err){
      alert(`Error: ${err.message}`);
    }
  });

  // initial
  refresh();
  openEditor(products[0] || null);
}

document.addEventListener("DOMContentLoaded", () => {
  initAdmin().catch(err => {
    console.error(err);
    $("#tableBody").innerHTML = `<tr><td colspan="5" class="muted">No se pudo cargar /data/products.json</td></tr>`;
  });
});
