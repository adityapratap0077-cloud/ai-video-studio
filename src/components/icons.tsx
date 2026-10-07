import type { ComponentType } from "react";

export type IconProps = { className?: string };
export type Icon = ComponentType<IconProps>;

function make(path: React.ReactNode): Icon {
  return function SvgIcon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
}

export const IconProjects = make(
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
);
export const IconCreate = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </>,
);
export const IconStoryboard = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4" />
  </>,
);
export const IconAssets = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="1.6" />
    <path d="M21 15l-4.5-4.5L6 21" />
  </>,
);
export const IconTimeline = make(
  <>
    <path d="M3 6h18M3 12h18M3 18h18" />
    <rect x="6" y="4.5" width="7" height="3" rx="1" fill="currentColor" stroke="none" />
    <rect x="12" y="10.5" width="9" height="3" rx="1" fill="currentColor" stroke="none" />
    <rect x="4" y="16.5" width="5" height="3" rx="1" fill="currentColor" stroke="none" />
  </>,
);
export const IconExports = make(
  <>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 19h16" />
  </>,
);
export const IconProviders = make(
  <>
    <path d="M9 7V3M15 7V3" />
    <path d="M7 7h10v4a5 5 0 0 1-10 0V7z" />
    <path d="M12 16v5" />
  </>,
);
export const IconSettings = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.89a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10.11 3V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56.6.26 1.3.13 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08c.26.6.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09c-.68 0-1.3.4-1.51 1.03z" />
  </>,
);
export const IconCheck = make(<path d="M4 12.5l5 5L20 6.5" />);
export const IconAlert = make(
  <>
    <path d="M12 3l10 17H2L12 3z" />
    <path d="M12 10v4M12 17.5v.5" />
  </>,
);
