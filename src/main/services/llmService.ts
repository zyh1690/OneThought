import fs from "node:fs";
import crypto from "node:crypto";
import { resolveAppPaths } from "./paths";
import type { AppConfig, SummaryRecord, Thought } from "../types";

interface GenerateOptions {
  from: string;
  to: string;
  tags: string[];
  archived: boolean | null;
  type: "summary" | "mindmap";
  forceRefresh?: boolean;
  customPrompt?: string;
}

interface LlmResult {
  source: "cache" | "llm" | "disabled" | "error";
  content: string;
}

export class LlmService {
  private readonly file = resolveAppPaths().summariesFile;

  async generate(thoughts: Thought[], config: AppConfig, options: GenerateOptions): Promise<LlmResult> {
    if (!config.llmEnabled) {
      return { source: "disabled", content: "大模型功能已关闭，请在设置中开启。" };
    }
    const cacheKey = this.buildHash({
      baseUrl: config.llm.baseUrl,
      model: config.llm.model,
      from: options.from,
      to: options.to,
      tags: options.tags,
      archived: options.archived,
      type: options.type,
      inputHash: this.buildHash(thoughts.map((t) => `${t.id}:${t.updated_at}`).join("|"))
    });
    if (!options.forceRefresh) {
      const hit = this.findCache(cacheKey, options.type);
      if (hit) return { source: "cache", content: hit.content };
    }

    try {
      const content = await this.callOpenAiCompatible(thoughts, config, options.type, options.customPrompt);
      this.persistCache({
        id: crypto.randomUUID(),
        range: { from: options.from, to: options.to },
        filter: { tags: options.tags, archived: options.archived },
        created_at: new Date().toISOString(),
        type: options.type,
        content,
        llm_config_hash: cacheKey
      });
      return { source: "llm", content };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        source: "error",
        content: `大模型调用失败，已降级到本地功能。错误信息：${message}`
      };
    }
  }

  private async callOpenAiCompatible(
    thoughts: Thought[],
    config: AppConfig,
    type: "summary" | "mindmap",
    customPrompt?: string
  ): Promise<string> {
    const text = thoughts.map((item) => `- [${item.created_at}] ${item.content}`).join("\n");
    const summaryPrompt = customPrompt ?? config.aiSummaryPrompt ?? "请基于以下想法记录生成结构化总结，按主题归类并给出可执行建议。";
    const prompt =
      type === "summary"
        ? `${summaryPrompt}\n\n${text}`
        : `请把以下想法整理为思维导图的 Markdown 层级结构（仅返回 markdown 列表，不要解释）：\n${text}`;
    const body = {
      model: config.llm.model,
      messages: [
        { role: "system", content: "你是一个帮助用户整理想法的助手，输出要简洁实用。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
      max_tokens: config.llm.maxTokens
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);
    try {
      const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.llm.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content?.trim() || "模型未返回内容";
    } finally {
      clearTimeout(timer);
    }
  }

  private persistCache(record: SummaryRecord): void {
    fs.appendFileSync(this.file, `${JSON.stringify(record)}\n`, "utf-8");
  }

  private findCache(hash: string, type: "summary" | "mindmap"): SummaryRecord | null {
    if (!fs.existsSync(this.file)) return null;
    const content = fs.readFileSync(this.file, "utf-8");
    const lines = content.split("\n").filter(Boolean).reverse();
    for (const line of lines) {
      try {
        const item = JSON.parse(line) as SummaryRecord;
        if (item.type !== type) continue;
        if (item.llm_config_hash !== hash) continue;
        const ageMs = Date.now() - +new Date(item.created_at);
        if (ageMs > 24 * 60 * 60 * 1000) continue;
        return item;
      } catch {
        continue;
      }
    }
    return null;
  }

  private buildHash(value: unknown): string {
    return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
}
