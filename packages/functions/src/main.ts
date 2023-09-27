import * as AWS from "aws-sdk";

import handler from "@rankfolio/core/handler";
import { Table } from "sst/node/table";

const dynamoDb = new AWS.DynamoDB.DocumentClient();

export const list = handler<string>(async () => {
  const params = {
    TableName: Table["folios"].tableName,
    Key: {},
  };

  const result = await dynamoDb.scan(params).promise();
  return JSON.stringify(result.Items);
});
