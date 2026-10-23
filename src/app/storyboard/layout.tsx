import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Storyboard · AI Video Studio",
  description: "Plan the scenes and shots of your AI video project in AI Video Studio.",
};

export default function SectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
