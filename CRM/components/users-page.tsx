"use client";

/* Manage team (PRD 2.4, D-046, D-050, D-055), laid out like Jobber's: title with a count and the Invite button, a Users tab, a search
   box, and a table of people with sortable columns, a status pill and a "Showing 1-3 of 3 items" footer. Admins invite staff (Clerk
   emails them a link that works for 7 days), choose their roles and businesses, turn access off, and cancel, re-send, delete or restore.
   Access is invite-only: a person added here can log in with that email; anyone else who signs up gets nothing. The backend refuses
   everyone but Admins, so hiding this from others is only for tidiness.
   Left out from Jobber: seats, billing, the Crews tab, the promo cards (not in the PRD, D-024). */

import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ROLE_LABEL, ROLES, type Role } from "@/convex/crm/lib/stages";
import { useBusinesses, useKept } from "@/lib/clients";
import { cleanEmail, cleanName } from "@/lib/fields";
import { Icon } from "./icon";
import { DeleteMemberDialog } from "./delete-member-dialog";
import { UsersSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type UserDoc = Doc<"users">;
type SortKey = "name" | "roles" | "lastActive" | "status";

const STATUS_PILL: Record<UserDoc["status"], { label: string; cls: string }> = {
  invited: { label: "Invited", cls: "lead" },
  active: { label: "Active", cls: "active" },
  expired: { label: "Expired", cls: "overdue" },
  deactivated: { label: "Turned off", cls: "draft" },
  deleted: { label: "Deleted", cls: "draft" },
};

const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** What the status pill's hover text says: when an invitation runs out, or that it already has. */
function statusHint(u: UserDoc) {
  if (u.status === "invited" && u.invitationExpiresAt) return `Invitation link works until ${day(u.invitationExpiresAt)}`;
  if (u.status === "expired") return "The invitation link no longer works. Send a new one.";
  return undefined;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** "11/05/2026 at 20:35", or a dash for someone who has never logged in. */
function lastActive(ms: number | undefined) {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export function UsersPage() {
  const staff = useStaff();
  const { dropdown, toast } = useUI();
  const businesses = useBusinesses();
  const update = useMutation(api.crm.users.update);
  const resend = useAction(api.crm.invitations.resend);
  const cancel = useAction(api.crm.invitations.cancel);
  const [deleting, setDeleting] = useState<UserDoc | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState(""); // what the server is asked, a moment after typing stops
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [editing, setEditing] = useState<UserDoc | "new" | null>(null);
  const [teamSize, setTeamSize] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const data = useKept(useQuery(api.crm.users.list, staff.isAdmin ? { search, sortKey: sort.key, dir: sort.dir, page, size, includeDeleted: showDeleted } : "skip"));

  if (!staff.isAdmin) {
    return (
      <div className="empty-state">
        <h2>Only Admins can manage the team</h2>
        <p>Ask an Admin if you need someone added or changed.</p>
        <Link className="btn primary" href="/">Back to home</Link>
      </div>
    );
  }
  if (data === undefined || businesses === undefined) return <UsersSkeleton />;

  // The chip shows the whole team, not the search result: remember the size from the last unfiltered answer.
  if (search === "" && teamSize !== data.total) setTeamSize(data.total);

  const businessName = (id: Id<"businesses">) => businesses.find((b) => b._id === id)?.name ?? "";
  const current = data.page;
  const pages = Math.max(1, Math.ceil(data.total / size));
  const from = data.total ? (current - 1) * size + 1 : 0;
  const to = Math.min(current * size, data.total);

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
  const sortHead = (key: SortKey, label: string) => (
    <button type="button" style={{ opacity: sort.key === key ? 1 : 0.8 }} onClick={() => toggleSort(key)}>
      {label} <span className="s"><Icon name="sort" size={16} /></span>
    </button>
  );

  const problem = (e: unknown, fallback: string) => toast(e instanceof ConvexError && typeof e.data === "string" ? e.data : fallback);

  async function setAccess(u: UserDoc, active: boolean) {
    try {
      await update({ id: u._id, active, name: u.name, roles: u.roles, businessIds: u.businessIds });
    } catch (e) {
      problem(e, "That could not be changed.");
    }
  }

  async function sendAgain(u: UserDoc) {
    try {
      const r = await resend({ id: u._id, origin: window.location.origin });
      toast(announce(u.email, r));
    } catch (e) {
      problem(e, "The invitation could not be sent. Try again.");
    }
  }

  async function cancelInvite(u: UserDoc) {
    try {
      await cancel({ id: u._id });
      toast(`The invitation to ${u.email} was cancelled.`);
    } catch (e) {
      problem(e, "The invitation could not be cancelled. Try again.");
    }
  }

  /** The menu for one row: what can be done depends on where the person is (invited, expired, active or turned off). */
  function menuFor(u: UserDoc) {
    const edit = { label: "Edit", onSelect: () => setEditing(u) };
    const remove = { label: "Delete", onSelect: () => setDeleting(u) };
    if (u.status === "deleted") return [{ label: "Restore (send new invitation)", onSelect: () => void sendAgain(u) }];
    if (u.status === "invited" && !u.tokenIdentifier) {
      return [
        { label: "Send invitation again", onSelect: () => void sendAgain(u) },
        { label: "Cancel invitation", onSelect: () => void cancelInvite(u) },
        edit,
        remove,
      ];
    }
    if (u.status === "expired") return [{ label: "Send new invitation", onSelect: () => void sendAgain(u) }, edit, remove];
    return [
      edit,
      u.status === "deactivated"
        ? { label: "Turn on access", onSelect: () => void setAccess(u, true) }
        : { label: "Turn off access", onSelect: () => void setAccess(u, false) },
      remove,
    ];
  }

  return (
    <div className="fade-in">
      <div className="page-head">
        <h1>Manage team</h1>
        <div className="actions">
          {teamSize !== null && <span className="count-chip"><b>{teamSize}</b> {teamSize === 1 ? "person" : "people"}</span>}
          <button className="btn primary" type="button" onClick={() => setEditing(editing === "new" ? null : "new")}>
            Invite New Member
          </button>
        </div>
      </div>

      <p className="team-intro">Manage your team members in one place: invite people, choose their roles and businesses, and turn access off.</p>

      <div className={`expand${editing ? " open" : ""}`}>
        <div>
          {editing && (
            <UserForm
              // A new panel for each person, so nothing carries over from the last one.
              key={editing === "new" ? "new" : editing._id}
              user={editing === "new" ? null : editing}
              businesses={businesses}
              onDone={(message) => {
                setEditing(null);
                if (message) toast(message);
              }}
            />
          )}
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button className="tab active" role="tab" aria-selected="true" type="button">Users</button>
      </div>

      <div className="searchbox wide">
        <span><Icon name="search" size={20} /></span>
        <input type="search" placeholder="Search team members" aria-label="Search team members" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>

      <div className="team-count-row">
        <h3 className="team-count">Team members ({data.total})</h3>
        <label className="checkline show-deleted">
          <input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setPage(1); }} />
          Show deleted
        </label>
      </div>

      <div className="table-card">
        <div className="table-wrap">
          <table className="table team-table">
            <colgroup>
              <col style={{ width: 230 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 230 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 60 }} />
            </colgroup>
            <thead>
              <tr>
                <th aria-sort={ariaSort("name")}>{sortHead("name", "Name")}</th>
                <th aria-sort={ariaSort("roles")}>{sortHead("roles", "Role")}</th>
                <th>Businesses</th>
                <th aria-sort={ariaSort("lastActive")}>{sortHead("lastActive", "Last Active")}</th>
                <th aria-sort={ariaSort("status")}>{sortHead("status", "Status")}</th>
                <th><span className="sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length ? (
                data.rows.map((u) => {
                  const pill = STATUS_PILL[u.status];
                  return (
                    <tr key={u._id} className={u.status === "deleted" ? "is-deleted" : undefined}>
                      <td>
                        <div className="member">
                          <span className="avatar-sm" aria-hidden="true">{initials(u.name)}</span>
                          {u.status === "deleted" ? <span className="member-name">{u.name}</span> : <button type="button" className="member-name" onClick={() => setEditing(u)}>{u.name}</button>}
                        </div>
                      </td>
                      <td>{u.roles.map((r) => ROLE_LABEL[r]).join(", ")}</td>
                      <td>{u.roles.includes("admin") ? "All businesses" : u.businessIds.map(businessName).join(", ")}</td>
                      <td>{lastActive(u.lastSignInAt)}</td>
                      <td><span className={`pill tag ${pill.cls}`} title={statusHint(u)}><span className="dot" />{pill.label}</span></td>
                      <td>
                        <button
                          type="button"
                          className="btn dots-btn"
                          aria-label={`Actions for ${u.name}`}
                          aria-haspopup="menu"
                          onClick={(e) => dropdown(e.currentTarget, menuFor(u), { alignRight: true })}
                        >
                          <Icon name="more" size={22} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty" style={{ margin: "20px 0" }}>No team members match your search.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="team-foot">
          <span>Showing {from}-{to} of {data.total} items</span>
          <div className="right">
            <select aria-label="Rows per page" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>per page</span>
            <button type="button" className="sq" aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)}>
              <Icon name="chevleft" size={20} />
            </button>
            <button type="button" className="sq" aria-label="Next page" disabled={current === pages} onClick={() => setPage(current + 1)}>
              <Icon name="chevright" size={20} />
            </button>
          </div>
        </div>
      </div>

      {deleting && (
        <DeleteMemberDialog
          // A new dialog for each person, so ticks never carry over.
          key={deleting._id}
          user={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(name) => toast(`${name} was deleted.`)}
        />
      )}
    </div>
  );
}

/** The toast after an invitation: sent, or (when Clerk already has a login for that email) why no email went out. */
function announce(email: string, r: { sent: true; expiresAt: number } | { sent: false; reason: "hasAccount" }) {
  return r.sent
    ? `Invitation sent to ${email}. The link works until ${day(r.expiresAt)}.`
    : `${email} already has a login, so no email was sent. They can sign in with it.`;
}

function UserForm({ user, businesses, onDone }: { user: UserDoc | null; businesses: Doc<"businesses">[]; onDone: (message?: string) => void }) {
  const invite = useAction(api.crm.invitations.send);
  const update = useMutation(api.crm.users.update);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [roles, setRoles] = useState<Role[]>(user?.roles ?? []);
  const [businessIds, setBusinessIds] = useState<Id<"businesses">[]>(user?.businessIds ?? []);
  const [active, setActive] = useState(user ? user.status !== "deactivated" : true);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (user ? nameRef : emailRef).current?.focus();
  }, [user]);

  const isAdmin = roles.includes("admin");
  // Red only after the first attempt to save (D-035).
  const problems = {
    name: name.trim() === "",
    email: !user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    roles: roles.length === 0,
    businesses: !isAdmin && businessIds.length === 0,
  };
  const bad = { name: attempted && problems.name, email: attempted && problems.email, roles: attempted && problems.roles, businesses: attempted && problems.businesses };

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (problems.name || problems.email || problems.roles || problems.businesses) {
      (problems.name ? nameRef : emailRef).current?.focus();
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      if (user) {
        await update({ id: user._id, active, name, roles, businessIds: isAdmin ? [] : businessIds });
        onDone();
      } else {
        const sent = await invite({ email, name, roles, businessIds: isAdmin ? [] : businessIds, origin: window.location.origin });
        onDone(announce(email.trim().toLowerCase(), sent));
      }
    } catch (err) {
      setServerError(err instanceof ConvexError && typeof err.data === "string" ? err.data : "That could not be saved. Try again.");
      setSaving(false);
    }
  }

  return (
    <form className="card user-form" noValidate onSubmit={submit}>
      <h3>{user ? `Edit ${user.name}` : "Invite a team member"}</h3>
      <p className="muted">
        {user ? "Changes apply the next time they load a page." : "We email them a link to create their password and log in. The link works for 7 days. Nobody gets in without being added here."}
      </p>
      <div className="frow">
        <div className={`field${bad.name ? " bad" : ""}`}>
          <label htmlFor="u-name">Name</label>
          <input id="u-name" ref={nameRef} autoComplete="off" value={name} aria-invalid={bad.name} onChange={(e) => setName(cleanName(e.target.value))} />
          <div className="err">Enter the person&apos;s name.</div>
        </div>
        <div className={`field${bad.email ? " bad" : ""}`}>
          <label htmlFor="u-email">Email</label>
          <input id="u-email" ref={emailRef} type="email" autoComplete="off" value={email} disabled={!!user} aria-invalid={bad.email} onChange={(e) => setEmail(cleanEmail(e.target.value))} />
          <div className="err">Enter a valid email address.</div>
        </div>
      </div>

      <fieldset className={`checkgroup${bad.roles ? " bad" : ""}`}>
        <legend>Roles</legend>
        {ROLES.map((r) => (
          <label key={r} className="checkline">
            <input type="checkbox" checked={roles.includes(r)} onChange={() => setRoles(toggle(roles, r))} />
            {ROLE_LABEL[r]}
          </label>
        ))}
        <div className="err">Choose at least one role.</div>
      </fieldset>

      <fieldset className={`checkgroup${bad.businesses ? " bad" : ""}`} disabled={isAdmin}>
        <legend>Businesses</legend>
        {businesses.map((b) => (
          <label key={b._id} className="checkline">
            <input type="checkbox" checked={isAdmin || businessIds.includes(b._id)} onChange={() => setBusinessIds(toggle(businessIds, b._id))} />
            {b.name}
          </label>
        ))}
        {isAdmin && <div className="muted">Admins work in every business.</div>}
        <div className="err">Choose at least one business.</div>
      </fieldset>

      {user && (
        <label className="checkline">
          <input type="checkbox" checked={active} onChange={() => setActive(!active)} />
          Can log in (turn off to remove access without deleting them)
        </label>
      )}

      {serverError && <div className="form-error" role="alert">{serverError}</div>}
      <div className="user-form-actions">
        <button type="button" className="btn plain" onClick={() => onDone()}>Cancel</button>
        <button type="submit" className="btn primary" disabled={saving}>{saving ? (user ? "Saving…" : "Sending…") : user ? "Save changes" : "Send invite"}</button>
      </div>
    </form>
  );
}
