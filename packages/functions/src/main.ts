import * as AWS from "aws-sdk";

import handler from "@rankfolio/core/handler";
import { Table } from "sst/node/table";

const dynamoDb = new AWS.DynamoDB.DocumentClient();

export const list = handler<string>(async () => {
  const params = {
    TableName: Table["folios"].tableName,
  };

  const result = await dynamoDb.scan(params).promise();

  return JSON.stringify(
    result.Items?.map((item) => {
      if (!item.latestLhData) return item;

      const data = JSON.parse(item.latestLhData);

      delete item.latestLhData;
      return {
        ...item,
        performance: data.performance.score * 100,
        bestPractices: data["best-practices"].score * 100,
        accessibility: data.accessibility.score * 100,
        seo: data.seo.score * 100,
        pwa: data.pwa.score * 100,
      };
    })
  );
});