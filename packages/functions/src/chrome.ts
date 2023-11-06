import handler from "@rankfolio/core/handler";
import chromium from "@sparticuz/chromium";
import { APIGatewayProxyEvent } from "aws-lambda";
import puppeteer, { Page } from "puppeteer-core";
import * as aws from "aws-sdk";
import { Bucket } from "sst/node/bucket";
import lighthouse from "lighthouse";

const LOCAL_CHROMIUM_PATH =
  "/tmp/local-chromium-113/chrome/mac_arm-113.0.5672.63/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const s3 = new aws.S3();

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

export const main = handler<string>(async (event: APIGatewayProxyEvent) => {
  const url = event?.queryStringParameters?.url;
  if (!url) throw new Error("url is required");

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
  const { data: results, error: lighthouseError } = await runLighthouse(
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

  return JSON.stringify({
    performance: results.report?.categories?.performance?.score,
    accessibility: results.report?.categories?.accessibility?.score,
    bestPractices: results.report?.categories?.["best-practices"]?.score,
    seo: results.report?.categories?.seo?.score,
    pwa: results.report?.categories?.pwa?.score,
    screenshot,
    screenshotError,
    report: results.url,
    lighthouseError,
  });
});
