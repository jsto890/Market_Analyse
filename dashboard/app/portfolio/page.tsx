"use client";
import Badge from "@/components/ui/Badge";
import StatChip from "@/components/ui/StatChip";
import Empty from "@/components/ui/Empty";
import Loading from "@/components/ui/Loading";
import Button from "@/components/ui/Button";
import { PlugZap, Briefcase, AlertTriangle } from "lucide-react";
import { signedCurrency, price as fmtPrice, pctWhole } from "@/lib/format";
import { PORTFOLIO_EDGE_LABEL } from "@/lib/labels";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Page from "@/components/ui/Page";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface PositionRow {
  symbol: string;
  position: number | null;
  avg_cost: number | null;
  verdict?: string;
  score?: number;
  edge?: string;
  market_value?: number | null;
  unrealized_pnl?: number | null;
  high_conviction?: boolean;
  ibkr_offline?: boolean;
  error?: string;
}

// /api/portfolio returns a bare list. When IBKR is unreachable and the yf
// fallback also yields nothing, it returns [{ error, ibkr_offline }].
type ApiResponse = PositionRow[] | { error: string };

function isList(r: ApiResponse | undefined): r is PositionRow[] {
  return Array.isArray(r);
}

function isErrorSentinel(rows: PositionRow[]): boolean {
  return rows.length === 1 && rows[0].error != null && rows[0].symbol == null;
}

