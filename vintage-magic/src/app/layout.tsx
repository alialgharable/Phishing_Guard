import type { Metadata, Viewport } from "next";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/barlow-condensed/400.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/caveat/400.css";
import "@fontsource/caveat/600.css";
import "@fontsource-variable/archivo";
import "@/app/globals.css";
import "@/styles/kit.css";
import { BagProvider } from "@/components/bag/BagProvider";
import { BagToast } from "@/components/bag/BagToast";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { BRAND, DEFAULT_SITE_CONTENT } from "@/lib/config";
import { getRepository } from "@/lib/data";

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} ${BRAND.city} — past lives, never ordinary`,
    template: `%s · ${BRAND.name} ${BRAND.city}`,
  },
  description: `${BRAND.tagline} A curated second-hand and vintage archive in ${BRAND.city}: jackets, shirts, trousers, dresses and accessories, most of them one of one.`,
  applicationName: `${BRAND.name} ${BRAND.city}`,
  keywords: ["vintage Beirut", "second-hand clothing", "one of a kind", "archive", "curated vintage"],
};

export const viewport: Viewport = {
  themeColor: "#F1EFE9",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Content is read per render in development so admin edits show up immediately.
  let content = DEFAULT_SITE_CONTENT;
  try {
    content = await getRepository().getSiteContent();
  } catch {
    // A database outage must not take the whole site down; fall back to code defaults.
  }

  return (
    <html lang="en" className="no-js">
      <head>
        {/* Without script the composition must still be readable, so the class is dropped on the
            first paint and every entrance resolves to its final state. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.remove('no-js');document.documentElement.classList.add('js');requestAnimationFrame(function(){document.documentElement.classList.add('is-ready')});`,
          }}
        />
      </head>
      <body className="relative min-h-dvh">
        <a href="#main" className="skip-link">
          Skip to the archive
        </a>
        <BagProvider>
          <SiteHeader />
          <main id="main" className="relative z-10">
            {children}
          </main>
          <SiteFooter content={content} />
          <BagToast />
        </BagProvider>
      </body>
    </html>
  );
}
