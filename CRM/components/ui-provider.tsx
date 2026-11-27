"use client";

/* Toasts, dropdown menus and the Create popover, shared by the whole shell. Only one menu is open at a time.
   Menus and toasts animate in and out (D-037): closing keeps the element mounted for the length of the exit animation. */

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";
import { TooltipLayer } from "./tooltip-layer";

/** One row in a dropdown, or a line between groups, or a small heading over a group (as in Jobber's quote menu). */
export type MenuItem =
  | { label: string; icon?: string; /** A colour for the icon (a green hammer, say). */ iconColor?: string; /** Red text and icon, for deleting. */ danger?: boolean; checked?: boolean; /** Not available yet (not built): shown greyed and cannot be chosen. */ disabled?: boolean;
      /** Cannot be done right now, and why: the item looks normal and choosing it says the reason instead (user, 2026-11-26, D-130). */ reason?: string; onSelect?: () => void }
  | { divider: true }
  | { heading: string };

type DropdownState = { kind: "dropdown"; anchor: HTMLElement; items: MenuItem[]; alignRight: boolean; variant?: "actions" };
type PopoverState = { kind: "popover"; anchor: HTMLElement; render: (close: () => void) => ReactNode; className: string; alignRight: boolean };
type MenuState = DropdownState | PopoverState | { kind: "create"; anchor: HTMLElement } | null;

type UI = {
  toast: (msg: string) => void;
  /** "X is not built yet." for items that belong to a later milestone. */
  soon: (what?: string) => void;
  dropdown: (anchor: HTMLElement, items: MenuItem[], opts?: { alignRight?: boolean; variant?: "actions" }) => void;
  /** A panel with content of its own (a filter with a search box, a date range). `render` gets a function that closes it. */
  popover: (anchor: HTMLElement, render: (close: () => void) => ReactNode, opts?: { className?: string; alignRight?: boolean }) => void;
  toggleCreate: (anchor: HTMLElement) => void;
  closeMenu: () => void;
  createOpen: boolean;
};

const Ctx = createContext<UI | null>(null);

export function useUI(): UI {
  const ui = useContext(Ctx);
  if (!ui) throw new Error("useUI must be used inside <UIProvider>");
  return ui;
}

const CREATE_ITEMS: { label: string; icon: string; color: string; href?: string; soon?: string }[] = [
  { label: "Client", icon: "user", color: "var(--ink)", href: "/clients/new" },
  { label: "Request", icon: "inbox", color: "var(--orange)", href: "/requests/new" },
  { label: "Quote", icon: "quote", color: "var(--burgundy)", href: "/quotes/new" },
  { label: "Job", icon: "hammer", color: "var(--green)", href: "/jobs/new" },
  { label: "Invoice", icon: "receipt", color: "var(--navy)", href: "/invoices/new" },
];

const EXIT_MS = 140; // keep in step with the pop-out / cp-out / toast-out animations in globals.css

