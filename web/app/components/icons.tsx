// Icon nét mảnh, kế thừa màu chữ
type P = { size?: number; className?: string };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconArrow = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconArrowLeft = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
export const IconChevron = ({ size = 12, className }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const IconCamera = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const IconSearch = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);
export const IconDownload = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
);
export const IconX = ({ size = 14, className }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconUp = ({ size = 14, className }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <path d="M6 15l6-6 6 6" />
  </svg>
);
export const IconDown = ({ size = 14, className }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const IconUpload = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
  </svg>
);
