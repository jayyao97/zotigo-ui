#!/usr/bin/env node
// Controls one disposable tab in the existing Chrome. Never launches another browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error('Usage: node smoke.mjs /absolute/external/artifacts/output [http://127.0.0.1:8091]');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
if (path.resolve(output) === repo || path.resolve(output).startsWith(repo + path.sep)) throw new Error('Output must be outside the source repository.');
const address = process.argv[3] ?? 'http://127.0.0.1:8091';
const url = new URL(address);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('This smoke test only accepts the local fixture preview.');
await fs.mkdir(output, { recursive: true });
const target = await (await fetch('http://localhost:9222/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map(); let sequence = 0;
const checks = [], screenshots = [], runtimeErrors = [];
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.id) { const callback = pending.get(message.id); if (callback) { clearTimeout(callback.timer); pending.delete(message.id); message.error ? callback.reject(new Error(JSON.stringify(message.error))) : callback.resolve(message.result); } }
  else if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description ?? ''));
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, description = expression) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error('Timed out: ' + description);
}
const visibleButtons = `[...document.querySelectorAll('[role="button"],[role="link"],button,a')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')`;
async function click(label) {
  const predicate = `e.getAttribute('aria-label') === ${JSON.stringify(label)} || e.textContent.trim().startsWith(${JSON.stringify(label)})`;
  await wait(`${visibleButtons}.some(e => ${predicate})`, 'button ' + label);
  await evaluate(`(() => { const e = ${visibleButtons}.find(e => ${predicate}); e.scrollIntoView({block:'center'}); e.click(); })()`);
  await delay(150);
}
async function back() {
  const predicate = `/back/i.test(e.getAttribute('aria-label') || '')`;
  await wait(`${visibleButtons}.some(e => ${predicate})`, 'back navigation');
  await evaluate(`${visibleButtons}.find(e => ${predicate}).click()`); await delay(150);
}
async function input(label, text) {
  await wait(`!!document.querySelector('[aria-label="${label}"]')`, 'input ' + label);
  await evaluate(`(() => { const e = document.querySelector('[aria-label="${label}"]'); const p = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(text)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
}
async function shot(name) {
  await delay(200);
  const result = await call('Page.captureScreenshot', { format: 'png' });
  const filename = name + '.png'; await fs.writeFile(path.join(output, filename), Buffer.from(result.data, 'base64')); screenshots.push(filename);
}
async function bodyIncludes(text) { await wait(`document.body.innerText.includes(${JSON.stringify(text)})`, 'text ' + text); }
try {
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  await call('Page.navigate', { url: address });
  await wait(`typeof __ZOTIGO_PREVIEW__ !== 'undefined'`);
  await bodyIncludes('Home Mac Studio'); await shot('01-home-device-picker');
  await click('Add device'); await bodyIncludes('Daemon address'); await click('Cancel');
  await click('Settings'); await click('Devices'); await bodyIncludes('DAEMONS');
  await back(); await back();
  checks.push('Home add flow cancels back; device configuration is reachable through Settings');
  await click('Home Mac Studio'); await bodyIncludes('Home: Multi-host mobile architecture'); await shot('02-home'); checks.push('Fixture host connects and real Home renders populated data');
  await click('Collapse Zotigo Mobile');
  assert.equal(await evaluate(`${visibleButtons}.some(e => e.getAttribute('aria-label') === 'New session in iOS client · feature/mobile')`), false);
  await shot('02b-project-collapsed');
  await click('Expand Zotigo Mobile'); await click('Collapse iOS client · feature/mobile');
  assert.equal(await evaluate(`${visibleButtons}.some(e => e.getAttribute('aria-label') === 'Expand iOS client · feature/mobile')`), true);
  await click('Collapse Zotigo Mobile'); await click('Expand Zotigo Mobile');
  assert.equal(await evaluate(`${visibleButtons}.some(e => e.getAttribute('aria-label') === 'Expand iOS client · feature/mobile')`), true);
  await click('Expand iOS client · feature/mobile'); await shot('02c-tree-expanded');
  checks.push('Project and workspace branches collapse independently and retain nested state');
  await click('Manage Zotigo Mobile'); await bodyIncludes('iOS client · feature/mobile'); await shot('03-project');
  await click('iOS client · feature/mobile'); await bodyIncludes('Home: Multi-host mobile architecture'); await shot('04-workspace'); checks.push('Project and workspace navigation retain scoped session list');
  await click('Home: Multi-host mobile architecture');
  await wait(`__ZOTIGO_PREVIEW__.snapshot('home').activeStreams === 1`);
  await bodyIncludes('Approval needed'); await shot('05-conversation');
  // Pagination explicitly leaves follow mode on web and native. This does not emulate native drag callbacks.
  await click('Load earlier messages'); await delay(400);
  await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 190, y: 350, deltaX: 0, deltaY: 600 });
  const distance = `(() => { const lists=[...document.querySelectorAll('div')].filter(e=>e.getClientRects().length && e.clientHeight>100 && e.scrollHeight>e.clientHeight+100 && ['auto','scroll'].includes(getComputedStyle(e).overflowY)); const e=lists.sort((a,b)=>b.scrollHeight-a.scrollHeight)[0]; return e ? e.scrollHeight-e.clientHeight-e.scrollTop : Infinity; })()`;
  await click('Jump to latest'); await wait(`(${distance}) < 100`, 'jump reaches latest');
  await delay(700); assert.ok(await evaluate(`(${distance}) < 100`), 'Late layout retains latest position');
  await shot('05b-jump-latest'); checks.push('Pagination exits follow mode; Jump to latest reaches and retains bottom after delayed layout');
  await click('exec_command result'); await bodyIncludes('Tests: 28 passed');
  await shot('06-tool-result'); checks.push('Real conversation renders rich history and expandable tool result');
  await click('View image'); await wait(`!!document.querySelector('img[alt="Conversation attachment"]') || [...document.querySelectorAll('[role="img"]')].some(e => e.getAttribute('aria-label') === 'Conversation attachment')`, 'fixture image rendered'); await shot('07-attachment');
  await click('Attach photo');
  await wait(`!!document.querySelector('input[type="file"]')`, 'photo-picker input');
  // A real browser-encoded JPEG intentionally bears a .png filename, reproducing picker metadata mismatch.
  const jpeg = await evaluate(`(() => { const c=document.createElement('canvas');c.width=240;c.height=140;const x=c.getContext('2d');x.fillStyle='#303030';x.fillRect(0,0,240,140);x.fillStyle='#77b7ff';x.fillRect(20,20,200,60);x.fillStyle='white';x.font='16px sans-serif';x.fillText('JPEG bytes / PNG name',20,115);return c.toDataURL('image/jpeg').split(',')[1];})()`);
  const upload = path.join(output, 'jpeg-bytes-named-png.png'); await fs.writeFile(upload, Buffer.from(jpeg, 'base64'));
  const { root } = await call('DOM.getDocument'); const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  await call('DOM.setFileInputFiles', { nodeId, files: [upload] });
  await wait(`${visibleButtons}.some(e => e.getAttribute('aria-label') === 'Remove image 1')`, 'attached image');
  await input('Message', 'Verify the uploaded screenshot and host isolation.');
  await evaluate(`__ZOTIGO_PREVIEW__.fault('home','send-rejected')`); await click('Send'); await bodyIncludes('Fixture: message rejected.');
  assert.equal(await evaluate(`${visibleButtons}.some(e => e.textContent.trim() === 'Reconnect')`), false, 'Action error must not offer transport reconnect');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Message"]').value`), 'Verify the uploaded screenshot and host isolation.');
  await shot('08-rejected-draft'); checks.push('HTTP 400 action error preserves editable draft and does not show Reconnect');
  await evaluate(`__ZOTIGO_PREVIEW__.fault('home','none')`); await click('Send');
  await wait(`__ZOTIGO_PREVIEW__.snapshot('home').lastSubmission?.accepted === true`);
  const submission = await evaluate(`__ZOTIGO_PREVIEW__.snapshot('home').lastSubmission`);
  assert.equal(submission.body.images[0].mime_type, 'image/jpeg'); assert.ok(submission.body.client_message_id); assert.equal(submission.body.text, 'Verify the uploaded screenshot and host isolation.');
  await wait(`document.querySelector('[aria-label="Message"]').value === ''`); await delay(1200); await shot('09-send-complete'); checks.push('Actual uploaded JPEG bytes are sent as image/jpeg with a durable client message ID; accepted draft clears');
  await back(); await wait(`__ZOTIGO_PREVIEW__.snapshot('home').activeStreams === 0`); checks.push('Leaving conversation releases its event stream');
  await back(); await back(); await click('Switch device: Work Linux');
  await bodyIncludes('Work: Multi-host mobile architecture'); await shot('10-work-host');
  await click('Work: Multi-host mobile architecture'); await wait(`__ZOTIGO_PREVIEW__.snapshot('work').activeStreams === 1`);
  assert.equal(await evaluate(`__ZOTIGO_PREVIEW__.snapshot('work').lastSubmission ?? null`), null);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Message"]').value`), '');
  assert.equal(await evaluate(`__ZOTIGO_PREVIEW__.snapshot('home').activeStreams`), 0);
  await shot('11-work-conversation'); checks.push('Same session ID on Work has no Home submission/draft and Home stream remains closed');
  assert.deepEqual(runtimeErrors, [], 'No uncaught browser runtime exceptions');
  await fs.writeFile(path.join(output, 'smoke.json'), JSON.stringify({ passed: true, viewport: '393x852 @2', preview: address, checks, screenshots, runtimeErrors, limits: 'React Native Web fixture validation; not native iOS validation.' }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length, output }));
} catch (error) {
  try { await shot('failure'); } catch {}
  const text = await evaluate('document.body.innerText').catch(() => 'Page unavailable');
  const controls = await evaluate(`[...document.querySelectorAll('[aria-label]')].map(e=>({tag:e.tagName,role:e.getAttribute('role'),label:e.getAttribute('aria-label')}))`).catch(()=>[]);
  await fs.writeFile(path.join(output, 'smoke.json'), JSON.stringify({ passed: false, error: String(error), checks, screenshots, runtimeErrors, body: text, controls }, null, 2));
  throw error;
} finally {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  socket.close(); await fetch(`http://localhost:9222/json/close/${target.id}`).catch(() => {});
}
