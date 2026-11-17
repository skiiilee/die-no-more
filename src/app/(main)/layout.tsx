import { Suspense } from "react";
import { requireSignedIn } from "@/runtime/session";
import { AppShell } from "@/ui/shell/AppShell";
import { PhotoFlowGuard } from "@/ui/plants/PhotoFlowGuard";
import { ScreenLoading } from "@/ui/shell/ScreenLoading";

/**
 * Every screen in this group needs a session (ADR-0003 D2).
 * The shell (header, nav) is static and prerendered; the session check and
 * the screen body stream in behind <Suspense> (Cache Components rule: request
 * data such as cookies must not be read outside a boundary).
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {/* Photos kept for a retry are forgotten once the user leaves the photo flow. */}
      <Suspense fallback={null}>
        <PhotoFlowGuard />
      </Suspense>
      <Suspense fallback={<ScreenLoading />}>
        <SignedInGate>{children}</SignedInGate>
      </Suspense>
    </AppShell>
  );
}

async function SignedInGate({ children }: { children: React.ReactNode }) {
  await requireSignedIn();
  return children;
}