/** Where the money is, not what it is doing — that is the row of chips. */
function ConnectionChip({ offline }: { offline: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-micro ${
        offline ? "border-warn/40 text-warn" : "border-line text-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${offline ? "bg-warn" : "bg-pos"}`} />
      TWS · port 7496 · {offline ? "offline" : "live"}
    </span>
  );
}

function Pnl({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-data text-muted">—</span>;
  return (
    <span className={`text-data ${value >= 0 ? "text-pos" : "text-neg"}`}>{signedCurrency(value)}</span>
  );
}

function PositionCard({ r }: { r: PositionRow }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <Link href={`/t/${r.symbol}`} className="text-data text-title font-medium text-accent hover:underline">
          {r.symbol}
        </Link>
        {r.verdict && <Badge variant="verdict" value={r.verdict} />}
        {r.score != null && <span className="text-data text-model">{r.score.toFixed(2)}</span>}
        {r.high_conviction && <span className="text-micro font-bold text-model">HC</span>}
        <span className="ml-auto">
          <Pnl value={r.unrealized_pnl} />
        </span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-data text-title text-foreground">
          {r.position == null ? "—" : r.position}
        </span>
        <span className="text-body text-muted">
          shares @ {r.avg_cost == null ? "—" : `$${r.avg_cost.toFixed(2)}`}
          {r.market_value != null && ` · ${fmtPrice(r.market_value)} at market`}
        </span>
      </div>

      {/* The edge in words. It was a three-letter badge with the meaning
          hidden behind a tooltip, which is the one place a reader will not
          look while deciding whether to keep a position. */}
      {r.edge && (
        <div className="mt-2 border-t border-line pt-2">
          <Badge variant="edge" value={r.edge} />
          <p className="mt-1 text-body text-2">{PORTFOLIO_EDGE_LABEL[r.edge]}</p>
        </div>
      )}
    </div>
  );
}

/** Positions the ensemble has turned against. This is the reason to open the
 *  page: nothing else here changes between visits without your doing something. */
function DisagreementBand({ rows }: { rows: PositionRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-md border border-warn/40 bg-warn/5 p-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-warn" />
        <h2 className="text-title text-foreground">
          Argus has turned against {rows.length} position{rows.length !== 1 ? "s" : ""}
        </h2>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.symbol} className="rounded border border-line bg-surface p-2.5">
            <div className="flex items-center gap-2">
              <Link href={`/t/${r.symbol}`} className="text-data font-medium text-accent hover:underline">
                {r.symbol}
              </Link>
              {r.verdict && <Badge variant="verdict" value={r.verdict} />}
              <span className="ml-auto">
                <Pnl value={r.unrealized_pnl} />
              </span>
            </div>
            <p className="mt-1 text-body text-2">{PORTFOLIO_EDGE_LABEL[r.edge!]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PortfolioPage() {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<ApiResponse>(
    "/api/argus/portfolio",
    fetcher,
    { refreshInterval: 60000 }
  );
  const { data: wl } = useSWR<{ watchlist: { ticker: string; pinned_at: string }[] }>(
    "/api/watchlist",
    fetcher
  );
  const { data: account } = useSWR<Record<string, string>>("/api/argus/account", fetcher);
  const pinned = wl?.watchlist ?? [];

  const rows = isList(data) ? data : [];
  const offline = !isList(data) || isErrorSentinel(rows);
  const liveOffline = rows.some((r) => r.ibkr_offline);
  const positions = offline ? [] : rows;
  const isEmpty = !isLoading && isList(data) && !offline && positions.length === 0;

  const disagreeing = positions.filter(
    (r) => r.edge === "CONSIDER SELLING" || r.edge === "CONSIDER COVERING"
  );

  // Two of the five come off the account summary and three off the positions
  // themselves; each renders only if its input arrived. IBKR's summary carries
  // no day P&L, so the band has none — a dash there would claim a feed.
  const num = (v: string | undefined) => {
    const n = Number(v);
    return v == null || Number.isNaN(n) ? null : n;
  };
  const nlv = num(account?.NetLiquidation);
  const cash = num(account?.TotalCashValue);
  const priced = positions.filter((r) => r.market_value != null);
  const gross = priced.reduce((s, r) => s + Math.abs(r.market_value!), 0);
  const unrealised = positions.some((r) => r.unrealized_pnl != null)
    ? positions.reduce((s, r) => s + (r.unrealized_pnl ?? 0), 0)
    : null;
  const exposure = nlv && gross > 0 ? gross / nlv : null;
  const concentration =
    gross > 0 ? Math.max(...priced.map((r) => Math.abs(r.market_value!))) / gross : null;

  return (
    <Page width="wide">
        <Page.Header title="Portfolio" status={<ConnectionChip offline={offline} />} />

        <DisagreementBand rows={disagreeing} />

        {(nlv !== null || unrealised !== null || cash !== null || exposure !== null) && (
          <div className="flex flex-wrap gap-2">
            {nlv !== null && <StatChip label="NLV" value={signedCurrency(nlv)} />}
            {unrealised !== null && (
              <StatChip
                label="Unrealised"
                value={signedCurrency(unrealised)}
                tone={unrealised >= 0 ? "pos" : "neg"}
              />
            )}
            {cash !== null && <StatChip label="Cash" value={signedCurrency(cash)} />}
            {exposure !== null && (
              <StatChip label="Exposure" value={pctWhole(exposure * 100, "percent")} />
            )}
            {concentration !== null && (
              <StatChip label="Largest" value={pctWhole(concentration * 100, "percent")} />
            )}
          </div>
        )}

        {isLoading && <Loading variant="block" label="Loading positions" />}

        {/* Offline with nothing to fall back on: one honest empty state that
         * fills the column, instead of a banner stacked on a ghost table
         * header listing columns that will never have rows. */}
        {!isLoading && offline && pinned.length === 0 && (
          <Empty
            fill
            icon={<PlugZap size={26} strokeWidth={1.5} />}
            title="IBKR Gateway offline"
            message="Connect TWS on port 7496 (live) to see positions, cost basis and Argus edge. Pin tickers on the watchlist for a price-only fallback."
            action={
              <Button variant="secondary" onClick={() => void mutate()}>
                Retry connection
              </Button>
            }
          />
        )}

        {!isLoading && offline && pinned.length > 0 && (
          <div className="space-y-4">
            {/* The header chip already says the connection is down; this says
                what is on screen instead, which the chip cannot. */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-body text-warn/80">
                  TWS is offline — showing your pinned watchlist instead of live positions ({pinned.length}).
                </p>
                <Button variant="secondary" size="sm" onClick={() => void mutate()} className="ml-auto">
                  Retry
                </Button>
              </div>
              <div className="bg-surface border border-line rounded p-2 overflow-x-auto">
                <table className="w-full text-body border-collapse">
                  <tbody>
                    {pinned.map((p) => (
                      <tr key={p.ticker} className="border-b border-[var(--elevated)] last:border-0">
                        <td className="py-1.5 px-2">
                          <Link href={`/t/${p.ticker}`} className="text-data text-accent hover:underline">
                            {p.ticker}
                          </Link>
                        </td>
                        <td className="py-1.5 px-2 text-right text-data text-muted">
                          pinned {new Date(p.pinned_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!isLoading && isEmpty && (
          <Empty
            fill
            icon={<Briefcase size={26} strokeWidth={1.5} />}
            title="No open positions"
            message="TWS is connected but the account holds no equity positions. Candidates from the screener and watchlist will show their Argus edge here once you're filled."
            action={
              <Button variant="secondary" onClick={() => router.push("/screener")}>
                Open screener
              </Button>
            }
          />
        )}

        {!isLoading && !offline && positions.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <p className="text-data text-muted">
                {positions.length} position{positions.length !== 1 ? "s" : ""}
              </p>
              {liveOffline && (
                <span className="text-body text-warn/80">
                  Price-only preview from your pinned watchlist — TWS positions unavailable
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {positions.map((r) => (
                <PositionCard key={r.symbol} r={r} />
              ))}
            </div>
          </>
        )}
    </Page>
  );
}
