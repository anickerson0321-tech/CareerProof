"use client";

import { ErrorState } from "@/components/common/error-state";

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="main" className="px-4 py-16">
      <ErrorState error={error} retry={retry} />
    </main>
  );
}
