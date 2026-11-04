/* Client page (PRD contact profile): details, related projects, activity history, notes. */
(function () {
  const { icon, esc, fullDate, shortCode, dropdown, soon, store, money } = window.ui;
  const id = new URLSearchParams(location.search).get("id");
  const c = window.QFT.findClient(id) || window.QFT.allClients()[0];
  document.title = `${c.name} · Quality First Turf CRM (mockup)`;

  const code = shortCode(c.id);
  // Sample figures, derived from the id so they stay the same between page loads.
  const lifetime = c.id === 1001 ? 0 : ((c.id * 7919) % 24 + 3) * 900;
  const balance = c.id % 5 === 0 ? ((c.id % 7) + 1) * 350 : 0;
  const addr = [c.street1, c.street2, c.city, `${c.state} ${c.zip}`].filter(Boolean).join(", ");
  const S = window.QFT.salesStages, P = window.QFT.preplanningStages;

  // Related projects: one record per project, shown with the pipeline and stage it is in now.
  const projects = [{ code, title: `${c.name} · ${c.city}`, pipeline: "Sales", stage: S[c.id % S.length], owner: "Sal", daysAgo: c.daysAgo + 8 }];
  if (c.id % 3 === 0) projects.push({ code: shortCode(c.id + 500), title: `${c.name} · patio`, pipeline: "Preplanning", stage: P[c.id % P.length], owner: "May", daysAgo: c.daysAgo + 30 });

  const visits = [
    { daysAgo: -1, time: "9:00 AM", title: `Follow-up visit 1 · ${code}`, who: "Sal", done: false },
    { daysAgo: 2, time: "9:00 AM", title: `Onsite consultation · ${code}`, who: "Sal", done: true },
  ];
  const activity = [
    { i: "sms", t: `Text sent: appointment reminder for ${fullDate(-1, "9:00 AM")}`, by: "Sal", daysAgo: 2 },
    { i: "stage", t: `Stage changed: ${S[0]} → ${S[1]}`, by: "Sal", daysAgo: 4 },
    { i: "note", t: "Note added: customer wants a pet-friendly turf option", by: "Sal", daysAgo: 5 },
    { i: "inbox", t: `Project ${code} created from the customer form`, by: "System", daysAgo: c.daysAgo + 8 },
    { i: "contact", t: "Client created", by: "System", daysAgo: c.daysAgo + 8 },
  ];

  const noteKey = "qft-mock-notes-" + c.id;
  const notes = () => {
    let saved = [];
    try { saved = JSON.parse(store.get(noteKey, "[]")); } catch (e) { /* ignore */ }
    return saved.concat(c.notes ? [{ t: c.notes, d: "From the client form" }] : []);
  };

  let tab = (location.hash || "#info").slice(1);
  if (!["info", "activity"].includes(tab)) tab = "info";
  const root = document.getElementById("root");

  function head() {
    return `
    <div class="client-head">
      <div class="left">
        <div class="who"><span class="pill tag">${esc(c.type)}</span>
          <a href="clients.html" class="btn link plain" style="margin-left:8px">${icon("chevleft", 18)} All clients</a></div>
        <div class="name-row"><h1>${esc(c.name)}</h1><a class="btn" href="client-new.html?edit=${c.id}" aria-label="Edit client">${icon("pencil", 22)}</a></div>
      </div>
      <div class="page-head" style="margin:0"><div class="actions">
        <button class="btn primary" type="button" id="createBtn2">${icon("plus", 18)} Create</button>
      </div></div>
    </div>
    <dl class="fields">
      <div class="f"><dt>Phone</dt><dd><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></dd></div>
      <div class="f"><dt>Client type</dt><dd>${esc(c.type)}</dd></div>
      <div class="f"><dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd></div>
      <div class="f"><dt>Company</dt><dd>${esc(c.company || "None")}</dd></div>
      <div class="f"><dt>Address</dt><dd>${esc(addr)}</dd></div>
      <div class="f"><dt>Business</dt><dd>${esc(c.business)}</dd></div>
    </dl>
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-tab="info">Client information</button>
      <button class="tab" role="tab" data-tab="activity">Activity</button>
    </div>`;
  }

  function info() {
    return `
    <section class="card panel"><div class="ph"><h3>Related projects</h3></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Project</th><th>Pipeline</th><th>Stage</th><th>Assigned</th><th>Created</th></tr></thead><tbody>
      ${projects.map((p) => `<tr><td><b style="color:var(--ink)">${esc(p.title)}</b><br><span class="muted">${p.code}</span></td><td>${p.pipeline}</td>
        <td><span class="pill stage-pill">${esc(p.stage)}</span></td><td>${p.owner}</td><td>${fullDate(p.daysAgo)}</td></tr>`).join("")}
      </tbody></table></div></section>

    <section class="card panel"><div class="ph"><h3>Scheduled visits</h3></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Schedule</th><th>Title</th><th>Assigned</th></tr></thead><tbody>
      ${visits.map((v) => `<tr><td><b style="color:var(--ink)">${fullDate(v.daysAgo, v.time)}</b>${v.done ? `<br><span class="muted">Completed</span>` : ""}</td><td>${esc(v.title)}</td><td>${v.who}</td></tr>`).join("")}
      </tbody></table></div></section>`;
  }

  function activityTab() {
    return `<section class="card panel"><div class="ph"><h3>Activity history</h3></div><div class="timeline">${activity.map((a) => `
      <div class="tl"><span class="badge-ic">${icon(a.i, 20)}</span><div class="t"><b>${esc(a.t)}</b><div class="d">${esc(a.by)} · ${fullDate(a.daysAgo)}</div></div></div>`).join("")}</div></section>`;
  }

  function aside() {
    const ns = notes();
    return `<aside class="aside">
      <div class="card"><h3>Overview</h3><div class="amt">${money(lifetime)}<small>Lifetime value</small></div><div class="amt">${money(balance)}<small>Current balance</small></div></div>
      <div class="card"><h3>Notes</h3><div class="note-box"><textarea id="noteText" placeholder="Leave an internal note for yourself or a team member" aria-label="New note"></textarea>
        <button class="btn small" type="button" id="noteAdd">Add note</button></div>
        <div id="noteList">${ns.map((n) => `<div class="note-item">${esc(n.t)}<div class="d">${esc(n.d)}</div></div>`).join("")}</div></div>
    </aside>`;
  }

  function render() {
    root.innerHTML = head() + `<div class="layout-2col"><div class="main-col">${tab === "info" ? info() : activityTab()}</div>${aside()}</div>`;
    root.querySelectorAll(".tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
      b.setAttribute("aria-selected", b.dataset.tab === tab);
      b.addEventListener("click", () => { tab = b.dataset.tab; history.replaceState(null, "", "#" + tab); render(); });
    });
    root.querySelector("#createBtn2").addEventListener("click", (e) =>
      dropdown(e.currentTarget, [["Quote", "quote"], ["Job", "hammer"], ["Invoice", "receipt"]].map(([l, ic]) => ({ label: l, icon: ic, onSelect: () => soon(l + "s") })), { alignRight: true }));
    root.querySelector("#noteAdd").addEventListener("click", () => {
      const t = root.querySelector("#noteText").value.trim();
      if (!t) return;
      let list = [];
      try { list = JSON.parse(store.get(noteKey, "[]")); } catch (e) { /* ignore */ }
      list.unshift({ t, d: "Sal · " + new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) });
      store.set(noteKey, JSON.stringify(list));
      render();
    });
  }

  render();
})();
