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

test("sent messages render selected skills in place without duplicate badges", () => {
  const dom = new JSDOM(renderToStaticMarkup(<UserMessage text={"先用 $review-taste 检查，再用 **$technical-doc-writing** 写说明。"} skills={["review-taste", "technical-doc-writing"]} />));
  const document = dom.window.document;
  assert.deepEqual([...document.querySelectorAll(".inline-skill-token")].map(node => node.textContent), ["✧ review-taste", "✧ technical-doc-writing"]);
  assert.equal(document.querySelector(".message-skills"), null);
  assert.equal(document.querySelector(".user-message-content")!.textContent, "先用 ✧ review-taste 检查，再用 ✧ technical-doc-writing 写说明。");
  assert.ok(document.querySelector("strong .inline-skill-token"));
  assert.equal(document.querySelector(".inline-skill-token button"), null);
  dom.window.close();
});

test("skill rendering preserves literal code, links and old messages with separate selection metadata", () => {
  const dom = new JSDOM(renderToStaticMarkup(<UserMessage text={"`$review-taste` [$review-taste](https://example.com) $unknown"} skills={["review-taste", "imagegen"]} />));
  assert.equal(dom.window.document.querySelectorAll(".inline-skill-token").length, 0);
  assert.equal(dom.window.document.querySelector("code")!.textContent, "$review-taste");
  assert.equal(dom.window.document.querySelector("a")!.textContent, "$review-taste");
  assert.equal(dom.window.document.querySelector(".message-skills")!.textContent, "imagegen");
  dom.window.close();
});

test("reference source metadata stays in the prompt without exposing internal ids in the message bubble", () => {
  const text = "[Reference 1](#message-item_internal-id):\n\n> Quoted sentence\n\nPlease explain.";
  const dom = new JSDOM(renderToStaticMarkup(<UserMessage text={text} />));
  assert.equal(dom.window.document.querySelector("blockquote")?.textContent?.trim(), "Quoted sentence");
  assert.ok(!dom.window.document.body.textContent?.includes("item_internal-id"));
  assert.match(dom.window.document.body.textContent ?? "", /Please explain/);
  dom.window.close();
});
