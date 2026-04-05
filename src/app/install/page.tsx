import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import InstallGuide from "@/components/pwa/InstallGuide";
import { getServerAppUser } from "@/lib/auth/server-session";

export default async function InstallPage() {
  const user = await getServerAppUser();

  if (!user?.id) {
    redirect("/auth/login");
  }

  return (
    <AppShell>
      <InstallGuide />
    </AppShell>
  );
}
