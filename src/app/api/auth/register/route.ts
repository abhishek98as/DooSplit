import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendEmailVerification } from "@/lib/email";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { newAppId, requireSupabaseAdmin } from "@/lib/supabase/app";

export const dynamic = "force-dynamic";

async function mergeDummyFriends(
  inviterId: string,
  newUserId: string,
  targetName: string
): Promise<number> {
  const supabase = requireSupabaseAdmin();
  const { data: dummies, error: dummiesError } = await supabase
    .from("users")
    .select("id")
    .eq("is_dummy", true)
    .eq("created_by", inviterId)
    .ilike("name", targetName);

  if (dummiesError) {
    throw dummiesError;
  }
  if (!dummies || dummies.length === 0) {
    return 0;
  }

  let mergedCount = 0;
  for (const dummy of dummies) {
    const dummyId = String(dummy.id);

    // Rewire friendships from/to dummy user.
    const { data: links, error: linksError } = await supabase
      .from("friendships")
      .select("id,user_id,friend_id,status,requested_by,created_at,updated_at")
      .or(`user_id.eq.${dummyId},friend_id.eq.${dummyId}`);
    if (linksError) {
      throw linksError;
    }

    for (const link of links || []) {
      const nextUserId = link.user_id === dummyId ? newUserId : link.user_id;
      const nextFriendId = link.friend_id === dummyId ? newUserId : link.friend_id;
      if (nextUserId === nextFriendId) {
        await supabase.from("friendships").delete().eq("id", link.id);
        continue;
      }

      const { data: duplicate } = await supabase
        .from("friendships")
        .select("id")
        .eq("user_id", nextUserId)
        .eq("friend_id", nextFriendId)
        .maybeSingle();

      if (duplicate?.id) {
        await supabase.from("friendships").delete().eq("id", link.id);
      } else {
        await supabase
          .from("friendships")
          .update({
            user_id: nextUserId,
            friend_id: nextFriendId,
          })
          .eq("id", link.id);
      }
    }

    // Rewire expense participants from dummy to new user.
    const { data: participants, error: participantsError } = await supabase
      .from("expense_participants")
      .select("id,expense_id,user_id,paid_amount,owed_amount,is_settled")
      .eq("user_id", dummyId);
    if (participantsError) {
      throw participantsError;
    }

    for (const participant of participants || []) {
      const { data: existing } = await supabase
        .from("expense_participants")
        .select("id,paid_amount,owed_amount,is_settled")
        .eq("expense_id", participant.expense_id)
        .eq("user_id", newUserId)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from("expense_participants")
          .update({
            paid_amount: Number(existing.paid_amount || 0) + Number(participant.paid_amount || 0),
            owed_amount: Number(existing.owed_amount || 0) + Number(participant.owed_amount || 0),
            is_settled: !!existing.is_settled && !!participant.is_settled,
          })
          .eq("id", existing.id);
        await supabase.from("expense_participants").delete().eq("id", participant.id);
      } else {
        await supabase
          .from("expense_participants")
          .update({ user_id: newUserId })
          .eq("id", participant.id);
      }
    }

    await supabase.from("users").delete().eq("id", dummyId);
    mergedCount += 1;
  }

  return mergedCount;
}

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = checkRateLimit(request, RATE_LIMITS.auth);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const body = await request.json();
    const { name, email, password, inviteToken } = body || {};

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    if (String(password).length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    const emailNormalized = String(email).toLowerCase().trim();
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(emailNormalized)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const supabase = requireSupabaseAdmin();
    const { data: existingUser, error: existingUserError } = await supabase
      .from("users")
      .select("id,auth_provider")
      .eq("email", emailNormalized)
      .eq("is_dummy", false)
      .maybeSingle();

    if (existingUserError) {
      throw existingUserError;
    }

    if (existingUser) {
      const loginMethod =
        existingUser.auth_provider === "firebase" ? "Google" : "email/password";
      return NextResponse.json(
        {
          error: "An account with this email already exists",
          conflict: true,
          recommendedMethod: loginMethod,
          message: `This email is already registered with ${loginMethod} login. Please use ${loginMethod} to sign in instead.`,
        },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const isDevelopment =
      process.env.NODE_ENV === "development" ||
      process.env.NEXTAUTH_URL?.includes("localhost");

    const newUserId = newAppId();
    const { data: userRow, error: createError } = await supabase
      .from("users")
      .insert({
        id: newUserId,
        name: String(name).trim(),
        email: emailNormalized,
        password: hashedPassword,
        email_verified: isDevelopment ? true : false,
        auth_provider: "email",
        reset_password_token: verificationToken,
        reset_password_expires: verificationTokenExpires.toISOString(),
        role: "user",
        is_active: true,
        is_dummy: false,
      })
      .select("id,name,email,email_verified")
      .single();

    if (createError || !userRow) {
      throw createError || new Error("Failed to create user");
    }

    // Best-effort: create Supabase Auth identity for compatibility.
    try {
      const created = await supabase.auth.admin.createUser({
        email: emailNormalized,
        password: String(password),
        email_confirm: !!isDevelopment,
        user_metadata: { id: newUserId, name: String(name).trim() },
      });
      if (created.data?.user?.id) {
        await supabase.from("user_identities").upsert(
          {
            auth_uid: created.data.user.id,
            user_id: newUserId,
            provider: "supabase",
          },
          { onConflict: "auth_uid" }
        );
      }
    } catch (identityError) {
      console.warn("Failed to create Supabase auth identity during register:", identityError);
    }

    if (!isDevelopment) {
      try {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.NEXTAUTH_URL ||
          "http://localhost:3000";
        const verificationUrl = `${appUrl}/api/auth/verify-email?token=${verificationToken}`;
        await sendEmailVerification({
          to: emailNormalized,
          userName: String(name).trim(),
          verificationUrl,
        });
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
      }
    }

    const responseData: any = {
      message: isDevelopment
        ? "User registered successfully. You can now log in."
        : "User registered successfully. Please check your email to verify your account.",
      user: {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        emailVerified: !!userRow.email_verified,
      },
      requiresEmailVerification: !isDevelopment,
    };

    let inviterId: string | null = null;
    if (inviteToken) {
      try {
        const { data: invitation } = await supabase
          .from("invitations")
          .select("id,invited_by,status,expires_at,token")
          .eq("token", String(inviteToken))
          .maybeSingle();

        if (
          invitation &&
          invitation.status === "pending" &&
          invitation.expires_at &&
          new Date(invitation.expires_at) > new Date()
        ) {
          inviterId = invitation.invited_by;
          await supabase
            .from("invitations")
            .update({ status: "accepted" })
            .eq("id", invitation.id);

          const { data: existingFriendship } = await supabase
            .from("friendships")
            .select("id")
            .or(
              `and(user_id.eq.${newUserId},friend_id.eq.${inviterId}),and(user_id.eq.${inviterId},friend_id.eq.${newUserId})`
            )
            .limit(1);

          if (!existingFriendship || existingFriendship.length === 0) {
            const firstId = newAppId();
            const secondId = newAppId();
            await supabase.from("friendships").insert([
              {
                id: firstId,
                user_id: newUserId,
                friend_id: inviterId,
                status: "accepted",
                requested_by: inviterId,
              },
              {
                id: secondId,
                user_id: inviterId,
                friend_id: newUserId,
                status: "accepted",
                requested_by: inviterId,
              },
            ]);
          }

          responseData.friendAdded = true;
        }
      } catch (inviteErr) {
        console.error("Invite processing error (non-fatal):", inviteErr);
      }
    }

    try {
      if (inviterId) {
        const merged = await mergeDummyFriends(
          inviterId,
          newUserId,
          String(name).trim()
        );
        if (merged > 0) {
          responseData.dummyMerged = merged;
        }
      }
    } catch (mergeErr) {
      console.error("Dummy merge error (non-fatal):", mergeErr);
    }

    return NextResponse.json(responseData, { status: 201 });
  } catch (error: any) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to register user" },
      { status: 500 }
    );
  }
}

