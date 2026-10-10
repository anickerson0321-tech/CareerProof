import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage, requireContactEmail } from "@/components/common/prose-page";
import { contactEmail } from "@/lib/env";
import { PRO_PRICES } from "@/lib/billing/plans";

// Review with a lawyer before launch. Plain-language draft; not legal advice.

export const metadata: Metadata = { title: "Terms", description: "The terms for using CareerProof." };

export default function TermsPage() {
  const email = requireContactEmail(contactEmail());
  return (
    <ProsePage title="Terms of use" updated="October 10, 2026">
      <p>These terms are the agreement between you and CareerProof when you use the service. Please read them.</p>

      <h2>What CareerProof does</h2>
      <p>
        CareerProof helps you organize facts about your career, compare them with job postings, and write resumes and cover
        letters based on the facts you confirm. It does not find jobs, apply for you, or guarantee interviews or offers.
      </p>

      <h2>You&apos;re responsible for what&apos;s true</h2>
      <p>
        &ldquo;Confirmed&rdquo; in CareerProof means <em>you</em> confirmed a fact. We don&apos;t check facts with employers,
        schools or certifying bodies. Before you send any document, read it and make sure it&apos;s accurate. The tool flags
        lines that seem to say more than your facts, but you are responsible for what you submit to employers.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You need to be at least 16 and give a working email address.</li>
        <li>Keep access to your email secure, because that&apos;s how you sign in.</li>
        <li>One person per account. Don&apos;t use CareerProof to create documents for someone without their permission.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own your resumes, facts, answers and documents. You give us permission to store and process them only to run the
        service for you, including sending the necessary text to our AI provider as described in our{" "}
        <Link href="/privacy">Privacy page</Link>. You can download or delete it at any time.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don&apos;t use CareerProof to create false credentials or misrepresent someone&apos;s history.</li>
        <li>Don&apos;t upload content you don&apos;t have the right to use, or anything unlawful.</li>
        <li>Don&apos;t try to break, overload, or get around the limits or security of the service.</li>
      </ul>

      <h2>Plans and payment</h2>
      <ul>
        <li>The Free plan includes 1 resume import and 2 applications.</li>
        <li>
          Pro costs {PRO_PRICES.monthly.label} per month or {PRO_PRICES.yearly.label} per year, billed in advance through
          Stripe, and renews automatically until you cancel.
        </li>
        <li>
          You can cancel any time in Settings. You keep Pro until the end of the period you paid for. We don&apos;t give
          partial refunds for unused time unless the law requires it.
        </li>
        <li>We may change prices with at least 30 days&apos; notice before your next renewal.</li>
        <li>To keep the service affordable, there&apos;s a fair-use monthly limit on AI processing per account.</li>
      </ul>

      <h2>Availability and changes</h2>
      <p>
        We work to keep CareerProof running and accurate, but it&apos;s provided &ldquo;as is&rdquo;. AI output can be wrong,
        which is why every line is checked against your facts and why you should review your documents. We may change or
        discontinue features. If we shut down, we&apos;ll give you notice and time to download your data.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, CareerProof isn&apos;t liable for indirect or consequential losses, such as a missed job
        opportunity. Our total liability is limited to the amount you paid us in the 12 months before the claim.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time in Settings. We may suspend accounts that break these terms. Where possible,
        we&apos;ll tell you why first and give you a chance to download your data.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms?{" "}
        {email ? <a href={`mailto:${email}`}>{email}</a> : <Link href="/contact">Contact us</Link>}.
      </p>
    </ProsePage>
  );
}
