import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AppConfig, GroupedThoughts, Thought } from "../main/types";

type ViewMode = "day" | "month";
type FilterMode = "all" | "active" | "archived";

function isQuickMode(): boolean {
  return new URLSearchParams(window.location.search).get("quick") === "1";
}

function hasElectronApi(): boolean {
  return typeof window !== "undefined" && "oneThought" in window && typeof (window as Window).oneThought !== "undefined";
}

function NoElectronFallback() {
  return (
    <div className="layout" style={{ padding: 24, textAlign: "center" }}>
      <h2>请使用 Electron 运行本应用</h2>
      <p>在项目目录执行：<code>npm run dev</code> 或 <code>npm start</code></p>
      <p style={{ color: "#97a3c3", fontSize: 14 }}>不要直接在浏览器中打开 localhost，否则无法连接本地数据与快捷键。</p>
    </div>
  );
}

export function App() {
  if (!hasElectronApi()) return <NoElectronFallback />;
  return isQuickMode() ? <QuickCapture /> : <MainScreen />;
}

function QuickCapture() {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim() || !hasElectronApi()) return;
    await window.oneThought.createThought({ content, source: "quick_input" });
    setSaved(true);
    setContent("");
    setTimeout(() => setSaved(false), 1000);
  };

  return (
    <div className="quick-wrap">
      <h2>快速记录</h2>
      <form onSubmit={onSubmit}>
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="输入你的想法，回车提交（Shift+Enter 换行）"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSubmit(e as unknown as FormEvent);
            }
          }}
        />
        <button type="submit">保存</button>
      </form>
      {saved && <div className="ok-tip">已保存</div>}
    </div>
  );
}

