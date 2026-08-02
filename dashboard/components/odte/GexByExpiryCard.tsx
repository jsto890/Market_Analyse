import ReadThis from "@/components/ui/ReadThis";
import { fmtGex } from "@/lib/odteCompanion";

export interface ExpiryGex {
  label: string;
  net: number;
}

/** Dealer-signed GEX summed per expiry across the strikes the ladder returned.
 *  Bars share one scale so the near expiry can be compared with the far one. */
export default function GexByExpiryCard({ rows }: { rows: ExpiryGex[] }) {
  const peak = Math.max(...rows.map((r) => Math.abs(r.net)), 0);
  if (rows.length === 0 || peak <= 0) return null;

  const firstNegative = rows.find((r) => r.net < 0);

  return (
    <section className="overflow-hidden rounded-[8px] border border-line bg-surface">
      <div className="border-b border-line px-[14px] py-[11px] text-title text-foreground">
        Net GEX by expiry
      </div>
      <div className="flex flex-col gap-[9px] px-[14px] py-3">
        {rows.map((r) => {
          const positive = r.net >= 0;
          const width = (Math.abs(r.net) / peak) * 50;
          return (
            <div key={r.label} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-data text-muted">{r.label}</span>
              <span className="relative h-3 flex-1">
                <span className="absolute inset-y-0 w-px bg-line-strong" style={{ left: "50%" }} />
                <span
                  className={`absolute inset-y-px opacity-60 ${
                    positive ? "rounded-r-[2px] bg-teal" : "rounded-l-[2px] bg-put"
                  }`}
                  style={
                    positive
                      ? { left: "50%", width: `${width}%` }
                      : { right: "50%", width: `${width}%` }
                  }
                />
              </span>
              <span
                className={`w-[52px] shrink-0 text-right text-data ${
                  positive ? "text-teal" : "text-put"
                }`}
              >
                {fmtGex(r.net)}
              </span>
            </div>
          );
        })}
      </div>
      <ReadThis>
        {firstNegative ? (
          <>
            the {firstNegative.label} expiry is the first with a negative book — that is where
            hedging starts amplifying moves rather than absorbing them.
          </>
        ) : (
          <>every listed expiry carries a positive book, so hedging absorbs moves across the curve.</>
        )}
      </ReadThis>
    </section>
  );
}
