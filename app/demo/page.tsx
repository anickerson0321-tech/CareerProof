import { VaultView } from "@/components/vault/vault-view";
import { DEMO_AS_OF, demoFacts, demoJobs, demoProfile } from "@/lib/demo/data";

export default function DemoVaultPage() {
  return <VaultView profile={demoProfile} jobs={demoJobs} facts={demoFacts} asOf={DEMO_AS_OF} readOnly />;
}
