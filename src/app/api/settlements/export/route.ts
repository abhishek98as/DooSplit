import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { toIso, uniqueStrings } from "@/lib/firestore/route-helpers";
import { queryUserSettlementFeed } from "@/lib/dynamodb/entities/settlements";
import { getUsersByIds } from "@/lib/dynamodb/entities/users";
import type { DdbSettlementFeed } from "@/lib/dynamodb/types";

export const dynamic = "force-dynamic";

type SettlementFeedDetails = DdbSettlementFeed & { method?: string };

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

    const { items: allSettlements } = await queryUserSettlementFeed(userId, 5000);
    const settlements = allSettlements.filter((s) => !s.is_deleted);

    if (!settlements || settlements.length === 0) {
      return new NextResponse("No settlements found", { status: 404 });
    }

    const userIds = uniqueStrings(
      settlements.flatMap((settlement: any) => [
        String(settlement.from_user_id || ""),
        String(settlement.to_user_id || ""),
      ])
    );
    const ddbUsers = await getUsersByIds(userIds);
    const usersMap = new Map<string, any>();
    for (const u of ddbUsers) {
      if (u) {
        usersMap.set(u.id, u);
      }
    }

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

    for (const settlement of settlements as SettlementFeedDetails[]) {
      const fromUser = usersMap.get(String(settlement.from_user_id));
      const toUser = usersMap.get(String(settlement.to_user_id));
      const isOutgoing = String(settlement.from_user_id) === userId;
      const description = isOutgoing
        ? `Payment to ${toUser?.name || "Unknown"}`
        : `Payment from ${fromUser?.name || "Unknown"}`;
      const dateIso = toIso(settlement.date || settlement.created_at);
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
