import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getAdminDb } from "@/lib/firestore/admin";
import { fetchDocsByIds, toIso, uniqueStrings } from "@/lib/firestore/route-helpers";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const userId = auth.user.id;
    const db = getAdminDb();

    const [fromSnap, toSnap] = await Promise.all([
      db.collection("settlements").where("from_user_id", "==", userId).get(),
      db.collection("settlements").where("to_user_id", "==", userId).get(),
    ]);

    const dedup = new Map<string, any>();
    for (const doc of [...fromSnap.docs, ...toSnap.docs]) {
      dedup.set(doc.id, { id: doc.id, ...((doc.data() as any) || {}) });
    }

    const settlements = Array.from(dedup.values()).sort((a, b) => {
      const aMs = new Date(toIso(a.date || a.created_at || a._created_at)).getTime();
      const bMs = new Date(toIso(b.date || b.created_at || b._created_at)).getTime();
      return bMs - aMs;
    });

    if (!settlements || settlements.length === 0) {
      return new NextResponse("No settlements found", { status: 404 });
    }

    const userIds = uniqueStrings(
      settlements.flatMap((settlement: any) => [
        String(settlement.from_user_id || ""),
        String(settlement.to_user_id || ""),
      ])
    );
    const usersMap = await fetchDocsByIds("users", userIds);

    const rows: string[] = [];
    rows.push(
      [
        "Date",
        "Description",
        "From",
        "To",
        "Amount",
        "Currency",
        "Method",
        "Status",
      ].join(",")
    );

    for (const settlement of settlements) {
      const fromUser = usersMap.get(String(settlement.from_user_id));
      const toUser = usersMap.get(String(settlement.to_user_id));
      const isOutgoing = String(settlement.from_user_id) === userId;
      const description = isOutgoing
        ? `Payment to ${toUser?.name || "Unknown"}`
        : `Payment from ${fromUser?.name || "Unknown"}`;
      const dateIso = toIso(settlement.date || settlement.created_at || settlement._created_at);
      const dateLabel = dateIso ? new Date(dateIso).toLocaleDateString() : "";

      rows.push(
        [
          csvCell(dateLabel),
          csvCell(description),
          csvCell(fromUser?.name || ""),
          csvCell(toUser?.name || ""),
          csvCell(Number(settlement.amount).toFixed(2)),
          csvCell(settlement.currency || "INR"),
          csvCell(settlement.method || ""),
          csvCell("Completed"),
        ].join(",")
      );
    }

    return new NextResponse(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="settlements_${new Date().toISOString().split("T")[0]}.csv"`,
        "X-Doosplit-Route-Ms": String(Date.now() - routeStart),
      },
    });
  } catch (error: any) {
    console.error("Export settlements error:", error);
    return NextResponse.json(
      { error: "Failed to export settlements" },
      { status: 500 }
    );
  }
}


