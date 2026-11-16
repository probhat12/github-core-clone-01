import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { collectReachable, readPack } from '../git-protocol.ts';

process.env.MAKEFUN_SHOP_TOKEN = 'test-token';
process.env.MAKEFUN_SHOP_LOGIN = 'octocat';
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

function pktLine(value: string): Buffer {
  const payload = Buffer.from(value);
  return Buffer.concat([Buffer.from((payload.length + 4).toString(16).padStart(4, '0')), payload]);
}

function packFromV2Response(response: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let offset = 0;
  let inPack = false;
  while (offset + 4 <= response.length) {
    const length = Number.parseInt(response.toString('ascii', offset, offset + 4), 16);
    if (length === 0) break;
    if (length === 1 || length === 2) {
      offset += 4;
      continue;
    }
    assert(length >= 4 && offset + length <= response.length, 'malformed pkt-line in fetch response');
    const payload = response.subarray(offset + 4, offset + length);
    offset += length;
    if (payload.toString() === 'packfile\n') {
      inPack = true;
    } else if (inPack) {
      assert.equal(payload[0], 1, 'pack data must use sideband channel 1');
      chunks.push(payload.subarray(1));
    }
  }
  return Buffer.concat(chunks);
}

test('contents writes create fetchable Git commits and keep branch snapshots isolated', async () => {
  assert.equal((await api('/api/v3/user/repos', 'POST', { name: 'contents-git-regression' })).status, 201);
  const contents = '/api/v3/repos/octocat/contents-git-regression/contents/';
  const put = (path: string, text: string, branch: string) => api(`${contents}${path}`, 'PUT', {
    message: `write ${path}`,
    content: Buffer.from(text).toString('base64'),
    branch,
  });

  assert.equal((await put('base.txt', 'base version', 'main')).status, 201);
  assert.equal((await put('feature.txt', 'feature version', 'feature')).status, 201);

  const featureFile = await api(`${contents}feature.txt?ref=feature`);
  assert.equal(featureFile.status, 200);
  assert.equal(Buffer.from(((await featureFile.json()) as { content: string }).content, 'base64').toString(), 'feature version');
  assert.equal((await api(`${contents}feature.txt?ref=main`)).status, 404);

  const remove = await api(`${contents}base.txt`, 'DELETE', { message: 'remove from feature', branch: 'feature' });
  assert.equal(remove.status, 200);
  assert.equal((await api(`${contents}base.txt?ref=main`)).status, 200);
  assert.equal((await api(`${contents}base.txt?ref=feature`)).status, 404);

  const commits = await api('/api/v3/repos/octocat/contents-git-regression/commits?sha=feature');
  const [{ sha }] = await commits.json() as Array<{ sha: string }>;
  const request = Buffer.concat([
    pktLine('command=fetch\n'),
    pktLine('object-format=sha1\n'),
    Buffer.from('0001'),
    pktLine(`want ${sha}\n`),
    pktLine('done\n'),
    Buffer.from('0000'),
  ]);
  const fetched = await fetch(`${origin}/octocat/contents-git-regression.git/git-upload-pack`, {
    method: 'POST',
    headers: { 'git-protocol': 'version=2', 'content-type': 'application/x-git-upload-pack-request' },
    body: request,
  });
  assert.equal(fetched.status, 200);
  const pack = readPack(packFromV2Response(Buffer.from(await fetched.arrayBuffer())));
  assert.equal(pack.checksumOk, true);
  const closure = collectReachable([sha], (oid) => pack.objects.get(oid));
  assert(closure.size >= 5, 'fetch contains the commit, tree, and both file blobs');
});
