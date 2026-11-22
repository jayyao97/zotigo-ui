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
  await call('Page.bringToFront');
  await wait(`typeof __ZOTIGO_PREVIEW__ !== 'undefined'`);
  // The fixture remembers Home as the last device, so launch connects directly.
  await bodyIncludes('Home: Multi-host mobile architecture'); await shot('01-home');
  checks.push('Last-used device connects on launch and Home renders populated data');
  await click('Switch device'); await bodyIncludes('Work Linux'); await shot('01b-device-switcher');
  // A device that does not answer must not trap the user: every row stays usable while it connects.
  await evaluate(`__ZOTIGO_PREVIEW__.fault('work','unreachable')`);
  await click('Switch device: Work Linux'); await bodyIncludes('Connecting…'); await shot('01c-device-connecting');
  assert.deepEqual(await evaluate(`${visibleButtons}.filter(e => (e.getAttribute('aria-label') || '').startsWith('Switch device: ')).map(e => e.getAttribute('aria-disabled'))`), [null, null], 'device rows stay enabled while one is connecting');
  await click('Switch device: Home Mac Studio');
  await wait(`!document.body.innerText.includes('Connecting…') && !document.body.innerText.includes('Manage devices')`, 'choosing the current device abandons the attempt and closes the switcher');
  await bodyIncludes('Home: Multi-host mobile architecture');
  await evaluate(`__ZOTIGO_PREVIEW__.fault('work','none')`);
  checks.push('An unreachable device does not block switching: rows stay enabled and the current device keeps working');
  await click('Switch device'); await bodyIncludes('Work Linux');
  await click('Add device'); await bodyIncludes('Daemon address'); await click('Cancel');
  await click('Settings'); await bodyIncludes('Model profiles'); await shot('02-settings');
  await click('Home Mac Studio'); await bodyIncludes('Choose where you want to work.');
  await click('Edit Work Linux'); await bodyIncludes('Remove device'); await shot('02a-edit-device');
  // A half-typed address must leave the form usable and explain itself on save.
  await input('Daemon address', 'not a url'); await bodyIncludes('Save device');
  await click('Save device'); await wait(`[...document.querySelectorAll('[role="alert"]')].some(e => e.getClientRects().length && e.textContent.trim())`, 'invalid address is reported');
  await click('Cancel');
  // A wrong token for the current device is reported and the device stays
  // connected; the right token switches to a fresh connection.
  await click('Edit Home Mac Studio'); await input('Daemon token', 'wrong-token'); await click('Save device');
  await wait(`document.body.innerText.includes('Fixture: daemon token is invalid.')`, 'a wrong token is reported');
  assert.ok(await evaluate(`${visibleButtons}.some(e => e.getAttribute('aria-label') === 'Switch device: Home Mac Studio')`), 'the Devices screen stays open');
  await shot('02a-wrong-token');
  await click('Edit Home Mac Studio'); await input('Daemon token', 'fixture-token'); await click('Save device');
  await wait(`!document.body.innerText.includes('Fixture: daemon token is invalid.') && !document.body.innerText.includes('Connecting…')`, 'the right token reconnects');
  await bodyIncludes('Choose where you want to work.');
  checks.push('Editing the current device keeps it connected until the new token answers; a wrong token is reported');
  await back();
  await back(); await bodyIncludes('Home: Multi-host mobile architecture');
  await click('Settings'); await bodyIncludes('Model profiles');
  // Each Settings row leads to a screen titled with the same words.
  for (const row of ['Model profiles', 'Favorite models', 'Runtime status']) {
    await click(row);
    await wait(`[...document.querySelectorAll('[role="heading"]')].some(e => e.getClientRects().length && e.textContent.trim() === ${JSON.stringify(row)})`, 'screen titled ' + row);
    await back();
  }
  // Usage reads the same daemon endpoints as Desktop; a tap on a day narrows the period below.
  await click('Usage'); await bodyIncludes('All time'); await bodyIncludes('Peak day'); await shot('02b-usage');
  const day = await evaluate(`(() => { const cells = [...document.querySelectorAll('svg rect[aria-label]')]; const cell = cells[cells.length - 3]; for (const type of ['pointerdown','mousedown','pointerup','mouseup','click']) cell.dispatchEvent(new MouseEvent(type, { bubbles: true })); return cell.getAttribute('aria-label'); })()`);
  await wait(`!!document.querySelector('[aria-label="Clear chart selection"]')`, 'a tapped day becomes the period');
  assert.ok(await evaluate(`document.body.innerText.includes(${JSON.stringify(day)} + ' · ')`), 'period summary names the tapped day ' + day);
  await back();
  checks.push('Usage shows totals and the year chart; tapping a day narrows period details to it');
  await click('Files'); await click('README.md'); await wait(`document.querySelector('[aria-label="File content"]')?.value.includes('export function connect')`, 'file opens in the editor');
  await click('Parent directory'); await bodyIncludes('preview.png'); await shot('02a-files'); await back();
  await back();
  checks.push('Device switcher offers add/manage; Settings rows match their destination titles; devices and files use list rows');
  const recent = await evaluate(`(() => { const all = ${visibleButtons}; const from = all.findIndex(e => e.getAttribute('aria-label') === 'Collapse Recent'); const to = all.findIndex(e => e.getAttribute('aria-label') === 'Collapse Projects'); return { from, to, rows: all.slice(from + 1, to).map(e => e.innerText.split(String.fromCharCode(10)).join(' | ')) }; })()`);
  assert.ok(recent.from >= 0 && recent.to > recent.from, 'Recent comes before Projects');
  assert.ok(recent.rows[0].startsWith('Review daemon API contracts | Zotigo Mobile · iOS client · feature/mobile'), 'Recent names the project and workspace: ' + recent.rows[0]);
  assert.ok(recent.rows.some(row => /\| 25m$/.test(row)) && recent.rows.some(row => /\| 3h$/.test(row)), 'Read conversations show a compact age: ' + recent.rows.join(' / '));
  assert.ok(recent.rows.some(row => row.startsWith('Home: Fix keyboard safe-area handling · 4 | 1d')), 'Conversations outside projects are listed too');
  assert.ok(recent.rows.at(-1).startsWith('Show '), 'Recent is a short preview with a way to see more');
  assert.equal(await evaluate(`${visibleButtons}.some(e => e.getAttribute('aria-label') === 'New project')`), true, 'New project is reachable from Home');
  checks.push('Home lists recent conversations across projects first, with location, age and a bounded preview');
  // A new conversation offers the same attachment sources as a conversation.
  await click('New conversation');
  await click('Attach');
  for (const source of ['Photo library', 'Take photo', 'Choose file'])
    await wait(`${visibleButtons}.some(e => e.textContent.trim().startsWith(${JSON.stringify(source)}))`, 'new conversation offers ' + source);
  await shot('02-new-session-attach');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await delay(400);
  await back();
  await bodyIncludes('Home: Multi-host mobile architecture');
  checks.push('New conversation offers photo library, camera and files, like a conversation');
  await click('Collapse Zotigo Mobile');
  assert.equal(await evaluate(`${visibleButtons}.some(e => e.getAttribute('aria-label') === 'New conversation in iOS client · feature/mobile')`), false);
  await shot('02b-project-collapsed');
  await click('Expand Zotigo Mobile'); await click('Collapse iOS client · feature/mobile');
  assert.equal(await evaluate(`${visibleButtons}.some(e => e.getAttribute('aria-label') === 'Expand iOS client · feature/mobile')`), true);
  await click('Collapse Zotigo Mobile'); await click('Expand Zotigo Mobile');
  assert.equal(await evaluate(`${visibleButtons}.some(e => e.getAttribute('aria-label') === 'Expand iOS client · feature/mobile')`), true);
  await click('Expand iOS client · feature/mobile'); await shot('02c-tree-expanded');
  checks.push('Project and workspace branches collapse independently and retain nested state');
  await click('Zotigo Mobile options'); await bodyIncludes('iOS client · feature/mobile'); await shot('03-project');
  await click('iOS client · feature/mobile'); await bodyIncludes('Home: Multi-host mobile architecture'); await shot('04-workspace'); checks.push('Project and workspace navigation retain scoped session list');
  await click('Home: Multi-host mobile architecture');
  await wait(`__ZOTIGO_PREVIEW__.snapshot('home').activeStreams === 1`);
  await bodyIncludes('Approval required'); await shot('05-conversation');
  const idleHistoryRequests = await evaluate(`__ZOTIGO_PREVIEW__.snapshot('home').historyRequests`);
  await delay(700);
  assert.equal(await evaluate(`__ZOTIGO_PREVIEW__.snapshot('home').historyRequests`), idleHistoryRequests, 'Idle layout does not repeatedly paginate');
  // Pagination explicitly leaves follow mode on web and native. This does not emulate native drag callbacks.
  assert.equal(await evaluate(`${visibleButtons}.some(e => e.textContent.includes('Load earlier messages'))`), false);
  await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 190, y: 350, deltaX: 0, deltaY: -100000 }); await delay(400);
  await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 190, y: 350, deltaX: 0, deltaY: 600 });
  const distance = `(() => { const lists=[...document.querySelectorAll('div')].filter(e=>e.getClientRects().length && e.clientHeight>100 && e.scrollHeight>e.clientHeight+100 && ['auto','scroll'].includes(getComputedStyle(e).overflowY)); const e=lists.sort((a,b)=>b.scrollHeight-a.scrollHeight)[0]; return e ? e.scrollHeight-e.clientHeight-e.scrollTop : Infinity; })()`;
  await click('Jump to latest'); await wait(`(${distance}) < 100`, 'jump reaches latest');
  await delay(700); assert.ok(await evaluate(`(${distance}) < 100`), 'Late layout retains latest position');
  await shot('05b-jump-latest'); checks.push('Pagination exits follow mode; Jump to latest reaches and retains bottom after delayed layout');
  await click('Ran pnpm test && git diff --stat'); await bodyIncludes('Tests: 28 passed');
  const toolTitle = `${visibleButtons}.find(e => e.textContent.trim().startsWith('$ pnpm test'))`;
  assert.ok(await evaluate(`!!${toolTitle}`), 'Expanded tool shows its command');
  await evaluate(`${toolTitle}.scrollIntoView({block:'center'})`);
  await shot('06-tool-result'); checks.push('Real conversation renders rich history and expandable tool result');
  await click('Wrap');
  await bodyIncludes('const client = new DaemonClient(connection, fetch);');
  await shot('06b-code-block');
  await click('View diagram'); await delay(2500); await shot('06c-mermaid');
  await click('Close diagram');
  checks.push('Fenced code has a native block with wrap/copy; Mermaid opens its offline diagram viewer');
  assert.equal(await evaluate(`${visibleButtons}.some(e => e.getAttribute('aria-label') === 'Select message text')`), false, 'No per-message source-selection buttons');
  checks.push('Inline native selection replaces source-sheet buttons; iOS menu actions require native verification');
  if (await evaluate(`${visibleButtons}.some(e => e.getAttribute('aria-label') === 'Jump to latest')`)) await click('Jump to latest');
  await wait(`!!document.querySelector('img[alt="Conversation attachment"]') || [...document.querySelectorAll('[role="img"]')].some(e => e.getAttribute('aria-label') === 'Conversation attachment')`, 'fixture image rendered'); await shot('07-attachment');
  // Headless Chrome opens the picker immediately; intercept the hidden input before it is clicked.
  await call('Page.setInterceptFileChooserDialog', { enabled: true });
  const chooser = new Promise((resolve) => socket.addEventListener('message', function listener({ data }) {
    const message = JSON.parse(String(data));
    if (message.method === 'Page.fileChooserOpened') { socket.removeEventListener('message', listener); resolve(message.params); }
  }));
  await click('Attach'); await click('Photo library');
  const { backendNodeId } = await chooser;
  // A real browser-encoded JPEG intentionally bears a .png filename, reproducing picker metadata mismatch.
  const jpeg = await evaluate(`(() => { const c=document.createElement('canvas');c.width=240;c.height=140;const x=c.getContext('2d');x.fillStyle='#303030';x.fillRect(0,0,240,140);x.fillStyle='#77b7ff';x.fillRect(20,20,200,60);x.fillStyle='white';x.font='16px sans-serif';x.fillText('JPEG bytes / PNG name',20,115);return c.toDataURL('image/jpeg').split(',')[1];})()`);
  const upload = path.join(output, 'jpeg-bytes-named-png.png'); await fs.writeFile(upload, Buffer.from(jpeg, 'base64'));
  await call('DOM.setFileInputFiles', { backendNodeId, files: [upload] });
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
  await back(); await back(); await click('Switch device'); await click('Switch device: Work Linux');
  await bodyIncludes('Work: Multi-host mobile architecture'); await shot('10-work-host');
  await click('Work: Multi-host mobile architecture'); await wait(`__ZOTIGO_PREVIEW__.snapshot('work').activeStreams === 1`);
  assert.equal(await evaluate(`__ZOTIGO_PREVIEW__.snapshot('work').lastSubmission ?? null`), null);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Message"]').value`), '');
  assert.equal(await evaluate(`__ZOTIGO_PREVIEW__.snapshot('home').activeStreams`), 0);
  await shot('11-work-conversation'); checks.push('Same session ID on Work has no Home submission/draft and Home stream remains closed');
  const saveDisabled = `${visibleButtons}.find(e => e.textContent.trim() === 'Save')?.getAttribute('aria-disabled')`;
  await click('Conversation details'); await wait(`${saveDisabled} === 'true'`, 'Save disabled for an unchanged title');
  await input('Rename conversation', 'Work: renamed in smoke'); await wait(`${saveDisabled} !== 'true'`, 'Save enabled for an edit');
  await click('Save'); await wait(`${saveDisabled} === 'true'`, 'Save disabled again once saved');
  await bodyIncludes('Work: renamed in smoke'); await click('Dismiss sheet');
  checks.push('Rename offers Save only while the title differs from what is saved');
  const streamedMarkdown = '![Streaming image](/sessions/session-shared/images/preview)\n\n```ts\nconst stable = true;\n```\n\nStreaming stability check: ';
  await evaluate('__ZOTIGO_PREVIEW__.appendMarkdown("work", ' + JSON.stringify(streamedMarkdown) + ')');
  await delay(900);
  await evaluate('globalThis.__streamCode = [...document.querySelectorAll(\'[aria-label="Copy code"]\')].at(-1); globalThis.__streamImage = [...document.querySelectorAll(\'img[alt="Conversation attachment"]\')].at(-1); true');
  assert.ok(await evaluate('!!__streamCode && !!__streamImage'), 'Streaming rich blocks are rendered');
  for (let i = 0; i < 8; i++) {
    await evaluate('__ZOTIGO_PREVIEW__.appendMarkdown("work", ' + JSON.stringify('chunk ' + i + '. ') + ')');
    await delay(120);
    assert.ok(await evaluate('__streamCode.isConnected && __streamImage.isConnected'), 'Appending stream text preserves mounted code/image nodes');
  }
  await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 190, y: 350, deltaX: 0, deltaY: -200 });
  await evaluate('__streamCode.scrollIntoView({block:"center"})');
  await shot('12-streaming-rich-content');
  checks.push('Repeated SSE text updates preserve existing code and image nodes instead of remounting them');
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
