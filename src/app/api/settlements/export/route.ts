import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const userId = auth.user.id;
    const supabase = requireSupabaseAdmin();

    const { data: settlements, error } = await supabase
      .from("settlements")
      .select("*")
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      throw error;
    }
    if (!settlements || settlements.length === 0) {
      return new NextResponse("No settlements found", { status: 404 });
    }

    const userIds = Array.from(
      new Set(
        settlements.flatMap((settlement: any) => [
          String(settlement.from_user_id),
          String(settlement.to_user_id),
        ])
      )
    );
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id,name,email")
      .in("id", userIds);
    if (usersError) {
      throw usersError;
    }
    const usersMap = new Map<string, any>((users || []).map((u: any) => [String(u.id), u]));

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

      rows.push(
        [
          csvCell(new Date(settlement.date).toLocaleDateString()),
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

