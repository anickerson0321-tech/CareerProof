import type { Metadata } from "next";
import { DemoWorkspace } from "./demo-workspace";

export const metadata: Metadata = { title: "Example application" };

export default function DemoApplicationPage() {
  return <DemoWorkspace />;
}
