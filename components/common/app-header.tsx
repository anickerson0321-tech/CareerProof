import { Suspense } from "react";
import { getUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Logo href="/start" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Suspense fallback={<span className="h-11 w-20" aria-hidden />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function UserMenu() {
  const user = await getUser();
  if (!user) return null;
  return (
    <form action="/auth/signout" method="post" className="flex items-center gap-2">
      <span className="hidden max-w-[16rem] truncate text-sm text-fg-muted sm:inline">{user.email}</span>
      <Button type="submit" variant="ghost">
        Sign out
      </Button>
    </form>
  );
}
