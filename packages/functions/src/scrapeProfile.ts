import handler from "@rankfolio/core/handler";
import chromium from "@sparticuz/chromium";
import { APIGatewayProxyEvent, SQSEvent } from "aws-lambda";
import puppeteer, { Page } from "puppeteer-core";
import * as aws from "aws-sdk";
import { Bucket } from "sst/node/bucket";
import lighthouse from "lighthouse";
import { Table } from "sst/node/table";
import { Queue } from "sst/node/queue";

const LOCAL_CHROMIUM_PATH =
  "/tmp/local-chromium-113/chrome/mac_arm-113.0.5672.63/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const s3 = new aws.S3();
const dynamoDb = new aws.DynamoDB.DocumentClient();
const sqs = new aws.SQS();

const runScreenshot = async (page: Page) => {
  let screenshot;
  let screenshotUrl;
  let error;
  let retries = 0;

  do {
    retries += 1;
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      screenshot = (await page.screenshot({ fullPage: true })) as Buffer;
    } catch (e: any) {
      if (e.message.includes("Page is too large")) {
        error = "Page is too large, chrome gave up";
        break;
      } else {
        error = e instanceof Error ? e.message : JSON.stringify(e);
        console.error(error);
        console.error("Retrying screenshot...");
      }
    }
  } while (retries < 3 && !screenshot);

  if (screenshot) {
    try {
      const screenshotName = `${Date.now()}-${page.url()}-screenshot.png`;
      await s3
        .putObject({
          Bucket: Bucket["rankfolio-screenshot"].bucketName,
          Key: screenshotName,
          Body: screenshot,
          ContentType: "image/png",
          ACL: "public-read",
        })
        .promise();
      screenshotUrl = `https://${Bucket["rankfolio-screenshot"].bucketName}.s3.amazonaws.com/${screenshotName}`;
    } catch (e) {
      error = e instanceof Error ? e.message : JSON.stringify(e);
      console.error(error);
    }
  }

  return {
    data: screenshotUrl,
    error,
  };
};

const runLighthouse = async (url: string, page: Page) => {
  let result;
  let retries;
  let reportUrl;
  let error;

  retries = 0;

  do {
    retries += 1;
    try {
      result = await lighthouse(
        url,
        {
          output: "html",
          logLevel: "warn",
        },
        undefined,
        page
      );
    } catch (e) {
      error = e instanceof Error ? e.message : JSON.stringify(e);
      console.error(error);
      console.error(url, "Retrying lighthouse...");
    }
  } while (retries < 3 && !result);

  if (result) {
    try {
      const reportName = `${Date.now()}-${encodeURI(url)}-report.html`;
      await s3
        .putObject({
          Bucket: Bucket["rankfolio-screenshot"].bucketName,
          Key: reportName,
          Body: result?.report,
          ContentType: "text/html",
          ACL: "public-read",
        })
        .promise();
      reportUrl = `https://${Bucket["rankfolio-screenshot"].bucketName}.s3.amazonaws.com/${reportName}`;
    } catch (e) {
      error = e instanceof Error ? e.message : JSON.stringify(e);
      console.error(e);
    }
  }

  return {
    data: {
      url: reportUrl,
      report: result?.lhr,
    },
    error,
  };
};

export const main = async (event: SQSEvent) => {
  try {
    const body = JSON.parse(event.Records[0].body);
    const url = body.payload.website;
    const name = body.payload.name;
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: null,
      executablePath: process.env.IS_LOCAL
        ? LOCAL_CHROMIUM_PATH
        : await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });

    const { data: screenshot, error: screenshotError } = await runScreenshot(
      page
    );
    const { data: lhResult, error: lighthouseError } = await runLighthouse(
      url,
      page
    );

    try {
      const pages = await browser.pages();
      await Promise.all(pages.map((page) => page.isClosed() || page.close()));
      await browser.close();
    } catch (e) {
      console.error(e);
      console.error("Error closing pages/browser");
    }

    const params = {
      TableName: Table["folios"].tableName,
      Item: {
        url: url,
        name: name,
        latestScreenshot: "",
        latestLhUrl: "",
        latestLhData: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        upVotes: 0,
        downVotes: 0,
        performance: -1,
        accessibility: -1,
        bestPractices: -1,
        seo: -1,
        pwa: -1,
      },
    };

    if (screenshot) {
      params.Item.latestScreenshot = screenshot;
    } else {
      console.error(screenshotError);
    }

    if (lhResult.report) {
      params.Item.latestLhUrl = lhResult?.url || "";
      params.Item.latestLhData = JSON.stringify(lhResult.report.categories);
      params.Item.performance =
        lhResult.report.categories.performance.score || -1;
      params.Item.accessibility =
        lhResult.report.categories.accessibility.score || -1;
      params.Item.bestPractices =
        lhResult.report.categories["best-practices"].score || -1;
      params.Item.seo = lhResult.report.categories.seo.score || -1;
      params.Item.pwa = lhResult.report.categories.pwa.score || -1;
    } else {
      console.error(lighthouseError);
    }

    await dynamoDb.put(params).promise();
  } catch (e) {
    console.error(e);
  }

  await sqs.deleteMessage({
    QueueUrl: Queue["folio-queue"].queueUrl,
    ReceiptHandle: event.Records[0].receiptHandle,
  });

  return {};
};
