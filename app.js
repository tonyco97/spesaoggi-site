/* SpesaOggi - logica frontend */
(() => {
  const CHUNK = 60; // card renderizzate per volta (scroll infinito)

  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), search = $("search");

  let data = null;
  let activeStore = localStorage.getItem("store") || null;
  let watchlist = JSON.parse(localStorage.getItem("watch") || "[]");

  /* ---------- bottom sheet: gestione centralizzata + tasto indietro ---------- */
  let sheetOpen = null;
  function openSheet(el) {
    if (sheetOpen) sheetOpen.hidden = true;
    else history.pushState({ sheet: true }, "");
    el.hidden = false;
    sheetOpen = el;
  }
  function closeSheet(el) {
    if (sheetOpen === el) history.back(); // il popstate chiude
    else el.hidden = true;
  }
  window.addEventListener("popstate", () => {
    if (sheetOpen) {
      sheetOpen.hidden = true;
      sheetOpen = null;
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheetOpen) closeSheet(sheetOpen);
  });
  let activeCat = localStorage.getItem("cat") || "all";
  let activeSort = localStorage.getItem("sort") || "default";
  let filters = JSON.parse(localStorage.getItem("filters") || "{}"); // {expiring, bigdiscount, maxprice}
  let shoplist = JSON.parse(localStorage.getItem("shoplist") || "[]");
  let filtered = []; // coppie [offerta, negozio]
  let globalMode = false;
  let rendered = 0;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const norm = (s) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const fmtPrice = (p) =>
    p == null ? "" : p.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  };

  const catInfo = (id) => (data.categories || {})[id] || { label: id, emoji: "📦" };

  const discountPct = (o) =>
    o.old_price && o.price ? 1 - o.price / o.old_price
    : o.discount ? parseFloat(o.discount.replace(/[^\d.]/g, "")) / 100 || 0
    : 0;

  const TOPSTORE = { id: "_top", name: "Occasioni", color: "#f59e0b", offers: [] };
  let topPairsCache = null;
  function topPairs() {
    if (!topPairsCache) {
      const all = [];
      for (const s of data.stores)
        for (const o of s.offers)
          if (o.old_price && o.price && o.price < o.old_price) all.push([o, s]);
      all.sort((a, b) => discountPct(b[0]) - discountPct(a[0]));
      topPairsCache = all.slice(0, 80);
    }
    return topPairsCache;
  }

  function currentStore() {
    if (activeStore === "_top") return TOPSTORE;
    return data.stores.find((s) => s.id === activeStore);
  }

  /* ---------- lista della spesa ---------- */
  const keyOf = (o, s) => `${s.id}|${o.title}|${o.price ?? ""}`;
  const inList = (k) => shoplist.some((i) => i.k === k);

  function saveList() {
    localStorage.setItem("shoplist", JSON.stringify(shoplist));
    syncListUI();
  }

  function toggleList(o, s) {
    const k = keyOf(o, s);
    if (inList(k)) {
      shoplist = shoplist.filter((i) => i.k !== k);
    } else {
      shoplist.push({
        k, storeName: s.name, color: s.color, title: o.title, price: o.price,
        old_price: o.old_price, unit: o.unit, image: o.image,
        valid_until: o.valid_until, qty: 1, done: false,
      });
    }
    saveList();
  }

  function syncListUI() {
    const badge = $("listCount");
    badge.textContent = shoplist.length;
    badge.hidden = !shoplist.length;
    for (const b of document.querySelectorAll(".fav"))
      b.classList.toggle("saved", inList(b.dataset.k));
  }

  const qtyOf = (i) => i.qty || 1;
  const listTotal = () => shoplist.reduce((t, i) => t + (i.price || 0) * qtyOf(i), 0);
  const listSavings = () =>
    shoplist.reduce(
      (t, i) => t + (i.old_price && i.price ? (i.old_price - i.price) * qtyOf(i) : 0),
      0
    );

  function renderListSheet() {
    const wrap = $("listItems"), foot = $("listFooter");
    if (!shoplist.length) {
      wrap.innerHTML = '<p class="list-empty">Lista vuota.<br>Tocca ＋ su un\'offerta per aggiungerla.</p>';
      foot.innerHTML = "";
      return;
    }
    wrap.innerHTML = "";
    const sorted = [...shoplist].sort((a, b) => a.storeName.localeCompare(b.storeName));
    let lastStore = null;
    for (const item of sorted) {
      if (item.storeName !== lastStore) {
        lastStore = item.storeName;
        const head = document.createElement("p");
        head.className = "li-group";
        head.innerHTML = `<span class="storedot" style="--store-color:${esc(item.color || "#888")}"></span>${esc(item.storeName)}`;
        wrap.appendChild(head);
      }
      const row = document.createElement("div");
      row.className = "list-item" + (item.done ? " done" : "");
      const img = item.image
        ? `<img src="${esc(item.image)}" alt="" loading="lazy">`
        : `<div class="noimg-sm">🛍️</div>`;
      row.innerHTML = `<button class="li-check" aria-label="Segna come preso"></button>${img}
        <div class="li-body">
          <div class="li-title">${esc(item.title)}</div>
          <div class="li-sub">${item.unit ? esc(item.unit) : ""}</div>
        </div>
        <div class="li-qty">
          <button data-d="-1" aria-label="Meno">−</button><span>${qtyOf(item)}</span><button data-d="1" aria-label="Più">＋</button>
        </div>
        <span class="li-price">${fmtPrice((item.price || 0) * qtyOf(item))}</span>`;
      row.querySelector(".li-check").addEventListener("click", () => {
        item.done = !item.done;
        saveList();
        renderListSheet();
      });
      for (const qbtn of row.querySelectorAll(".li-qty button")) {
        qbtn.addEventListener("click", () => {
          const next = qtyOf(item) + Number(qbtn.dataset.d);
          if (next <= 0) shoplist = shoplist.filter((i) => i.k !== item.k);
          else item.qty = next;
          saveList();
          renderListSheet();
        });
      }
      wrap.appendChild(row);
    }
    const savings = listSavings();
    foot.innerHTML = `
      <div class="list-total"><span>Totale stimato (${shoplist.length})</span><span>${fmtPrice(listTotal())}</span></div>
      ${savings > 0.005 ? `<div class="list-savings">🎉 Stai risparmiando ${fmtPrice(savings)} rispetto ai prezzi pieni</div>` : ""}
      <div class="d-actions">
        <button class="btn btn-primary" id="shareList">📤 Condividi</button>
        <button class="btn btn-ghost" id="clearList">🗑️ Svuota</button>
      </div>`;
    $("shareList").addEventListener("click", shareShoplist);
    $("clearList").addEventListener("click", () => {
      shoplist = [];
      saveList();
      renderListSheet();
    });
  }

  async function shareShoplist() {
    const lines = shoplist.map(
      (i) =>
        `${i.done ? "✓ " : "• "}${qtyOf(i) > 1 ? qtyOf(i) + "× " : ""}${i.title} — ${i.storeName}` +
        (i.price != null ? ` · ${fmtPrice(i.price * qtyOf(i))}` : "")
    );
    const text = `🛒 Lista spesa SpesaOggi\n${lines.join("\n")}\n\nTotale stimato: ${fmtPrice(listTotal())}`;
    if (navigator.share) {
      try { await navigator.share({ text }); } catch {}
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      const btn = $("shareList");
      btn.textContent = "✅ Copiata!";
      setTimeout(() => (btn.textContent = "📤 Condividi"), 1500);
    }
  }

  /* ---------- filtri ---------- */
  const filtersActive = () => !!(filters.expiring || filters.bigdiscount || filters.maxprice || filters.newonly);

  function passFilters(o) {
    if (filters.newonly && !o.new) return false;
    if (filters.maxprice && !(o.price != null && o.price <= filters.maxprice)) return false;
    if (filters.bigdiscount && discountPct(o) < 0.3) return false;
    if (filters.expiring) {
      if (!o.valid_until) return false;
      const d = new Date(o.valid_until);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (isNaN(d) || d < today || d - today > 2 * 864e5) return false;
    }
    return true;
  }

  // offerte che passano ricerca + filtri rapidi (prima della categoria)
  function baseline() {
    const tokens = norm(search.value.trim()).split(/\s+/).filter(Boolean);
    const global = tokens.length > 0;
    let pool = [];
    if (global) {
      for (const s of data.stores) for (const o of s.offers) pool.push([o, s]);
    } else if (activeStore === "_top") {
      pool = topPairs().slice();
    } else {
      const store = currentStore();
      if (store) pool = store.offers.map((o) => [o, store]);
    }
    pool = pool.filter(([o]) => {
      if (tokens.length) {
        const t = norm(o.title);
        // tollera il plurale: "detersivi" trova anche "detersivo"
        if (!tokens.every((tok) => t.includes(tok) || (tok.length > 4 && t.includes(tok.slice(0, -1)))))
          return false;
      }
      return passFilters(o);
    });
    return { pool, global };
  }

  /* ---------- rendering ---------- */
  const groupOf = (s) => s.group || "super";
  // negozio visibile: ha offerte, oppure almeno un volantino PDF da scaricare
  const hasPdf = (s) => (s.leaflets || []).some((l) => l.pdf);
  const visible = (s) => s.offers.length > 0 || hasPdf(s);

  let activeGroup = null; // derivato dal negozio attivo

  function selectStore(id) {
    activeStore = id; // la categoria attiva resta: vale per tutti i negozi
    localStorage.setItem("store", id);
    const s = data.stores.find((x) => x.id === id);
    activeGroup = id === "_top" ? null : s ? groupOf(s) : activeGroup;
    if (globalMode) { search.value = ""; $("searchClear").hidden = true; }
    renderGroups();
    renderStoreBtn();
    renderCats();
    renderStaleHint();
    applyFilter();
    window.scrollTo({ top: 0 });
  }

  function renderGroups() {
    const nav = $("groups");
    nav.innerHTML = "";
    const avail = Object.keys(data.groups || {}).filter((g) =>
      data.stores.some((s) => groupOf(s) === g && visible(s))
    );
    if (avail.length < 2) { nav.hidden = true; return; }
    nav.hidden = false;
    const topBtn = document.createElement("button");
    topBtn.className = "gchip top" + (activeStore === "_top" ? " active" : "");
    topBtn.textContent = "🔥 Occasioni";
    topBtn.onclick = () => { if (activeStore !== "_top") selectStore("_top"); };
    nav.appendChild(topBtn);
    for (const g of avail) {
      const info = data.groups[g];
      const btn = document.createElement("button");
      btn.className = "gchip" + (g === activeGroup ? " active" : "");
      btn.textContent = `${info.emoji} ${info.label}`;
      btn.onclick = () => {
        if (activeGroup === g) return;
        const first = data.stores.find((s) => groupOf(s) === g && visible(s));
        if (first) selectStore(first.id);
      };
      nav.appendChild(btn);
    }
  }

  const staleDays = (s) =>
    s && s.fetched_at ? Math.floor((Date.now() - new Date(s.fetched_at)) / 864e5) : 0;

  function renderStaleHint() {
    const el = $("staleHint");
    const d = staleDays(currentStore());
    el.hidden = d < 3;
    if (d >= 3) el.textContent = `⚠️ Offerte di questo negozio aggiornate ${d} giorni fa`;
  }

  function renderStoreBtn() {
    const store = currentStore();
    const btn = $("storeBtn");
    if (!store) return;
    const isTop = store.id === "_top";
    const count = isTop ? topPairs().length : store.offers.length || "📄";
    btn.style.setProperty("--store-color", store.color);
    btn.innerHTML = `<span class="storedot"></span>${isTop ? "🔥 " : ""}${esc(store.name)}
      <span class="count">${count}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
    $("flyerBtn").hidden = isTop || !(store.leaflets && store.leaflets.length);
  }

  function renderStoreSheet(query = "") {
    const wrap = $("storeList");
    wrap.innerHTML = "";
    const q = norm(query.trim());
    for (const [gid, ginfo] of Object.entries(data.groups || {})) {
      if (!q && activeGroup && gid !== activeGroup) continue; // tab sopra: una sezione alla volta
      const stores = data.stores.filter(
        (s) => groupOf(s) === gid && visible(s) && (!q || norm(s.name).includes(q))
      );
      if (!stores.length) continue;
      const title = document.createElement("p");
      title.className = "sheet-title";
      title.textContent = `${ginfo.emoji} ${ginfo.label}`;
      wrap.appendChild(title);
      const grid = document.createElement("div");
      grid.className = "store-grid";
      for (const s of stores) {
        const b = document.createElement("button");
        b.className = "store-item" + (s.id === activeStore ? " active" : "");
        b.style.setProperty("--store-color", s.color);
        const stale = staleDays(s) >= 2 ? `<span class="stale-tag">${staleDays(s)}g</span>` : "";
        b.innerHTML = `<span class="storedot"></span><span class="store-name">${esc(s.name)}</span>
          ${stale}<span class="count">${s.offers.length || "📄"}</span>`;
        b.onclick = () => {
          closeSheet($("storeSheet"));
          if (s.id !== activeStore) selectStore(s.id);
        };
        grid.appendChild(b);
      }
      wrap.appendChild(grid);
    }
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
        const pages = leaf.pages ? `${leaf.pages} pagine · ` : "";
        a.innerHTML = `📄 ${esc(leaf.title)}<span class="opt-sub">${pages}PDF${until}</span>`;
      } else {
        a.href = leaf.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.innerHTML = `↗️ ${esc(leaf.title)}<span class="opt-sub">si apre nel browser</span>`;
      }
      list.appendChild(a);
    }
  }

  function renderCats() {
    // aggiorna il bottone categoria (il pannello si costruisce all'apertura)
    const btn = $("catBtn");
    const label = activeCat === "all"
      ? "🏷️ Tutte"
      : `${catInfo(activeCat).emoji} ${esc(catInfo(activeCat).label)}`;
    btn.classList.toggle("filtered", activeCat !== "all");
    btn.innerHTML = `${label}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
  }

  function selectCat(id) {
    activeCat = id;
    localStorage.setItem("cat", id);
    renderCats();
    applyFilter();
    window.scrollTo({ top: 0 });
  }

  function renderCatSheet(query = "") {
    const { pool } = baseline();
    const wrap = $("catList");
    wrap.innerHTML = "";
    const counts = {};
    for (const [o] of pool) counts[o.category || "altro"] = (counts[o.category || "altro"] || 0) + 1;
    const ids = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    if (activeCat !== "all" && !counts[activeCat]) ids.push(activeCat);
    const q = norm(query.trim());
    const grid = document.createElement("div");
    grid.className = "store-grid";
    const mk = (id, label, count) => {
      const b = document.createElement("button");
      b.className = "store-item" + (id === activeCat ? " active" : "");
      b.innerHTML = `<span class="store-name">${label}</span><span class="count">${count}</span>`;
      b.onclick = () => {
        closeSheet($("catSheet"));
        if (id !== activeCat) selectCat(id);
      };
      return b;
    };
    if (!q) grid.appendChild(mk("all", "🏷️ Tutte le categorie", pool.length));
    for (const id of ids) {
      const info = catInfo(id);
      if (q && !norm(info.label).includes(q)) continue;
      grid.appendChild(mk(id, `${info.emoji} ${esc(info.label)}`, counts[id] || 0));
    }
    wrap.appendChild(grid);
  }

  function applyFilter() {
    const { pool, global } = baseline();
    globalMode = global;
    renderWatchCta(global);
    filtered = pool.filter(
      ([o]) => activeCat === "all" || (o.category || "altro") === activeCat
    );

    if (activeSort === "discount") {
      filtered.sort((a, b) => discountPct(b[0]) - discountPct(a[0]));
    } else if (activeSort === "price-asc") {
      filtered.sort((a, b) => (a[0].price ?? 1e9) - (b[0].price ?? 1e9));
    } else if (activeSort === "price-desc") {
      filtered.sort((a, b) => (b[0].price ?? -1) - (a[0].price ?? -1));
    }

    grid.innerHTML = "";
    rendered = 0;
    const store = currentStore();
    const pdfOnly = !global && store && !store.offers.length && hasPdf(store);
    $("empty").innerHTML = pdfOnly
      ? "Nessuna offerta taggata per questo negozio.<br>📄 Scarica il volantino completo col bottone in basso a destra."
      : "Nessuna offerta trovata 🤷";
    $("empty").hidden = filtered.length > 0;
    renderChunk();
  }

  /* ---------- watchlist (avvisi sui prodotti) ---------- */
  function saveWatch() {
    localStorage.setItem("watch", JSON.stringify(watchlist));
  }

  function watchMatches(term) {
    const tokens = norm(term).split(/\s+/).filter(Boolean);
    const out = [];
    for (const s of data.stores)
      for (const o of s.offers) {
        const t = norm(o.title);
        if (tokens.every((tok) => t.includes(tok) || (tok.length > 4 && t.includes(tok.slice(0, -1)))))
          out.push([o, s]);
      }
    return out;
  }

  function renderWatchCta(global) {
    const hint = $("globalHint");
    hint.hidden = !global;
    if (!global) return;
    const term = search.value.trim().toLowerCase();
    const watched = watchlist.includes(term);
    hint.innerHTML = `🔎 Risultati da tutti i negozi ·
      <button id="watchToggle" class="watchtoggle${watched ? " on" : ""}">${watched ? "🔕 Rimuovi avviso" : "🔔 Avvisami"}</button>`;
    $("watchToggle").addEventListener("click", () => {
      if (watchlist.includes(term)) watchlist = watchlist.filter((t) => t !== term);
      else if (term) watchlist.push(term);
      saveWatch();
      renderWatchCta(true);
      renderWatchBar();
    });
  }

  function renderWatchBar() {
    const bar = $("watchBar");
    const hits = watchlist
      .map((term) => ({ term, n: watchMatches(term).length }))
      .filter((h) => h.n > 0);
    bar.hidden = !hits.length;
    if (!hits.length) return;
    bar.innerHTML = hits
      .slice(0, 3)
      .map((h) => `<button class="watchhit" data-term="${esc(h.term)}">🔔 «${esc(h.term)}»: ${h.n} offert${h.n === 1 ? "a" : "e"}</button>`)
      .join("");
    for (const b of bar.querySelectorAll(".watchhit"))
      b.addEventListener("click", () => {
        search.value = b.dataset.term;
        $("searchClear").hidden = false;
        renderCats();
        applyFilter();
        window.scrollTo({ top: 0 });
      });
  }

  function renderChunk() {
    const frag = document.createDocumentFragment();
    const end = Math.min(rendered + CHUNK, filtered.length);
    for (let i = rendered; i < end; i++) frag.appendChild(card(filtered[i][0], filtered[i][1]));
    rendered = end;
    grid.appendChild(frag);
  }

  function card(o, s) {
    const el = document.createElement("article");
    el.className = "card";
    const k = keyOf(o, s);
    const img = o.image
      ? `<img src="${esc(o.image)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=noimg>🛍️</div>'">`
      : `<div class="noimg">🛍️</div>`;
    const badge = o.discount ? `<span class="badge">${esc(o.discount)}</span>` : "";
    const newb = o.new ? '<span class="badge-new">Novità</span>' : "";
    const chip = globalMode || activeStore === "_top"
      ? `<span class="storechip" style="background:${esc(s.color)}">${esc(s.name)}</span>` : "";
    const oldP = o.old_price ? `<span class="old-price">${fmtPrice(o.old_price)}</span>` : "";
    const unit = o.unit ? `<span class="unit">${esc(o.unit)}</span>` : "";
    const valid = o.valid_until ? `<span class="valid">⏳ fino al ${fmtDate(o.valid_until)}</span>` : "";
    el.innerHTML = `<div class="imgwrap">${img}${badge}${newb}
        <button class="fav${inList(k) ? " saved" : ""}" data-k="${esc(k)}" aria-label="Aggiungi alla lista"></button>
      </div>
      <div class="card-body">
        ${chip}
        <div class="title">${esc(o.title)}</div>
        ${unit}
        <div class="prices"><span class="price">${fmtPrice(o.price) || esc(o.discount || "")}</span>${oldP}</div>
        ${valid}
      </div>`;
    el.querySelector(".fav").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleList(o, s);
    });
    el.addEventListener("click", () => openDetail(o, s));
    return el;
  }

  /* ---------- dettaglio offerta ---------- */
  let historyData = null;
  async function loadHistory() {
    if (historyData) return historyData;
    try {
      historyData = await (await fetch("data/history.json")).json();
    } catch {
      historyData = {};
    }
    return historyData;
  }

  function historyTag(o, s) {
    const key = `${s.id}|${o.title.toLowerCase().split(/\s+/).join(" ")}`;
    const h = historyData && historyData[key];
    if (!h || o.price == null) return "";
    const today = new Date().toISOString().slice(0, 10);
    if (h.low < o.price - 0.005)
      return `<div class="hist warn">📉 Visto più basso: ${fmtPrice(h.low)} (${fmtDate(h.low_date)})</div>`;
    if (h.low_date < today)
      return '<div class="hist good">✅ Prezzo più basso delle ultime settimane</div>';
    return "";
  }

  const STOPWORDS = new Set([
    "con", "per", "della", "delle", "degli", "dalla", "alla", "gusto", "vari",
    "tipi", "pezzi", "confezione", "linea", "senza", "extra", "alta",
  ]);

  function similarOffers(o, s) {
    const tokens = norm(o.title)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w));
    if (!tokens.length) return [];
    const need = Math.min(2, tokens.length);
    const scored = [];
    for (const s2 of data.stores) {
      if (s2.id === s.id) continue;
      for (const o2 of s2.offers) {
        const t2 = norm(o2.title);
        let shared = 0;
        for (const tok of tokens) if (t2.includes(tok)) shared++;
        if (shared >= need) scored.push([shared, o2, s2]);
      }
    }
    scored.sort((a, b) => b[0] - a[0] || (a[1].price ?? 1e9) - (b[1].price ?? 1e9));
    return scored.slice(0, 3);
  }

  function similarTerm(title) {
    const words = title.split(/[\s,\-–—"]+/).filter((w) => w.length > 3);
    return words.slice(0, 2).join(" ");
  }

  function openDetail(o, s) {
    const k = keyOf(o, s);
    const img = o.image
      ? `<img class="d-img" src="${esc(o.image)}" alt="" onerror="this.outerHTML='<div class=\\'d-img noimg\\'>🛍️</div>'">`
      : `<div class="d-img noimg">🛍️</div>`;
    const oldP = o.old_price ? `<span class="old-price">${fmtPrice(o.old_price)}</span>` : "";
    const badge = o.discount ? `<span class="badge d-badge">${esc(o.discount)}</span>` : "";
    const meta = [
      o.unit ? esc(o.unit) : "",
      o.valid_until ? `⏳ fino al ${fmtDate(o.valid_until)}` : "",
    ].filter(Boolean).join(" · ");
    $("detailBody").innerHTML = `${img}
      <span class="storechip" style="background:${esc(s.color)}">${esc(s.name)}</span>
      <div class="d-title">${esc(o.title)}</div>
      ${meta ? `<div class="d-meta">${meta}</div>` : ""}
      <div class="prices d-prices"><span class="price">${fmtPrice(o.price) || esc(o.discount || "")}</span>${oldP}${badge}</div>
      <div id="dHist"></div>
      <div class="d-actions">
        <button class="btn btn-primary" id="dFav">${inList(k) ? "✓ Nella lista" : "＋ Aggiungi alla lista"}</button>
        <button class="btn btn-ghost" id="dSimilar" title="Cerca negli altri negozi">🔍</button>
        <button class="btn btn-ghost" id="dShare">📤</button>
      </div>`;
    loadHistory().then(() => {
      const el = $("dHist");
      if (el) el.innerHTML = historyTag(o, s);
    });
    const sims = similarOffers(o, s);
    if (sims.length) {
      const box = document.createElement("div");
      box.className = "d-similar";
      box.innerHTML = "<p class='d-similar-title'>Negli altri negozi</p>";
      for (const [, o2, s2] of sims) {
        const row = document.createElement("button");
        row.className = "sim-row";
        const cheaper = o2.price != null && o.price != null && o2.price < o.price - 0.005;
        row.innerHTML = `<span class="storechip" style="background:${esc(s2.color)}">${esc(s2.name)}</span>
          <span class="sim-title">${esc(o2.title)}</span>
          <span class="sim-price${cheaper ? " cheaper" : ""}">${fmtPrice(o2.price) || esc(o2.discount || "")}</span>`;
        row.addEventListener("click", () => openDetail(o2, s2));
        box.appendChild(row);
      }
      $("detailBody").appendChild(box);
    }
    $("dSimilar").addEventListener("click", () => {
      const term = similarTerm(o.title);
      if (!term) return;
      closeSheet($("detailSheet"));
      search.value = term;
      $("searchClear").hidden = false;
      renderCats();
      applyFilter();
      window.scrollTo({ top: 0 });
    });
    $("dFav").addEventListener("click", () => {
      toggleList(o, s);
      $("dFav").textContent = inList(k) ? "✓ Nella lista" : "＋ Aggiungi alla lista";
    });
    $("dShare").addEventListener("click", async () => {
      const text = `${o.title} — ${s.name}${o.price != null ? " · " + fmtPrice(o.price) : ""}${o.discount ? ` (${o.discount})` : ""}\nvia SpesaOggi Pesaro`;
      if (navigator.share) { try { await navigator.share({ text }); } catch {} }
      else if (navigator.clipboard) await navigator.clipboard.writeText(text);
    });
    openSheet($("detailSheet"));
  }

  /* ---------- init ---------- */
  function renderSkeleton() {
    grid.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      const el = document.createElement("div");
      el.className = "card sk";
      el.innerHTML = '<div class="sk-img"></div><div class="card-body"><div class="sk-line"></div><div class="sk-line short"></div></div>';
      grid.appendChild(el);
    }
  }

  async function init() {
    renderSkeleton();
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

    const valid = data.stores.filter(visible);
    if (activeStore !== "_top") {
      const current = valid.find((s) => s.id === activeStore);
      activeStore = current ? current.id : "_top"; // default: vetrina occasioni
    }
    const cur = currentStore();
    activeGroup = activeStore === "_top" ? null : cur ? groupOf(cur) : null;

    renderGroups();
    renderStoreBtn();
    renderCats();
    renderStaleHint();
    applyFilter();
    syncListUI();
    renderWatchBar();

    if (new URLSearchParams(location.search).has("list")) {
      renderListSheet();
      openSheet($("listSheet"));
    }

    new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && rendered < filtered.length) renderChunk();
    }, { rootMargin: "600px" }).observe($("sentinel"));
  }

  /* ---------- eventi ---------- */
  let debounce;
  search.addEventListener("input", () => {
    $("searchClear").hidden = !search.value;
    $("recentBar").hidden = true;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      renderCats();
      applyFilter();
      saveRecent(search.value);
    }, 150);
  });
  $("searchClear").addEventListener("click", () => {
    search.value = "";
    $("searchClear").hidden = true;
    renderCats();
    applyFilter();
    search.focus();
  });

  // bottom sheet ordinamento + filtri
  const sheet = $("sheet");
  function syncSortUI() {
    for (const btn of sheet.querySelectorAll(".sheet-opt[data-sort]"))
      btn.classList.toggle("active", btn.dataset.sort === activeSort);
    for (const btn of sheet.querySelectorAll(".fchip[data-filter]"))
      btn.classList.toggle("active", !!filters[btn.dataset.filter]);
    for (const btn of sheet.querySelectorAll(".fchip[data-maxprice]"))
      btn.classList.toggle("active", filters.maxprice === Number(btn.dataset.maxprice));
    $("sortDot").hidden = activeSort === "default" && !filtersActive();
  }
  function saveFilters() {
    localStorage.setItem("filters", JSON.stringify(filters));
    syncSortUI();
    renderCats();
    applyFilter();
  }
  function renderWatchManage() {
    const wrap = $("watchManage");
    wrap.hidden = !watchlist.length;
    if (!watchlist.length) return;
    const terms = $("watchTerms");
    terms.innerHTML = "";
    for (const term of watchlist) {
      const b = document.createElement("button");
      b.className = "fchip on";
      b.textContent = `🔔 ${term} ✕`;
      b.onclick = () => {
        watchlist = watchlist.filter((t) => t !== term);
        saveWatch();
        renderWatchManage();
        renderWatchBar();
      };
      terms.appendChild(b);
    }
  }

  $("sortBtn").addEventListener("click", () => {
    syncSortUI();
    renderWatchManage();
    openSheet(sheet);
  });
  sheet.addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined && !e.target.closest(".sheet-panel")) {
      closeSheet(sheet);
      return;
    }
    const fchip = e.target.closest(".fchip");
    if (fchip) {
      if (fchip.dataset.filter) {
        filters[fchip.dataset.filter] = !filters[fchip.dataset.filter];
      } else {
        const v = Number(fchip.dataset.maxprice);
        filters.maxprice = filters.maxprice === v ? null : v;
      }
      saveFilters(); // il sheet resta aperto: i filtri si compongono
      return;
    }
    if (e.target.id === "resetFilters") {
      filters = {};
      activeSort = "default";
      localStorage.setItem("sort", activeSort);
      saveFilters();
      closeSheet(sheet);
      return;
    }
    if (e.target.id === "resetAll") {
      // ripristina i default: la lista della spesa NON si tocca
      for (const key of ["store", "cat", "sort", "filters"]) localStorage.removeItem(key);
      location.reload();
      return;
    }
    const opt = e.target.closest(".sheet-opt[data-sort]");
    if (!opt) return;
    activeSort = opt.dataset.sort;
    localStorage.setItem("sort", activeSort);
    syncSortUI();
    closeSheet(sheet);
    applyFilter();
    window.scrollTo({ top: 0 });
  });
  syncSortUI();

  // sheet volantini
  const flyerSheet = $("flyerSheet");
  $("flyerBtn").addEventListener("click", () => {
    renderFlyerSheet();
    openSheet(flyerSheet);
  });
  flyerSheet.addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined || e.target.closest(".sheet-opt"))
      closeSheet(flyerSheet);
  });

  // sheet scelta negozio
  $("storeBtn").addEventListener("click", () => {
    $("storeSearch").value = "";
    renderStoreSheet();
    openSheet($("storeSheet"));
  });
  $("storeSheet").addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined) closeSheet($("storeSheet"));
  });
  $("storeSearch").addEventListener("input", () => renderStoreSheet($("storeSearch").value));

  // sheet scelta categoria
  $("catBtn").addEventListener("click", () => {
    $("catSearch").value = "";
    renderCatSheet();
    openSheet($("catSheet"));
  });
  $("catSheet").addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined) closeSheet($("catSheet"));
  });
  $("catSearch").addEventListener("input", () => renderCatSheet($("catSearch").value));

  // sheet dettaglio + lista spesa: chiusura su backdrop
  for (const id of ["detailSheet", "listSheet"]) {
    $(id).addEventListener("click", (e) => {
      if (e.target.dataset.close !== undefined) closeSheet($(id));
    });
  }
  $("listBtn").addEventListener("click", () => {
    renderListSheet();
    openSheet($("listSheet"));
  });

  // torna su
  const topBtn = $("topBtn");
  window.addEventListener("scroll", () => {
    topBtn.hidden = window.scrollY < 800;
  }, { passive: true });
  topBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  // banner di installazione PWA
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvt = e;
    if (!localStorage.getItem("installdismiss")) $("installBar").hidden = false;
  });
  $("installGo").addEventListener("click", () => {
    $("installBar").hidden = true;
    if (installEvt) { installEvt.prompt(); installEvt = null; }
  });
  $("installNo").addEventListener("click", () => {
    localStorage.setItem("installdismiss", "1");
    $("installBar").hidden = true;
  });

  // tema manuale (auto -> chiaro -> scuro)
  const THEMES = { auto: "\u{1F317} Tema: automatico", light: "\u2600\uFE0F Tema: chiaro", dark: "\u{1F319} Tema: scuro" };
  let theme = localStorage.getItem("theme") || "auto";
  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    $("themeToggle").textContent = THEMES[theme];
  }
  $("themeToggle").addEventListener("click", () => {
    theme = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    localStorage.setItem("theme", theme);
    applyTheme();
  });
  applyTheme();

  // ricerche recenti
  let recents = JSON.parse(localStorage.getItem("recent") || "[]");
  function saveRecent(term) {
    term = term.trim().toLowerCase();
    if (term.length < 3) return;
    recents = [term, ...recents.filter((t) => t !== term)].slice(0, 6);
    localStorage.setItem("recent", JSON.stringify(recents));
  }
  function showRecents() {
    const bar = $("recentBar");
    if (search.value.trim() || !recents.length) { bar.hidden = true; return; }
    bar.innerHTML = recents
      .map((t) => `<button class="recentchip" data-t="${esc(t)}">\u{1F550} ${esc(t)}</button>`)
      .join("");
    for (const b of bar.querySelectorAll(".recentchip"))
      b.addEventListener("click", () => {
        search.value = b.dataset.t;
        $("searchClear").hidden = false;
        bar.hidden = true;
        renderCats();
        applyFilter();
      });
    bar.hidden = false;
  }
  search.addEventListener("focus", showRecents);
  search.addEventListener("blur", () => setTimeout(() => { $("recentBar").hidden = true; }, 250));

  // ricarica i dati se l'app riapre dopo ore
  const loadedAt = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - loadedAt > 3 * 3600e3)
      location.reload();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
    // nuova versione attivata -> ricarica una volta per uscire dalla shell vecchia
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }

  init();
})();
