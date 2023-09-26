import * as lambda from "aws-cdk-lib/aws-lambda";
import { StackContext, Api, EventBus, use } from "sst/constructs";
import { Storage } from "./StorageStack";

export function API({ stack }: StackContext) {
  const { bucket } = use(Storage);

  // https://github.com/Sparticuz/chromium/releases/tag/v116.0.0
  const layerChromium = new lambda.LayerVersion(stack, "chromiumLayers", {
    code: lambda.Code.fromAsset("layers/chromium"),
  });

  // I have no idea what I'm doing here; basically matching
  // chromium (116.0.0) + lighthouse (11.1.0) + puppeteer-core (21.3.4) versions
  // https://github.com/GoogleChrome/lighthouse/releases/tag/v11.1.0
  const layerLighthouse = new lambda.LayerVersion(stack, "lighthouseLayers", {
    code: lambda.Code.fromAsset("layers/lighthouse"),
  });

  const bus = new EventBus(stack, "bus", {
    defaults: {
      retries: 10,
    },
  });
  const api = new Api(stack, "api", {
    defaults: {
      function: {
        bind: [bus, bucket],
      },
    },
    routes: {
      "GET /": {
        function: {
          handler: "packages/functions/src/lambda.main",
          runtime: "nodejs18.x",
          timeout: 30,
          layers: [layerChromium, layerLighthouse],
          nodejs: {
            esbuild: {
              external: ["@sparticuz/chromium", "lighthouse"],
            },
          },
          bind: [bucket],
        },
      },
    },
  });

  bus.subscribe("todo.created", {
    handler: "packages/functions/src/events/todo-created.handler",
  });

  stack.addOutputs({
    ApiEndpoint: api.url,
  });
}
