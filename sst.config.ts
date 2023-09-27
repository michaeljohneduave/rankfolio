import { SSTConfig } from "sst";
import { API } from "./stacks/ApiStack";
import { Storage } from "./stacks/StorageStack";
import { Scraper } from "./stacks/ScrapeStack";

export default {
  config(_input) {
    return {
      name: "rankfolio",
      region: "us-east-2",
    };
  },
  stacks(app) {
    app.stack(Storage).stack(Scraper).stack(API);
  },
} satisfies SSTConfig;
