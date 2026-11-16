import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDelta, GitProtocolError, readPack, writePack } from '../git-protocol.ts';

test('pack reader reports a damaged trailer checksum', () => {
  const pack = writePack([{ type: 'blob', data: Buffer.from('valid object') }]);
  pack[pack.length - 1] ^= 0xff;
  const result = readPack(pack);
  assert.equal(result.checksumOk, false);
});

test('delta parser rejects a target size that cannot safely fit in a Buffer', () => {
  // source size 0, then a base-128 target size above Node's maximum Buffer length
  const oversizedTarget = Buffer.from([0x00, 0x80, 0x80, 0x80, 0x80, 0x10]);
  assert.throws(() => applyDelta(Buffer.alloc(0), oversizedTarget), (error: unknown) => {
    assert(error instanceof GitProtocolError);
    assert.equal(error.code, 'delta-size');
    return true;
  });
});

test('pack object size varint rejects precision overflow before inflate', () => {
  const pack = Buffer.alloc(12 + 9 + 20);
  pack.write('PACK', 0, 'ascii');
  pack.writeUInt32BE(2, 4);
  pack.writeUInt32BE(1, 8);
  pack.fill(0xff, 12, 20);
  pack[20] = 0x7f;
  assert.throws(() => readPack(pack), (error: unknown) => {
    assert(error instanceof GitProtocolError);
    assert.equal(error.code, 'pack-corrupt');
    return true;
  });
});
