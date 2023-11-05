import * as lambda from "aws-cdk-lib/aws-lambda";
import { StackContext, Api, use } from "sst/constructs";
import { Storage } from "./StorageStack";
import { Scraper } from "./ScrapeStack";

export function API({ stack }: StackContext) {
  const { bucket, table } = use(Storage);
  const { queue } = use(Scraper);

  const layerChromium = new lambda.LayerVersion(stack, "chromiumLayers", {
    code: lambda.Code.fromAsset("layers/chromium"),
  });
  const layerLighthouse = new lambda.LayerVersion(stack, "lighthouseLayers", {
    code: lambda.Code.fromAsset("layers/lighthouse"),
  });

  const api = new Api(stack, "api", {
    defaults: {
      function: {
        bind: [bucket, queue, table],
      },
    },
    routes: {
      "GET /": "packages/functions/src/main.list",
      "GET /scrape": "packages/functions/src/scraper.main",
      "GET /test": {
        function: {
          handler: "packages/functions/src/chrome.main",
          runtime: "nodejs18.x",
          timeout: "120 seconds",
          layers: [layerChromium, layerLighthouse],
          nodejs: {
            esbuild: {
              external: ["@sparticuz/chromium", "lighthouse"],
            },
          },
          memorySize: "2000 MB",
        },
      },
    },
  });

  stack.addOutputs({
    ApiEndpoint: api.url,
  });

  return {
    api,
  };
}
