import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ServiceWorkerRegistration } from "./sw-register";

// Atkinson Hyperlegible was drawn so that 1 and 7, 0 and 8, 6 and 9 cannot be
// mistaken for each other, which is what matters when copying times. The
// mono cut is used only for the readback, like a timing printer's tape.
// The files are Google Fonts' latin subsets (variable weight, SIL OFL),
// committed so the build needs no network.
const atkinson = localFont({
  src: "./_fonts/atkinson-hyperlegible-next-latin.woff2",
  weight: "200 800",
  variable: "--font-atkinson",
});

const atkinsonMono = localFont({
  src: "./_fonts/atkinson-hyperlegible-mono-latin.woff2",
  weight: "200 800",
  variable: "--font-atkinson-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Rally Timing Results",
    template: "%s – Rally Timing Results",
  },
  description:
    "Enter rally times read from the event's timing equipment. Each entry is signed on this device.",
  applicationName: "Rally Timing Results",
  // Times and car numbers are digit runs; iOS must not turn them into links.
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: {
    capable: true,
    title: "Timing Results",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${atkinson.variable} ${atkinsonMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
