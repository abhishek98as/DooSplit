"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth/react-session";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";

type RealtimeDomain =
  | "expenses"
  | "friends"
  | "groups"
  | "settlements"
  | "analytics"
  | "activity";

interface DataUpdatedEventDetail {
  domains: RealtimeDomain[];
  reason: string;
  at: number;
}

const DEFAULT_DEBOUNCE_MS = 350;
const AUTH_READY_TIMEOUT_MS = 6000;

async function waitForAuthReady(timeoutMs = AUTH_READY_TIMEOUT_MS): Promise<void> {
  if (auth.currentUser) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve();
    }, timeoutMs);

    const unsubscribe = auth.onAuthStateChanged(() => {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

function emitDataUpdated(detail: DataUpdatedEventDetail) {
  window.dispatchEvent(new CustomEvent("doosplit:data-updated", { detail }));
}

interface RealtimeDataSyncProviderProps {
  children: React.ReactNode;
}

export function RealtimeDataSyncProvider({ children }: RealtimeDataSyncProviderProps) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      return;
    }

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pendingDomains = new Set<RealtimeDomain>();
    const pendingReasons = new Set<string>();
    const unsubscribers: Array<() => void> = [];
    let permissionWarningShown = false;

    const flushPending = () => {
      if (pendingDomains.size === 0 || disposed) {
        return;
      }

      const domains = Array.from(pendingDomains);
      const reason =
        pendingReasons.size > 0 ? Array.from(pendingReasons).join(",") : "realtime-update";

      pendingDomains.clear();
      pendingReasons.clear();

      emitDataUpdated({
        domains,
        reason,
        at: Date.now(),
      });
    };

    const queueUpdate = (domains: RealtimeDomain[], reason: string) => {
      for (const domain of domains) {
        pendingDomains.add(domain);
      }
      pendingReasons.add(reason);

      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(flushPending, DEFAULT_DEBOUNCE_MS);
    };

    const handleListenerError = (label: string) => (error: any) => {
      const code = error?.code || "unknown";
      if (code === "permission-denied") {
        if (!permissionWarningShown) {
          permissionWarningShown = true;
          console.warn(
            "Realtime data sync listeners are disabled by Firestore rules for this session."
          );
        }
        return;
      }
      console.warn(`Realtime data sync listener error (${label}): ${code}`);
    };

    const subscribeQuery = (
      label: string,
      queryRef: ReturnType<typeof query>,
      domains: RealtimeDomain[]
    ) => {
      let initialized = false;
      const unsubscribe = onSnapshot(
        queryRef,
        (snapshot) => {
          if (!initialized) {
            initialized = true;
            return;
          }
          if (snapshot.docChanges().length === 0) {
            return;
          }
          queueUpdate(domains, label);
        },
        handleListenerError(label)
      );
      unsubscribers.push(unsubscribe);
    };

    const startSubscriptions = async () => {
      await waitForAuthReady();
      if (disposed) {
        return;
      }
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || firebaseUser.uid !== session.user.id) {
        return;
      }

      await firebaseUser.getIdToken().catch(() => undefined);
      if (disposed) {
        return;
      }

      const uid = session.user.id;
      subscribeQuery(
        "expense_participants",
        query(collection(db, "expense_participants"), where("user_id", "==", uid)),
        ["expenses", "friends", "groups", "analytics", "activity"]
      );
      subscribeQuery(
        "settlements_from",
        query(collection(db, "settlements"), where("from_user_id", "==", uid)),
        ["settlements", "friends", "analytics", "activity", "expenses"]
      );
      subscribeQuery(
        "settlements_to",
        query(collection(db, "settlements"), where("to_user_id", "==", uid)),
        ["settlements", "friends", "analytics", "activity", "expenses"]
      );
      subscribeQuery(
        "friendships_user",
        query(collection(db, "friendships"), where("user_id", "==", uid)),
        ["friends", "groups", "activity"]
      );
      subscribeQuery(
        "friendships_friend",
        query(collection(db, "friendships"), where("friend_id", "==", uid)),
        ["friends", "groups", "activity"]
      );
      subscribeQuery(
        "group_members",
        query(collection(db, "group_members"), where("user_id", "==", uid)),
        ["groups", "friends", "activity"]
      );
      subscribeQuery(
        "notifications",
        query(collection(db, "notifications"), where("user_id", "==", uid)),
        ["activity"]
      );
    };

    void startSubscriptions();

    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [session?.user?.id, status]);

  return <>{children}</>;
}

export default RealtimeDataSyncProvider;
