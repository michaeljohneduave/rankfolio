import { Bucket, StackContext } from "sst/constructs";

export function Storage({ stack }: StackContext) {
  const bucket = new Bucket(stack, "rankfolio-screenshot");

  return {
    bucket,
  };
}
