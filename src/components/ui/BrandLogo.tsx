import Image from "next/image";

interface BrandLogoProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

const ALLOWED_ICON_SIZES = [32, 72, 96, 128, 144, 152, 180, 192, 384, 512] as const;

function resolvePwaIconSize(size: number): number {
  const rounded = Math.max(1, Math.round(size));
  const exact = ALLOWED_ICON_SIZES.find((value) => value === rounded);
  if (exact) {
    return exact;
  }
  const nextLargest = ALLOWED_ICON_SIZES.find((value) => value >= rounded);
  return nextLargest || 512;
}

export default function BrandLogo({
  size = 32,
  className = "",
  priority = false,
}: BrandLogoProps) {
  const iconSize = resolvePwaIconSize(size);

  return (
    <Image
      src={`/api/pwa/icon?size=${iconSize}`}
      alt="DooSplit"
      width={size}
      height={size}
      priority={priority}
      className={`shrink-0 ${className}`.trim()}
    />
  );
}
