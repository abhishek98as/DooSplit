import { getAdminAuth, getAdminDb } from "@/lib/firestore/admin";

export async function getFirebaseAccountDetails() {
  const auth = getAdminAuth();
  getAdminDb();

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;

  let usersCount = 0;
  try {
    const result = await auth.listUsers(1);
    usersCount = result.users.length;
  } catch {
    usersCount = 0;
  }

  return {
    project: {
      id: projectId,
      displayName: "DooSplit",
    },
    firestore: {
      plan: "Spark (Free)",
      limits: {
        storage: "1 GiB",
        reads: "50,000/day",
        writes: "20,000/day",
        deletes: "20,000/day",
        bandwidth: "10 GiB/month",
      },
    },
    auth: {
      usersCount,
    },
  };
}
