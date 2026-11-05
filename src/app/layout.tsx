import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { cn } from "@/lib/utils";
import { routerConfig } from "@/lib/env";
import { RoutingAvailabilityProvider } from "@/components/routing-availability";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "CommuteNity",
  description: "Community-driven commute navigation for the Philippines",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Whether routing is configured, as a boolean (the URL never leaves the
 * server). A malformed `ROUTER_URL` counts as unavailable here, so pages still
 * render; `/api/route` keeps reporting the error.
 */
function isRoutingConfigured(): boolean {
  try {
    return routerConfig() !== undefined;
  } catch {
    return false;
  }
}

export default function RootLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  // Pages with a builder (feed, focus view, profile) are dynamic, so this reads ROUTER_URL per
  // request there; prerendered pages bake the build-time value but never open a builder.
  const routingAvailable = isRoutingConfigured();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans", geist.variable, spaceGrotesk.variable)}
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <RoutingAvailabilityProvider available={routingAvailable}>
            {children}
            {modal}
          </RoutingAvailabilityProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
