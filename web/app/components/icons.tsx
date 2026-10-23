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

// Icon cho thanh điều hướng & bảng ở trang quản trị
export const IconDashboard = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="4" rx="1.5" />
    <rect x="13" y="10" width="7" height="10" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
  </svg>
);
export const IconCube = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
  </svg>
);
export const IconFolder = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </svg>
);
export const IconDoc = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z" />
    <path d="M14 3.5V8h4M9 12h6M9 16h6" />
  </svg>
);
export const IconReceipt = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8.5h6M9 12.5h6" />
  </svg>
);
export const IconUsers = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 15.3c1.9.6 3.1 2.2 3.5 4.7" />
  </svg>
);
export const IconCloud = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10a4.3 4.3 0 0 1-.5 8.5z" />
  </svg>
);
export const IconWallet = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
    <path d="M4 7.5V17a2 2 0 0 0 2 2h14V8H6.5A2.5 2.5 0 0 1 4 7.5z" />
    <circle cx="16" cy="13.5" r="1" />
  </svg>
);
export const IconPlus = ({ size = 16, className }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconChevronRight = ({ size = 12, className }: P) => (
  <svg {...base(size)} strokeWidth={2} className={className}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const IconExternal = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const IconSettings = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </svg>
);