function MainScreen() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [groups, setGroups] = useState<GroupedThoughts[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [tagInput, setTagInput] = useState("");
  const [newThought, setNewThought] = useState("");
  const [summary, setSummary] = useState("");
  const [mindmap, setMindmap] = useState("");
  const [loadingLlm, setLoadingLlm] = useState(false);
  const [backups, setBackups] = useState<string[]>([]);

  const activeTags = useMemo(
    () =>
      tagInput
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    [tagInput]
  );

  async function reload() {
    if (!hasElectronApi()) return;
    const archived = filterMode === "all" ? null : filterMode === "archived";
    const items = await window.oneThought.listThoughts({
      viewMode,
      archived,
      tags: activeTags
    });
    setGroups(items);
  }

  async function loadBase() {
    if (!hasElectronApi()) return;
    const cfg = await window.oneThought.getConfig();
    setConfig(cfg);
    await reload();
    setBackups(await window.oneThought.listBackups());
  }

  useEffect(() => {
    if (!hasElectronApi()) return;
    void loadBase();
    const off = window.oneThought.onThoughtUpdated(() => void reload());
    return () => { off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, filterMode, tagInput]);

  const submitMainThought = async () => {
    if (!newThought.trim()) return;
    await window.oneThought.createThought({ content: newThought, tags: activeTags, source: "main_ui" });
    setNewThought("");
  };

  const toggleArchive = async (item: Thought) => {
    await window.oneThought.archiveThought(item.id, !item.archived);
  };

  const updateConfig = async (patch: Partial<AppConfig>) => {
    const result = await window.oneThought.updateConfig(patch);
    setConfig(result.config);
    if (!result.hotkeyRegistered) {
      alert("热键注册失败，可能与其他软件冲突，请更换组合键。");
    }
  };

  const generateWithLlm = async (type: "summary" | "mindmap") => {
    setLoadingLlm(true);
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = now.toISOString();
    const archived = filterMode === "all" ? null : filterMode === "archived";
    const result = await window.oneThought.generateLlm({
      from,
      to,
      tags: activeTags,
      archived,
      type
    });
    if (type === "summary") setSummary(`${result.source.toUpperCase()}\n\n${result.content}`);
    else setMindmap(`${result.source.toUpperCase()}\n\n${result.content}`);
    setLoadingLlm(false);
  };

  const createBackup = async () => {
    await window.oneThought.createBackup("manual");
    setBackups(await window.oneThought.listBackups());
  };

  const restoreBackup = async (filename: string) => {
    if (!confirm(`确认恢复备份 ${filename} 吗？会覆盖当前数据。`)) return;
    await window.oneThought.restoreBackup(filename);
    await loadBase();
  };

  return (
    <div className="layout">
      <header className="toolbar">
        <h1>OneThought</h1>
        <div className="row">
          <button onClick={() => setViewMode("day")} className={viewMode === "day" ? "active" : ""}>
            按天
          </button>
          <button onClick={() => setViewMode("month")} className={viewMode === "month" ? "active" : ""}>
            按月
          </button>
          <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as FilterMode)}>
            <option value="all">全部</option>
            <option value="active">仅活跃</option>
            <option value="archived">仅归档</option>
          </select>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="标签筛选（逗号分隔）"
          />
        </div>
      </header>

      <main className="main-grid">
        <section className="panel">
          <h3>新增想法</h3>
          <textarea value={newThought} onChange={(e) => setNewThought(e.target.value)} />
          <button onClick={submitMainThought}>保存</button>
          <button onClick={() => hasElectronApi() && window.oneThought.compactThoughts()}>数据整理(Compact)</button>
          <div className="timeline">
            {groups.map((group) => (
              <div key={group.groupKey} className="group">
                <h4>{group.groupKey}</h4>
                {group.items.map((item) => (
                  <div key={item.id} className="card">
                    <div className="meta">
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                      <span>{item.tags.join(", ") || "无标签"}</span>
                    </div>
                    <p>{item.content}</p>
                    <button onClick={() => toggleArchive(item)}>{item.archived ? "激活" : "归档"}</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3>AI 总结 / 思维导图</h3>
          <div className="row">
            <button disabled={loadingLlm} onClick={() => generateWithLlm("summary")}>
              生成最近7天总结
            </button>
            <button disabled={loadingLlm} onClick={() => generateWithLlm("mindmap")}>
              生成最近7天导图
            </button>
          </div>
          <pre>{summary || "暂无总结"}</pre>
          <pre>{mindmap || "暂无导图"}</pre>
        </section>

        <section className="panel">
          <h3>设置</h3>
          {config && (
            <>
              <label>
                快捷键
                <input
                  value={config.hotkey}
                  onChange={(e) => setConfig({ ...config, hotkey: e.target.value })}
                  onBlur={() => void updateConfig({ hotkey: config.hotkey })}
                />
              </label>
              <label>
                开机自启
                <input
                  type="checkbox"
                  checked={config.autoLaunch}
                  onChange={(e) => void updateConfig({ autoLaunch: e.target.checked })}
                />
              </label>
              <label>
                启用大模型
                <input
                  type="checkbox"
                  checked={config.llmEnabled}
                  onChange={(e) => void updateConfig({ llmEnabled: e.target.checked })}
                />
              </label>
              <label>
                LLM Base URL
                <input
                  value={config.llm.baseUrl}
                  onChange={(e) => setConfig({ ...config, llm: { ...config.llm, baseUrl: e.target.value } })}
                  onBlur={() => void updateConfig({ llm: config.llm })}
                />
              </label>
              <label>
                Model
                <input
                  value={config.llm.model}
                  onChange={(e) => setConfig({ ...config, llm: { ...config.llm, model: e.target.value } })}
                  onBlur={() => void updateConfig({ llm: config.llm })}
                />
              </label>
              <label>
                API Key
                <input
                  type="password"
                  value={config.llm.apiKey}
                  onChange={(e) => setConfig({ ...config, llm: { ...config.llm, apiKey: e.target.value } })}
                  onBlur={() => void updateConfig({ llm: config.llm })}
                />
              </label>
            </>
          )}
          <h4>备份管理</h4>
          <button onClick={createBackup}>创建备份</button>
          <div className="backup-list">
            {backups.map((file) => (
              <div key={file} className="backup-row">
                <span>{file}</span>
                <button onClick={() => void restoreBackup(file)}>恢复</button>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
