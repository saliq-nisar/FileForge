import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { SITE } from "@/lib/constants/navigation";
import { SITE_URL } from "@/lib/seo";
import { STORAGE_KEYS } from "@/lib/constants/storage-keys";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE.name} — PDF, image & document tools`, template: `%s - ${SITE.name}` },
  description:
    "Convert, compress, edit, merge, split, optimize and transform your PDFs, images and documents from one place. Most tools run privately in your browser.",
  applicationName: SITE.name,
  openGraph: { siteName: SITE.name, type: "website" },
  twitter: { card: "summary" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#18181c" },
  ],
};

// Applies the saved theme before first paint to avoid a light/dark flash.
const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEYS.settings)})||"{}").state||{};var t=s.theme||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");if(s.motion&&s.motion!=="system")document.documentElement.setAttribute("data-motion",s.motion);}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
