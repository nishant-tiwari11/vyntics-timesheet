import "./skeleton.css";

type Size = number | string;

/** One placeholder block. Decorative, so it is hidden from screen readers; wrap groups in SkeletonRegion. */
export function Skeleton({
  width,
  height = 16,
  radius,
  circle,
  pill,
  className,
  style,
}: {
  width?: Size;
  height?: Size;
  radius?: Size;
  circle?: boolean;
  pill?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const classes = ["ts-sk", circle ? "ts-sk-circle" : "", pill ? "ts-sk-pill" : "", className ?? ""].filter(Boolean).join(" ");
  return <span className={classes} aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}

/** Tells assistive technology that this area is loading (and what is loading), once, for the whole group. */
export function SkeletonRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className} role="status" aria-busy="true" aria-label={`${label}, loading`}>
      {children}
    </div>
  );
}
