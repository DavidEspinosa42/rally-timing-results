import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "No connection" };

// What the service worker shows for a page it does not hold. The entry
// screen itself is precached, so it opens without a connection.
export default function OfflinePage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-[max(env(safe-area-inset-top),1rem)]">
      <h1 className="mb-4 text-2xl font-bold">No connection</h1>
      <p className="mb-6">
        This page is not available offline. The entry screen is, and entries
        made there are kept on this phone until they can be sent.
      </p>
      <Link
        href="/entry"
        className="flex h-14 items-center justify-center rounded-md bg-board text-lg font-bold text-black"
      >
        Open the entry screen
      </Link>
    </main>
  );
}
