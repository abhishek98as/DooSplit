import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDB } from "../client";
import { TABLE, GSI1 } from "../tables";
import { PK, SK, GSI1PK, GSI1SK } from "../keys";
import type { DdbFeedback } from "../types";
import { queryAll } from "../helpers";

export async function putFeedback(
  fb: Omit<DdbFeedback, "PK" | "SK" | "entityType" | "GSI1PK" | "GSI1SK">
): Promise<void> {
  const item: DdbFeedback = {
    PK: PK.feedback(fb.id),
    SK: SK.meta,
    entityType: "feedback",
    GSI1PK: GSI1PK.feedbackCat(fb.category),
    GSI1SK: GSI1SK.feedback(fb.upvotes, fb.id),
    ...fb,
  };
  await getDynamoDB().send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function getFeedbackById(id: string): Promise<DdbFeedback | null> {
  const res = await getDynamoDB().send(
    new GetCommand({ TableName: TABLE, Key: { PK: PK.feedback(id), SK: SK.meta } })
  );
  return (res.Item as DdbFeedback) ?? null;
}

export async function listFeedbackByCategory(category: string): Promise<DdbFeedback[]> {
  return queryAll<DdbFeedback>({
    TableName: TABLE,
    IndexName: GSI1,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": GSI1PK.feedbackCat(category) },
    ScanIndexForward: false,
  });
}

export async function updateFeedbackVotes(
  id: string,
  upvotes: number,
  downvotes: number,
  updatedAt: string
): Promise<void> {
  await getDynamoDB().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: PK.feedback(id), SK: SK.meta },
      UpdateExpression: "SET upvotes = :up, downvotes = :dn, updated_at = :ua, GSI1SK = :gsk",
      ExpressionAttributeValues: {
        ":up": upvotes,
        ":dn": downvotes,
        ":ua": updatedAt,
        ":gsk": GSI1SK.feedback(upvotes, id),
      },
    })
  );
}

export async function updateFeedbackStatus(
  id: string,
  status: string,
  priority: string,
  updatedAt: string
): Promise<void> {
  await getDynamoDB().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: PK.feedback(id), SK: SK.meta },
      UpdateExpression: "SET #st = :st, priority = :pr, updated_at = :ua",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: { ":st": status, ":pr": priority, ":ua": updatedAt },
    })
  );
}
