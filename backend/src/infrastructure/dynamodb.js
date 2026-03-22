import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import config from "../config.js";

const client = new DynamoDBClient({ region: config.region });
const docClient = DynamoDBDocumentClient.from(client);

// ─── Users ───

export async function createUser(user) {
  await docClient.send(new PutCommand({
    TableName: config.dynamodb.usersTable,
    Item: user,
    ConditionExpression: "attribute_not_exists(user_id)",
  }));
  return user;
}

export async function getUserByEmail(email) {
  const result = await docClient.send(new QueryCommand({
    TableName: config.dynamodb.usersTable,
    IndexName: "EmailIndex",
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: { ":email": email },
  }));
  return result.Items?.[0] || null;
}

// ─── Transactions ───

export async function createTransactionsBatch(transactions) {
  const BATCH_SIZE = 25;
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [config.dynamodb.transactionsTable]: batch.map((txn) => ({
          PutRequest: { Item: txn },
        })),
      },
    }));
  }
}

export async function getTransactionsByUser(userId, startDate, endDate, category) {
  let keyExpr = "user_id = :uid";
  const exprValues = { ":uid": userId };
  const exprNames = {};

  if (startDate && endDate) {
    keyExpr += " AND #d BETWEEN :start AND :end";
    exprValues[":start"] = startDate;
    exprValues[":end"] = endDate;
    exprNames["#d"] = "date";
  }

  const params = {
    TableName: config.dynamodb.transactionsTable,
    IndexName: "UserDateIndex",
    KeyConditionExpression: keyExpr,
    ExpressionAttributeValues: exprValues,
  };

  if (Object.keys(exprNames).length > 0) {
    params.ExpressionAttributeNames = exprNames;
  }

  if (category) {
    params.FilterExpression = "category = :cat";
    exprValues[":cat"] = category;
  }

  const items = [];
  let lastKey;
  do {
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await docClient.send(new QueryCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

export async function updateTransaction(transactionId, updates) {
  const exprParts = [];
  const exprValues = {};
  const exprNames = {};
  let i = 0;

  for (const [key, value] of Object.entries(updates)) {
    exprParts.push(`#a${i} = :v${i}`);
    exprNames[`#a${i}`] = key;
    exprValues[`:v${i}`] = value;
    i++;
  }

  const result = await docClient.send(new UpdateCommand({
    TableName: config.dynamodb.transactionsTable,
    Key: { transaction_id: transactionId },
    UpdateExpression: "SET " + exprParts.join(", "),
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues,
    ReturnValues: "ALL_NEW",
  }));
  return result.Attributes;
}

// ─── Files ───

export async function createFileRecord(record) {
  await docClient.send(new PutCommand({
    TableName: config.dynamodb.filesTable,
    Item: record,
  }));
  return record;
}

export async function getFileById(fileId) {
  const result = await docClient.send(new GetCommand({
    TableName: config.dynamodb.filesTable,
    Key: { file_id: fileId },
  }));
  return result.Item || null;
}

export async function getFilesByUser(userId) {
  const result = await docClient.send(new QueryCommand({
    TableName: config.dynamodb.filesTable,
    IndexName: "UserIndex",
    KeyConditionExpression: "user_id = :uid",
    ExpressionAttributeValues: { ":uid": userId },
  }));
  return result.Items || [];
}

export async function updateFileStatus(fileId, status, transactionCount = 0) {
  const result = await docClient.send(new UpdateCommand({
    TableName: config.dynamodb.filesTable,
    Key: { file_id: fileId },
    UpdateExpression: "SET #s = :status, transaction_count = :count",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":status": status, ":count": transactionCount },
    ReturnValues: "ALL_NEW",
  }));
  return result.Attributes;
}
