import Skeleton from "./Skeleton";

/** Ghosted table placeholder — signals "content will load here" rather than a
 * blank void, used for empty/offline states. */
export default function SkeletonTable({
  headers,
  rows = 6,
}: {
  headers: string[];
  rows?: number;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-elevated/40" aria-hidden="true">
      <div className="flex gap-4 border-b border-line px-4 py-2">
        {headers.map((h, i) => (
          <span
            key={i}
            className="text-micro uppercase tracking-wide text-muted/40"
            style={{ flex: i === 0 ? "0 0 90px" : "1" }}
          >
            {h}
          </span>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line/40 px-4 py-2 last:border-0">
          {headers.map((_, i) => (
            <span key={i} style={{ flex: i === 0 ? "0 0 90px" : "1" }}>
              <Skeleton
                height={10}
                width={i === 0 ? "70%" : `${40 + ((r * 7 + i * 13) % 45)}%`}
                className="opacity-40"
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
