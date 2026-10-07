import Link from "next/link";
import { DemoToggle } from "@/components/DemoToggle";
import { IconProviders } from "@/components/icons";

/**
 * App settings. Environment status lists which (non-secret) variables are
 * set — never their values. Server-side secrets are never listed here.
 */
const ENV_WHITELIST = [
  { name: "NODE_ENV", hint: "Runtime environment" },
  { name: "NEXT_PUBLIC_APP_URL", hint: "Public app URL" },
  { name: "NEXT_PUBLIC_API_URL", hint: "Public API base URL" },
  { name: "NEXT_PUBLIC_DEMO_ENABLED", hint: "Demo mode feature flag" },
] as const;

function envIsSet(name: string): boolean {
  const v = process.env[name];
  return v !== undefined && v !== "";
}

export default function SettingsPage() {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
        Configuration
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text">
        Settings
      </h1>

      <div className="mt-8 space-y-4">
        <section className="rounded-md border border-line bg-panel p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-medium text-text">Demo mode</h2>
              <p className="mt-1 max-w-lg text-sm leading-relaxed text-dim">
                Shows the seeded sample projects alongside your own, with every
                demo item clearly labelled. Turn it off to see only real
                projects. Equivalent to adding{" "}
                <code className="rounded bg-ink px-1.5 py-0.5 font-mono text-[12px] text-dim">
                  ?demo=1
                </code>{" "}
                to any URL.
              </p>
            </div>
            <DemoToggle />
          </div>
        </section>

        <section className="rounded-md border border-line bg-panel p-5">
          <h2 className="text-[16px] font-medium text-text">
            Environment status
          </h2>
          <p className="mt-1 max-w-lg text-sm leading-relaxed text-dim">
            Which configuration variables are present. Values are never shown
            here — server-side secrets are not listed at all.
          </p>
          <dl className="mt-4 divide-y divide-line/60 border-t border-line/60">
            {ENV_WHITELIST.map(({ name, hint }) => {
              const set = envIsSet(name);
              return (
                <div
                  key={name}
                  className="flex items-center justify-between gap-4 py-2.5"
                >
                  <div>
                    <dt className="font-mono text-[13px] text-text">{name}</dt>
                    <dd className="text-[12px] text-faint">{hint}</dd>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
                      set
                        ? "border-ok/40 bg-ok/10 text-ok"
                        : "border-line bg-ink text-faint"
                    }`}
                  >
                    {set ? "Set" : "Not set"}
                  </span>
                </div>
              );
            })}
          </dl>
        </section>

        <section className="rounded-md border border-line bg-panel p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-medium text-text">AI providers</h2>
              <p className="mt-1 max-w-lg text-sm leading-relaxed text-dim">
                Connect your own API keys for script, video, image, voice and
                research providers. You pay providers directly.
              </p>
            </div>
            <Link
              href="/providers"
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-line bg-raise px-4 py-2 text-sm text-text hover:border-dim"
            >
              <IconProviders className="h-4 w-4" />
              Manage providers
            </Link>
          </div>
        </section>

        <section className="rounded-md border border-line bg-panel p-5">
          <h2 className="text-[16px] font-medium text-text">About</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-mono text-[12px] text-faint">
                version
              </dt>
              <dd className="font-mono text-[12px] text-dim">0.1.0 · phase 1</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-mono text-[12px] text-faint">
                model
              </dt>
              <dd className="font-mono text-[12px] text-dim">
                bring your own key — open source
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
