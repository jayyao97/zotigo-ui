import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { UserMessage } from "../src/conversation/ConversationTimeline";

test("user prompts preserve soft line breaks and compact Markdown without heading elements", () => {
  const text = "第一行\n第二行 **没有**\n\n# 普通大小的标题\n\n- 列表一\n- 列表二\n\n1. 有序列表\n\n`inline` [链接](https://example.com)\n\n```js\nconst a = 1;\nconst b = 2;\n```\n\n| 名称 | 值 |\n| --- | --- |\n| a | b |";
  const dom = new JSDOM(renderToStaticMarkup(<UserMessage text={text} />));
  const content = dom.window.document.querySelector(".user-message-content")!;
  assert.match(content.querySelector("p")!.innerHTML, /第一行<br>\n第二行 <strong>没有<\/strong>/);
  assert.equal(content.querySelector("h1,h2,h3,h4,h5,h6"), null);
  assert.ok([...content.querySelectorAll("p")].some((p) => p.textContent === "普通大小的标题"));
  assert.equal(content.querySelectorAll("ul > li").length, 2);
  assert.equal(content.querySelectorAll("ol > li").length, 1);
  assert.equal(content.querySelector("a")!.getAttribute("href"), "https://example.com");
  assert.equal(content.querySelector("p > code")!.textContent, "inline");
  assert.equal(content.querySelector("pre code")!.textContent, "const a = 1;\nconst b = 2;\n");
  assert.equal(content.querySelectorAll("table tbody tr").length, 1);
  dom.window.close();
});

test("explicit Markdown breaks do not duplicate and list soft breaks are preserved", () => {
  const dom = new JSDOM(renderToStaticMarkup(<UserMessage text={"a  \nb\nc\n\n- first\n  continuation"} />));
  assert.equal(dom.window.document.querySelectorAll("p br").length, 2);
  assert.equal(dom.window.document.querySelectorAll("li br").length, 1);
  dom.window.close();
});
