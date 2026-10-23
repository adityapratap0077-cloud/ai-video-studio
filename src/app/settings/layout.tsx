import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings · AI Video Studio",
  description: "Configure AI Video Studio — demo mode, environment status and app preferences.",
};

export default function SectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