export function UIProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToastMsg] = useState<{ msg: string } | null>(null);
  const [toastLeaving, setToastLeaving] = useState(false);
  const [menu, setMenu] = useState<MenuState>(null);
  const [closing, setClosing] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const toast = useCallback((msg: string) => {
    setToastLeaving(false);
    setToastMsg({ msg });
  }, []);
  const soon = useCallback((what?: string) => toast(`${what || "That"} is not built yet.`), [toast]);
  const closeMenu = useCallback(() => setClosing(true), []);

  // Toast: visible for 2.6 s, then animates out.
  useEffect(() => {
    if (!toastMsg) return;
    const out = setTimeout(() => setToastLeaving(true), 2600);
    const gone = setTimeout(() => setToastMsg(null), 2600 + 220);
    return () => {
      clearTimeout(out);
      clearTimeout(gone);
    };
  }, [toastMsg]);

  // Menu: after the exit animation, unmount it.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => {
      setMenu(null);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [closing]);

  useEffect(() => {
    if (!menu) return;
    const anchor = menu.anchor;
    const since = performance.now();
    const onClick = (e: MouseEvent) => {
      // The click that opened this one (a menu item such as "Move to…") is still on its way up the page when this starts listening, and
      // would close it at once (D-136).
      if (e.timeStamp <= since) return;
      const t = e.target as Node;
      // A time picker opened from inside a popover draws its panel over the page; a click in it is still inside (D-129).
      if (menuRef.current?.contains(t) || anchor.contains(t) || (t instanceof Element && t.closest(".tp-panel"))) return;
      setClosing(true);
    };
    const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.querySelector(".tp-panel:not(.leaving)")) return; // a time picker opened from here closes first
        // Only the menu or popover closes, not the dialog under it (D-132): this listener runs before the dialog's.
        e.preventDefault();
        e.stopPropagation();
        setClosing(true);
        return;
      }
      // A menu is walked with the arrow keys, Home and End, like any native menu.
      if (menu.kind === "popover" || !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list = items();
      if (list.length === 0) return;
      e.preventDefault();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : e.key === "ArrowDown" ? (at + 1) % list.length : (at <= 0 ? list.length - 1 : at - 1);
      list[next].focus();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey, true);
    // The button that opened it says so, and focus moves into the menu (and back to the button when it closes) so a keyboard or screen reader follows.
    if (menu.kind !== "popover") anchor.setAttribute("aria-haspopup", "menu");
    anchor.setAttribute("aria-expanded", "true");
    const raf = requestAnimationFrame(() => {
      const box = menuRef.current;
      if (!box || box.contains(document.activeElement)) return;
      if (menu.kind !== "popover") items()[0]?.focus();
      else (box.querySelector<HTMLElement>("input, button:not(:disabled), [tabindex]") ?? box).focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey, true);
      anchor.setAttribute("aria-expanded", "false");
      const a = document.activeElement;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- read at close time on purpose: the node may already be gone, and then the focus is on the body
      if ((a === document.body || menuRef.current?.contains(a)) && anchor.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [menu]);

  const open = menu !== null && !closing;

  const ui = useMemo<UI>(
    () => ({
      toast,
      soon,
      closeMenu,
      createOpen: open && menu?.kind === "create",
      dropdown: (anchor, items, opts) => {
        if (open && menu?.kind === "dropdown" && menu.anchor === anchor) {
          setClosing(true);
          return;
        }
        setClosing(false);
        setMenu({ kind: "dropdown", anchor, items, alignRight: !!opts?.alignRight, variant: opts?.variant });
      },
      popover: (anchor, render, opts) => {
        if (open && menu?.kind === "popover" && menu.anchor === anchor) {
          setClosing(true);
          return;
        }
        setClosing(false);
        setMenu({ kind: "popover", anchor, render, className: opts?.className ?? "", alignRight: !!opts?.alignRight });
      },
      toggleCreate: (anchor) => {
        if (open && menu?.kind === "create") {
          setClosing(true);
        } else {
          setClosing(false);
          setMenu({ kind: "create", anchor });
        }
      },
    }),
    [toast, soon, closeMenu, menu, open],
  );

  return (
    <Ctx.Provider value={ui}>
      {children}
      {menu?.kind === "dropdown" && createPortal(<Dropdown ref={menuRef} state={menu} closing={closing} onClose={closeMenu} onReason={toast} />, document.body)}
      {menu?.kind === "popover" && createPortal(<Popover ref={menuRef} state={menu} closing={closing} onClose={closeMenu} />, document.body)}
      {menu?.kind === "create" && createPortal(<CreatePopover ref={menuRef} anchor={menu.anchor} closing={closing} onClose={closeMenu} />, document.body)}
      <TooltipLayer />
      {toastMsg && createPortal(<div className={`toast${toastLeaving ? " leaving" : ""}`} role="status">{toastMsg.msg}</div>, document.body)}
    </Ctx.Provider>
  );
}

/** What a menu is called for a screen reader: its button's name. */
const nameOf = (anchor: HTMLElement) => {
  if (anchor.getAttribute("aria-label")) return anchor.getAttribute("aria-label")!;
  // A filter chip reads "Date | All": its name is the first words, not the current value run into them.
  const first = [...anchor.childNodes].find((n) => n.nodeType === 3 && n.textContent?.trim());
  return first?.textContent?.trim() || anchor.textContent?.trim() || "Menu";
};

function useMergedRef(node: React.RefObject<HTMLDivElement | null>, ref: Ref<HTMLDivElement>) {
  return (n: HTMLDivElement | null) => {
    node.current = n;
    if (typeof ref === "function") ref(n);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = n;
  };
}

