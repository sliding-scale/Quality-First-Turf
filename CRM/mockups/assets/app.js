/* Shared shell: sidebar, top bar, menus, toasts. Pages put their content in #page. */
(function () {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  let toastTimer;
  function toast(msg) {
    document.querySelectorAll(".toast").forEach((n) => n.remove());
    const t = el(`<div class="toast" role="status">${msg}</div>`);
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2600);
  }
  const soon = (what) => toast(`${what || "That"} is not part of this mockup yet.`);

  let openMenu = null;
  let menuCleanup = null;
  function closeMenu() {
    if (openMenu) { openMenu.remove(); openMenu = null; }
    if (menuCleanup) { menuCleanup(); menuCleanup = null; }
  }
  document.addEventListener("click", (e) => { if (openMenu && !openMenu.contains(e.target) && !e.target.closest("[data-menu-anchor]")) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  /* items: [{label, icon?, href?, checked?, onSelect?}] */
  function dropdown(anchor, items, opts) {
    closeMenu();
    const menu = el(`<div class="menu" role="menu"></div>`);
    items.forEach((it) => {
      const node = it.href ? el(`<a role="menuitem" href="${it.href}"></a>`) : el(`<button type="button" role="menuitem"${it.checked !== undefined ? ` aria-checked="${it.checked}"` : ""}></button>`);
      node.innerHTML = (it.checked !== undefined ? `<span class="check">${it.checked ? window.icon("check", 16) : ""}</span>` : "") + (it.icon ? window.icon(it.icon, 18) : "") + `<span>${it.label}</span>`;
      if (!it.href) node.addEventListener("click", () => { closeMenu(); it.onSelect && it.onSelect(it); });
      menu.appendChild(node);
    });
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    let left = (opts && opts.alignRight) ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    menu.style.left = left + "px";
    menu.style.top = r.bottom + 6 + window.scrollY + "px";
    anchor.setAttribute("data-menu-anchor", "");
    openMenu = menu;
    return menu;
  }

  const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = (n) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  function dayLabel(daysAgo) {
    const d = new Date(window.QFT.today);
    d.setDate(d.getDate() - daysAgo);
    if (daysAgo < 7) return daysAgo === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function fullDate(daysAgo, time) {
    const d = new Date(window.QFT.today);
    d.setDate(d.getDate() - daysAgo);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + (time ? ", " + time : "");
  }
  const CODE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  function shortCode(id) {
    let n = Number(id) * 7919, s = "";
    for (let i = 0; i < 6; i++) { s += CODE[n % CODE.length]; n = Math.floor(n / CODE.length) + 17; }
    return s.slice(0, 3) + "-" + s.slice(3);
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const NAV = [
    { key: "create", label: "Create", icon: "circle-plus", create: true },
    { key: "home", label: "Home", icon: "home", href: "index.html" },
    { key: "schedule", label: "Schedule", icon: "calendar" },
    { divider: true },
    { key: "clients", label: "Clients", icon: "contact", href: "clients.html" },
    { key: "requests", label: "Requests", icon: "inbox" },
    { key: "quotes", label: "Quotes", icon: "quote" },
    { key: "jobs", label: "Jobs", icon: "hammer" },
    { key: "invoices", label: "Invoices", icon: "receipt" },
    { key: "payments", label: "Payments", icon: "card" },
    { divider: true },
    { key: "messages", label: "Messages", icon: "message" },
    { key: "pipeline", label: "Pipeline", icon: "kanban" },
  ];

  function build() {
    const active = document.body.dataset.nav;
    const content = document.getElementById("page");
    const business = store.get("qft-mock-business", window.QFT.businesses[0]);
    const navHtml = NAV.map((n) => {
      if (n.divider) return `<hr class="divider">`;
      const inner = `${window.icon(n.icon, 24)}<span class="label">${n.label}</span>`;
      if (n.create) return `<button type="button" class="item" id="createBtn" title="Create">${inner}</button>`;
      if (n.href) return `<a class="item${n.key === active ? " active" : ""}" href="${n.href}" title="${n.label}"${n.key === active ? ' aria-current="page"' : ""}>${inner}</a>`;
      return `<a class="item soon" href="#" data-soon="${n.label}" title="${n.label}">${inner}</a>`;
    }).join("");

    const app = el(`<div class="app">
      <header class="topbar">
        <button type="button" class="brand" id="brandBtn" aria-label="Switch business">
          <span class="brand-mark">Q</span><span class="brand-name" id="brandName">${esc(business)}</span>${window.icon("chevdown", 16)}
        </button>
        <span class="grow"></span>
        <form class="search" id="globalSearch" role="search">
          ${window.icon("search", 18)}<input id="gs" type="search" placeholder="Press / to search" aria-label="Search clients, projects, quotes">
        </form>
        <button class="icon-btn" type="button" data-soon="Messages" aria-label="Messages">${window.icon("message", 24)}</button>
        <button class="icon-btn" type="button" data-soon="Notifications" aria-label="Notifications">${window.icon("bell", 24)}<span class="badge">3</span></button>
        <button class="icon-btn" type="button" data-soon="Settings" aria-label="Settings">${window.icon("sliders", 24)}</button>
      </header>
      <nav class="sidebar" aria-label="Main"><div class="nav">${navHtml}</div>
        <button type="button" class="collapse" id="collapseBtn" aria-label="Collapse menu">${window.icon("arrowleft", 24)}<span class="label">Collapse</span></button>
      </nav>
      <main class="main" id="main"></main>
    </div>`);
    app.querySelector("#main").appendChild(content);
    document.body.appendChild(app);
    if (store.get("qft-mock-rail", "0") === "1") document.body.classList.add("rail");

    document.querySelectorAll("[data-soon]").forEach((n) => n.addEventListener("click", (e) => { e.preventDefault(); soon(n.dataset.soon); }));

    document.getElementById("collapseBtn").addEventListener("click", () => {
      document.body.classList.toggle("rail");
      store.set("qft-mock-rail", document.body.classList.contains("rail") ? "1" : "0");
    });

    // Create: a horizontal row of coloured icons beside the button, like Jobber. The button turns into an X while open.
    document.getElementById("createBtn").addEventListener("click", (e) => {
      e.stopPropagation(); // the button swaps its own contents, so the outside-click check would misread this click
      const btn = e.currentTarget;
      if (btn.classList.contains("open")) { closeMenu(); return; }
      closeMenu();
      const items = [
        { label: "Client", icon: "user", color: "var(--ink)", href: "client-new.html" },
        { label: "Request", icon: "inbox", color: "var(--orange)", soon: "Requests" },
        { label: "Quote", icon: "quote", color: "var(--burgundy)", soon: "Quotes" },
        { label: "Job", icon: "hammer", color: "var(--green)", soon: "Jobs" },
        { label: "Invoice", icon: "receipt", color: "var(--navy)", soon: "Invoices" },
        { label: "Intake form", icon: "intake", color: "var(--muted)", soon: "The intake form" },
      ];
      const pop = el(`<div class="create-pop" role="menu">${items.map((i) => {
        const tag = i.href ? `a href="${i.href}"` : `button type="button"`;
        return `<${tag} class="cp-item" role="menuitem" style="--c:${i.color}">${window.icon(i.icon, 28)}<span>${i.label}</span></${i.href ? "a" : "button"}>`;
      }).join("")}</div>`);
      document.body.appendChild(pop);
      pop.querySelectorAll("button.cp-item").forEach((n, k) => n.addEventListener("click", () => {
        const it = items.filter((x) => !x.href)[k];
        closeMenu();
        soon(it.soon);
      }));
      const r = btn.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.right + 12, window.innerWidth - pop.offsetWidth - 8));
      pop.style.left = left + "px";
      pop.style.top = r.top + r.height / 2 + "px";
      const original = btn.innerHTML;
      btn.classList.add("open");
      btn.innerHTML = `<span class="xcircle">${window.icon("x", 14)}</span><span class="label">Create</span>`;
      btn.setAttribute("data-menu-anchor", "");
      openMenu = pop;
      menuCleanup = () => { btn.classList.remove("open"); btn.innerHTML = original; };
    });

    document.getElementById("brandBtn").addEventListener("click", (e) => {
      dropdown(e.currentTarget, window.QFT.businesses.map((b) => ({
        label: b,
        checked: b === store.get("qft-mock-business", window.QFT.businesses[0]),
        onSelect: () => { store.set("qft-mock-business", b); document.getElementById("brandName").textContent = b; toast(`Switched to ${esc(b)}`); },
      })));
    });

    const gs = document.getElementById("gs");
    document.getElementById("globalSearch").addEventListener("submit", (e) => {
      e.preventDefault();
      if (gs.value.trim()) location.href = "clients.html?q=" + encodeURIComponent(gs.value.trim());
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); gs.focus(); }
    });
  }

  window.ui = { icon: window.icon, el, toast, soon, dropdown, closeMenu, money, money0, dayLabel, fullDate, shortCode, esc, initials, store };
  build();
})();
