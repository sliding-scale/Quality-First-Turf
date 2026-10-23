import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Sans } from "next/font/google";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quality First Turf",
  description: "Tell us about your landscaping project.",
  icons: {
    icon: [{ url: "/brand/favicon.png", type: "image/png", sizes: "300x300" }],
    apple: [{ url: "/brand/favicon-full.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} ${dmSans.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}