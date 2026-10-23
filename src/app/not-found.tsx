import Link from "next/link";

export default function NotFound() {
  return (
    <div className="px-4 py-16 text-center">
      <p className="font-mono text-[11px] uppercase tracking-widest text-faint">
        404
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">
        Page not found
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-dim">
        This page does not exist in AI Video Studio. Head back to your projects
        to keep creating.
      </p>
      <Link
        href="/projects"
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-rec px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#c93a40]"
      >
        Go to Projects
      </Link>
    </div>
  );
}
