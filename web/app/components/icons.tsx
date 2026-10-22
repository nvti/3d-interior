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
// Logo Google giữ màu thương hiệu (không kế thừa màu chữ)
export const IconGoogle = ({ size = 18, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
    <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11z" />
    <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77z" />
  </svg>
);
