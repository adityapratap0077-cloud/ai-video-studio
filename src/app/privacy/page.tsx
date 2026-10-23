import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · AI Video Studio",
  description:
    "How AI Video Studio stores your projects, generated assets and provider API keys.",
};

export default function PrivacyPage() {
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: "https://aivideostudio-app.vercel.app/",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Privacy Policy",
                item: "https://aivideostudio-app.vercel.app/privacy",
              },
            ],
          }),
        }}
      />
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-faint">
          <li>
            <Link href="/projects" className="hover:text-text">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-dim">
            Privacy Policy
          </li>
        </ol>
      </nav>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text">
        Privacy Policy
      </h1>
      <p className="mt-2 font-mono text-[12px] text-faint">
        Last updated: 24 October 2026
      </p>

      <div className="mt-8 max-w-2xl space-y-8">
        <section>
          <h2 className="text-[16px] font-medium text-text">Overview</h2>
          <p className="mt-2 text-sm leading-relaxed text-dim">
            AI Video Studio is an open-source, bring-your-own-key video
            production studio. It has no user accounts and includes no
            advertising or analytics trackers. This page explains what the app
            itself stores so it can work.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-text">
            What the app stores
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-dim">
            Projects you create — the project name, your idea, settings, and
            the pipeline content generated for it (research, scripts,
            storyboards and timeline data) — are stored in the app&apos;s
            database. Files you upload or the app generates for a project
            (images, audio, video and captions), and finished exports, are
            stored as files on the server the app runs on.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-text">Your API keys</h2>
          <p className="mt-2 text-sm leading-relaxed text-dim">
            AI Video Studio runs on your own keys. A key you enter on the
            Providers page is stored in the app&apos;s database encrypted with
            AES-256-GCM, and only a masked hint of it is ever shown again. When
            you run the production pipeline, the server uses your key to call
            the provider you configured — for example OpenRouter or another
            OpenAI-compatible endpoint — so your prompts and project content
            are sent to that provider under your own account, subject to that
            provider&apos;s own policies.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-text">Self-hosting</h2>
          <p className="mt-2 text-sm leading-relaxed text-dim">
            AI Video Studio is open source and designed to be self-hosted. If
            you run your own instance, the database and files described above
            live on infrastructure you control.
          </p>
        </section>

        <section>
          <h2 className="text-[16px] font-medium text-text">Contact</h2>
          <p className="mt-2 text-sm leading-relaxed text-dim">
            Questions about this policy: email{" "}
            <a
              href="mailto:adityapratap0077@gmail.com"
              className="text-dim underline underline-offset-2 hover:text-text"
            >
              adityapratap0077@gmail.com
            </a>{" "}
            or open an issue on{" "}
            <a
              href="https://github.com/adityapratap0077-cloud/ai-video-studio/issues"
              className="text-dim underline underline-offset-2 hover:text-text"
            >
              GitHub
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
