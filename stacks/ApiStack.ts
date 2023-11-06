import * as lambda from "aws-cdk-lib/aws-lambda";
import { StackContext, Api, use } from "sst/constructs";
import { Storage } from "./StorageStack";
import { Scraper } from "./ScrapeStack";

export function API({ stack }: StackContext) {
  const { bucket, table } = use(Storage);
  const { queue } = use(Scraper);

  const api = new Api(stack, "api", {
    defaults: {
      function: {
        bind: [bucket, queue, table],
      },
    },
    routes: {
      "GET /": "packages/functions/src/main.list",
      "GET /scrape": "packages/functions/src/getProfiles.main",
    },
  });

  stack.addOutputs({
    ApiEndpoint: api.url,
  });

  return {
    api,
  };
}
