import fs from "node:fs";
import path from "node:path";

const out = path.join(process.cwd(), "tmp", "stability-log.txt");
fs.mkdirSync(path.dirname(out), { recursive: true });
const start = Date.now();

function sample() {
  const uptime = ((Date.now() - start) / 1000).toFixed(0);
  const mem = process.memoryUsage();
  const line = `${new Date().toISOString()} uptime_s=${uptime} rss=${mem.rss} heapUsed=${mem.heapUsed}\n`;
  fs.appendFileSync(out, line, "utf-8");
}

sample();
setInterval(sample, 60_000);
console.log("[stability] running, keep process alive for 72h in CI/manual test");
