"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { IconAlert } from "@/components/icons";
import { listProviders, saveProvider, testProvider } from "@/lib/api";
import type { Provider, TestResult } from "@/lib/types";

const OPENROUTER_MODELS = [
  "anthropic/claude-sonnet-4",
  "openai/gpt-5",
  "google/gemini-2.5-pro",
  "x-ai/grok-4",
  "deepseek/deepseek-v3",
];

function keyPlaceholder(keyHint: string | null): string {
  if (!keyHint) return "Paste your key — never shown again";
  const tail = keyHint.replace(/•/g, "").slice(-4);
  return `••••${tail}`;
}

function ProviderCard({
  provider,
  onSaved,
  simulated,
}: {
  provider: Provider;
  onSaved: (p: Provider) => void;
  simulated: boolean;
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(provider.model ?? "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  const dirty =
    apiKey.trim().length > 0 || model.trim() !== (provider.model ?? "");

  const doSave = useCallback(async () => {
    setSaving(true);
    setCardError(null);
    setSavedFlash(false);
    try {
      const res = await saveProvider(provider.providerId, {
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        model: model.trim() || undefined,
      });
      onSaved(res.data);
      setApiKey("");
      setSavedFlash(true);
      setTestResult(null);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [apiKey, model, onSaved, provider.providerId]);

  const doTest = useCallback(async () => {
    setTesting(true);
    setCardError(null);
    try {
      const res = await testProvider(provider.providerId);
      setTestResult(res.data);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  }, [provider.providerId]);

  return (
    <section
      aria-label={`${provider.displayName} provider`}
      className="flex flex-col rounded-md border border-line bg-panel p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-text">
            {provider.displayName}
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-faint">
            {provider.providerId}
          </p>
        </div>
        <StatusBadge status={provider.lastStatus} />
      </div>

      {provider.lastError && (
        <p className="mt-3 flex items-start gap-2 rounded border border-line bg-ink px-3 py-2 text-[13px] text-dim">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          {provider.lastError}
        </p>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor={`key-${provider.providerId}`}
            className="mb-1.5 block font-mono text-[11px] uppercase tracking-widest text-faint"
          >
            API key
          </label>
          <input
            id={`key-${provider.providerId}`}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keyPlaceholder(provider.keyHint)}
            autoComplete="new-password"
            spellCheck={false}
            className="w-full rounded-md border border-line bg-ink px-3 py-2.5 font-mono text-sm text-text placeholder:font-sans placeholder:text-faint focus:border-dim"
          />
          <p className="mt-1.5 text-[12px] text-faint">
            {provider.keyHint
              ? "A key is stored. Paste a new one to replace it — the current key is never displayed."
              : "No key stored yet. Keys are encrypted server-side."}
          </p>
        </div>

        <div>
          <label
            htmlFor={`model-${provider.providerId}`}
            className="mb-1.5 block font-mono text-[11px] uppercase tracking-widest text-faint"
          >
            Model
          </label>
          <input
            id={`model-${provider.providerId}`}
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider.model ?? "e.g. anthropic/claude-sonnet-4"}
            list={
              provider.providerId === "openrouter"
                ? `models-${provider.providerId}`
                : undefined
            }
            spellCheck={false}
            className="w-full rounded-md border border-line bg-ink px-3 py-2.5 font-mono text-sm text-text placeholder:text-faint focus:border-dim"
          />
          {provider.providerId === "openrouter" && (
            <datalist id={`models-${provider.providerId}`}>
              {OPENROUTER_MODELS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
        </div>
      </div>

      {testResult && (
        <div
          role="status"
          className="mt-4 rounded border border-line bg-ink px-3 py-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <StatusBadge status={testResult.status} />
            <span className="font-mono text-[11px] tabular-nums text-faint">
              {testResult.latencyMs} ms{simulated ? " · simulated" : ""}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-dim">
            {testResult.message}
          </p>
        </div>
      )}

      {cardError && (
        <p role="alert" className="mt-3 text-[13px] text-rec">
          {cardError}
        </p>
      )}
      {savedFlash && (
        <p role="status" className="mt-3 font-mono text-[12px] text-ok">
          Saved{simulated ? " (simulated — API not connected)" : ""}.
        </p>
      )}

      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => void doSave()}
          disabled={saving || !dirty}
          className="rounded-md bg-rec px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#c93a40] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => void doTest()}
          disabled={testing}
          className="rounded-md border border-line bg-raise px-4 py-2 text-sm text-text transition-colors hover:border-dim disabled:opacity-40"
        >
          {testing ? "Testing…" : "Test Connection"}
        </button>
      </div>
    </section>
  );
}

function ProvidersInner() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [mock, setMock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await listProviders();
      setProviders(res.data);
      setMock(res.mock);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load providers.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect
    void load();
  }, [load]);

  const onSaved = useCallback((updated: Provider) => {
    setProviders((prev) =>
      prev
        ? prev.map((p) => (p.providerId === updated.providerId ? updated : p))
        : prev,
    );
  }, []);

  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
        Settings
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text">
        AI Providers
      </h1>

      <div
        role="note"
        className="mt-5 rounded-md border border-line bg-panel px-5 py-4"
      >
        <p className="font-mono text-[12px] uppercase tracking-wide text-text">
          Bring your own key
        </p>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-dim">
          You pay providers directly — AI Video Studio does not charge for API
          usage. Keys are encrypted and never leave the server: they are never
          shown in full, stored in the browser, or put in URLs.
        </p>
      </div>

      {mock && (
        <p
          role="note"
          className="mt-4 rounded border border-warn/40 bg-warn/[0.07] px-4 py-2.5 text-sm text-dim"
        >
          <span className="font-mono text-[12px] uppercase tracking-wide text-warn">
            Sample data
          </span>{" "}
          — the providers API is not connected yet. Saves and tests below are
          simulated.
        </p>
      )}

      <div className="mt-6">
        {error && (
          <div className="rounded-md border border-rec/40 bg-rec/[0.07] px-4 py-5">
            <p className="text-sm font-medium text-text">
              Could not load providers
            </p>
            <p className="mt-1 text-sm text-dim">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 rounded-md border border-line bg-raise px-3 py-1.5 text-sm text-text hover:border-dim"
            >
              Retry
            </button>
          </div>
        )}

        {!error && providers === null && (
          <div
            className="grid gap-4 md:grid-cols-2"
            aria-label="Loading providers"
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-md border border-line bg-panel"
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {!error && providers !== null && (
          <div className="grid items-start gap-4 md:grid-cols-2">
            {providers.map((p) => (
              <ProviderCard
                key={p.providerId}
                provider={p}
                onSaved={onSaved}
                simulated={mock}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProvidersPage() {
  return <ProvidersInner />;
}
