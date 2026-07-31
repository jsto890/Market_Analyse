import Link from "next/link";
import Page from "@/components/ui/Page";

/** The three reference pages, which until now were reachable only by typing
 *  their URL. Nothing here is a feed — it is the explanation of the feeds. */
const PAGES = [
  {
    href: "/learn/glossary",
    title: "Glossary",
    blurb:
      "Every abbreviation, badge and status value the dashboard uses — the same text as each info-tip, without the hover.",
  },
  {
    href: "/learn/options",
    title: "Reading the options pages",
    blurb: "What the ladder markers, gamma walls, flow columns and greeks each mean.",
  },
  {
    href: "/learn/data",
    title: "Where the data comes from",
    blurb: "Which process produced each number, how fresh it is, and what it cannot tell you.",
  },
];

export default function LearnPage() {
  return (
    <Page width="prose">
      <Page.Header
        title="Learn"
        subtitle="How to read what the rest of the dashboard shows you. Nothing here is advice."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {PAGES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="rounded-md border border-line bg-surface p-3 hover:border-accent"
          >
            <h2 className="text-title text-foreground">{p.title}</h2>
            <p className="mt-1 text-body text-2">{p.blurb}</p>
          </Link>
        ))}
      </div>
    </Page>
  );
}
