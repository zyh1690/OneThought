import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface AppPaths {
  dataRoot: string;
  thoughtsFile: string;
  indexFile: string;
  summariesFile: string;
  configFile: string;
  backupsDir: string;
}

export function resolveAppPaths(): AppPaths {
  const portableRoot = path.join(process.cwd(), "data");
  const isPortable = process.argv.includes("--portable") || fs.existsSync(portableRoot);
  const dataRoot = isPortable ? portableRoot : path.join(app.getPath("appData"), "OneThought");
  ensureDir(dataRoot);
  const backupsDir = path.join(dataRoot, "backups");
  ensureDir(backupsDir);
  return {
    dataRoot,
    thoughtsFile: path.join(dataRoot, "thoughts.jsonl"),
    indexFile: path.join(dataRoot, "index.json"),
    summariesFile: path.join(dataRoot, "summaries.jsonl"),
    configFile: path.join(dataRoot, "config.json"),
    backupsDir
  };
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
