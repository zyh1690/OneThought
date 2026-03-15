import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import type { AppConfig, GroupedThoughts, Thought } from "../main/types";
import { extractTagsFromContent, clampText } from "./utils/tags";

function isQuickMode(): boolean {
  return new URLSearchParams(window.location.search).get("quick") === "1";
}

function hasElectronApi(): boolean {
  return typeof window !== "undefined" && "oneThought" in window && typeof (window as Window).oneThought !== "undefined";
}

function NoElectronFallback() {
  return (
    <div className="no-electron">
      <h2>请使用 Electron 运行本应用</h2>
      <p>在项目目录执行：<code>npm run dev</code> 或 <code>npm start</code></p>
    </div>
  );
}

const TAG_COLORS = ["0", "1", "2", "3", "4"] as const;
function tagColorIndex(tag: string, allTags: string[]): string {
  const i = allTags.indexOf(tag);
  return TAG_COLORS[i % TAG_COLORS.length];
}

export function App() {
  if (!hasElectronApi()) return <NoElectronFallback />;
  return isQuickMode() ? <QuickCapture /> : <MainApp />;
}

function QuickCapture() {
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "success">("idle");
  const [tagSuggestionIndex, setTagSuggestionIndex] = useState(0);
  const [allThoughtsForTags, setAllThoughtsForTags] = useState<Thought[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const tags = useMemo(() => extractTagsFromContent(content), [content]);
  const allTags = useMemo(() => {
    const set = new Set<string>();
    allThoughtsForTags.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [allThoughtsForTags]);

  useEffect(() => {
    document.documentElement.setAttribute("data-quick-capture", "true");
    return () => document.documentElement.removeAttribute("data-quick-capture");
  }, []);

  useEffect(() => {
    if (!hasElectronApi() || typeof window.oneThought.setQuickCaptureHeight !== "function") return;
    const reportHeight = () => {
      const h = document.documentElement.scrollHeight;
      window.oneThought.setQuickCaptureHeight(h);
    };
    const el = wrapRef.current;
    if (!el) return;
    reportHeight();
    const ro = new ResizeObserver(() => reportHeight());
    ro.observe(el);
    return () => ro.disconnect();
  }, [allThoughtsForTags.length, content]);

  useEffect(() => {
    if (hasElectronApi()) void window.oneThought.listAllThoughts().then(setAllThoughtsForTags);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setSaveStatus("idle");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const saveAndClose = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!content.trim() || !hasElectronApi()) return;
    await window.oneThought.createThought({
      content: content.trim(),
      tags,
      source: "quick_input"
    });
    setSaveStatus("success");
    setContent("");
    setTimeout(() => window.oneThought.closeQuickCapture?.(), 1200);
  };

  const closeWithoutSave = (e?: MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (hasElectronApi() && window.oneThought.closeQuickCapture) {
      void window.oneThought.closeQuickCapture();
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setSaveStatus("idle");
  };

  return (
    <div ref={wrapRef} className="quick-capture-wrap">
      <div className="quick-capture-header">
        <h2>OneThought</h2>
        <button type="button" className="modal-close quick-capture-close" onClick={(e) => closeWithoutSave(e)} title="关闭">
          ×
        </button>
      </div>
      <form onSubmit={saveAndClose}>
        <div className="input-with-suggestions">
          <textarea
            className="input-area quick-capture-input"
            autoFocus
            value={content}
            onChange={handleContentChange}
            placeholder="输入想法，输入 # 显示标签列表，方向键选择、回车确认；或输入 #标签 后空格确认，回车保存并关闭（Shift+Enter 换行）"
            onKeyDown={(e) => {
              const hashMatch = content.match(/#([^\s#]*)$/u);
              const prefix = hashMatch ? hashMatch[1] : "";
              const prefixLower = prefix.toLowerCase();
              let suggestions: string[] = hashMatch
                ? (prefixLower
                    ? allTags.filter((t) => t.toLowerCase().startsWith(prefixLower))
                    : allTags.slice(0, 10))
                : allTags.slice(0, 15);
              if (hashMatch && prefix && !suggestions.includes(prefix)) suggestions = [prefix, ...suggestions];
              if (e.key === "Enter" && !e.shiftKey) {
                if (hashMatch && suggestions.length > 0 && suggestions[tagSuggestionIndex]) {
                  e.preventDefault();
                  const t = suggestions[tagSuggestionIndex];
                  const before = content.replace(/#[^\s#]*$/u, "");
                  setContent((before === "" ? before : before + " ") + "#" + t + " ");
                  setTagSuggestionIndex(0);
                  return;
                }
                e.preventDefault();
                void saveAndClose();
                return;
              }
              if (e.nativeEvent.isComposing) return;
              if (suggestions.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setTagSuggestionIndex((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setTagSuggestionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === " " && hashMatch && prefix) {
                e.preventDefault();
                const before = content.replace(/#[^\s#]*$/u, "");
                setContent(before + "#" + prefix + " ");
                setTagSuggestionIndex(0);
              }
            }}
          />
          {(() => {
            const hashMatch = content.match(/#([^\s#]*)$/u);
            const prefix = hashMatch ? hashMatch[1] : "";
            const prefixLower = prefix.toLowerCase();
            let suggestions: string[] = hashMatch
              ? (prefixLower
                  ? allTags.filter((t) => t.toLowerCase().startsWith(prefixLower))
                  : allTags.slice(0, 10))
              : allTags.slice(0, 15);
            if (hashMatch && prefix && !suggestions.includes(prefix)) suggestions = [prefix, ...suggestions];
            if (suggestions.length === 0) return null;
            const idx = Math.min(tagSuggestionIndex, suggestions.length - 1);
            return (
              <div className="tag-suggestions" role="listbox">
                {suggestions.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    role="option"
                    className="tag-suggestion-chip"
                    data-color={tagColorIndex(t, allTags)}
                    onClick={() => {
                      const before = hashMatch ? content.replace(/#[^\s#]*$/u, "") : content;
                      setContent((before === "" ? before : before + " ") + "#" + t + " ");
                      setTagSuggestionIndex(0);
                    }}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
        <div className="input-actions quick-capture-actions">
          <button type="submit" className={`btn-save quick-capture-save-btn ${saveStatus === "success" ? "success" : ""}`}>
            {saveStatus === "success" ? "✓ 已保存" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}

type Page = "home" | "archive";
type TimeRangePreset = "all" | "7" | "30" | "custom";

function MainApp() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [groups, setGroups] = useState<GroupedThoughts[]>([]);
  const [archiveList, setArchiveList] = useState<Thought[]>([]);
  const [page, setPage] = useState<Page>("home");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [timePreset, setTimePreset] = useState<TimeRangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [newThought, setNewThought] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "success">("idle");
  const [tagSuggestionIndex, setTagSuggestionIndex] = useState(0);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [loadingLlm, setLoadingLlm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailThought, setDetailThought] = useState<Thought | null>(null);
  const [detailEditContent, setDetailEditContent] = useState("");
  const [allThoughtsForTags, setAllThoughtsForTags] = useState<Thought[]>([]);

  const theme = config?.theme ?? "light";
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    allThoughtsForTags.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [allThoughtsForTags]);

  const tagCount = useMemo(() => {
    const count: Record<string, number> = {};
    allThoughtsForTags
      .filter((t) => !t.archived)
      .forEach((t) => {
        t.tags.forEach((tag) => {
          count[tag] = (count[tag] ?? 0) + 1;
        });
      });
    return count;
  }, [allThoughtsForTags]);

  const timeRange = useMemo(() => {
    const now = new Date();
    if (timePreset === "all") {
      return {
        from: new Date(0).toISOString(),
        to: now.toISOString()
      };
    }
    if (timePreset === "7") {
      return {
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString()
      };
    }
    if (timePreset === "30") {
      return {
        from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString()
      };
    }
    const from =
      typeof customFrom === "string" && customFrom.length === 8
        ? new Date(customFrom.slice(0, 4) + "-" + customFrom.slice(4, 6) + "-" + customFrom.slice(6, 8) + "T00:00:00").toISOString()
        : new Date(0).toISOString();
    const to =
      typeof customTo === "string" && customTo.length === 8
        ? new Date(customTo.slice(0, 4) + "-" + customTo.slice(4, 6) + "-" + customTo.slice(6, 8) + "T23:59:59").toISOString()
        : new Date().toISOString();
    return { from, to };
  }, [timePreset, customFrom, customTo]);

  const loadBase = useCallback(async () => {
    if (!hasElectronApi()) return;
    const cfg = await window.oneThought.getConfig();
    setConfig(cfg);
    setAiPrompt(cfg.aiSummaryPrompt ?? "");
  }, []);

  const reload = useCallback(async () => {
    if (!hasElectronApi()) return;
    const all = await window.oneThought.listAllThoughts();
    setAllThoughtsForTags(all);
    setArchiveList(all.filter((t) => t.archived));
    // 请求时用“当前时刻”作为 to，避免 timeRange 来自上次渲染导致刚保存的条目被截断
    const nowIso = new Date().toISOString();
    const effectiveTo = timePreset === "all" || timePreset === "7" || timePreset === "30" ? nowIso : timeRange.to;
    const options: Parameters<typeof window.oneThought.listThoughts>[0] = {
      viewMode: "day",
      archived: false,
      tags: selectedTag ? [selectedTag] : undefined,
      from: timeRange.from,
      to: effectiveTo
    };
    const items = await window.oneThought.listThoughts(options);
    setGroups(items);
  }, [selectedTag, timeRange, timePreset]);

  useEffect(() => {
    void loadBase();
    const off = window.oneThought.onThoughtUpdated(() => {
      void reload();
    });
    return () => { off?.(); };
  }, [loadBase, reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submitThought = async () => {
    if (!newThought.trim() || !hasElectronApi()) return;
    const tags = extractTagsFromContent(newThought);
    await window.oneThought.createThought({ content: newThought.trim(), tags, source: "main_ui" });
    setNewThought("");
    setSaveStatus("success");
    await reload();
    setTimeout(() => setSaveStatus("idle"), 1200);
  };

  const updateConfig = async (patch: Partial<AppConfig>) => {
    const result = await window.oneThought.updateConfig(patch);
    setConfig(result.config);
    if (patch.aiSummaryPrompt !== undefined) setAiPrompt(result.config.aiSummaryPrompt);
    if (Object.hasOwn(patch, "hotkey") && !result.hotkeyRegistered) {
      alert("热键注册失败，可能与其他软件冲突，请更换组合键。");
    }
  };

  const generateSummary = async () => {
    setLoadingLlm(true);
    setAiResult("生成中…");
    const promptToUse = aiPrompt.trim() || config?.aiSummaryPrompt;
    if (promptToUse) await updateConfig({ aiSummaryPrompt: promptToUse });
    const result = await window.oneThought.generateLlm({
      from: timeRange.from,
      to: timeRange.to,
      tags: selectedTag ? [selectedTag] : [],
      archived: false,
      type: "summary",
      customPrompt: promptToUse || undefined
    });
    setAiResult(result.content);
    setLoadingLlm(false);
  };

  const restoreFromArchive = async (id: string) => {
    await window.oneThought.archiveThought(id, false);
  };

  const deletePermanently = async (id: string) => {
    if (!confirm("确定彻底删除这条想法？此操作不可恢复。")) return;
    await window.oneThought.deleteThought(id);
  };

  const clearArchive = async () => {
    if (!confirm("确定清空归档？所有已归档想法将被彻底删除，不可恢复。")) return;
    for (const t of archiveList) {
      await window.oneThought.deleteThought(t.id);
    }
  };

  return (
    <div className="app-three-col">
      <aside className="left-sidebar">
        <nav>
          <button
            type="button"
            className={`nav-btn ${page === "home" ? "active" : ""}`}
            onClick={() => setPage("home")}
          >
            <span className="nav-btn-icon" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </span>
            Home
          </button>
          <button
            type="button"
            className={`nav-btn ${page === "archive" ? "active" : ""}`}
            onClick={() => setPage("archive")}
          >
            <span className="nav-btn-icon" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            </span>
            Archive
          </button>
        </nav>
        <div className="tag-cloud">
          {allTags.map((tag) => {
            const count = tagCount[tag] ?? 0;
            const showDelete = count === 0;
            return (
              <span key={tag} className="tag-chip-wrap">
                <button
                  type="button"
                  className={`tag-chip ${selectedTag === tag ? "selected" : ""}`}
                  data-color={tagColorIndex(tag, allTags)}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  title={selectedTag === tag ? "点击取消筛选" : `按 #${tag} 筛选`}
                >
                  #{tag}({count})
                </button>
                {showDelete && hasElectronApi() && (
                  <button
                    type="button"
                    className="tag-chip-delete"
                    onClick={async (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (window.oneThought.removeTag) {
                        await window.oneThought.removeTag(tag);
                        await reload();
                      }
                    }}
                    title="删除该标签"
                    aria-label="删除该标签"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <div className="settings-gear">
          <button type="button" className="settings-gear-btn" onClick={() => setSettingsOpen(true)}>
            <span className="gear-icon" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </span> Settings
          </button>
        </div>
      </aside>

      <main className="main-content">
        {page === "home" && (
          <>
            <section className="input-section">
              <h2>OneThought</h2>
              <div className="input-with-suggestions">
                <textarea
                  className="input-area"
                  value={newThought}
                  onChange={(e) => setNewThought(e.target.value)}
                  placeholder="输入想法，输入 # 显示标签列表，方向键选择、回车确认；或输入 #标签 后空格确认"
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    const hashMatch = newThought.match(/#([^\s#]*)$/u);
                    const prefix = hashMatch ? hashMatch[1] : "";
                    const prefixLower = prefix.toLowerCase();
                    let suggestions: string[] = hashMatch
                      ? (prefixLower
                          ? allTags.filter((t) => t.toLowerCase().startsWith(prefixLower))
                          : allTags.slice(0, 10))
                      : allTags.slice(0, 15);
                    if (hashMatch && prefix && !suggestions.includes(prefix)) suggestions = [prefix, ...suggestions];
                    if (suggestions.length === 0) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setTagSuggestionIndex((i) => (i + 1) % suggestions.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setTagSuggestionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
                      return;
                    }
                    if (e.key === "Enter" && hashMatch && suggestions[tagSuggestionIndex]) {
                      e.preventDefault();
                      const t = suggestions[tagSuggestionIndex];
                      const before = newThought.replace(/#[^\s#]*$/u, "");
                      setNewThought((before === "" ? before : before + " ") + "#" + t + " ");
                      setTagSuggestionIndex(0);
                    }
                    if (e.key === " " && hashMatch && prefix) {
                      e.preventDefault();
                      const before = newThought.replace(/#[^\s#]*$/u, "");
                      setNewThought(before + "#" + prefix + " ");
                      setTagSuggestionIndex(0);
                    }
                  }}
                />
                {(() => {
                  const hashMatch = newThought.match(/#([^\s#]*)$/u);
                  const prefix = hashMatch ? hashMatch[1] : "";
                  const prefixLower = prefix.toLowerCase();
                  let suggestions: string[] = hashMatch
                    ? (prefixLower
                        ? allTags.filter((t) => t.toLowerCase().startsWith(prefixLower))
                        : allTags.slice(0, 10))
                    : allTags.slice(0, 15);
                  if (hashMatch && prefix && !suggestions.includes(prefix)) suggestions = [prefix, ...suggestions];
                  if (suggestions.length === 0) return null;
                  const idx = Math.min(tagSuggestionIndex, suggestions.length - 1);
                  return (
                    <div className="tag-suggestions" role="listbox">
                      {suggestions.map((t, i) => (
                        <button
                          key={t}
                          type="button"
                          role="option"
                          className="tag-suggestion-chip"
                          data-color={tagColorIndex(t, allTags)}
                          onClick={() => {
                            const before = hashMatch ? newThought.replace(/#[^\s#]*$/u, "") : newThought;
                            setNewThought((before === "" ? before : before + " ") + "#" + t + " ");
                            setTagSuggestionIndex(0);
                          }}
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="input-actions">
                <button
                  type="button"
                  className={`btn-save ${saveStatus === "success" ? "success" : ""}`}
                  onClick={submitThought}
                >
                  {saveStatus === "success" ? "✓ 已保存" : "保存"}
                </button>
              </div>
            </section>
            <div className="thought-list timeline-wrap">
              {groups.map((group) => (
                <div key={group.groupKey} className="timeline-group">
                  <h4 className="timeline-group-title">{group.groupKey}</h4>
                  <div className="timeline-track">
                    {group.items.map((item) => (
                      <div key={item.id} className="timeline-item">
                        <div className="timeline-dot" />
                        <div className="timeline-card-wrap">
                          <ThoughtCard
                            thought={item}
                            allTags={allTags}
                            onViewDetail={() => { setDetailEditContent(""); setDetailThought(item); }}
                            onArchive={() => window.oneThought.archiveThought(item.id, true)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {page === "archive" && (
          <div className="archive-page" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="archive-toolbar">
              <span>归档</span>
              <button type="button" className="btn-save" style={{ background: "var(--danger)" }} onClick={clearArchive}>
                清空归档
              </button>
            </div>
            <div className="archive-list">
              {archiveList.map((item) => (
                <div key={item.id} className="thought-card">
                  <div className="card-meta">
                    <span>{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  <div className="card-content">{clampText(item.content, 2, 120)}</div>
                  {item.tags.length > 0 && (
                    <div className="card-tags">
                      {item.tags.map((t) => (
                        <span key={t} className="tag-pill" data-color={tagColorIndex(t, allTags)}>#{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="card-actions">
                    <button type="button" onClick={() => { setDetailEditContent(""); setDetailThought(item); }}>查看详情</button>
                    <button type="button" className="primary" onClick={() => restoreFromArchive(item.id)}>恢复</button>
                    <button type="button" onClick={() => deletePermanently(item.id)}>彻底删除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <aside className="right-bar">
        <div className="time-filter">
          <h3>时间范围</h3>
          <div className="quick-range">
            <button type="button" className={timePreset === "all" ? "active" : ""} onClick={() => setTimePreset("all")}>
              全部
            </button>
            <button type="button" className={timePreset === "7" ? "active" : ""} onClick={() => setTimePreset("7")}>
              近7天
            </button>
            <button type="button" className={timePreset === "30" ? "active" : ""} onClick={() => setTimePreset("30")}>
              近30天
            </button>
            <button type="button" className={timePreset === "custom" ? "active" : ""} onClick={() => setTimePreset("custom")}>
              自定义
            </button>
          </div>
          {timePreset === "custom" && (
            <div className="custom-range">
              <input
                type="date"
                value={typeof customFrom === "string" && customFrom.length === 8 ? `${customFrom.slice(0, 4)}-${customFrom.slice(4, 6)}-${customFrom.slice(6, 8)}` : ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/-/g, "");
                  if (v.length === 8) setCustomFrom(v);
                }}
              />
              <span>至</span>
              <input
                type="date"
                value={typeof customTo === "string" && customTo.length === 8 ? `${customTo.slice(0, 4)}-${customTo.slice(4, 6)}-${customTo.slice(6, 8)}` : ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/-/g, "");
                  if (v.length === 8) setCustomTo(v);
                }}
              />
            </div>
          )}
        </div>
        <div className="ai-summary">
          <h3>AI 总结</h3>
          <textarea
            className="prompt-area"
            placeholder="默认提示词，可编辑"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onBlur={() => aiPrompt.trim() && config && void updateConfig({ aiSummaryPrompt: aiPrompt.trim() })}
          />
          <button type="button" className="generate-btn" disabled={loadingLlm} onClick={generateSummary}>
            生成总结
          </button>
          <pre className="result">{aiResult || "暂无总结"}</pre>
        </div>
      </aside>

      {detailThought && (
        <DetailEditModal
          thought={detailThought}
          allTags={allTags}
          initialContent={detailEditContent ? detailEditContent : detailThought.content}
          onClose={() => {
            setDetailThought(null);
            setDetailEditContent("");
          }}
          onSave={async (content, tags) => {
            await window.oneThought.updateThought(detailThought.id, { content, tags });
            await reload();
            setDetailThought(null);
            setDetailEditContent("");
          }}
        />
      )}

      {settingsOpen && config && (
        <SettingsModal config={config} onClose={() => setSettingsOpen(false)} onUpdate={updateConfig} />
      )}
    </div>
  );
}

function ThoughtCard({
  thought,
  allTags,
  onViewDetail,
  onArchive
}: {
  thought: Thought;
  allTags: string[];
  onViewDetail: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="thought-card">
      <div className="card-meta card-meta-with-tags">
        <span>{new Date(thought.created_at).toLocaleString()}</span>
        {thought.tags.length > 0 && (
          <div className="card-tags">
            {thought.tags.map((t) => (
              <span key={t} className="tag-pill" data-color={tagColorIndex(t, allTags)}>#{t}</span>
            ))}
          </div>
        )}
      </div>
      <div className="card-content">{clampText(thought.content, 2, 120)}</div>
      <div className="card-actions card-actions-right">
        <button type="button" onClick={onViewDetail}>查看详情</button>
        <button type="button" onClick={onArchive}>归档</button>
      </div>
    </div>
  );
}

function DetailEditModal({
  thought,
  allTags,
  initialContent,
  onClose,
  onSave
}: {
  thought: Thought;
  allTags: string[];
  initialContent: string;
  onClose: () => void;
  onSave: (content: string, tags: string[]) => Promise<void>;
}) {
  const [content, setContent] = useState(initialContent);
  useEffect(() => { setContent(initialContent); }, [initialContent]);

  const handleSave = async () => {
    const tags = extractTagsFromContent(content);
    await onSave(content.trim(), tags);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box detail-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{new Date(thought.created_at).toLocaleString()}</span>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {thought.tags.length > 0 && (
            <div className="card-tags" style={{ marginBottom: 8 }}>
              {thought.tags.map((t) => (
                <span key={t} className="tag-pill" data-color={tagColorIndex(t, allTags)}>#{t}</span>
              ))}
            </div>
          )}
          <textarea
            className="detail-edit-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="编辑内容，支持 #标签 与 Markdown"
          />
          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>取消</button>
            <button type="button" className="btn-save" onClick={handleSave}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAccelerator(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push("Super");
  if (e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (key !== "Meta" && key !== "Control" && key !== "Alt" && key !== "Shift") {
    parts.push(key);
  }
  return parts.join("+");
}

function isModifierKey(key: string): boolean {
  return key === "Meta" || key === "Control" || key === "Alt" || key === "Shift";
}

function SettingsModal({
  config,
  onClose,
  onUpdate
}: {
  config: AppConfig;
  onClose: () => void;
  onUpdate: (patch: Partial<AppConfig>) => Promise<void>;
}) {
  const [local, setLocal] = useState(config);
  const [recordingHotkey, setRecordingHotkey] = useState(false);
  useEffect(() => { setLocal(config); }, [config]);

  useEffect(() => {
    if (!recordingHotkey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setRecordingHotkey(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (isModifierKey(e.key)) return;
      const acc = formatAccelerator(e);
      if (acc) {
        setLocal((prev) => ({ ...prev, hotkey: acc }));
        setRecordingHotkey(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingHotkey]);

  const handleSave = async () => {
    await onUpdate({
      theme: local.theme,
      hotkey: local.hotkey,
      autoLaunch: local.autoLaunch,
      llmEnabled: true,
      llm: local.llm
    });
    onClose();
  };

  return (
    <div className="modal-overlay settings-modal" onClick={onClose}>
      <div className="modal-box settings-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>设置</span>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body settings-modal-body">
          <label>
            <span className="settings-label-text">主题</span>
            <select
              className="settings-input"
              value={local.theme}
              onChange={(e) => setLocal({ ...local, theme: e.target.value as "light" | "dark" })}
            >
              <option value="light">浅色 (Light)</option>
              <option value="dark">深色 (Dark)</option>
            </select>
          </label>
          <label className="settings-hotkey-row">
            <span className="settings-label-text">快捷键</span>
            <div className="settings-hotkey-wrap">
              <button
                type="button"
                className="settings-hotkey-input"
                onClick={() => setRecordingHotkey(true)}
                data-recording={recordingHotkey ? "true" : undefined}
              >
                {recordingHotkey ? "请按键" : (local.hotkey || "点击设置")}
              </button>
              <button
                type="button"
                className="settings-hotkey-clear"
                onClick={() => setLocal((prev) => ({ ...prev, hotkey: "" }))}
                title="清空快捷键"
                aria-label="清空快捷键"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </label>
          <label className="settings-checkbox">
            <input type="checkbox" checked={local.autoLaunch} onChange={(e) => setLocal({ ...local, autoLaunch: e.target.checked })} />
            开机自启
          </label>
          <div className="settings-section-title">大模型</div>
          <label>
            <span className="settings-label-text">LLM Base URL</span>
            <input
              className="settings-input"
              value={local.llm.baseUrl}
              onChange={(e) => setLocal({ ...local, llm: { ...local.llm, baseUrl: e.target.value } })}
            />
          </label>
          <label>
            <span className="settings-label-text">Model</span>
            <input
              className="settings-input"
              value={local.llm.model}
              onChange={(e) => setLocal({ ...local, llm: { ...local.llm, model: e.target.value } })}
            />
          </label>
          <label>
            <span className="settings-label-text">API Key</span>
            <input
              type="password"
              className="settings-input"
              value={local.llm.apiKey}
              onChange={(e) => setLocal({ ...local, llm: { ...local.llm, apiKey: e.target.value } })}
            />
          </label>
          <div className="settings-footer">
            <button type="button" className="btn-save" onClick={handleSave}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}
