"use client";

import { useRouter } from "next/navigation";
import { VaultView, type VaultActions, type VaultProfile } from "@/components/vault/vault-view";
import type { Fact, Job } from "@/lib/domain";
import type { YearMonth } from "@/lib/dates/parse";
import { api } from "@/lib/api/client";

export function VaultClient(props: {
  profile: VaultProfile;
  jobs: Job[];
  facts: Fact[];
  asOf: YearMonth;
  highlightSourceId: string | null;
}) {
  const router = useRouter();
  const after = async (p: Promise<unknown>) => {
    await p;
    router.refresh();
  };

  const actions: VaultActions = {
    confirmAll: () => after(api("/api/vault/confirm-all", { method: "POST" })),
    confirmFact: (id) => after(api(`/api/vault/facts/${id}`, { method: "PATCH", body: { status: "confirmed" } })),
    confirmJob: (id) => after(api(`/api/vault/jobs/${id}`, { method: "PATCH", body: { status: "confirmed" } })),
    editFact: (id, text) => after(api(`/api/vault/facts/${id}`, { method: "PATCH", body: { text } })),
    removeFact: (id) => after(api(`/api/vault/facts/${id}`, { method: "DELETE" })),
    addFact: (input) => after(api("/api/vault/facts", { body: input })),
    editJob: (id, input) => after(api(`/api/vault/jobs/${id}`, { method: "PATCH", body: input })),
  };

  return <VaultView {...props} actions={actions} />;
}
