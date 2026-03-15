import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "tmp", "poweroff-sim.jsonl");
fs.mkdirSync(path.dirname(file), { recursive: true });
if (!fs.existsSync(file)) fs.writeFileSync(file, "", "utf-8");

for (let i = 0; i < 1000; i += 1) {
  fs.appendFileSync(file, JSON.stringify({ id: i, ts: new Date().toISOString(), content: `entry-${i}` }) + "\n");
  if (i % 200 === 0) {
    console.log(`[poweroff-sim] appended=${i}`);
  }
}

const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
let ok = 0;
for (const line of lines) {
  try {
    JSON.parse(line);
    ok += 1;
  } catch {
    // ignore broken tails
  }
}
console.log(`[poweroff-sim] valid_lines=${ok}/${lines.length}`);
