import { NextRequest, NextResponse } from "next/server";
import { getServerAppUser, type ServerAppUser } from "./server-session";

export interface RequireUserResult {
  user: ServerAppUser | null;
  response?: NextResponse;
}

export async function requireUser(request: NextRequest): Promise<RequireUserResult> {
  const user = await getServerAppUser(request);
  if (!user?.id) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user };
}
