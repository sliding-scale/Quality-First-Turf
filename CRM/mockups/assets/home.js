/* Home: greeting, workflow cards, today's appointments, my messages, upcoming consultations. Sample data. */
(function () {
  const { icon, money0, esc } = window.ui;
  const now = window.QFT.today;
  const hour = now.getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  document.getElementById("today").textContent = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  document.getElementById("greeting").textContent = `Good ${part}, Sal`;

  const cards = [
    { bar: "var(--orange)", icon: "inbox", name: "Requests", big: 4, label: "New leads", lines: [["Approved leads", 2], ["Overdue follow-ups", 1]] },
    { bar: "var(--burgundy)", icon: "quote", name: "Quotes", big: 4, label: "Pending", lines: [["Draft (2)", money0(5200)], ["Changes requested (1)", ""]] },
    { bar: "var(--green)", icon: "hammer", name: "Jobs", big: 2, label: "Awaiting invoicing", lines: [["Active (5)", money0(38420)], ["Action required (1)", ""]] },
    { bar: "var(--navy)", icon: "receipt", name: "Invoices", big: money0(12300), label: "Outstanding", lines: [["Draft (1)", ""], ["Past due (2)", money0(4150)]] },
  ];
  document.getElementById("workflow").innerHTML = cards.map((c) => `
    <div class="wf-card" style="--bar:${c.bar}">
      <div class="top">${icon(c.icon, 20)}<span>${c.name}</span></div>
      <div class="big">${c.big}</div>
      <div class="lbl">${c.label}</div>
      ${c.lines.map((l) => `<div class="ln"><span>${l[0]}</span><span>${l[1]}</span></div>`).join("")}
    </div>`).join("");

  /* Today's appointments */
  const appts = [
    { time: "8:30 AM", title: "Consultation", client: "Maria Alvarez", where: "1840 Oak Ridge Dr, Temecula", who: "Sal", state: "completed" },
    { time: "11:00 AM", title: "Follow-up visit 1", client: "David Kim", where: "27310 Canyon View Rd, Murrieta", who: "Sal", state: "active" },
    { time: "2:30 PM", title: "Consultation", client: "Rivera Landscape", where: "9120 Hillcrest Ave, Upland", who: "Robert", state: "upcoming" },
  ];
  const count = (s) => appts.filter((a) => a.state === s).length;
  let mode = "Visit";

  function row(a) {
    return `<div class="appt"><div class="time">${a.time}</div>
      <div class="t"><b>${esc(a.title)} · ${esc(a.client)}</b><span class="muted">${esc(a.where)}</span></div>
      <span class="pill ${a.state === "completed" ? "active" : a.state === "active" ? "lead" : "draft"}">${a.state === "completed" ? "Completed" : a.state === "active" ? "In progress" : "Upcoming"}</span></div>`;
  }
  function group(label, list, emptyText) {
    return `<div class="group-label">${label} (${list.length})</div>` +
      (list.length ? list.map(row).join("") : `<div class="empty">${emptyText}</div>`);
  }
  function renderAppts() {
    const el = document.getElementById("appts");
    let body;
    if (mode === "Visit") {
      body = group("OVERDUE", [], "No overdue events") + group("ACTIVE", appts.filter((a) => a.state === "active"), "No active events") +
        group("UPCOMING", appts.filter((a) => a.state === "upcoming"), "No upcoming events") + group("COMPLETED", appts.filter((a) => a.state === "completed"), "Nothing completed yet");
    } else {
      body = ["Sal", "Robert"].map((w) => group(w.toUpperCase(), appts.filter((a) => a.who === w), "No events")).join("");
    }
    el.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="k">Total</div><div class="v">${appts.length}</div></div>
        <div class="stat"><div class="k">Active</div><div class="v">${count("active")}</div></div>
        <div class="stat"><div class="k">Completed</div><div class="v">${count("completed")}</div></div>
        <div class="stat"><div class="k">Overdue</div><div class="v">0</div></div>
        <div class="stat"><div class="k">Remaining</div><div class="v">${count("upcoming") + count("active")}</div></div>
        <a class="btn" href="#" data-soon="Schedule">View Schedule</a>
      </div>
      <div class="seg" role="tablist"><button type="button" class="${mode === "Visit" ? "on" : ""}" data-m="Visit">Visit</button><button type="button" class="${mode === "Employee" ? "on" : ""}" data-m="Employee">Employee</button></div>
      ${body}<div style="height:8px"></div>`;
    el.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.m; renderAppts(); }));
    el.querySelectorAll("[data-soon]").forEach((n) => n.addEventListener("click", (e) => { e.preventDefault(); window.ui.soon("Schedule"); }));
  }
  renderAppts();

  /* My messages (PRD: texts and WhatsApp are logged against the client and the user) */
  const msgs = [
    { who: "Maria Alvarez", ch: "Text", t: "Can we move Thursday's visit to the afternoon?", ago: "10 min ago", unread: true },
    { who: "Crew A", ch: "WhatsApp", t: "Work package received, we start at 7:30 tomorrow.", ago: "1 h ago", unread: false },
    { who: "David Kim", ch: "Text", t: "Thanks, I will review the quote tonight.", ago: "3 h ago", unread: true },
    { who: "Rivera Landscape", ch: "Text", t: "The gate will be open at 2 PM for the consultation.", ago: "Yesterday", unread: false },
  ];
  const mEl = document.getElementById("messages");
  mEl.innerHTML = msgs.map((m) => `<a class="msgrow${m.unread ? " unread" : ""}" href="#" data-soon="Messages">
    <span class="dot-u"></span><div class="m"><div class="top"><b>${esc(m.who)}</b><span class="d">${m.ago}</span></div>
    <div class="s">${esc(m.t)}</div><span class="pill tag">${m.ch}</span></div></a>`).join("");
  mEl.querySelectorAll("[data-soon]").forEach((n) => n.addEventListener("click", (e) => { e.preventDefault(); window.ui.soon("Messages"); }));

  /* Upcoming consultations */
  const cons = [
    { d: "Tomorrow, 9:00 AM", t: "Linda Foster", w: "Glendora · Sal" },
    { d: "Fri, 1:30 PM", t: "Summit Builders", w: "Corona · Robert" },
    { d: "Mon, 10:00 AM", t: "Kevin Tran", w: "Menifee · Sal" },
  ];
  document.getElementById("consults").innerHTML = cons.map((c) => `<div class="task"><div><b style="color:var(--ink)">${esc(c.t)}</b><div class="d">${c.d} · ${esc(c.w)}</div></div></div>`).join("");
})();
