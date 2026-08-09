import Link from "next/link";

const STEPS = [
  {
    label: "Import",
    title: "From KOReader, no manual export",
    body: "Drop in a metadata.lua, an annotations.lua, or a statistics.sqlite3 — or let the KOReader plugin sync in the background whenever you're online.",
  },
  {
    label: "Unify",
    title: "One dashboard for every book",
    body: "Highlights, reading stats, tags, and covers land in the same place, deduped across re-uploads, searchable across your whole library.",
  },
  {
    label: "Export",
    title: "Obsidian-flavored Markdown",
    body: "One book as a .md, or your whole library as a .zip — formatted as callouts with frontmatter, ready to drop into your vault.",
  },
];

export default function Home() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="w-full max-w-3xl mx-auto px-6 py-24 sm:py-32 text-center">
        <h1 className="text-[32px] sm:text-[var(--text-display)] font-semibold leading-tight text-text">
          Your KOReader highlights,
          <br />
          unified and in Obsidian.
        </h1>
        <p className="mt-5 text-lg text-text-2 max-w-xl mx-auto">
          Highlights Hub imports annotations straight from KOReader, gives them one
          home, and exports them as Markdown your Obsidian vault already understands.
        </p>
        <div className="mt-9 flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium px-6 py-3 rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity"
          >
            Sign in
          </Link>
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto px-6 pb-24 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.label}
            className="rounded-[var(--radius-card)] border border-border bg-surface p-6"
          >
            <div className="text-xs font-medium tracking-wide uppercase text-accent mb-3">
              {step.label}
            </div>
            <div className="text-base font-semibold text-text mb-2">{step.title}</div>
            <p className="text-sm text-text-2">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
