import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create · AI Video Studio",
  description: "Start a new AI video project in AI Video Studio — describe an idea and the studio builds the production pipeline.",
};

export default function SectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
