/**
 * Icons.tsx — the icon set used across every surface.
 *
 * Drawn in Duolingo's iconography: 24px grid, 2.2px strokes with round caps,
 * solid fills for "reward" objects (flame, gem, heart, bolt). Everything
 * inherits `currentColor` so a single icon works on every background.
 */
import type { CSSProperties, ReactNode } from 'react';

export interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

interface BaseProps extends IconProps {
  children: ReactNode;
  filled?: boolean;
}

function Svg({ size = 24, className, style, title, children, filled }: BaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? 0 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/* ------------------------------- Brand objects ------------------------------ */

export const FlameIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M12.2 1.8c.4 3.1 2.2 4.2 3.6 5.8 1.2 1.4 1.9 3.1 1.9 4.8a5.7 5.7 0 1 1-11.4 0c0-2 .8-3.8 2.1-5.1.3 1.5 1 2.6 2.1 3.2.2-2.7.4-5.9 1.7-8.7Z" />
    <path d="M12 21.6a2.9 2.9 0 0 0 2.9-2.9c0-1.6-1.1-2.7-2.9-4.9-1.8 2.2-2.9 3.3-2.9 4.9A2.9 2.9 0 0 0 12 21.6Z" fill="rgba(255,255,255,.55)" />
  </Svg>
);

export const GemIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M7.3 2.6h9.4l3.6 5.6-8.3 13.2L3.7 8.2l3.6-5.6Z" />
    <path d="M12 2.6 8.4 8.2l3.6 13.2 3.6-13.2L12 2.6Z" fill="rgba(255,255,255,.28)" />
  </Svg>
);

export const HeartIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M12 21.3s-7.7-4.7-9.5-9.2A5.4 5.4 0 0 1 12 6.2a5.4 5.4 0 0 1 9.5 5.9c-1.8 4.5-9.5 9.2-9.5 9.2Z" />
  </Svg>
);

export const BoltIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M13.6 1.8 4.4 13.4h5.3L9.2 22.2l9.4-12.1h-5.5l.5-8.3Z" />
  </Svg>
);

export const StarIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z" />
  </Svg>
);

export const CrownIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M2.6 7.4 7 10.6l5-6.4 5 6.4 4.4-3.2-1.7 11.2H4.3L2.6 7.4Z" />
  </Svg>
);

export const TrophyIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M6.4 3h11.2v5.2a5.6 5.6 0 0 1-4.5 5.5v3.1h2.6a1.3 1.3 0 0 1 0 2.6H8.3a1.3 1.3 0 0 1 0-2.6h2.6v-3.1a5.6 5.6 0 0 1-4.5-5.5V3Z" />
    <path d="M4.7 5.2H2.4v1.9a4.1 4.1 0 0 0 3.6 4v-2a2.1 2.1 0 0 1-1.3-1.9V5.2Zm14.6 0h2.3v1.9a4.1 4.1 0 0 1-3.6 4v-2a2.1 2.1 0 0 0 1.3-1.9V5.2Z" />
  </Svg>
);

export const ChestIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M2.8 9.2A4.4 4.4 0 0 1 7.2 4.8h9.6a4.4 4.4 0 0 1 4.4 4.4v1.2H2.8V9.2Z" />
    <path d="M2.8 12.2h18.4v5.2a2.4 2.4 0 0 1-2.4 2.4H5.2a2.4 2.4 0 0 1-2.4-2.4v-5.2Zm7.2 0h4v3.4h-4v-3.4Z" />
  </Svg>
);

export const OwlIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M5 6.6 2.8 3.2l4.6 1.1A9.2 9.2 0 0 1 12 3.4a9.2 9.2 0 0 1 4.6.9l4.6-1.1L19 6.6a9 9 0 0 1 1.6 5.2c0 5-3.9 9-8.6 9s-8.6-4-8.6-9A9 9 0 0 1 5 6.6Z" />
    <circle cx="9.1" cy="11.4" r="2.6" fill="rgba(255,255,255,.92)" />
    <circle cx="14.9" cy="11.4" r="2.6" fill="rgba(255,255,255,.92)" />
    <circle cx="9.1" cy="11.6" r="1.15" fill="#131f24" />
    <circle cx="14.9" cy="11.6" r="1.15" fill="#131f24" />
    <path d="M12 14.4 10 16.6h4L12 14.4Z" fill="rgba(255,255,255,.92)" />
  </Svg>
);

/* --------------------------------- Actions -------------------------------- */

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const PlayIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M7.5 4.6a1 1 0 0 1 1.5-.9l9.4 6.5a1.2 1.2 0 0 1 0 2l-9.4 6.5a1 1 0 0 1-1.5-.9V4.6Z" />
  </Svg>
);

