import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { resolveAppPaths } from "./paths";
import type { GroupedThoughts, QueryOptions, Thought } from "../types";

interface DiskIndex {
  dayMap: Record<string, string[]>;
  monthMap: Record<string, string[]>;
  archivedIds: string[];
  idToOffset: Record<string, number>;
  updatedAt: string;
}

export class ThoughtRepository {
  private readonly paths = resolveAppPaths();
  private thoughtsById = new Map<string, Thought>();
  private dayMap = new Map<string, string[]>();
  private monthMap = new Map<string, string[]>();
  private archivedIds = new Set<string>();
  private idToOffset = new Map<string, number>();

  initialize(): void {
    this.ensureDataFiles();
    this.loadThoughts();
    this.rebuildIndexStructures();
    this.persistIndex();
  }

  getAll(): Thought[] {
    return [...this.thoughtsById.values()].sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at)
    );
  }

  create(content: string, tags: string[] = [], source: Thought["source"] = "quick_input"): Thought {
    const now = new Date().toISOString();
    const thought: Thought = {
      id: crypto.randomUUID(),
      content,
      created_at: now,
      updated_at: now,
      status: "active",
      archived: false,
      tags,
      source,
      pinned: false,
      summary_id: null,
      meta: {
        device: os.hostname(),
        app_version: "1.0.0"
      }
    };
    this.upsert(thought);
    return thought;
  }

  update(id: string, patch: Partial<Thought>): Thought | null {
    const current = this.thoughtsById.get(id);
    if (!current) return null;
    const next: Thought = {
      ...current,
      ...patch,
      id,
      updated_at: new Date().toISOString()
    };
    this.upsert(next);
    return next;
  }

  archive(id: string, archived: boolean): Thought | null {
    return this.update(id, { archived });
  }

  queryGrouped(options: QueryOptions): GroupedThoughts[] {
    const fromTs = options.from ? +new Date(options.from) : Number.MIN_SAFE_INTEGER;
    const toTs = options.to ? +new Date(options.to) : Number.MAX_SAFE_INTEGER;
    const tags = new Set(options.tags ?? []);
    const matched = this.getAll().filter((item) => {
      const ts = +new Date(item.created_at);
      if (ts < fromTs || ts > toTs) return false;
      if (typeof options.archived === "boolean" && item.archived !== options.archived) return false;
      if (tags.size > 0 && !item.tags.some((t) => tags.has(t))) return false;
      return true;
    });

    const grouped = new Map<string, Thought[]>();
    for (const item of matched) {
      const date = new Date(item.created_at);
      const key =
        options.viewMode === "month"
          ? `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`
          : `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => (a > b ? -1 : 1))
      .map(([groupKey, items]) => ({
        groupKey,
        items: items.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      }));
  }

  compact(): void {
    const tmp = `${this.paths.thoughtsFile}.tmp`;
    const lines = this.getAll()
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
      .map((item) => JSON.stringify(item))
      .join("\n");
    fs.writeFileSync(tmp, `${lines}\n`, "utf-8");
    fs.renameSync(tmp, this.paths.thoughtsFile);
    this.loadThoughts();
    this.rebuildIndexStructures();
    this.persistIndex();
  }

  private upsert(thought: Thought): void {
    const line = `${JSON.stringify(thought)}\n`;
    fs.appendFileSync(this.paths.thoughtsFile, line, "utf-8");
    this.thoughtsById.set(thought.id, thought);
    this.rebuildIndexStructures();
    this.persistIndex();
  }

  private ensureDataFiles(): void {
    if (!fs.existsSync(this.paths.thoughtsFile)) fs.writeFileSync(this.paths.thoughtsFile, "", "utf-8");
    if (!fs.existsSync(this.paths.summariesFile)) fs.writeFileSync(this.paths.summariesFile, "", "utf-8");
  }

  private loadThoughts(): void {
    this.thoughtsById.clear();
    this.idToOffset.clear();
    if (!fs.existsSync(this.paths.thoughtsFile)) return;
    const raw = fs.readFileSync(this.paths.thoughtsFile, "utf-8");
    if (!raw.trim()) return;

    const lines = raw.split("\n");
    let byteOffset = 0;
    for (const line of lines) {
      if (!line.trim()) {
        byteOffset += Buffer.byteLength(`${line}\n`, "utf-8");
        continue;
      }
      try {
        const item = JSON.parse(line) as Thought;
        this.thoughtsById.set(item.id, item);
        this.idToOffset.set(item.id, byteOffset);
      } catch {
        // Skip corrupted tail lines and recover available data.
      } finally {
        byteOffset += Buffer.byteLength(`${line}\n`, "utf-8");
      }
    }
  }

  private rebuildIndexStructures(): void {
    this.dayMap.clear();
    this.monthMap.clear();
    this.archivedIds.clear();

    for (const item of this.thoughtsById.values()) {
      const d = new Date(item.created_at);
      const day = `${d.getFullYear()}${`${d.getMonth() + 1}`.padStart(2, "0")}${`${d.getDate()}`.padStart(2, "0")}`;
      const month = `${d.getFullYear()}${`${d.getMonth() + 1}`.padStart(2, "0")}`;
      if (!this.dayMap.has(day)) this.dayMap.set(day, []);
      if (!this.monthMap.has(month)) this.monthMap.set(month, []);
      this.dayMap.get(day)!.push(item.id);
      this.monthMap.get(month)!.push(item.id);
      if (item.archived) this.archivedIds.add(item.id);
    }
  }

  private persistIndex(): void {
    const disk: DiskIndex = {
      dayMap: Object.fromEntries(this.dayMap),
      monthMap: Object.fromEntries(this.monthMap),
      archivedIds: [...this.archivedIds],
      idToOffset: Object.fromEntries(this.idToOffset),
      updatedAt: new Date().toISOString()
    };
    const tmp = `${this.paths.indexFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(disk), "utf-8");
    fs.renameSync(tmp, this.paths.indexFile);
  }

  getDataRoot(): string {
    return this.paths.dataRoot;
  }

  getPaths(): ReturnType<typeof resolveAppPaths> {
    return this.paths;
  }
}
