import { NextRequest, NextResponse } from "next/server";
import { sendPaymentReminder } from "@/lib/email";
import { requireUser } from "@/lib/auth/require-user";
import { newAppId, requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

async function fetchUsersMap(ids: string[]) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) {
    return new Map<string, any>();
  }
  const supabase = requireSupabaseAdmin();
  const { data: users, error } = await supabase
    .from("users")
    .select("id,name,email,profile_picture")
    .in("id", unique);
  if (error) {
    throw error;
  }
  return new Map<string, any>((users || []).map((user: any) => [String(user.id), user]));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth.response || !auth.user) {
      return auth.response as NextResponse;
    }

    const type = request.nextUrl.searchParams.get("type") || "received";
    const supabase = requireSupabaseAdmin();
    let query = supabase
      .from("payment_reminders")
      .select("*")
      .order("created_at", { ascending: false });
    query = type === "sent"
      ? query.eq("from_user_id", auth.user.id)
      : query.eq("to_user_id", auth.user.id);

    const { data: reminders, error } = await query;
    if (error) {
      throw error;
    }

    const usersMap = await fetchUsersMap(
      (reminders || []).flatMap((r: any) => [r.from_user_id, r.to_user_id])
    );

    const formattedReminders = (reminders || []).map((reminder: any) => {
      const fromUser = usersMap.get(String(reminder.from_user_id));
      const toUser = usersMap.get(String(reminder.to_user_id));
      return {
        id: reminder.id,
        fromUser: fromUser
          ? {
              id: fromUser.id,
              name: fromUser.name,
              email: fromUser.email,
              profilePicture: fromUser.profile_picture || null,
            }
          : null,
        toUser: toUser
          ? {
              id: toUser.id,
              name: toUser.name,
              email: toUser.email,
              profilePicture: toUser.profile_picture || null,
            }
          : null,
        amount: Number(reminder.amount || 0),
        currency: reminder.currency,
        message: reminder.message,
        status: reminder.status,
        sentAt: reminder.sent_at,
        readAt: reminder.read_at,
        paidAt: reminder.paid_at,
        createdAt: reminder.created_at,
        updatedAt: reminder.updated_at,
      };
    });

    return NextResponse.json({ reminders: formattedReminders, type });
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
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }
    if (toUserId === auth.user.id) {
      return NextResponse.json(
        { error: "Cannot send payment reminder to yourself" },
        { status: 400 }
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: toUser, error: toUserError } = await supabase
      .from("users")
      .select("id,name,email,profile_picture")
      .eq("id", toUserId)
      .maybeSingle();

    if (toUserError) {
      throw toUserError;
    }
    if (!toUser) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }

    const reminderId = newAppId();
    const nowIso = new Date().toISOString();
    const { data: reminder, error: reminderError } = await supabase
      .from("payment_reminders")
      .insert({
        id: reminderId,
        from_user_id: auth.user.id,
        to_user_id: toUserId,
        amount,
        currency,
        message,
        status: "sent",
        sent_at: nowIso,
      })
      .select("*")
      .single();

    if (reminderError || !reminder) {
      throw reminderError || new Error("Failed to create reminder");
    }

    const { data: fromUser } = await supabase
      .from("users")
      .select("id,name,email,profile_picture")
      .eq("id", auth.user.id)
      .maybeSingle();

    try {
      await sendPaymentReminder({
        to: toUser.email,
        fromUserName: fromUser?.name || "User",
        toUserName: toUser.name,
        amount,
        currency,
        message: message || undefined,
      });
    } catch (emailError) {
      console.error("Failed to send payment reminder email:", emailError);
    }

    return NextResponse.json({
      reminder: {
        id: reminder.id,
        fromUser: fromUser
          ? {
              id: fromUser.id,
              name: fromUser.name,
              email: fromUser.email,
              profilePicture: fromUser.profile_picture || null,
            }
          : null,
        toUser: {
          id: toUser.id,
          name: toUser.name,
          email: toUser.email,
          profilePicture: toUser.profile_picture || null,
        },
        amount: Number(reminder.amount || 0),
        currency: reminder.currency,
        message: reminder.message,
        status: reminder.status,
        sentAt: reminder.sent_at,
        createdAt: reminder.created_at,
      },
      message: "Payment reminder sent successfully",
    });
  } catch (error: any) {
    console.error("Create payment reminder error:", error);
    return NextResponse.json(
      { error: "Failed to create payment reminder" },
      { status: 500 }
    );
  }
}

