/* New / edit client form (PRD contact fields). Saves to this browser's localStorage; sample data only. */
(function () {
  const $ = (s) => document.querySelector(s);
  const form = $("#form");
  const editId = new URLSearchParams(location.search).get("edit");
  const editing = editId ? window.QFT.findClient(editId) : null;

  $("#business").innerHTML = window.QFT.businesses.map((b) => `<option>${b}</option>`).join("");

  if (editing) {
    document.title = `Edit ${editing.name} · Quality First Turf CRM (mockup)`;
    $("#title").textContent = "Edit Client";
    const [first, ...rest] = editing.contactName.split(" ");
    form.type.value = editing.type;
    $("#first").value = first; $("#last").value = rest.join(" ");
    $("#company").value = editing.company; $("#phone").value = editing.phone; $("#email").value = editing.email;
    $("#business").value = editing.business;
    $("#street1").value = editing.street1; $("#street2").value = editing.street2 || ""; $("#city").value = editing.city;
    $("#state").value = editing.state; $("#zip").value = editing.zip; $("#notes").value = editing.notes || "";
    $("#cancel").href = `client.html?id=${editing.id}`;
  }

  function validate() {
    let ok = true;
    const mark = (id, bad) => { document.getElementById(id).classList.toggle("bad", bad); if (bad) ok = false; };
    mark("f-company", !$("#first").value.trim() && !$("#last").value.trim() && !$("#company").value.trim());
    const phone = $("#phone").value.trim();
    mark("f-phone", phone !== "" && phone.replace(/\D/g, "").length < 10);
    const email = $("#email").value.trim();
    mark("f-email", email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (!ok) { const bad = document.querySelector(".field.bad input"); bad && bad.focus(); }
    return ok;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validate()) return;
    const first = $("#first").value.trim(), last = $("#last").value.trim(), company = $("#company").value.trim();
    const contactName = [first, last].filter(Boolean).join(" ") || company;
    const type = form.type.value;
    const client = {
      id: editing ? editing.id : 5000 + Math.floor(Math.random() * 90000),
      name: type === "Contractor" && company ? company : contactName, contactName, company, type,
      phone: $("#phone").value.trim(), email: $("#email").value.trim(), business: $("#business").value,
      street1: $("#street1").value.trim(), street2: $("#street2").value.trim(), city: $("#city").value.trim(),
      state: $("#state").value.trim().toUpperCase(), zip: $("#zip").value.trim(), notes: $("#notes").value.trim(),
      daysAgo: 0,
    };
    window.QFT.saveClient(client);
    location.href = editing ? `client.html?id=${client.id}` : `clients.html?saved=${client.id}`;
  });
})();
