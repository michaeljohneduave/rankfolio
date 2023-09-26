import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import * as aws from "aws-sdk";
import lighthouse from "lighthouse";
import handler from "@rankfolio/core/handler";
import { Bucket } from "sst/node/bucket";

const LOCAL_CHROMIUM_PATH = "/opt/homebrew/bin/chromium";

export const main = handler<string>(async (_evt) => {
  const { url } = _evt.queryStringParameters!;
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

  let retries = 0;

  let screenshot;
  let result;

  do {
    retries += 1;
    try {
      screenshot = (await page.screenshot({ fullPage: false })) as Buffer;
    } catch (e) {
      console.error(e);
      console.error("Retrying...");
    }
  } while (retries < 3 && !result);

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
      console.error(e);
      console.error("Retrying...");
    }
  } while (retries < 3 && !result);

  if (!screenshot || !result) throw new Error("Failed to take screenshot");

  const pages = await browser.pages();
  await Promise.all(pages.map((page) => page.close()));
  await browser.close();

  const s3 = new aws.S3();
  const screenshotName = `${Date.now()}-screenshot.png`;
  const reportName = `${Date.now()}-report.html`;

  await Promise.all([
    s3
      .putObject({
        Bucket: Bucket["rankfolio-screenshot"].bucketName,
        Key: screenshotName,
        Body: screenshot,
        ContentType: "image/png",
        ACL: "public-read",
      })
      .promise(),

    s3
      .putObject({
        Bucket: Bucket["rankfolio-screenshot"].bucketName,
        Key: reportName,
        Body: result?.report,
        ContentType: "text/html",
        ACL: "public-read",
      })
      .promise(),
  ]);

  return JSON.stringify({
    result: {
      screenshot: `https://${Bucket["rankfolio-screenshot"].bucketName}.s3.amazonaws.com/${screenshotName}`,
      html: `https://${Bucket["rankfolio-screenshot"].bucketName}.s3.amazonaws.com/${reportName}`,
      performance: result?.lhr.categories.performance.score,
      accessibility: result?.lhr.categories.accessibility.score,
      "best-practices": result?.lhr.categories["best-practices"].score,
      seo: result?.lhr.categories.seo.score,
      pwa: result?.lhr.categories.pwa.score,
    },
  });
});
