import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/common/prose-page";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

export default function AccountDeletedPage() {
  return (
    <ProsePage title="Your account is deleted">
      <p>
        Your Career Vault, applications, documents and uploaded files have been permanently deleted, and any subscription has been
        cancelled.
      </p>
      <p>
        Thanks for trying CareerProof. You&apos;re welcome back any time: <Link href="/login?mode=signup">start fresh</Link>.
      </p>
    </ProsePage>
  );
}
