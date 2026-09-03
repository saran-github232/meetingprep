import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

export const IconDashboard = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </svg>
);

export const IconPractice = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.3 0-2.6-.28-3.7-.8L4 21l1.4-4.4A8.5 8.5 0 1 1 21 12Z" />
    <path d="M8.5 10.5h7M8.5 14h4.5" />
  </svg>
);

export const IconCode = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
  </svg>
);

export const IconMic = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5" />
  </svg>
);

export const IconScan = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 3.5H6A2.5 2.5 0 0 0 3.5 6v2M16 3.5h2A2.5 2.5 0 0 1 20.5 6v2M8 20.5H6A2.5 2.5 0 0 1 3.5 18v-2M16 20.5h2a2.5 2.5 0 0 0 2.5-2.5v-2" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IconFile = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" />
    <path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" />
  </svg>
);

export const IconWand = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m4.5 19.5 10-10M13 6l.7-2.2L14.4 6l2.2.7-2.2.7-.7 2.2-.7-2.2L10.8 6l2.2-.7ZM18.5 11l.5-1.5.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5ZM7 4l.5-1.5L8 4l1.5.5L8 5l-.5 1.5L7 5l-1.5-.5L7 4Z" />
  </svg>
);

export const IconFolder = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9.5V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V7Z" />
  </svg>
);

export const IconNotes = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M9 3.5v17M12.5 8.5H16M12.5 12H16M6.5 8.5h.01M6.5 12h.01" />
  </svg>
);

export const IconClock = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconStar = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
  </svg>
);

export const IconCards = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="7.5" width="13" height="13" rx="2" />
    <path d="M8 4.5h10A2.5 2.5 0 0 1 20.5 7v10" />
  </svg>
);

export const IconChart = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3.5" />
  </svg>
);

export const IconSliders = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
);

export const IconShield = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3 5 5.8v5.4c0 4.3 2.9 7.7 7 9.3 4.1-1.6 7-5 7-9.3V5.8L12 3Z" />
    <path d="m9 11.8 2.2 2.2 4-4.2" />
  </svg>
);

export const IconSun = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 13.5A8 8 0 0 1 10.5 4 7.5 7.5 0 1 0 20 13.5Z" />
  </svg>
);

export const IconMonitor = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M9 20.5h6M12 16.5v4" />
  </svg>
);

export const IconBolt = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13 2.5 4.5 13.5H11l-1 8L18.5 10H12l1-7.5Z" />
  </svg>
);

export const IconArrowRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.5 12h15M13.5 6l6 6-6 6" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.5 6.5h15M9.5 3.5h5M7 6.5l.8 12A1.5 1.5 0 0 0 9.3 20h5.4a1.5 1.5 0 0 0 1.5-1.4l.8-12M10 10v6M14 10v6" />
  </svg>
);

export const IconUpload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 16V4.5M7 9.5l5-5 5 5M4.5 19.5h15" />
  </svg>
);

export const IconExternal = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 5H6.5A2 2 0 0 0 4.5 7v10.5a2 2 0 0 0 2 2H17a2 2 0 0 0 2-2V14M14.5 4.5h5v5M19.5 4.5 11.5 12.5" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconLock = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </svg>
);

export const IconChevron = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m9 5.5 6.5 6.5L9 18.5" />
  </svg>
);

export const IconVolume = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4Z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
  </svg>
);

export const IconSpark = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M5.6 18.4l2.5-2.5M15.9 8.1l2.5-2.5" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

export const IconRocket = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

export const IconGuide = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M2.5 4h5.5a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2.5V4Z" />
    <path d="M21.5 4H16a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h6.5V4Z" />
  </svg>
);

export const IconListCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m3.5 16.5 2 2 4-4" />
    <path d="m3.5 7.5 2 2 4-4" />
    <path d="M13 7h8M13 13.5h8M13 20h8" />
  </svg>
);
