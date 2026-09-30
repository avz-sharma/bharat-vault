import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const directory = "frontend/dist/assets";
const files = (await readdir(directory)).filter((file) => file.endsWith(".js"));
assert.ok(files.length > 0, "Production JavaScript not found");
let total = 0;
for (const file of files)
  total += gzipSync(await readFile(`${directory}/${file}`)).byteLength;
assert.ok(
  total < 200_000,
  `JavaScript gzip budget exceeded: ${total} bytes >= 200000`,
);
console.log(
  `PASS: all JavaScript chunks gzip to ${total} bytes (budget: 200000).`,
);
