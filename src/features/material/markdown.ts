const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeLink(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl, "https://local.invalid");
    return SAFE_LINK_PROTOCOLS.has(url.protocol) ? escapeHtml(url.href) : null;
  } catch {
    return null;
  }
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => {
      const href = safeLink(url);
      return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const html: string[] = [];
  let listType: "ol" | "ul" | null = null;

  const closeList = (): void => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    const listMatch = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (listMatch) {
      const nextType = /^\d/.test(listMatch[2]) ? "ol" : "ul";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        html.push(`<${nextType}>`);
      }
      html.push(`<li>${inlineMarkdown(listMatch[3])}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) continue;
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length + 2;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (line.startsWith("> ")) {
      html.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
    } else {
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }
  closeList();
  return html.join("");
}

function markdownFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const content = [...node.childNodes].map(markdownFromNode).join("");
  switch (node.tagName) {
    case "STRONG":
    case "B":
      return `**${content}**`;
    case "EM":
    case "I":
      return `*${content}*`;
    case "DEL":
    case "S":
      return `~~${content}~~`;
    case "CODE":
      return `\`${content}\``;
    case "A": {
      const href = safeLink(node.getAttribute("href") ?? "");
      return href ? `[${content}](${href.replaceAll("&amp;", "&")})` : content;
    }
    case "H1":
    case "H2":
    case "H3":
    case "H4":
      return `## ${content}\n\n`;
    case "BLOCKQUOTE":
      return content.split("\n").filter(Boolean).map((line) => `> ${line}`).join("\n") + "\n\n";
    case "LI":
      return `${node.parentElement?.tagName === "OL" ? "1." : "-"} ${content.trim()}\n`;
    case "UL":
    case "OL":
      return `${content}\n`;
    case "BR":
      return "\n";
    case "DIV":
    case "P":
      return `${content}\n\n`;
    default:
      return content;
  }
}

export function htmlToMarkdown(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  return [...template.content.childNodes]
    .map(markdownFromNode)
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
