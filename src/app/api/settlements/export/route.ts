import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import dbConnect from "@/lib/db";
import Settlement from "@/models/Settlement";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv"; // csv, excel

    await dbConnect();
    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Get all settlements for the user
    const settlements = await Settlement.find({
      $or: [{ fromUserId: userId }, { toUserId: userId }],
    })
      .populate("fromUserId", "name email")
      .populate("toUserId", "name email")
      .sort({ date: -1, createdAt: -1 })
      .lean();

    if (settlements.length === 0) {
      return new NextResponse("No settlements found", { status: 404 });
    }

    // Prepare CSV data
    const csvHeaders = [
      "Date",
      "Description",
      "From",
      "To",
      "Amount",
      "Currency",
      "Method",
      "Status"
    ];

    const csvData = settlements.map((settlement: any) => {
      const isOutgoing = settlement.fromUserId._id.toString() === session.user.id;
      const description = isOutgoing
        ? `Payment to ${settlement.toUserId.name}`
        : `Payment from ${settlement.fromUserId.name}`;

      return [
        new Date(settlement.date).toLocaleDateString(),
        description,
        settlement.fromUserId.name,
        settlement.toUserId.name,
        settlement.amount.toString(),
        settlement.currency,
        settlement.method,
        "Completed" // All settlements in this table are completed
      ];
    });

    // Create CSV content
    const csvContent = [
      csvHeaders.join(","),
      ...csvData.map(row => row.map(field => `"${field}"`).join(","))
    ].join("\n");

    // Return CSV file
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="settlements_${new Date().toISOString().split('T')[0]}.csv"`,
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