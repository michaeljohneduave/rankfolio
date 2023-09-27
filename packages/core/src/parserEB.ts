const websiteRegex = /\((https|http).[^ ]+\)/;
const nameRegex = /- \[[a-zA-Z ]+\]/;

export default function parserEB(str: string) {
  const devs: Record<"name" | "website", string>[] = [];

  for (const line of str.split("\n")) {
    if (!line.includes("- [")) continue;

    const names = line.match(nameRegex);
    const websites = line.match(websiteRegex);

    if (!names || !websites) continue;

    devs.push({
      name: names[0].replace("- [", "").replace("]", ""),
      website: websites[0].replace("(", "").replace(")", ""),
    });
  }

  return devs;
}
