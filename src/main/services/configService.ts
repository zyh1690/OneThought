import fs from "node:fs";
import { resolveAppPaths } from "./paths";
import type { AppConfig } from "../types";

const defaultConfig: AppConfig = {
  hotkey: "Super+T",
  autoLaunch: false,
  llmEnabled: false,
  theme: "light",
  aiSummaryPrompt: "请基于以下想法记录生成结构化总结，按主题归类并给出可执行建议。",
  llm: {
    baseUrl: "",
    apiKey: "",
    model: "",
    timeoutMs: 30000,
    maxTokens: 1200
  },
  backup: {
    autoDaily: true,
    maxFiles: 20
  }
};

export class ConfigService {
  private readonly configFile = resolveAppPaths().configFile;
  private cache: AppConfig | null = null;

  getConfig(): AppConfig {
    if (this.cache) return this.cache;
    if (!fs.existsSync(this.configFile)) {
      this.writeConfig(defaultConfig);
      return defaultConfig;
    }
    const raw = fs.readFileSync(this.configFile, "utf-8");
    this.cache = { ...defaultConfig, ...JSON.parse(raw) } as AppConfig;
    return this.cache;
  }

  updateConfig(patch: Partial<AppConfig>): AppConfig {
    const next = { ...this.getConfig(), ...patch } as AppConfig;
    this.writeConfig(next);
    return next;
  }

  private writeConfig(config: AppConfig): void {
    const tmp = `${this.configFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), "utf-8");
    fs.renameSync(tmp, this.configFile);
    this.cache = config;
  }
}
