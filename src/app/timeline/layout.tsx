import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Timeline · AI Video Studio",
  description: "Arrange scenes, narration and music on the timeline of your AI Video Studio project.",
};

export default function SectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
