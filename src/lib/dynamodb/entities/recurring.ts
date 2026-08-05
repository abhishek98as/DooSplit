import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE, GSI1, GSI2 } from "../tables";
import { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, toSortableTs } from "../keys";
import type { DdbRecurringTemplate, DdbRecurringRun } from "../types";
import { queryAll } from "../helpers";

// ── Template CRUD ─────────────────────────────────────────────────────────────

export async function putRecurringTemplate(
  tmpl: Omit<DdbRecurringTemplate, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK" | "GSI2PK" | "GSI2SK">
): Promise<void> {
  const item: DdbRecurringTemplate = {
    PK: PK.recurring(tmpl.id),
    SK: SK.meta,
    entityType: "recurring_template",
    GSI1PK: GSI1PK.recurOwner(tmpl.owner_id),
    GSI1SK: GSI1SK.recurring(tmpl.id),
    GSI2PK: GSI2PK.due(tmpl.next_run_date.slice(0, 10)), // YYYY-MM-DD
    GSI2SK: GSI2SK.recurring(tmpl.id),
    ...tmpl,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function getRecurringTemplateById(id: string): Promise<DdbRecurringTemplate | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: { PK: PK.recurring(id), SK: SK.meta } })
  );
  return (res.Item as DdbRecurringTemplate) ?? null;
}

export async function listRecurringTemplatesByOwner(
  ownerId: string
): Promise<DdbRecurringTemplate[]> {
  return queryAll<DdbRecurringTemplate>({
    TableName: TABLE,
    IndexName: GSI1,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": GSI1PK.recurOwner(ownerId) },
  });
}

/** Get all active templates due on or before the given date — used by the cron */
export async function listRecurringTemplatesDue(
  dateStr: string // YYYY-MM-DD
): Promise<DdbRecurringTemplate[]> {
  return queryAll<DdbRecurringTemplate>({
    TableName: TABLE,
    IndexName: GSI2,
    KeyConditionExpression: "GSI2PK = :pk",
    FilterExpression: "is_active = :active",
    ExpressionAttributeValues: {
      ":pk": GSI2PK.due(dateStr),
      ":active": true,
    },
  });
}

type RecurringTemplateUpdateFields = Partial<
  Omit<
    DdbRecurringTemplate,
    "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK" | "GSI2PK" | "GSI2SK" | "id" | "owner_id" | "created_at"
  >
>;

export async function updateRecurringTemplate(
  id: string,
  fields: RecurringTemplateUpdateFields
): Promise<void> {
  const sets: string[] = [];
  const names: Record<string, string> = {};
  const vals: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    sets.push(`#${k} = :${k}`);
    names[`#${k}`] = k;
    vals[`:${k}`] = v;
  }
  const nextRunDate =
    fields.next_run_date?.slice(0, 10) ||
    (fields.next_run_at ? fields.next_run_at.slice(0, 10) : undefined);
  if (nextRunDate) {
    sets.push("GSI2PK = :g2pk", "GSI2SK = :g2sk");
    vals[":g2pk"] = GSI2PK.due(nextRunDate);
    vals[":g2sk"] = GSI2SK.recurring(id);
  }
  if (sets.length === 0) return;
  await getDynamoDB().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: PK.recurring(id), SK: SK.meta },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
    })
  );
}

export async function deleteRecurringTemplate(id: string): Promise<void> {
  await getDynamoDB().send(
    new DeleteCommand({ TableName: TABLE, Key: { PK: PK.recurring(id), SK: SK.meta } })
  );
}

// ── Run records ───────────────────────────────────────────────────────────────

export async function putRecurringRun(
  run: Omit<DdbRecurringRun, "PK" | "SK" | "entityType">
): Promise<void> {
  const item: DdbRecurringRun = {
    PK: PK.recurring(run.template_id),
    SK: SK.run(run.run_date, run.id),
    entityType: "recurring_run",
    ...run,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function listRecurringRuns(templateId: string): Promise<DdbRecurringRun[]> {
  return queryAll<DdbRecurringRun>({
    TableName: TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": PK.recurring(templateId),
      ":prefix": "RUN#",
    },
    ScanIndexForward: false,
  });
}
