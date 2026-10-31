import type { Metadata, Viewport } from "next";
import {
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
} from "next/font/google";
import "./globals.css";

// Atkinson Hyperlegible was drawn so that 1 and 7, 0 and 8, 6 and 9 cannot be
// mistaken for each other, which is what matters when copying times. The
// mono cut is used only for the readback, like a timing printer's tape.
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
});

const atkinsonMono = Atkinson_Hyperlegible_Mono({
  variable: "--font-atkinson-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Rally Stage Times", template: "%s – Rally Stage Times" },
  description:
    "Enter rally times read from the event's timing equipment. Each entry is signed on this device.",
  applicationName: "Rally Stage Times",
  // Times and car numbers are digit runs; iOS must not turn them into links.
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: {
    capable: true,
    title: "Stage Times",
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
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
