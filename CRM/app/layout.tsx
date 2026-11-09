import { ClerkProvider } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Headings: Figtree (open source), the closest match to Jobber's heading font.
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], weight: ["700", "800"], display: "swap" });

// Text: Inter v3 (open source), the same files the approved mockups used.
const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [
    { path: "./fonts/inter-v3-regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-v3-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/inter-v3-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/inter-v3-700italic.woff2", weight: "700", style: "italic" },
  ],
});

export const metadata: Metadata = {
  title: { default: "Quality First Turf CRM", template: "%s · Quality First Turf CRM" },
};

// Sets the collapsed-sidebar class before first paint so the page does not jump.
const railScript = `try{if(localStorage.getItem("qft-mock-rail")==="1")document.documentElement.classList.add("rail")}catch(e){}`;

// Wording for Clerk's forms, matching Jobber's login: floating labels with no placeholder text, "OR", and "Log In With Google".
const localization = {
  socialButtonsBlockButton: "Log In With {{provider|titleize}}",
  dividerText: "OR",
  formFieldLabel__emailAddress: "Email address*",
  formFieldLabel__emailAddress_username: "Email address*",
  formFieldLabel__password: "Password*",
  formFieldAction__forgotPassword: "Forgot password?",
  formFieldInputPlaceholder__emailAddress: "",
  formFieldInputPlaceholder__emailAddress_username: "",
  formFieldInputPlaceholder__password: "",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: railScript }} />
      </head>
      <body>
        {/* ui pins the version of Clerk's forms, so the CSS in app/globals.css that targets their class names only changes when we upgrade @clerk/ui. */}
        {/* signUpUrl: an invitation link that ran out arrives at the sign-up page, which here explains that instead of showing a form. */}
        <ClerkProvider ui={ui} localization={localization} afterSignOutUrl="/sign-in" signUpUrl="/accept-invite">
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
