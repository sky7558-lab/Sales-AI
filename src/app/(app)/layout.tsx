import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { getWorkspaceContext } from "@/lib/workspace";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/onboarding");

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
