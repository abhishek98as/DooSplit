import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getActiveRepository } from "@/lib/data";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }
    const userId = auth.user.id;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const { messages } = await request.json();

    const repository = await getActiveRepository();
    const [expensesData, groupsData, friendsData, settlementsData] = await Promise.all([
      repository.getExpenses({ userId, page: 1, limit: 150 }),
      repository.getGroups({ userId, requestSearch: "" }),
      repository.getFriends({ userId, requestSearch: "" }),
      repository.getSettlements({ userId, page: 1, limit: 50 }),
    ]);

    const contextData = {
      currentUser: { id: userId, name: auth.user.name, email: auth.user.email },
      friends: (friendsData?.friends || []).map((f: any) => ({ id: f.id, name: f.name, status: f.status })),
      groups: (groupsData?.groups || []).map((g: any) => ({ id: g.id, name: g.name, memberCount: g.members?.length || 0 })),
      expenses: (expensesData?.expenses || []).slice(0, 150).map((e: any) => ({
        description: e.description,
        amount: e.amount,
        category: e.category,
        date: e.date,
        paidBy: e.paidById,
        groupId: e.groupId,
      })),
      settlements: (settlementsData?.settlements || []).slice(0, 50).map((s: any) => ({
        amount: s.amount,
        from: s.fromUserId,
        to: s.toUserId,
        date: s.date,
      })),
    };

    const google = createGoogleGenerativeAI({ apiKey });

    const systemPrompt = `
      You are the DooSplit AI assistant. You help users analyze their expenses, friends, groups, and balances.
      
      Here is the user's transaction data context:
      ${JSON.stringify(contextData)}

      Use this data to answer the user's questions. Always calculate balances precisely.
      Formatting guidelines:
      - Use standard markdown formatting.
      - Return figures in rupees (₹) since the app uses INR.
      - Keep answers clear, friendly, and simple.
      - If they ask who owes whom, calculate net offsets using the expenses and settlements provided.
    `;

    const result = streamText({
      model: google("gemini-2.5-flash") as any,
      messages,
      system: systemPrompt,
    });

    return result.toDataStreamResponse();
  } catch (error: any) {
    console.error("[ai/chat] Error streaming chat:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to initiate AI stream." },
      { status: 500 }
    );
  }
}
