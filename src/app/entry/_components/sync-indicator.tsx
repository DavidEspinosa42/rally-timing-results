import type { DrainOutcome, SyncProblem } from "@/lib/client/sync";

const entries = (n: number) => (n === 1 ? "1 entry" : `${n} entries`);

const PROBLEMS: Partial<Record<SyncProblem["reason"], string>> = {
  "not-authorized":
    "The server refused an entry: this device is not authorized for that point. Ask the organizer.",
  revoked: "The server refused this device's entries: it was revoked.",
  "unknown-device":
    "The server does not know this device. Ask the organizer to authorize it again.",
  "wrong-rally": "The server refused an entry made for another rally.",
  "server-chain-differs":
    "The server holds different entries for this device. Tell the organizer, and keep this phone as it is.",
};

/**
 * Whether entries have reached the server. "No connection" means the last
 * attempt to send failed, whatever the phone's own network icon shows.
 */
export function SyncIndicator({ status }: { status: DrainOutcome | null }) {
  if (status === null) {
    return <p className="min-h-6 text-graphite">Checking what is synced…</p>;
  }
  const { pending, online, problem } = status;

  if (problem !== null) {
    return (
      <div role="alert" className="border-l-4 border-alert pl-3">
        <p className="font-semibold">
          {PROBLEMS[problem.reason] ??
            `The server refused an entry (${problem.reason}). Tell the organizer.`}
        </p>
        <p className="text-graphite">
          {entries(pending)} waiting on this phone.{" "}
          {pending === 1 ? "It is not lost." : "They are not lost."}
        </p>
      </div>
    );
  }
  if (pending === 0) {
    return <p className="min-h-6 text-graphite">All entries synced</p>;
  }
  if (online === false) {
    return (
      <p className="min-h-6 border-l-4 border-board pl-3 font-semibold">
        {entries(pending)} waiting to sync. No connection;{" "}
        {pending === 1 ? "it is" : "they are"} safe on this phone.
      </p>
    );
  }
  return <p className="min-h-6 text-graphite">Syncing {entries(pending)}…</p>;
}
