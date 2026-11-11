"use client";

/* Toasts, dropdown menus and the Create popover, shared by the whole shell. Only one menu is open at a time.
   Menus and toasts animate in and out (D-037): closing keeps the element mounted for the length of the exit animation. */

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

/** One row in a dropdown, or a line between groups, or a small heading over a group (as in Jobber's quote menu). */
export type MenuItem =
  | { label: string; icon?: string; /** A colour for the icon (a green hammer, say). */ iconColor?: string; /** Red text and icon, for deleting. */ danger?: boolean; checked?: boolean; /** Not available yet: shown greyed and cannot be chosen. */ disabled?: boolean; onSelect?: () => void }
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
  { label: "Job", icon: "hammer", color: "var(--green)", soon: "Jobs" },
  { label: "Invoice", icon: "receipt", color: "var(--navy)", soon: "Invoices" },
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
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchor.contains(t)) return;
      setClosing(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
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
        setClosing(false);
        setMenu({ kind: "dropdown", anchor, items, alignRight: !!opts?.alignRight, variant: opts?.variant });
      },
      popover: (anchor, render, opts) => {
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
      {menu?.kind === "dropdown" && createPortal(<Dropdown ref={menuRef} state={menu} closing={closing} onClose={closeMenu} />, document.body)}
      {menu?.kind === "popover" && createPortal(<Popover ref={menuRef} state={menu} closing={closing} onClose={closeMenu} />, document.body)}
      {menu?.kind === "create" && createPortal(<CreatePopover ref={menuRef} anchor={menu.anchor} closing={closing} onClose={closeMenu} />, document.body)}
      {toastMsg && createPortal(<div className={`toast${toastLeaving ? " leaving" : ""}`} role="status">{toastMsg.msg}</div>, document.body)}
    </Ctx.Provider>
  );
}

function useMergedRef(node: React.RefObject<HTMLDivElement | null>, ref: Ref<HTMLDivElement>) {
  return (n: HTMLDivElement | null) => {
    node.current = n;
    if (typeof ref === "function") ref(n);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = n;
  };
}

/** Places a menu or popover just under its anchor, lined up with the anchor's left or right edge. */
function usePlacement(anchor: HTMLElement, alignRight: boolean, dep: unknown) {
  const node = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const menu = node.current;
    if (!menu) return;
    const r = anchor.getBoundingClientRect();
    if (alignRight) {
      // Anchor by the right edge, so the menu lines up with its button whatever its final width turns out to be.
      const right = Math.max(8, document.documentElement.clientWidth - r.right);
      menu.style.left = "auto";
      menu.style.right = right + "px";
    } else {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8));
      menu.style.left = left + "px";
    }
    menu.style.top = r.bottom + 6 + window.scrollY + "px";
    menu.style.transformOrigin = alignRight ? "top right" : "top left";
  }, [anchor, alignRight, dep]);
  return node;
}

function Popover({ state, closing, onClose, ref }: { state: PopoverState; closing: boolean; onClose: () => void; ref: Ref<HTMLDivElement> }) {
  const node = usePlacement(state.anchor, state.alignRight, state);
  return (
    <div className={`menu panel${state.className ? " " + state.className : ""}${closing ? " closing" : ""}`} ref={useMergedRef(node, ref)}>
      {state.render(onClose)}
    </div>
  );
}

function Dropdown({ state, closing, onClose, ref }: { state: DropdownState; closing: boolean; onClose: () => void; ref: Ref<HTMLDivElement> }) {
  const node = usePlacement(state.anchor, state.alignRight, state);

  const actions = state.variant === "actions";
  return (
    <div className={`menu${actions ? " actions" : ""}${closing ? " closing" : ""}`} role="menu" ref={useMergedRef(node, ref)}>
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
            onClick={() => {
              onClose();
              it.onSelect?.();
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
    <div className={`create-pop${closing ? " closing" : ""}`} role="menu" ref={useMergedRef(node, ref)}>
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
