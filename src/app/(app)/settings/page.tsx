import { TopBar } from "@/components/TopBar";
import { SettingsClient } from "./SettingsClient";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = (await getWorkspaceContext())!;
  return (
    <>
      <TopBar title="설정" subtitle="워크스페이스와 계정" />
      <SettingsClient
        workspaceId={ctx.workspaceId}
        workspaceName={ctx.workspaceName}
        userId={ctx.userId}
        email={ctx.email}
        myDisplayName={ctx.myDisplayName}
        members={ctx.members}
      />
    </>
  );
}
