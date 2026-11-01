import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { updateSidebarClipping } from "../src/sidebarClipping";

test("sticky ancestors clip session paint and tree lines without clipping menus", () => {
  const dom = new JSDOM(`<div id="scroll"><section class="sidebar-section">
    <div class="sidebar-section-heading" id="section"><button id="section-button">Projects</button></div>
    <div><div class="project-group">
      <div class="project-row-shell" id="project"><button id="project-button">Project</button></div>
      <div><div class="workspace-list" id="tree"><div class="workspace-group">
        <div class="workspace-row-shell" id="workspace"><button id="workspace-button">Workspace</button>
          <div class="workspace-row-actions"><button id="actions">More</button><div class="workspace-action-menu" id="menu"><button>Pin</button></div></div>
        </div>
        <div><div class="workspace-sessions" id="sessions"><div class="sidebar-session" id="session">Conversation</div><button class="workspace-sessions-more" id="more">More</button></div></div>
      </div></div></div>
    </div></div>
  </section></div>`);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, value: dom.window.getComputedStyle.bind(dom.window) });
  const element = (id: string) => dom.window.document.getElementById(id)!;
  const rect = (id: string, top: number, height = 30) => {
    element(id).getBoundingClientRect = () => ({ top, bottom: top + height, height, left: 0, right: 300, width: 300, x: 0, y: top, toJSON() {} });
  };
  try {
    rect("scroll", 0, 300);
    rect("section", 0); rect("section-button", 0);
    rect("project", 30); rect("project-button", 30); element("project").style.top = "30px";
    rect("workspace", 60); rect("workspace-button", 60); rect("actions", 62, 26); element("workspace").style.top = "60px";
    rect("tree", -100, 500); rect("sessions", -50, 300); rect("session", 70);
    rect("more", 70);
    updateSidebarClipping(element("scroll"));
    assert.equal(element("session").style.clipPath, "inset(20px -16px -16px)");
    assert.equal(element("more").style.clipPath, "inset(20px -16px -16px)", "pagination must not paint over the sticky workspace heading");
    assert.equal(element("tree").style.getPropertyValue("--sidebar-tree-clip-top"), "160px", "project line starts below its own heading, continuing beside the sticky workspace");
    assert.equal(element("sessions").style.getPropertyValue("--sidebar-tree-clip-top"), "140px");
    for (const id of ["menu", "tree", "sessions", "project", "workspace", "section-button", "actions"]) {
      assert.equal(element(id).style.clipPath, "", `${id} must remain unclipped`);
    }
    // At the end of a group its workspace header is pushed under its parent.
    rect("workspace", 45); rect("workspace-button", 45); rect("actions", 47, 26);
    updateSidebarClipping(element("scroll"));
    assert.equal(element("workspace-button").style.clipPath, "inset(15px -16px -16px)");
    assert.equal(element("actions").style.clipPath, "inset(13px -16px -16px)");
    assert.equal(element("tree").style.getPropertyValue("--sidebar-tree-clip-top"), "160px", "a pushed workspace must not change the project line boundary");
    assert.equal(element("menu").style.clipPath, "");
    // Scrolling back must restore the content, including its pointer hit area.
    rect("workspace", 80); rect("workspace-button", 80); rect("actions", 82, 26); rect("session", 120);
    rect("more", 150);
    updateSidebarClipping(element("scroll"));
    assert.equal(element("session").style.clipPath, "");
    assert.equal(element("more").style.clipPath, "", "scrolling back restores pagination paint and pointer hit area");
    assert.equal(element("workspace-button").style.clipPath, "");
    // A directly pinned workspace has only the section header as its ancestor.
    element("section").parentElement!.appendChild(element("workspace").parentElement!);
    rect("workspace", 30); rect("workspace-button", 30); rect("actions", 32, 26); rect("session", 50);
    updateSidebarClipping(element("scroll"));
    assert.equal(element("session").style.clipPath, "inset(10px -16px -16px)");
    assert.equal(element("workspace-button").style.clipPath, "");
  } finally {
    if (previous) Object.defineProperty(globalThis, "getComputedStyle", previous);
    else Reflect.deleteProperty(globalThis, "getComputedStyle");
    dom.window.close();
  }
});
