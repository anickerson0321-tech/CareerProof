import { AppHeader } from "@/components/common/app-header";

// Not async on purpose: anything that reads the session lives in its own
// <Suspense> boundary (Cache Components). Pages check auth themselves.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
