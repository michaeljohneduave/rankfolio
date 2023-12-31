import handler from "@rankfolio/core/handler";
import parserEB from "@rankfolio/core/parserEB";
import DynamoDB from "aws-sdk/clients/dynamodb";
import SQS from "aws-sdk/clients/sqs";
import fetch from "node-fetch";
import { Queue } from "sst/node/queue";

const sqs = new SQS();

export const main = handler<string>(async (event) => {
  const size = event?.queryStringParameters?.size || "5";
  const response = await fetch(
    "https://raw.githubusercontent.com/emmabostian/developer-portfolios/master/README.md",
  );

  const result = parserEB(await response.text()).slice(0, parseInt(size));

  await Promise.allSettled(
    result.map(async (folio) => {
      return sqs
        .sendMessage({
          QueueUrl: Queue["folio-queue"].queueUrl,
          MessageBody: JSON.stringify({
            payload: folio,
            ordered: true,
          }),
        })
        .promise();
    }),
  );
  return JSON.stringify(result);
});
