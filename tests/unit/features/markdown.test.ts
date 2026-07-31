import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../../src/features/material/markdown.js";

describe("renderMarkdown", () => {
  it("renders the supported formatting", () => {
    expect(renderMarkdown("## Word\n\n**bold** and *italic*\n\n- one\n- two"))
      .toBe("<h4>Word</h4><p><strong>bold</strong> and <em>italic</em></p><ul><li>one</li><li>two</li></ul>");
  });

  it("escapes HTML and rejects executable links", () => {
    const rendered = renderMarkdown("<img src=x onerror=alert(1)>\n[bad](javascript:alert(1))");
    expect(rendered).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(rendered).not.toContain("<img");
    expect(rendered).not.toContain("javascript:");
  });
});
