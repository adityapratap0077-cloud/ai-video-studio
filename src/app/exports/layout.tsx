import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exports · AI Video Studio",
  description: "Finished renders and export packages from your AI Video Studio projects, ready to download.",
};

export default function SectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
