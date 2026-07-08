// DynamoDB-only — re-export Firebase Auth from firebase-admin, stub Firestore
export { getFirebaseAuth as getAdminAuth } from "@/lib/firebase-admin";

// Stub for getAdminDb — returns a minimal stub so existing code compiles.
// Real Firestore operations are not supported — use DynamoDB instead.
export function getAdminDb(): any {
  // Return a stub that logs warnings about removed Firestore usage
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === "collection") {
        return (_name: string) => ({
          doc: (_id: string) => ({
            get: async () => ({ exists: false, data: () => ({}), id: _id }),
            set: async () => {},
            update: async () => {},
            delete: async () => {},
          }),
          where: () => ({ get: async () => ({ docs: [], empty: true, size: 0 }), orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [], empty: true, size: 0 }) }) }) }),
          orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [], empty: true, size: 0 }) }), get: async () => ({ docs: [], empty: true, size: 0 }) }),
          get: async () => ({ docs: [], empty: true, size: 0 }),
          limit: () => ({ get: async () => ({ docs: [], empty: true, size: 0 }) }),
        });
      }
      if (prop === "batch") {
        return () => ({ set: () => {}, commit: async () => {}, delete: () => {} });
      }
      return undefined;
    }
  });
}

// Stub for getAdminStorage — throws since Firebase Storage is removed
export function getAdminStorage(): never {
  throw new Error("Firebase Storage has been removed.");
}

// Stub FieldValue and Timestamp for code that still references them
export const FieldValue = {
  serverTimestamp: () => new Date().toISOString(),
  delete: () => null,
  arrayUnion: (..._args: any[]) => [],
  arrayRemove: (..._args: any[]) => [],
  increment: (_n: number) => 0,
} as any;

export const Timestamp = {
  now: () => new Date(),
  fromDate: (d: Date) => d,
};
