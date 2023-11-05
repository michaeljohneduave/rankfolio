import fetch from "node-fetch";
import AWS from "aws-sdk";
import handler from "@rankfolio/core/handler";
import parserEB from "@rankfolio/core/parserEB";
import { Queue } from "sst/node/queue";

const sqs = new AWS.SQS();

export const main = handler<string>(async (event) => {
  const size = event?.queryStringParameters?.size || "5";
  const response = await fetch(
    "https://raw.githubusercontent.com/emmabostian/developer-portfolios/master/README.md"
  );

  const result = parserEB(await response.text()).slice(0, parseInt(size));

  await Promise.all(
    result.map((folio) => {
      return sqs
        .sendMessage({
          QueueUrl: Queue["folio-queue"].queueUrl,
          MessageBody: JSON.stringify({
            payload: folio,
            ordered: true,
          }),
        })
        .promise();
    })
  );
  return JSON.stringify(result);
});
