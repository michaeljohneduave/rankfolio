import puppeteer, { Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import * as aws from "aws-sdk";
import lighthouse from "lighthouse";
import { Bucket } from "sst/node/bucket";
import { SQSEvent } from "aws-lambda";
import { Table } from "sst/node/table";

const LOCAL_CHROMIUM_PATH = "/opt/homebrew/bin/chromium";
const dynamoDb = new aws.DynamoDB.DocumentClient();
const s3 = new aws.S3();

const runScreenshot = async (page: Page) => {
  let screenshot;
  let screenshotUrl;
  let error;
  let retries = 0;

  do {
    retries += 1;
    try {
      screenshot = (await page.screenshot({ fullPage: false })) as Buffer;
    } catch (e) {
      error = e instanceof Error ? e.message : JSON.stringify(e);
      console.error(error);
      console.error("Retrying screenshot...");
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

const runLigthhouse = async (url: string, page: Page) => {
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
  const body = JSON.parse(event.Records[0].body);
  const url = body.payload.website;
  const name = body.payload.name;
  const removeArgs = ["--single-process"];
  const args = chromium.args;
  if (!url) throw new Error("url is required");

  for (let i = 0; i < args.length; i += 1) {
    if (removeArgs.includes(args[i])) {
      args.splice(i, 1);
      i -= 1;
    }
  }
  const browser = await puppeteer.launch({
    args,
    defaultViewport: chromium.defaultViewport,
    executablePath: process.env.IS_LOCAL
      ? LOCAL_CHROMIUM_PATH
      : await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  const { data: screenshot, error: screenshotError } = await runScreenshot(
    page
  );
  const { data: result, error: lighthouseError } = await runLigthhouse(
    url,
    page
  );

  try {
    const pages = await browser.pages();
    await Promise.all(pages.map((page) => page.close()));
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
    },
  };

  if (screenshot) {
    params.Item.latestScreenshot = screenshot;
  } else {
    console.error(screenshotError);
  }

  if (result.report) {
    params.Item.latestLhUrl = result?.url || "";
    params.Item.latestLhData = JSON.stringify(result.report);
  } else {
    console.error(lighthouseError);
  }

  await dynamoDb.put(params).promise();

  return {};
};
