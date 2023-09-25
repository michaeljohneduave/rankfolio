import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import * as aws from "aws-sdk";
import lighthouse from "lighthouse";
import handler from "@rankfolio/core/handler";
import { Bucket } from "sst/node/bucket";

const url = "https://meduave.com";

const LOCAL_CHROMIUM_PATH = "/opt/homebrew/bin/chromium";

export const main = handler<string>(async (_evt) => {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: process.env.IS_LOCAL
      ? LOCAL_CHROMIUM_PATH
      : await chromium.executablePath(),
    headless: chromium.headless,
  });

  console.log(chromium);

  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle2" });

  const screenshot = (await page.screenshot({ fullPage: true })) as Buffer;
  // const result = await lighthouse(url, undefined, undefined, page);
  // console.log(result);

  const pages = await browser.pages();
  await Promise.all(pages.map((page) => page.close()));
  await browser.close();

  const s3 = new aws.S3();
  const fName = `${Date.now()}-screenshot.png`;
  const link = await s3
    .putObject({
      Bucket: Bucket["rankfolio-screenshot"].bucketName,
      Key: fName,
      Body: screenshot,
      ContentType: "image/png",
      ACL: "public-read",
    })
    .promise();
  return JSON.stringify({
    body: `https://${Bucket["rankfolio-screenshot"].bucketName}.s3.amazonaws.com/${fName}`,
  });
});
