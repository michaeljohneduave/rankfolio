import { Context, APIGatewayProxyEvent } from "aws-lambda";

export default function handler<T>(
  lambda: (event: APIGatewayProxyEvent, context: Context) => Promise<T>
) {
  return async function (event: APIGatewayProxyEvent, context: Context) {
    let body, statusCode;

    try {
      body = await lambda(event, context);
      statusCode = 200;
    } catch (e) {
      statusCode = 500;
      body = JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return {
      body,
      statusCode,
    };
  };
}
