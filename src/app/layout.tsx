import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aivideostudio-app.vercel.app"),
  title: "AI Video Studio",
  description:
    "Bring-your-own-key AI video production studio — from idea to export.",
  authors: [
    {
      name: "Aditya Pratap",
      url: "https://adityapratapjhansi.vercel.app/about.html",
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-ink font-sans text-text">
        <link rel="canonical" href="https://aivideostudio-app.vercel.app/" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Person",
                  "@id": "https://adityapratapjhansi.vercel.app/about.html#aditya-pratap",
                  name: "Aditya Pratap",
                  url: "https://adityapratapjhansi.vercel.app/about.html",
                  sameAs: [
                    "https://github.com/adityapratap0077-cloud",
                    "https://www.linkedin.com/in/aditya-pratap-1244a7383/",
                  ],
                },
                {
                  "@type": "WebSite",
                  name: "AI Video Studio",
                  url: "https://aivideostudio-app.vercel.app/",
                  author: {
                    "@id": "https://adityapratapjhansi.vercel.app/about.html#aditya-pratap",
                  },
                },
              ],
            }),
          }}
        />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header />
            <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
              <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>
            <footer className="px-4 pb-6 pt-2 text-center text-xs text-faint sm:px-6 lg:px-10">
              <a
                href="https://adityapratapjhansi.vercel.app/about.html"
                className="text-dim underline underline-offset-2 hover:text-text"
              >Built by Aditya Pratap</a>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
