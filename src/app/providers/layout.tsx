import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Providers · AI Video Studio",
  description: "Connect your own LLM provider — OpenRouter or any OpenAI-compatible endpoint — with your own API key.",
};

export default function SectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
