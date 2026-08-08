/* SpesaOggi - logica frontend */
(() => {
  const CHUNK = 60; // card renderizzate per volta (scroll infinito)

  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), tabs = $("tabs"), cats = $("cats"), search = $("search");

  let data = null;
  let activeStore = localStorage.getItem("store") || null;
  let activeCat = localStorage.getItem("cat") || "all";
  let activeSort = localStorage.getItem("sort") || "default";
  let filtered = [];
  let rendered = 0;

  const fmtPrice = (p) =>
    p == null ? "" : p.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  };

  const catInfo = (id) => (data.categories || {})[id] || { label: id, emoji: "📦" };

  function currentStore() {
    return data.stores.find((s) => s.id === activeStore);
  }

  function renderTabs() {
    tabs.innerHTML = "";
    for (const store of data.stores) {
      if (!store.offers.length) continue;
      const btn = document.createElement("button");
      btn.className = "tab" + (store.id === activeStore ? " active" : "");
      btn.style.setProperty("--tab-color", store.color);
      btn.setAttribute("role", "tab");
      btn.innerHTML = `${store.name} <span class="count">${store.offers.length}</span>`;
      btn.onclick = () => {
        activeStore = store.id; // la categoria attiva resta: vale per tutti i negozi
        localStorage.setItem("store", store.id);
        renderTabs();
        renderCats();
        renderFab();
        applyFilter();
        window.scrollTo({ top: 0 });
      };
      tabs.appendChild(btn);
    }
  }

  function renderFab() {
    const store = currentStore();
    $("flyerFab").hidden = !(store && store.leaflets && store.leaflets.length);
  }

  function renderFlyerSheet() {
    const store = currentStore();
    if (!store || !store.leaflets) return;
    $("flyerTitle").textContent = `Volantini — ${store.name}`;
    const list = $("flyerList");
    list.innerHTML = "";
    for (const leaf of store.leaflets) {
      const a = document.createElement("a");
      a.className = "sheet-opt";
      if (leaf.pdf) {
        a.href = leaf.pdf;
        a.setAttribute("download", "");
        const until = leaf.valid_until ? ` · fino al ${fmtDate(leaf.valid_until)}` : "";
        a.innerHTML = `📄 ${leaf.title}<span class="opt-sub">${leaf.pages} pagine · PDF${until}</span>`;
      } else {
        a.href = leaf.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.innerHTML = `↗️ ${leaf.title}<span class="opt-sub">si apre nel browser</span>`;
      }
      list.appendChild(a);
    }
  }

  function renderCats() {
    const store = currentStore();
    cats.innerHTML = "";
    if (!store) return;
    const counts = {};
    for (const o of store.offers) counts[o.category || "altro"] = (counts[o.category || "altro"] || 0) + 1;
    const ids = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    // categoria attiva senza offerte in questo negozio: mostrala comunque (con 0)
    if (activeCat !== "all" && !counts[activeCat]) ids.push(activeCat);
    if (ids.length < 2 && activeCat === "all") return; // una sola categoria: chips inutili

    const mk = (id, label, count) => {
      const btn = document.createElement("button");
      btn.className = "cat" + (id === activeCat ? " active" : "");
      btn.innerHTML = count != null ? `${label} <span class="count">${count}</span>` : label;
      btn.onclick = () => {
        activeCat = id;
        localStorage.setItem("cat", id);
        renderCats();
        applyFilter();
        window.scrollTo({ top: 0 });
      };
      return btn;
    };
    cats.appendChild(mk("all", "Tutte", store.offers.length));
    for (const id of ids) {
      const info = catInfo(id);
      cats.appendChild(mk(id, `${info.emoji} ${info.label}`, counts[id] || 0));
    }
  }

  function applyFilter() {
    const store = currentStore();
    if (!store) return;
    const q = search.value.trim().toLowerCase();
    filtered = store.offers.filter(
      (o) =>
        (activeCat === "all" || (o.category || "altro") === activeCat) &&
        (!q || o.title.toLowerCase().includes(q))
    );

    const sort = activeSort;
    if (sort === "discount") {
      const pct = (o) =>
        o.old_price && o.price ? 1 - o.price / o.old_price
        : o.discount ? parseFloat(o.discount.replace(/[^\d.]/g, "")) / 100 || 0
        : 0;
      filtered.sort((a, b) => pct(b) - pct(a));
    } else if (sort === "price-asc") {
      filtered.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9));
    } else if (sort === "price-desc") {
      filtered.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    }

    grid.innerHTML = "";
    rendered = 0;
    $("empty").hidden = filtered.length > 0;
    renderChunk();
  }

  function renderChunk() {
    const frag = document.createDocumentFragment();
    const end = Math.min(rendered + CHUNK, filtered.length);
    for (let i = rendered; i < end; i++) frag.appendChild(card(filtered[i]));
    rendered = end;
    grid.appendChild(frag);
  }

  function card(o) {
    const el = document.createElement("article");
    el.className = "card";
    const img = o.image
      ? `<img src="${o.image}" alt="" loading="lazy" onerror="this.outerHTML='<div class=noimg>🛍️</div>'">`
      : `<div class="noimg">🛍️</div>`;
    const badge = o.discount ? `<span class="badge">${o.discount}</span>` : "";
    const oldP = o.old_price ? `<span class="old-price">${fmtPrice(o.old_price)}</span>` : "";
    const unit = o.unit ? `<span class="unit">${o.unit}</span>` : "";
    const valid = o.valid_until ? `<span class="valid">⏳ fino al ${fmtDate(o.valid_until)}</span>` : "";
    el.innerHTML = `<div class="imgwrap">${img}${badge}</div>
      <div class="card-body">
        <div class="title">${o.title}</div>
        ${unit}
        <div class="prices"><span class="price">${fmtPrice(o.price) || (o.discount || "")}</span>${oldP}</div>
        ${valid}
      </div>`;
    return el;
  }

  async function init() {
    try {
      const resp = await fetch("data/offers.json");
      data = await resp.json();
    } catch {
      grid.innerHTML = '<p class="empty">Impossibile caricare le offerte 😕</p>';
      return;
    }

    const updated = new Date(data.updated_at);
    $("updated").textContent =
      "agg. " + updated.toLocaleDateString("it-IT", { day: "numeric", month: "short" }) +
      " " + updated.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    $("stale-banner").hidden = Date.now() - updated.getTime() < 48 * 3600 * 1000;

    const valid = data.stores.filter((s) => s.offers.length);
    if (!valid.find((s) => s.id === activeStore)) activeStore = valid[0]?.id;

    renderTabs();
    renderCats();
    renderFab();
    applyFilter();

    new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && rendered < filtered.length) renderChunk();
    }, { rootMargin: "600px" }).observe($("sentinel"));
  }

  let debounce;
  search.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(applyFilter, 150);
  });

  // bottom sheet ordinamento
  const sheet = $("sheet");
  function syncSortUI() {
    for (const btn of sheet.querySelectorAll(".sheet-opt"))
      btn.classList.toggle("active", btn.dataset.sort === activeSort);
    $("sortDot").hidden = activeSort === "default";
  }
  $("sortBtn").addEventListener("click", () => {
    syncSortUI();
    sheet.hidden = false;
  });
  sheet.addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined && !e.target.closest(".sheet-panel")) {
      sheet.hidden = true;
      return;
    }
    const opt = e.target.closest(".sheet-opt");
    if (!opt) return;
    activeSort = opt.dataset.sort;
    localStorage.setItem("sort", activeSort);
    syncSortUI();
    sheet.hidden = true;
    applyFilter();
    window.scrollTo({ top: 0 });
  });
  syncSortUI();

  // sheet volantini
  const flyerSheet = $("flyerSheet");
  $("flyerFab").addEventListener("click", () => {
    renderFlyerSheet();
    flyerSheet.hidden = false;
  });
  flyerSheet.addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined || e.target.closest(".sheet-opt"))
      flyerSheet.hidden = true;
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

  init();
})();
