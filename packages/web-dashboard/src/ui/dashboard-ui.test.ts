import { test } from 'node:test';
import * as assert from 'node:assert';
import * as vm from 'node:vm';
import { DASHBOARD_JS } from './dashboard-scripts.js';

interface MockElement {
  id: string;
  innerHTML: string;
  innerText: string;
  textContent: string;
  style: Record<string, string>;
  children: Array<{ tag?: string; text?: string }>;
  scrollTop: number;
  scrollHeight: number;
  classList: { add: () => void; remove: () => void };
  appendChild: (node: { tag?: string; text?: string }) => void;
}

function createMockElement(id: string): MockElement {
  const el: MockElement = {
    id,
    innerHTML: '',
    innerText: '',
    textContent: '',
    style: {},
    children: [],
    scrollTop: 0,
    scrollHeight: 42,
    classList: { add: () => undefined, remove: () => undefined },
    appendChild: (node) => {
      el.children.push(node);
    }
  };
  return el;
}

function runDashboardVm(): {
  elements: Record<string, MockElement>;
  renderProjectSelector: (projects: unknown[], active: unknown) => void;
  renderAgents: (agents: unknown[]) => void;
  renderKanban: (issues: unknown[]) => void;
  renderMetrics: (tm: unknown) => void;
  appendLog: (msg: string) => void;
} {
  const ids = [
    'project-selector', 'project-badge', 'agents-list', 'fleet-count', 'log-box',
    'savings-badge', 'thermo-bar', 'used-tokens', 'cached-tokens', 'files-scanned',
    'col-ready', 'col-in_progress', 'col-blocked', 'col-review', 'col-done'
  ];
  const elements: Record<string, MockElement> = {};
  for (const id of ids) elements[id] = createMockElement(id);
  const ctx: Record<string, unknown> = {
    window: {},
    document: {
      getElementById: (id: string) => elements[id] ?? null,
      querySelector: (sel: string) => {
        const col = sel.match(/^#col-([a-z_]+)\s+\.cards-list$/)?.[1];
        return col ? elements[`col-${col}`] : null;
      },
      createElement: (tag: string) => ({ tag }),
      createTextNode: (text: string) => ({ text })
    }
  };
  vm.runInNewContext(DASHBOARD_JS, ctx);
  return {
    elements,
    renderProjectSelector: ctx.renderProjectSelector as (p: unknown[], a: unknown) => void,
    renderAgents: ctx.renderAgents as (a: unknown[]) => void,
    renderKanban: ctx.renderKanban as (i: unknown[]) => void,
    renderMetrics: ctx.renderMetrics as (tm: unknown) => void,
    appendLog: ctx.appendLog as (msg: string) => void
  };
}

test('DASHBOARD_JS escapes XSS payloads across selectors, agents, kanban, metrics, and logs', () => {
  const env = runDashboardVm();
  const imgXss = '<img src=x onerror=alert(1)>';
  const attrXss = '" onclick="alert(1)';

  env.renderProjectSelector([{ id: attrXss, name: imgXss, isLocalBound: true }], { id: attrXss, name: imgXss });
  assert.ok(!env.elements['project-selector'].innerHTML.includes('<img'));
  assert.ok(!env.elements['project-selector'].innerHTML.includes('" onclick="'));
  assert.ok(env.elements['project-selector'].innerHTML.includes('&lt;img'));

  env.renderAgents([{ agentName: imgXss, ideType: attrXss, worktreePath: imgXss, status: 'locked', lockedFiles: [imgXss] }]);
  assert.ok(!env.elements['agents-list'].innerHTML.includes('<img'));
  assert.ok(!env.elements['agents-list'].innerHTML.includes('" onclick="'));

  env.renderKanban([{ number: '1, evilFn(1)' as unknown as number, title: imgXss, status: 'in_progress', targetFiles: [imgXss] }]);
  const cardHtml = env.elements['col-in_progress'].innerHTML;
  assert.ok(!cardHtml.includes('<img'));
  assert.ok(!cardHtml.includes('onerror=alert(1)>'));
  assert.ok(!cardHtml.includes('evilFn(1)'));
  assert.ok(cardHtml.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(cardHtml.includes('issueNumber: 0'));
  assert.ok(cardHtml.includes('onDragStart(event, 0)'));

  env.renderMetrics({ savingsPercent: '50%;background:url(x)' as unknown as number, usedTokens: 100, cachedTokens: 200 });
  assert.strictEqual(env.elements['thermo-bar'].style.width, '0%');

  env.appendLog(imgXss);
  const logHtml = env.elements['log-box'].innerHTML;
  assert.ok(!logHtml.includes('<img'));
  assert.ok(logHtml.includes('&lt;img src=x onerror=alert(1)&gt;'));
});
