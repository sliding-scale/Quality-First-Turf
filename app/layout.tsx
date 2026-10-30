import type { Metadata, Viewport } from "next";
import { DM_Sans, IBM_Plex_Sans } from "next/font/google";
import Script from "next/script";
import { DesktopScale } from "@/components/desktop-scale";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { PhotoRetries } from "@/components/ui/retry-image";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

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
        <Script id="no-scroll-restore" strategy="beforeInteractive">
          {`history.scrollRestoration="manual"`}
        </Script>
        <PhotoRetries />
        <DesktopScale>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </DesktopScale>
      </body>
    </html>
  );
}