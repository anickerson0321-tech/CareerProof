export function ProsePage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-bold">{title}</h1>
      {updated && <p className="mt-2 text-sm text-fg-muted">Last updated {updated}</p>}
      <div className="mt-8 flex flex-col gap-4 text-[1.05rem] [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
        {children}
      </div>
    </article>
  );
}

export function requireContactEmail(email: string | null): string | null {
  if (!email && process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_CONTACT_EMAIL must be set for production builds (Privacy, Terms and Contact pages).");
  }
  return email;
}
