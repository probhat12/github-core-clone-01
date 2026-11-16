import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MAKEFUN_SHOP_TOKEN = 'test-token';
process.env.MAKEFUN_SHOP_LOGIN = 'octocat';
process.env.MAKEFUN_TRIAL_NOW = '2026-11-14T06:30:00.000Z';
const { createApp } = await import('../app.ts');
const server = createApp();
let origin = '';

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function api(path: string, method = 'GET', body?: unknown) {
  return fetch(`${origin}${path}`, {
    method,
    headers: { authorization: 'Bearer test-token', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('pull merge retains independent changes made on the base after the pull opened', async () => {
  const repo = await api('/api/v3/user/repos', 'POST', { name: 'merge-regression' });
  assert.equal(repo.status, 201);
  const prefix = '/api/v3/repos/octocat/merge-regression/contents/';
  const put = (path: string, content: string, branch: string) => api(`${prefix}${path}`, 'PUT', {
    message: `add ${path}`, content: Buffer.from(content).toString('base64'), branch,
  });

  assert.equal((await put('base.txt', 'base', 'main')).status, 201);
  assert.equal((await put('head.txt', 'head', 'feature')).status, 201);
  const pull = await api('/api/v3/repos/octocat/merge-regression/pulls', 'POST', {
    title: 'independent changes', head: 'feature', base: 'main',
  });
  assert.equal(pull.status, 201);
  const opened = await pull.json() as { number: number };
  assert.equal((await put('base-later.txt', 'kept', 'main')).status, 201);

  const merged = await api(`/api/v3/repos/octocat/merge-regression/pulls/${opened.number}/merge`, 'PUT');
  assert.equal(merged.status, 200);
  for (const [path, content] of [['base.txt', 'base'], ['head.txt', 'head'], ['base-later.txt', 'kept']]) {
    const response = await api(`${prefix}${path}?ref=main`);
    assert.equal(response.status, 200);
    const file = await response.json() as { content: string };
    assert.equal(Buffer.from(file.content, 'base64').toString(), content);
  }
});

test('MCP pull merge updates Git-backed branch contents and uses the trial clock', async () => {
  const repo = await api('/api/v3/user/repos', 'POST', { name: 'mcp-merge-regression' });
  assert.equal(repo.status, 201);
  assert.equal((await repo.json() as { created_at: string }).created_at, process.env.MAKEFUN_TRIAL_NOW);

  const prefix = '/api/v3/repos/octocat/mcp-merge-regression/contents/';
  const put = (path: string, content: string, branch: string) => api(`${prefix}${path}`, 'PUT', {
    message: `add ${path}`, content: Buffer.from(content).toString('base64'), branch,
  });
  assert.equal((await put('base.txt', 'base', 'main')).status, 201);
  assert.equal((await put('head.txt', 'head', 'feature')).status, 201);
  const pull = await api('/api/v3/repos/octocat/mcp-merge-regression/pulls', 'POST', {
    title: 'merge through MCP', head: 'feature', base: 'main',
  });
  const { number } = await pull.json() as { number: number };
  assert.equal((await put('base-later.txt', 'kept', 'main')).status, 201);

  const merged = await api('/mcp', 'POST', {
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'merge_pull_request', arguments: { owner: 'octocat', repo: 'mcp-merge-regression', pull_number: number } },
  });
  const { result } = await merged.json() as { result: { structuredContent: { merged: boolean; merge_commit_sha: string } } };
  assert.equal(result.structuredContent.merged, true);
  assert.match(result.structuredContent.merge_commit_sha, /^[0-9a-f]{40}$/);

  for (const [path, content] of [['base.txt', 'base'], ['head.txt', 'head'], ['base-later.txt', 'kept']]) {
    const response = await api(`${prefix}${path}?ref=main`);
    assert.equal(response.status, 200);
    const file = await response.json() as { content: string };
    assert.equal(Buffer.from(file.content, 'base64').toString(), content);
  }
});
