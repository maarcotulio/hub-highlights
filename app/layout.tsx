import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import "./globals.css";

const THEME_BOOTSTRAP_SCRIPT = `
  try {
    var theme = localStorage.getItem("theme");
    if (theme) document.documentElement.dataset.theme = theme;
  } catch (e) {}
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Highlights Hub",
  description:
    "Import your Kindle and KOReader highlights, unify them in one dashboard, and export them as Obsidian-flavored Markdown.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
