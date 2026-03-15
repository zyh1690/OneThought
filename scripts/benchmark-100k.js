const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");

const target = path.join(process.cwd(), "tmp", "benchmark-thoughts.jsonl");
fs.mkdirSync(path.dirname(target), { recursive: true });

const total = 100000;
const startWrite = performance.now();
const lines = [];
for (let i = 0; i < total; i += 1) {
  const ts = new Date(Date.now() - i * 60000).toISOString();
  lines.push(
    JSON.stringify({
      id: crypto.randomUUID(),
      content: `thought-${i}`,
      created_at: ts,
      updated_at: ts,
      status: "active",
      archived: i % 3 === 0,
      tags: i % 2 === 0 ? ["work"] : ["life"],
      source: "main_ui",
      pinned: false,
      summary_id: null,
      meta: { device: "bench", app_version: "1.0.0" }
    })
  );
}
fs.writeFileSync(target, `${lines.join("\n")}\n`, "utf-8");
const writeMs = performance.now() - startWrite;

const startRead = performance.now();
const raw = fs.readFileSync(target, "utf-8");
const readLines = raw.split("\n").filter(Boolean);
const recent = readLines
  .map((line) => JSON.parse(line))
  .filter((x) => !x.archived && +new Date(x.created_at) > Date.now() - 30 * 24 * 60 * 60 * 1000);
const queryMs = performance.now() - startRead;

console.log(
  `[benchmark] generated=${total} write_ms=${writeMs.toFixed(2)} query_ms=${queryMs.toFixed(2)} matched=${recent.length}`
);
