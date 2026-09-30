import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const [tool, ...args] = process.argv.slice(2);
if (!["forge", "anvil"].includes(tool))
  throw new Error("Unsupported Foundry tool");
const platform = `${process.platform}-${process.arch === "x64" ? "amd64" : process.arch}`;
const directory = dirname(
  require.resolve(`@foundry-rs/${tool}-${platform}/package.json`),
);
const result = spawnSync(
  join(directory, "bin", tool + (process.platform === "win32" ? ".exe" : "")),
  args,
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
