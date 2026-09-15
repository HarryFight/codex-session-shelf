type IconProps = { size?: number; className?: string };

const svgProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  'aria-hidden': true as const,
  className,
});

export function RefreshIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89M13.5 1.5V4h-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StarIcon({ size = 14, className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg {...svgProps(size, className)} fill={filled ? 'currentColor' : 'none'}>
      <path d="M8 1.5l1.9 3.85 4.1.6-3 2.92.71 4.13L8 11l-3.71 1.95.71-4.13-3-2.92 4.1-.6L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function PinIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M8 1.5v7M5 4.5L8 1.5l3 3M3 12.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowUpRightIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4.5 11.5l7-7M5.5 4.5h6v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ListIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M2.5 4h11M2.5 8h11M2.5 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ColumnsIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="2" y="3" width="4.5" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9.5" y="3" width="4.5" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function PulseIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M1.5 8h3l1.5-4 3 8 1.5-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronIcon({ size = 14, className, direction = 'down' }: IconProps & { direction?: 'up' | 'down' }) {
  return (
    <svg {...svgProps(size, className)} style={{ transform: direction === 'up' ? 'rotate(180deg)' : undefined }}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TagIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M8.5 1.5H14v5.5L7.5 13.5 1.5 7.5 8.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="11" cy="5" r="1" fill="currentColor" />
    </svg>
  );
}
