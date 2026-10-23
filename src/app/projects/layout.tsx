import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects · AI Video Studio",
  description: "Browse and manage your AI video projects in AI Video Studio — from first idea to finished export.",
};

export default function SectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
