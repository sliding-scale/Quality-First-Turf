import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import localFont from "next/font/local";
import { Shell } from "@/components/shell";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: railScript }} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
