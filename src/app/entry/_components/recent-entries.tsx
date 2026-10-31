export type RecentRow = {
  recordId: string;
  carNumber: number | null;
  target: string;
  time: string;
};

/** The latest entries kept on this phone, newest first. */
export function RecentEntries({ rows }: { rows: RecentRow[] }) {
  return (
    <section aria-labelledby="recent-title" className="mt-8">
      <h2 id="recent-title" className="text-lg font-semibold">
        Saved on this phone
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-graphite">Entries you save appear here.</p>
      ) : (
        <ol className="mt-2">
          {rows.map((row) => (
            <li
              key={row.recordId}
              className="flex items-baseline gap-3 border-t border-rule py-2"
            >
              <span className="w-14 shrink-0 text-2xl font-bold">
                {row.carNumber ?? "–"}
              </span>
              <span className="min-w-0 flex-1 truncate">{row.target}</span>
              <span className="font-mono text-lg">{row.time}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
