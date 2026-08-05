import { NextRequest, NextResponse } from "next/server";
import { sendPaymentReminder } from "@/lib/email";
import { requireUser } from "@/lib/auth/require-user";
import { sendPushNotificationToUsers } from "@/lib/firebase-messaging-admin";
import { toIso, toNum, uniqueStrings } from "@/lib/firestore/route-helpers";
import { newAppId } from "@/lib/ids";

export const dynamic = "force-dynamic";

function mapReminder(row: any, usersMap: Map<string, any>) {
  const fromUser = usersMap.get(String(row.from_user_id || ""));
  const toUser = usersMap.get(String(row.to_user_id || ""));
  return {
    id: String(row.id || ""),
    fromUser: fromUser
      ? {
          id: fromUser.id,
          name: fromUser.name,
          email: fromUser.email,
          profilePicture: fromUser.photo_url || null,
        }
      : null,
    toUser: toUser
      ? {
          id: toUser.id,
          name: toUser.name,
          email: toUser.email,
          profilePicture: toUser.photo_url || null,
        }
      : null,
    amount: toNum(row.amount),
    currency: String(row.currency || "INR"),
    message: row.message || null,
    status: String(row.status || "sent"),
    sentAt: toIso(row.sent_at),
    readAt: toIso(row.read_at),
    paidAt: toIso(row.paid_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function GET(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const type = request.nextUrl.searchParams.get("type") || "received";
    const { listRemindersByRecipient, listRemindersBySender } = await import(
      "@/lib/dynamodb/entities/reminders"
    );
    const { getUsersByIds } = await import("@/lib/dynamodb/entities/users");

    const reminders =
      type === "sent"
        ? await listRemindersBySender(auth.user.id)
        : await listRemindersByRecipient(auth.user.id);

    const userIds = uniqueStrings(
      reminders.flatMap((reminder: any) => [
        String(reminder.from_user_id || ""),
        String(reminder.to_user_id || ""),
      ])
    );

    const ddbUsers = await getUsersByIds(userIds);
    const usersMap = new Map<string, any>();
    for (const u of ddbUsers) {
      if (u) usersMap.set(u.id, u);
    }

    const formattedReminders = reminders.map((reminder: any) =>
      mapReminder(reminder, usersMap)
    );

    return NextResponse.json(
      { reminders: formattedReminders, type },
      {
        status: 200,
        headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) },
      }
    );
  } catch (error: any) {
    console.error("Get payment reminders error:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment reminders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const routeStart = Date.now();
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const body = await request.json();
    const toUserId = String(body?.toUserId || "");
    const amount = Number(body?.amount || 0);
    const currency = String(body?.currency || "INR");
    const message = body?.message ? String(body.message).trim() : null;

    if (!toUserId || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }
    if (toUserId === auth.user.id) {
      return NextResponse.json(
        { error: "Cannot send payment reminder to yourself" },
        { status: 400 }
      );
    }

    const reminderId = newAppId();
    const nowIso = new Date().toISOString();
    const { getUserById } = await import("@/lib/dynamodb/entities/users");
    const { putReminder } = await import("@/lib/dynamodb/entities/reminders");

    const [toUser, fromUser] = await Promise.all([
      getUserById(toUserId),
      getUserById(auth.user.id),
    ]);
    if (!toUser) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }

    await putReminder({
      id: reminderId,
      from_user_id: auth.user.id,
      to_user_id: toUserId,
      amount,
      currency,
      message,
      status: "sent",
      sent_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });

    try {
      await sendPaymentReminder({
        to: String(toUser.email || ""),
        fromUserName: String(fromUser?.name || "User"),
        toUserName: String(toUser.name || "User"),
        amount,
        currency,
        message: message || undefined,
      });
    } catch (emailError) {
      console.error("Failed to send payment reminder email:", emailError);
    }

    try {
      await sendPushNotificationToUsers([toUserId], {
        title: "Payment Reminder",
        body: `${String(fromUser?.name || "A friend")} reminded you about ${currency} ${amount.toFixed(2)}`,
        url: "/settlements",
        data: {
          type: "payment_reminder",
          reminderId,
          fromUserId: auth.user.id,
          amount,
          currency,
        },
      });
    } catch (pushError) {
      console.error("Failed to send payment reminder push:", pushError);
    }

    return NextResponse.json(
      { message: "Payment reminder sent successfully", reminderId },
      {
        status: 201,
        headers: { "X-Doosplit-Route-Ms": String(Date.now() - routeStart) },
      }
    );
  } catch (error: any) {
    console.error("Create payment reminder error:", error);
    return NextResponse.json(
      { error: "Failed to send payment reminder" },
      { status: 500 }
    );
  }
}
