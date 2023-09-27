import * as lambda from "aws-cdk-lib/aws-lambda";
import { Cron, Function, Queue, StackContext, use } from "sst/constructs";
import { Duration } from "aws-cdk-lib/core";
import { Storage } from "./StorageStack";

export function Scraper({ stack, app }: StackContext) {
  const { bucket, table } = use(Storage);

  // I have no idea what I'm doing here; basically matching
  // chromium (116.0.0) + lighthouse (11.1.0) + puppeteer-core (21.3.4) versions
  // https://github.com/Sparticuz/chromium/releases/tag/v116.0.0
  const layerChromium = new lambda.LayerVersion(stack, "chromiumLayers", {
    code: lambda.Code.fromAsset("layers/chromium"),
  });
  // https://github.com/GoogleChrome/lighthouse/releases/tag/v11.1.0
  const layerLighthouse = new lambda.LayerVersion(stack, "lighthouseLayers", {
    code: lambda.Code.fromAsset("layers/lighthouse"),
  });

  const scraperLambda = new Function(stack, "scraper", {
    handler: "packages/functions/src/lambda.main",
    runtime: "nodejs18.x",
    timeout: 300,
    layers: [layerChromium, layerLighthouse],
    nodejs: {
      esbuild: {
        external: ["@sparticuz/chromium", "lighthouse"],
      },
    },
    bind: [bucket, table],
  });

  const cron = new Cron(stack, "folio-scraper", {
    schedule: "rate(10 minutes)",
    job: "packages/functions/src/scraper.main",
    enabled: false,
  });
  const queue = new Queue(stack, "folio-queue", {
    consumer: {
      function: scraperLambda,
      cdk: {
        eventSource: {
          batchSize: 1,
        },
      },
    },
    cdk: {
      queue: {
        visibilityTimeout: Duration.seconds(300),
      },
    },
  });

  cron.bind([queue]);

  return {
    cron,
    queue,
    scraperLambda,
  };
}
