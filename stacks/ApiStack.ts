import * as lambda from "aws-cdk-lib/aws-lambda";
import { StackContext, Api, EventBus, use } from "sst/constructs";
import { Storage } from "./StorageStack";

export function API({ stack }: StackContext) {
  const { bucket } = use(Storage);

  const layerChromium = new lambda.LayerVersion(stack, "chromiumLayers", {
    code: lambda.Code.fromAsset("layers/chromium"),
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
          layers: [layerChromium],
          nodejs: {
            esbuild: {
              external: ["@sparticuz/chromium"],
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
