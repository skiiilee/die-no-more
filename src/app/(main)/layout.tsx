import { requireSignedIn } from "@/runtime/session";
import { AppShell } from "@/ui/shell/AppShell";

/** Every screen in this group needs a session (ADR-0003 D2). */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  await requireSignedIn();
  return <AppShell>{children}</AppShell>;
}
