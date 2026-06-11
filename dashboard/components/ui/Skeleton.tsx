interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

export default function Skeleton({ width, height, className = "" }: SkeletonProps) {
  return (
    <span
      className={`inline-block rounded bg-elevated animate-pulse ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