/** Places a menu or popover just under its anchor, lined up with the anchor's left or right edge. */
function usePlacement(anchor: HTMLElement, alignRight: boolean, dep: unknown, onClose: () => void) {
  const node = useRef<HTMLDivElement | null>(null);
  const above = useRef<boolean | null>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; });
  useLayoutEffect(() => {
    const menu = node.current;
    if (!menu) return;
    // Fixed to the window and re-placed whenever anything scrolls or the window resizes, so a menu stays on its button and never makes the page taller.
    menu.style.position = "fixed";
    above.current = null;
    const place = () => {
    const r = anchor.getBoundingClientRect();
    // The button has scrolled out of view under the top bar or off the bottom: the menu goes with it instead of floating over the page.
    if (!anchor.closest(".topbar")) {
      const edge = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
      if (r.bottom <= edge || r.top >= window.innerHeight) { closeRef.current(); return; }
    }
    // Never wider than the screen, so a wide popover on a phone is not cut off.
    menu.style.maxWidth = `${document.documentElement.clientWidth - 16}px`;
    if (alignRight) {
      // Anchor by the right edge, so the menu lines up with its button whatever its final width turns out to be.
      const right = Math.max(8, document.documentElement.clientWidth - r.right);
      menu.style.left = "auto";
      menu.style.right = right + "px";
      // A menu wider than the room to the left of that edge starts at the screen's left margin instead.
      if (menu.getBoundingClientRect().left < 8) {
        menu.style.right = "auto";
        menu.style.left = "8px";
      }
    } else {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8));
      menu.style.left = left + "px";
    }
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    // Decided once when it opens, so it does not flip from side to side while the page scrolls.
    above.current ??= spaceBelow < menu.offsetHeight + 12 && spaceAbove > spaceBelow;
    const openAbove = above.current;
    const top = openAbove ? Math.max(8, r.top - menu.offsetHeight - 10) : r.bottom + 10;
    menu.style.top = top + "px";
    menu.style.transformOrigin = openAbove
      ? (alignRight ? "bottom right" : "bottom left")
      : (alignRight ? "top right" : "top left");
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, alignRight, dep]);
  return node;
}

function Popover({ state, closing, onClose, ref }: { state: PopoverState; closing: boolean; onClose: () => void; ref: Ref<HTMLDivElement> }) {
  const node = usePlacement(state.anchor, state.alignRight, state, onClose);
  return (
    <div className={`menu panel${state.className ? " " + state.className : ""}${closing ? " closing" : ""}`} role="dialog" aria-label={nameOf(state.anchor)} tabIndex={-1} ref={useMergedRef(node, ref)}>
      {state.render(onClose)}
    </div>
  );
}

function Dropdown({ state, closing, onClose, onReason, ref }: { state: DropdownState; closing: boolean; onClose: () => void; onReason: (msg: string) => void; ref: Ref<HTMLDivElement> }) {
  const node = usePlacement(state.anchor, state.alignRight, state, onClose);

  const actions = state.variant === "actions";
  return (
    <div className={`menu${actions ? " actions" : ""}${closing ? " closing" : ""}`} role="menu" aria-label={nameOf(state.anchor)} ref={useMergedRef(node, ref)}>
      {state.items.map((it, n) => {
        if ("divider" in it) return <div key={n} className="menu-rule" role="separator" />;
        if ("heading" in it) return <div key={n} className="menu-heading" role="presentation">{it.heading}</div>;
        return (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            className={it.danger ? "danger" : undefined}
            disabled={it.disabled}
            {...(it.checked !== undefined ? { "aria-checked": it.checked } : {})}
            aria-disabled={it.reason ? true : undefined}
            onClick={() => {
              onClose();
              if (it.reason) onReason(it.reason);
              else it.onSelect?.();
            }}
          >
            {it.checked !== undefined && <span className="check">{it.checked && <Icon name="check" size={16} />}</span>}
            {it.icon && <span className="mi" style={it.iconColor ? { color: it.iconColor } : undefined}><Icon name={it.icon} size={actions ? 24 : 18} /></span>}
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Create: a horizontal row of coloured icons beside the sidebar button, like Jobber. */
function CreatePopover({ anchor, closing, onClose, ref }: { anchor: HTMLElement; closing: boolean; onClose: () => void; ref: Ref<HTMLDivElement> }) {
  const node = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const pop = node.current;
    if (!pop) return;
    const r = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right + 12, window.innerWidth - pop.offsetWidth - 8));
    pop.style.left = left + "px";
    pop.style.top = r.top + r.height / 2 + "px";
  }, [anchor]);

  return (
    <div className={`create-pop${closing ? " closing" : ""}`} role="menu" aria-label={nameOf(anchor)} ref={useMergedRef(node, ref)}>
      {CREATE_ITEMS.map((i, n) => {
        const style = { "--c": i.color, "--n": n } as CSSProperties;
        const inner = (
          <>
            <Icon name={i.icon} size={28} />
            <span>{i.label}</span>
          </>
        );
        return i.href ? (
          <Link key={i.label} href={i.href} className="cp-item" role="menuitem" style={style} onClick={onClose}>
            {inner}
          </Link>
        ) : (
          <button
            key={i.label}
            type="button"
            className="cp-item"
            role="menuitem"
            style={style}
            disabled
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
