import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Assets · AI Video Studio",
  description: "Generated and uploaded images, audio and video assets for your AI Video Studio projects.",
};

export default function SectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
