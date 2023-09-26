import { Bucket, StackContext, Table } from "sst/constructs";

export function Storage({ stack }: StackContext) {
  const bucket = new Bucket(stack, "rankfolio-screenshot");
  const table = new Table(stack, "folios", {
    fields: {
      url: "string",
      name: "string",
      latestScreenshot: "string",
      latestLhReport: "string",
      createdAt: "number",
      updatedAt: "number",
      upVotes: "number",
      downVotes: "number",
    },
    primaryIndex: {
      partitionKey: "url",
    },
  });
  return {
    bucket,
    table,
  };
}
