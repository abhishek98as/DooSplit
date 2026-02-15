import { getServerAppUser } from "@/lib/auth/server-session";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getServerAppUser();

  if (user?.id) {
    redirect("/dashboard");
  } else {
    redirect("/auth/login");
  }
}
