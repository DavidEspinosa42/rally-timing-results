import type { Persistence } from "@/lib/client/support";

/**
 * Whether the browser has agreed to keep this site's data. Until it has,
 * anything not yet synced (and the key) can be lost with it.
 */
export function StorageBadge({ persistence }: { persistence: Persistence }) {
  if (persistence === "persistent") {
    return <p className="text-sm text-graphite">Storage: persistent</p>;
  }
  return (
    <p className="text-sm font-semibold text-alert">
      May be cleared: install to Home Screen
    </p>
  );
}
