import * as lambda from "aws-cdk-lib/aws-lambda";
import { Cron, Function, Queue, StackContext, use } from "sst/constructs";
import { Storage } from "./StorageStack";

export function Scraper({ stack }: StackContext) {
  const { bucket, table } = use(Storage);

  const scraperLambda = new Function(stack, "scraper", {
    handler: "packages/functions/src/scrapeProfile.main",
    runtime: "nodejs18.x",
    timeout: 60,
    layers: [
      lambda.LayerVersion.fromLayerVersionArn(
        stack,
        "chromiumLayers",
        "arn:aws:lambda:us-east-2:951043172154:layer:chromium:3"
      ),
      lambda.LayerVersion.fromLayerVersionArn(
        stack,
        "lighthouseLayers",
        "	arn:aws:lambda:us-east-2:951043172154:layer:lighthouse:9"
      ),
    ],
    nodejs: {
      esbuild: {
        external: ["@sparticuz/chromium", "lighthouse"],
      },
    },
    bind: [bucket, table],
    memorySize: "3008 MB",
  });

  const cron = new Cron(stack, "folio-scraper", {
    schedule: "rate(10 minutes)",
    job: "packages/functions/src/scrapeProfile.main",
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
  });

  cron.bind([queue]);
  scraperLambda.bind([queue]);

  return {
    cron,
    queue,
    scraperLambda,
  };
}
