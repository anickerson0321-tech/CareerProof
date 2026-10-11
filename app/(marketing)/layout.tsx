import { SiteFooter } from "@/components/common/site-footer";
import { SiteHeader } from "@/components/common/site-header";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
