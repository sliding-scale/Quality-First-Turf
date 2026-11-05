/* How Clerk's sign-in form looks in the CRM only (the forms app does not use Clerk). The target is Jobber's login
   screen: a centred column, floating-label fields, a full-width green button, an OR divider, and an outlined Google button.
   Clerk's own components still do the real work (passwords, resets, new-device checks, Google), so nobody gets locked out by
   a custom form; these are only styles. Colours match the tokens in app/globals.css. */

const green = "#388523";
const greenDark = "#2d6e1c";
const ink = "#032b3a";
const muted = "#49646f";
const line = "#b8c2c7";
const font = "var(--font-inter), Inter, Helvetica, Arial, sans-serif";

const base = {
  variables: {
    colorPrimary: green,
    colorText: ink,
    colorTextSecondary: muted,
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: ink,
    colorDanger: "#b3261e",
    borderRadius: "6px",
    fontFamily: font,
    fontSize: "15px",
  },
  layout: { socialButtonsPlacement: "bottom" as const, socialButtonsVariant: "blockButton" as const, logoPlacement: "none" as const },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "none", border: "none", background: "transparent" },
    card: { boxShadow: "none", border: "none", background: "transparent", padding: 0, gap: "18px" },
    // Our own logo sits above the form. There is no sign-up and no social login (D-047).
    header: { display: "none" },
    socialButtonsRoot: { display: "none" },
    dividerRow: { display: "none" },
    lastAuthenticationStrategyBadge: { display: "none" },
    footer: { display: "none" },
    main: { gap: "18px" },

    // Floating labels: the label sits on the top border of the field, as in Jobber.
    formField: { position: "relative" as const, display: "flex", flexDirection: "column" as const, gap: 0 },
    formFieldLabelRow: { order: 2, marginTop: "10px", minHeight: 0 },
    formFieldLabel: { position: "absolute" as const, top: "-9px", left: "12px", zIndex: 1, background: "#ffffff", padding: "0 4px", fontSize: "12px", color: muted },
    formFieldInput: {
      height: "50px",
      padding: "0 14px",
      fontSize: "15px",
      border: `1px solid ${line}`,
      borderRadius: "6px",
      boxShadow: "none",
      "&:hover": { borderColor: muted },
      "&:focus": { borderColor: ink, boxShadow: `0 0 0 1px ${ink}` },
    },
    formFieldInputShowPasswordButton: { color: ink },
    formFieldAction: { color: green, fontSize: "15px", fontWeight: 400, "&:hover": { color: greenDark, textDecoration: "underline" } },

    // The button and its text: "Log In", as in Jobber (the default says "Continue").
    formButtonPrimary: {
      height: "52px",
      borderRadius: "6px",
      backgroundColor: green,
      boxShadow: "none",
      textTransform: "none" as const,
      fontWeight: 700,
      fontSize: "17px",
      "&:hover": { backgroundColor: greenDark },
      "&:focus": { boxShadow: `0 0 0 2px #ffffff, 0 0 0 4px ${green}` },
    },
    buttonArrowIcon: { display: "none" },



    identityPreview: { border: `1px solid ${line}`, borderRadius: "6px" },
    alert: { borderRadius: "6px" },
  },
};

/* The things styles in this object cannot do (the order of the blocks, showing the password field on the first step, and the
   button's "Log In" wording) are plain CSS in app/globals.css, scoped to .auth-signin and using Clerk's stable cl-* class names. */
export const signInAppearance = base;


