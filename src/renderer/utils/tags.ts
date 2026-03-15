/** 匹配 #标签，支持中英文及任意非空白、非 # 的字符（Unicode） */
const TAG_RE = /#([^\s#]+)/gu;

export function extractTagsFromContent(content: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(content)) !== null) {
    set.add(m[1].trim());
  }
  return [...set];
}

export function renderContentWithTagPills(text: string, tagClass = "tag-pill"): (string | { type: "tag"; name: string })[] {
  const parts: (string | { type: "tag"; name: string })[] = [];
  let lastIndex = 0;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    parts.push({ type: "tag", name: m[1].trim() });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function clampText(text: string, maxLines: number, maxLength?: number): string {
  const lines = text.split(/\n/);
  if (lines.length > maxLines) {
    const joined = lines.slice(0, maxLines).join("\n");
    return maxLength && joined.length > maxLength ? joined.slice(0, maxLength) + "…" : joined + "…";
  }
  const result = lines.join("\n");
  if (maxLength && result.length > maxLength) return result.slice(0, maxLength) + "…";
  return result;
}
