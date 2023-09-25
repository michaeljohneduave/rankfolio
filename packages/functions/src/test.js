import fs from "fs/promises";
import puppeteer from "puppeteer";
import lighthouse from "lighthouse";

const url = "https://meduave.com";

const browser = await puppeteer.launch({
    headless: true,
    ignoreDefaultArgs: ["--enable-automation"],
});

const page = await browser.newPage();

await page.setViewport({ width: 1920, height: 1080 });
await page.goto(url, { waitUntil: "networkidle2" });
const screenshot = await page.screenshot({ fullPage: true });
const result = await lighthouse(url, undefined, undefined, page);
await fs.writeFile("screenshot.png", screenshot);

for (const [key, value] of Object.entries(result.lhr.categories)) {
    console.log(`${key}: ${value.score * 100}`);
}

await browser.close();