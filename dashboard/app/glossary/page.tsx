import Link from "next/link";
import {
  HEADER_GLOSS,
  QUADRANT_LABEL,
  COMBO_POSITION_LABEL,
  COMBO_LETTER_LABEL,
  LADDER_CODE_LABEL,
  GREEK_LABEL,
  PORTFOLIO_EDGE_LABEL,
  VERDICT_LABEL,
  TIER_LABEL,
  WATCHLIST_STATUS_LABEL,
} from "@/lib/labels";
import { glossarySlug } from "@/lib/glossarySlug";
import PageShell from "@/components/PageShell";

function GlossarySection({
  title,
  entries,
  idPrefix = "",
}: {
  title: string;
  entries: [string, string][];
  idPrefix?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-mono text-body font-medium text-foreground uppercase tracking-wide">
        {title}
      </h2>
      <dl className="space-y-2">
        {entries.map(([term, gloss]) => (
          <div
            key={term}
            id={`${idPrefix}${glossarySlug(term)}`}
            className="scroll-mt-[calc(var(--nav-h)+12px)] border-b border-line pb-2"
          >
            <dt className="font-mono text-body text-foreground">{term}</dt>
            <dd className="text-body text-muted leading-relaxed">{gloss}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function GlossaryPage() {
  const greekEntries: [string, string][] = Object.entries(GREEK_LABEL).map(([k, v]) => [
    k,
    `${v.symbol} — ${v.gloss}`,
  ]);

  return (
    <PageShell width="reading">
      <div className="space-y-1">
        <Link
          href="/"
          className="font-mono text-dense text-muted hover:text-foreground transition-colors"
        >
          ← Today
        </Link>
        <h1 className="text-title font-medium text-foreground">Glossary</h1>
        <p className="text-body text-muted leading-relaxed">
          Every abbreviation, badge, and status value used across the dashboard, in one place —
          the same text shown in each info-tip, reachable without a hover.
        </p>
      </div>
      <GlossarySection title="Table headers" entries={Object.entries(HEADER_GLOSS)} />
      <GlossarySection title="Rotation quadrant" entries={Object.entries(QUADRANT_LABEL)} />
      <GlossarySection title="Combo decode — positions" entries={COMBO_POSITION_LABEL}
      />
      <GlossarySection title="Combo decode — letters" entries={Object.entries(COMBO_LETTER_LABEL)} />
      <GlossarySection title="Verdict" entries={Object.entries(VERDICT_LABEL)} idPrefix="verdict-" />
      <GlossarySection title="Conviction tier" entries={Object.entries(TIER_LABEL)} idPrefix="tier-" />
      <GlossarySection title="Options ladder codes" entries={Object.entries(LADDER_CODE_LABEL)} />
      <GlossarySection title="Option greeks" entries={greekEntries} />
      <GlossarySection title="Portfolio edge" entries={Object.entries(PORTFOLIO_EDGE_LABEL)} />
      <GlossarySection title="Watchlist status" entries={Object.entries(WATCHLIST_STATUS_LABEL)} />
    </PageShell>
  );
}