export const StopIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <rect x="5" y="5" width="14" height="14" rx="3" />
  </Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.4 12a8.4 8.4 0 1 1-2.6-6.1" />
    <path d="M20.6 4.2v5.2h-5.2" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.8" cy="10.8" r="6.6" />
    <path d="M15.7 15.7 20.4 20.4" />
  </Svg>
);

export const SlidersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h6M14 7h6M4 12h10M18 12h2M4 17h3M11 17h9" />
    <circle cx="12" cy="7" r="2.1" />
    <circle cx="16" cy="12" r="2.1" />
    <circle cx="9" cy="17" r="2.1" />
  </Svg>
);

export const HistoryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.6 12a8.4 8.4 0 1 0 2.5-6" />
    <path d="M3.4 3.8v5h5" />
    <path d="M12 7.6V12l3 1.8" />
  </Svg>
);

export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V9.5M10 20V4.5M16 20v-7.5M22 20H2" />
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5v11M7.5 10 12 14.5 16.5 10M4 19.5h16" />
  </Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 19.5h16" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h16M9.5 6.5V4.2h5v2.3M6.5 6.5 7.4 20h9.2l.9-13.5M10.4 10.5v6M13.6 10.5v6" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.5 5 7 7-7 7" />
  </Svg>
);

export const SparkleIcon = (p: IconProps) => (
  <Svg {...p} filled>
    <path d="M12 2.4 13.9 8l5.6 1.9-5.6 1.9L12 17.4l-1.9-5.6L4.5 9.9 10.1 8 12 2.4Z" />
    <path d="M18.6 15.2l.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8.8-2.3Z" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.4V12l3.4 2" />
  </Svg>
);

export const TargetIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <circle cx="12" cy="12" r="4.4" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </Svg>
);

export const BookIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 5.2A2 2 0 0 1 6.5 3.2H19v17.6H6.5a2 2 0 0 0-2 2V5.2Z" />
    <path d="M4.5 18.8h14.5" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.8 20.2a6.2 6.2 0 0 1 12.4 0" />
    <path d="M16.2 5.2a3.4 3.4 0 0 1 0 6.6M17.4 14.6a6.2 6.2 0 0 1 3.8 5.6" />
  </Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.2 13.8a3.8 3.8 0 0 0 5.4 0l2.6-2.6a3.8 3.8 0 0 0-5.4-5.4l-1 1" />
    <path d="M13.8 10.2a3.8 3.8 0 0 0-5.4 0l-2.6 2.6a3.8 3.8 0 0 0 5.4 5.4l1-1" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.4 21.4 20H2.6L12 3.4Z" />
    <path d="M12 9.4v4.4" />
    <circle cx="12" cy="16.9" r="1.05" fill="currentColor" stroke="none" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.8" />
    <path d="M12 10.8v5.4" />
    <circle cx="12" cy="7.9" r="1.05" fill="currentColor" stroke="none" />
  </Svg>
);

export const KeyIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8.2" cy="15.8" r="3.9" />
    <path d="m11 13 8-8M16.6 7.4l2 2M14.2 9.8l2 2" />
  </Svg>
);

export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.8" />
    <path d="M3.2 12h17.6M12 3.2c2.4 2.4 3.6 5.4 3.6 8.8S14.4 18.4 12 20.8C9.6 18.4 8.4 15.4 8.4 12S9.6 5.6 12 3.2Z" />
  </Svg>
);

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.8 8.8 0 1 0 10.6 10.6Z" />
  </Svg>
);

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
  </Svg>
);

export const RocketIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.6 3.4c3.6-1.4 7 .4 7 .4s1.8 3.4.4 7c-1.4 3.6-6.6 7.2-6.6 7.2l-4-4s3.6-5.2 3.2-10.6Z" />
    <circle cx="15.6" cy="8.4" r="1.7" />
    <path d="M8.4 15.6 5 19M4.6 13.2 2.4 15.4l3.4 1M10.8 19.4l-1 3.4 2.2-2.2" />
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.4" y="5.4" width="17.2" height="15.2" rx="3" />
    <path d="M3.4 10.4h17.2M8 3.4v4M16 3.4v4" />
  </Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8.6" y="8.6" width="12" height="12" rx="2.6" />
    <path d="M15.4 8.6v-1.2a2.6 2.6 0 0 0-2.6-2.6H5.4a2.6 2.6 0 0 0-2.6 2.6v7.4a2.6 2.6 0 0 0 2.6 2.6h1.2" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3.6h6.4V10M20 4 11 13" />
    <path d="M18.4 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.6a2 2 0 0 1 2-2h5" />
  </Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.8 4.6 5.6v6.2c0 4.4 3.1 8.2 7.4 9.4 4.3-1.2 7.4-5 7.4-9.4V5.6L12 2.8Z" />
    <path d="m8.8 12.2 2.2 2.2 4.2-4.4" />
  </Svg>
);
