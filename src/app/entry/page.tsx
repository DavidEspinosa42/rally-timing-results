import type { Metadata } from "next";
import { EntryApp } from "./_components/entry-app";

export const metadata: Metadata = { title: "Entry" };

// A static shell: everything on this screen comes from the phone's own
// storage, so it can open with no connection once installed.
export default function EntryPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <h1 className="mb-4 text-2xl font-bold">Rally Stage Times</h1>
      <EntryApp />
    </main>
  );
}
