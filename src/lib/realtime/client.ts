"use client";

import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentChange,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export interface RealtimeEvent {
  source: "notifications" | "friend-requests";
  event: "INSERT" | "UPDATE" | "DELETE";
  payload: any;
}

function toEventType(changeType: DocumentChange["type"]): "INSERT" | "UPDATE" | "DELETE" {
  if (changeType === "added") {
    return "INSERT";
  }
  if (changeType === "modified") {
    return "UPDATE";
  }
  return "DELETE";
}

async function waitForAuthReady(timeoutMs = 6000): Promise<void> {
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

export async function subscribeToUserRealtime(
  userId: string,
  onEvent: (event: RealtimeEvent) => void
): Promise<() => void> {
  await waitForAuthReady();
  const firebaseUser = auth.currentUser;

  if (!firebaseUser || firebaseUser.uid !== userId) {
    return () => {};
  }

  // Ensure Firestore listeners start only after token is available.
  await firebaseUser.getIdToken().catch(() => undefined);

  const unsubscribers: Array<() => void> = [];
  let permissionWarningShown = false;
  const handleListenerError = (source: RealtimeEvent["source"]) => (error: any) => {
    const code = error?.code || "unknown";
    if (code === "permission-denied") {
      if (!permissionWarningShown) {
        permissionWarningShown = true;
        console.warn(
          "Realtime listeners are disabled by Firestore rules for this session."
        );
      }
      return;
    }
    console.warn(`Realtime listener error (${source}): ${code}`);
  };

  const notificationsQuery = query(
    collection(db, "notifications"),
    where("user_id", "==", userId)
  );
  unsubscribers.push(
    onSnapshot(
      notificationsQuery,
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          onEvent({
            source: "notifications",
            event: toEventType(change.type),
            payload: {
              id: change.doc.id,
              ...change.doc.data(),
            },
          });
        }
      },
      handleListenerError("notifications")
    )
  );

  const incomingFriendRequestsQuery = query(
    collection(db, "friendships"),
    where("friend_id", "==", userId)
  );
  unsubscribers.push(
    onSnapshot(
      incomingFriendRequestsQuery,
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          onEvent({
            source: "friend-requests",
            event: toEventType(change.type),
            payload: {
              id: change.doc.id,
              ...change.doc.data(),
            },
          });
        }
      },
      handleListenerError("friend-requests")
    )
  );

  const outgoingFriendRequestsQuery = query(
    collection(db, "friendships"),
    where("user_id", "==", userId)
  );
  unsubscribers.push(
    onSnapshot(
      outgoingFriendRequestsQuery,
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          onEvent({
            source: "friend-requests",
            event: toEventType(change.type),
            payload: {
              id: change.doc.id,
              ...change.doc.data(),
            },
          });
        }
      },
      handleListenerError("friend-requests")
    )
  );

  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
}
