import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage, requireContactEmail } from "@/components/common/prose-page";
import { contactEmail } from "@/lib/env";

// Review with a lawyer before launch. This is a plain-language draft that
// describes how the app actually handles data; it is not legal advice.

export const metadata: Metadata = { title: "Privacy", description: "What CareerProof stores, why, and how to delete it." };

export default function PrivacyPage() {
  const email = requireContactEmail(contactEmail());
  return (
    <ProsePage title="Privacy" updated="October 10, 2026">
      <p>
        Your resume is personal. This page explains, in plain words, what CareerProof keeps, what we do with it, who else
        handles it, and how you can take it with you or delete it.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email address and, if you sign in with Google, the name Google shares with us.
        </li>
        <li>
          <strong>Your details for documents:</strong> name, phone, location and headline, which you can change in Settings.
        </li>
        <li>
          <strong>Resumes you upload:</strong> the original file, kept in private storage only you can access, and the text we
          read from it.
        </li>
        <li>
          <strong>Your Career Vault:</strong> the jobs and facts taken from your resume, the ones you add yourself, your answers
          to questions, and a history of edits you make to facts.
        </li>
        <li>
          <strong>Applications:</strong> the job postings you paste, how your record matches them, and the resumes and cover
          letters you create.
        </li>
        <li>
          <strong>Billing:</strong> your plan and a customer ID from our payment processor. We never see or store your card
          number.
        </li>
        <li>
          <strong>Usage records:</strong> when an AI task ran, which task, how long it took, how much text it used, and whether
          it worked. These records never include your resume, postings or answers. We use them to keep the service running and
          enforce plan limits.
        </li>
      </ul>

      <h2>How your resume is processed</h2>
      <p>
        To read your resume, compare it with job postings, turn your answers into facts, and write resumes and cover letters,
        CareerProof sends the text needed for that one task to an AI provider (currently Anthropic) for processing. We send
        only what each task needs. For example, matching a job sends your jobs and facts and the posting, not your uploaded
        file. The provider processes it to return a result to us. Under its commercial terms it does not use this data to train
        its models.
      </p>
      <p>
        The AI never decides what&apos;s true about you. Only you can confirm a fact, and only confirmed facts can appear in
        documents you download.
      </p>

      <h2>Who else handles your data</h2>
      <ul>
        <li>
          <strong>Supabase</strong> hosts our database, sign-in and private file storage.
        </li>
        <li>
          <strong>Anthropic</strong> provides the AI processing described above.
        </li>
        <li>
          <strong>Stripe</strong> processes payments if you upgrade.
        </li>
        <li>
          <strong>Vercel</strong> hosts the website.
        </li>
      </ul>
      <p>We don&apos;t sell your data, and we don&apos;t share it with employers or recruiters.</p>

      <h2>Cookies and analytics</h2>
      <p>
        We use cookies only to keep you signed in. If we measure site visits, we use a privacy-friendly tool that sets no
        cookies and doesn&apos;t track you across sites.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          <strong>Download everything:</strong> Settings → Download my data gives you a file with your vault and applications.
        </li>
        <li>
          <strong>Delete everything:</strong> Settings → Delete my account permanently deletes your account, vault,
          applications, documents and uploaded files, and cancels any subscription. This can&apos;t be undone.
        </li>
        <li>
          <strong>Fix anything:</strong> you can edit or remove any fact in your vault at any time.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account exists. When you delete your account, it&apos;s removed from our database and
        storage right away. Backups held by our hosting provider expire on their normal schedule. Payment records may be kept
        by Stripe as the law requires.
      </p>

      <h2>Security</h2>
      <p>
        Your data is separated from every other user&apos;s at the database level, uploaded files are private and only
        reachable through short-lived links, and secret keys never reach your browser.
      </p>

      <h2>Children</h2>
      <p>CareerProof is not meant for anyone under 16.</p>

      <h2>Changes and contact</h2>
      <p>
        If we change how we handle your data, we&apos;ll update this page and the date at the top. Questions?{" "}
        {email ? <a href={`mailto:${email}`}>{email}</a> : <Link href="/contact">Contact us</Link>}.
      </p>
    </ProsePage>
  );
}
