import { SSTConfig } from "sst";
import { API } from "./stacks/ApiStack";
import { Storage } from "./stacks/StorageStack";

export default {
  config(_input) {
    return {
      name: "rankfolio",
      region: "us-east-2",
    };
  },
  stacks(app) {
    app.stack(Storage).stack(API);
  },
} satisfies SSTConfig;
