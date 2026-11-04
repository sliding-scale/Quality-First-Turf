/* Clients list: search, Homeowner/Contractor filter, sorting, pagination, CSV export. */
(function () {
  const { icon, esc, dayLabel, dropdown, toast } = window.ui;
  const params = new URLSearchParams(location.search);

  const state = { q: params.get("q") || "", type: "All", sort: { key: "daysAgo", dir: "asc" }, page: 1, size: 25 };
  document.getElementById("q").value = state.q;
  document.getElementById("searchIc").innerHTML = icon("search", 20);
  document.querySelector(".searchbox").insertAdjacentElement("afterbegin", document.getElementById("searchIc"));
  if (params.get("saved")) toast("Client saved (sample data, stored in this browser only)");

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const list = window.QFT.allClients().filter((c) => {
      if (state.type !== "All" && c.type !== state.type) return false;
      if (!q) return true;
      return [c.name, c.contactName, c.company, c.email, c.phone, c.street1, c.city, c.zip].join(" ").toLowerCase().includes(q);
    });
    const { key, dir } = state.sort;
    list.sort((a, b) => {
      const x = key === "name" ? a.name.toLowerCase() : a[key];
      const y = key === "name" ? b.name.toLowerCase() : b[key];
      return (x < y ? -1 : x > y ? 1 : 0) * (dir === "asc" ? 1 : -1);
    });
    return list;
  }

  function kpis() {
    const a = window.QFT.allClients();
    const recent = a.filter((c) => c.daysAgo <= 30);
    const card = (title, sub, n, delta) => `
      <div class="card kpi"><div class="h"><span>${title}</span>${icon("arrowupright", 18)}</div>
      <div class="s">${sub}</div><div class="n">${n}${delta ? `<span class="delta">${delta}</span>` : ""}</div></div>`;
    document.getElementById("kpis").innerHTML =
      card("New leads", "Past 30 days", recent.filter((c) => c.id % 5 === 0).length, "↑ 12%") +
      card("New clients", "Past 30 days", recent.length, "↑ 8%") +
      card("Total clients", "All time", a.length, "");
  }

  function pageButtons(pages) {
    const list = [...new Set([1, pages, state.page, state.page - 1, state.page + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
    let out = "", prev = 0;
    list.forEach((n) => {
      if (n - prev > 1) out += `<span class="gap">…</span>`;
      out += `<button type="button" class="pg${n === state.page ? " current" : ""}" data-p="${n}"${n === state.page ? ' aria-current="page"' : ""}>${n}</button>`;
      prev = n;
    });
    return out;
  }

  function render() {
    document.getElementById("typeChip").innerHTML = `Type<span class="sep"></span><b>${esc(state.type)}</b>`;
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / state.size));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * state.size;
    const slice = list.slice(start, start + state.size);
    document.getElementById("count").textContent = `(${list.length} client${list.length === 1 ? "" : "s"})`;

    document.getElementById("rows").innerHTML = slice.length ? slice.map((c) => {
      const addr = c.street1 ? `${esc(c.street1)}, ${esc(c.city)}, ${esc(c.state)} ${esc(c.zip)}` : "";
      const sub = c.company && c.name !== c.company ? esc(c.company) : (c.company ? `Contact: ${esc(c.contactName)}` : "");
      return `<tr class="click" data-id="${c.id}">
        <td><div class="strong">${esc(c.name)}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</td>
        <td style="white-space:nowrap">${esc(c.phone)}</td><td>${esc(c.email)}</td><td>${addr}</td>
        <td><span class="pill tag">${esc(c.type)}</span></td>
        <td style="white-space:nowrap">${dayLabel(c.daysAgo)}</td></tr>`;
    }).join("") : `<tr><td colspan="6"><div class="empty" style="margin:20px 0">No clients match these filters.</div></td></tr>`;

    document.querySelectorAll("[data-sort]").forEach((b) => {
      const on = state.sort.key === b.dataset.sort;
      b.querySelector(".s").innerHTML = icon("sort", 16);
      b.setAttribute("aria-sort", on ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none");
      b.style.opacity = on ? 1 : 0.8;
    });

    const from = list.length ? start + 1 : 0, to = Math.min(start + state.size, list.length);
    document.getElementById("pager").innerHTML = `
      <div class="left"><label for="size">Rows per page</label>
        <select id="size" aria-label="Rows per page">${[10, 25, 50, 100].map((n) => `<option${n === state.size ? " selected" : ""}>${n}</option>`).join("")}</select>
        <span>${from}–${to} of ${list.length}</span></div>
      <div class="right pages">
        <button type="button" class="pg" data-p="${state.page - 1}" ${state.page === 1 ? "disabled" : ""} aria-label="Previous page">${icon("chevleft", 20)}</button>
        ${pageButtons(pages)}
        <button type="button" class="pg" data-p="${state.page + 1}" ${state.page === pages ? "disabled" : ""} aria-label="Next page">${icon("chevright", 20)}</button>
      </div>`;
  }

  document.getElementById("rows").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) location.href = "client.html?id=" + tr.dataset.id;
  });
  document.getElementById("pager").addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]");
    if (b && !b.disabled) { state.page = Number(b.dataset.p); render(); document.getElementById("main").scrollTo({ top: 0 }); }
  });
  document.getElementById("pager").addEventListener("change", (e) => {
    if (e.target.id === "size") { state.size = Number(e.target.value); state.page = 1; render(); }
  });
  document.getElementById("q").addEventListener("input", (e) => { state.q = e.target.value; state.page = 1; render(); });
  document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.sort;
    state.sort = { key: k, dir: state.sort.key === k && state.sort.dir === "asc" ? "desc" : "asc" };
    render();
  }));
  document.getElementById("typeChip").addEventListener("click", (e) =>
    dropdown(e.currentTarget, ["All", "Homeowner", "Contractor"].map((o) => ({ label: o, checked: state.type === o, onSelect: () => { state.type = o; state.page = 1; render(); } }))));

  document.getElementById("exportBtn").addEventListener("click", () => {
    const rows = filtered();
    const q = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const head = ["Name", "Company", "Type", "Phone", "Email", "Street", "City", "State", "ZIP", "Business"];
    const csv = [head.join(",")].concat(rows.map((c) => [c.name, c.company, c.type, c.phone, c.email, c.street1, c.city, c.state, c.zip, c.business].map(q).join(","))).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "clients.csv"; a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} clients`);
  });

  kpis();
  render();
})();
