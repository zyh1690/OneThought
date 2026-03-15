import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import type { AppConfig } from "../types";
import type { ThoughtRepository } from "./thoughtRepository";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

interface BackupPayload {
  thoughts: string;
  summaries: string;
  index: string;
  config: string;
  createdAt: string;
}

export class BackupService {
  constructor(private readonly repository: ThoughtRepository) {}

  async createBackup(reason = "manual"): Promise<string> {
    const { thoughtsFile, summariesFile, indexFile, configFile, backupsDir } = this.repository.getPaths();
    const payload: BackupPayload = {
      thoughts: this.readSafe(thoughtsFile),
      summaries: this.readSafe(summariesFile),
      index: this.readSafe(indexFile),
      config: this.readSafe(configFile),
      createdAt: new Date().toISOString()
    };
    const blob = await gzip(Buffer.from(JSON.stringify(payload), "utf-8"));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${stamp}-${reason}.json.gz`;
    const fullpath = path.join(backupsDir, filename);
    fs.writeFileSync(fullpath, blob);
    return filename;
  }

  listBackups(): string[] {
    const { backupsDir } = this.repository.getPaths();
    if (!fs.existsSync(backupsDir)) return [];
    return fs
      .readdirSync(backupsDir)
      .filter((f) => f.endsWith(".json.gz"))
      .sort()
      .reverse();
  }

  async restoreBackup(filename: string): Promise<void> {
    const { thoughtsFile, summariesFile, indexFile, configFile, backupsDir } = this.repository.getPaths();
    const fullpath = path.join(backupsDir, filename);
    const gz = fs.readFileSync(fullpath);
    const payload = JSON.parse((await gunzip(gz)).toString("utf-8")) as BackupPayload;
    this.atomicWrite(thoughtsFile, payload.thoughts);
    this.atomicWrite(summariesFile, payload.summaries);
    this.atomicWrite(indexFile, payload.index);
    this.atomicWrite(configFile, payload.config);
  }

  async runAutoDaily(config: AppConfig): Promise<string | null> {
    if (!config.backup.autoDaily) return null;
    const list = this.listBackups();
    const today = new Date().toISOString().slice(0, 10);
    const already = list.some((item) => item.includes(today));
    if (already) return null;
    const filename = await this.createBackup("auto");
    this.cleanup(config.backup.maxFiles);
    return filename;
  }

  cleanup(maxFiles: number): void {
    const { backupsDir } = this.repository.getPaths();
    const list = this.listBackups();
    if (list.length <= maxFiles) return;
    list.slice(maxFiles).forEach((file) => fs.unlinkSync(path.join(backupsDir, file)));
  }

  private readSafe(file: string): string {
    return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  }

  private atomicWrite(file: string, content: string): void {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, content, "utf-8");
    fs.renameSync(tmp, file);
  }
}
