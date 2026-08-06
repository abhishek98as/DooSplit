import "server-only";
import { GetCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "@/lib/dynamodb/client";
import { TABLE } from "@/lib/dynamodb/tables";
import { PK } from "@/lib/dynamodb/keys";

/** Weekly AI token budget per user. */
export const AI_WEEKLY_TOKEN_LIMIT = 100_000;

export const AI_WEEKLY_LIMIT_CODE = "AI_WEEKLY_LIMIT";

/** Hardcoded emails with unlimited AI tokens (no weekly cap). */
const AI_UNLIMITED_EMAILS = new Set(["abhishek98as@gmail.com"]);

export function isAiUnlimitedEmail(email?: string | null): boolean {
  if (!email) return false;
  return AI_UNLIMITED_EMAILS.has(String(email).trim().toLowerCase());
}

function mondayUtc(d = new Date()): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/** Week key like 2026-W32 (ISO-ish, Monday-start UTC). */
export function getAiWeekKey(now = new Date()): string {
  const monday = mondayUtc(now);
  const yearStart = new Date(Date.UTC(monday.getUTCFullYear(), 0, 1));
  const week = Math.floor((monday.getTime() - yearStart.getTime()) / (7 * 86400000)) + 1;
  return `${monday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekEndIso(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 7);
  return end.toISOString();
}

export interface AiUsageSnapshot {
  weekKey: string;
  tokensUsed: number;
  /** null when unlimited */
  limit: number | null;
  /** null when unlimited */
  remaining: number | null;
  exhausted: boolean;
  unlimited: boolean;
  resetsAt: string;
}

function snapshotFromUsed(
  tokensUsed: number,
  weekKey: string,
  weekStart: Date,
  email?: string | null
): AiUsageSnapshot {
  const unlimited = isAiUnlimitedEmail(email);
  if (unlimited) {
    return {
      weekKey,
      tokensUsed,
      limit: null,
      remaining: null,
      exhausted: false,
      unlimited: true,
      resetsAt: weekEndIso(weekStart),
    };
  }
  return {
    weekKey,
    tokensUsed,
    limit: AI_WEEKLY_TOKEN_LIMIT,
    remaining: Math.max(0, AI_WEEKLY_TOKEN_LIMIT - tokensUsed),
    exhausted: tokensUsed >= AI_WEEKLY_TOKEN_LIMIT,
    unlimited: false,
    resetsAt: weekEndIso(weekStart),
  };
}

export async function getAiWeeklyUsage(
  userId: string,
  email?: string | null
): Promise<AiUsageSnapshot> {
  const weekKey = getAiWeekKey();
  const weekStart = mondayUtc();
  const sk = `AI_USAGE#${weekKey}`;
  const res = await getDynamoDB().send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: PK.user(userId), SK: sk },
    })
  );
  const tokensUsed = Number((res.Item as any)?.tokens_used || 0);
  return snapshotFromUsed(tokensUsed, weekKey, weekStart, email);
}

/** Returns usage snapshot (check `.exhausted` before calling AI). */
export async function assertAiWeeklyAllowance(
  userId: string,
  email?: string | null
): Promise<AiUsageSnapshot> {
  return getAiWeeklyUsage(userId, email);
}

/** Atomically add tokens consumed by an AI call. */
export async function recordAiTokenUsage(
  userId: string,
  tokens: number,
  email?: string | null
): Promise<AiUsageSnapshot> {
  const add = Math.max(0, Math.floor(Number(tokens) || 0));
  const weekKey = getAiWeekKey();
  const weekStart = mondayUtc();
  const sk = `AI_USAGE#${weekKey}`;
  const now = new Date().toISOString();

  if (add === 0) {
    return getAiWeeklyUsage(userId, email);
  }

  try {
    const res = await getDynamoDB().send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: PK.user(userId), SK: sk },
        UpdateExpression:
          "ADD tokens_used :add SET entityType = if_not_exists(entityType, :et), week_key = if_not_exists(week_key, :wk), week_start = if_not_exists(week_start, :ws), updated_at = :now, created_at = if_not_exists(created_at, :now)",
        ExpressionAttributeValues: {
          ":add": add,
          ":et": "ai_usage",
          ":wk": weekKey,
          ":ws": weekStart.toISOString(),
          ":now": now,
        },
        ReturnValues: "ALL_NEW",
      })
    );
    const tokensUsed = Number((res.Attributes as any)?.tokens_used || add);
    return snapshotFromUsed(tokensUsed, weekKey, weekStart, email);
  } catch (err) {
    console.warn("[ai/usage] update failed, putting:", err);
    await getDynamoDB()
      .send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: PK.user(userId),
            SK: sk,
            entityType: "ai_usage",
            week_key: weekKey,
            week_start: weekStart.toISOString(),
            tokens_used: add,
            created_at: now,
            updated_at: now,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        })
      )
      .catch(async () => {
        await getDynamoDB().send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { PK: PK.user(userId), SK: sk },
            UpdateExpression: "ADD tokens_used :add SET updated_at = :now",
            ExpressionAttributeValues: { ":add": add, ":now": now },
          })
        );
      });
    return getAiWeeklyUsage(userId, email);
  }
}

export function weeklyLimitResponse(usage: AiUsageSnapshot) {
  return {
    error: "Weekly AI limit exhausted",
    code: AI_WEEKLY_LIMIT_CODE,
    message:
      "You've used your 100,000 AI tokens for this week. Your limit resets next Monday.",
    usage,
  };
}
