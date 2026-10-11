import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { ProsePage, requireContactEmail } from "@/components/common/prose-page";
import { Button } from "@/components/ui/button";
import { contactEmail } from "@/lib/env";

export const metadata: Metadata = { title: "Contact", description: "How to reach the CareerProof team." };

export default function ContactPage() {
  const email = requireContactEmail(contactEmail());
  return (
    <ProsePage title="Contact">
      <p>
        Questions, problems, or something in your vault that looks wrong? Write to us. A person reads every message, usually
        within one business day.
      </p>
      {email ? (
        <p>
          <Button asChild size="lg">
            <a href={`mailto:${email}`} className="!text-primary-fg !no-underline">
              <Mail className="size-5" aria-hidden /> {email}
            </a>
          </Button>
        </p>
      ) : (
        <p className="rounded-lg bg-partial-tint p-4 text-partial">
          The contact address hasn&apos;t been set up on this copy of CareerProof (NEXT_PUBLIC_CONTACT_EMAIL).
        </p>
      )}
      <h2>Before you write</h2>
      <ul>
        <li>
          To download your data or delete your account, go to <strong>Settings</strong>. You can do both yourself, any time.
        </li>
        <li>
          To change your plan or payment details, use <strong>Settings → Plan &amp; billing</strong>.
        </li>
        <li>
          Please don&apos;t email your resume. Upload it in the app instead, where it&apos;s stored privately. See{" "}
          <Link href="/privacy">Privacy</Link>.
        </li>
      </ul>
    </ProsePage>
  );
}
