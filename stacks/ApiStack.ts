import { Api, StackContext, use } from "sst/constructs";
import { Scraper } from "./ScrapeStack";
import { Storage } from "./StorageStack";

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
