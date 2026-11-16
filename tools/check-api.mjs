import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const base = process.argv[2] || 'http://127.0.0.1:18787';
const local = ['127.0.0.1', 'localhost'].includes(new URL(base).hostname);
if (!local && !process.argv.includes('--allow-remote-test')) throw new Error('Remote writes require explicit --allow-remote-test');
const origin = 'https://datkep92.github.io';
const alice = randomBytes(32).toString('hex'), bob = randomBytes(32).toString('hex');
const headers = token => ({ Origin: origin, 'Content-Type': 'application/json', 'X-Participant-Token': token });
async function call(token, method = 'GET', data, path = '/api/feedback') {
  const response = await fetch(base + path, { method, headers: headers(token), ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return { status: response.status, data: await response.json() };
}
const data = { scope: '2-10', stance: 'adjust', topic: 'price', content: '[KIỂM THỬ HỆ THỐNG] Đề xuất gói 3 MST, 29.000đ mỗi tháng.', consent: true };
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const initial = await call(alice);
assert.equal(initial.status, 200);
if (!local && initial.data.items.length) throw new Error('Remote database is no longer empty; do not insert test opinions.');
let id;
try {
  let result = await call(alice, 'POST', data); id = result.data.id;
  check('gửi phiếu vào D1', () => assert.equal(result.status, 201));
  result = await call(alice);
  check('chủ phiếu đọc và nhận quyền sửa', () => assert.ok(result.data.items.find(x => x.id === id)?.mine));
  result = await call(bob);
  check('trình duyệt khác thấy phiếu nhưng không nhận dữ liệu bí mật', () => {
    const row = result.data.items.find(x => x.id === id); assert.ok(row && !row.mine); assert.ok(!('owner_hash' in row)); assert.ok(!JSON.stringify(result.data).includes(alice));
  });
  await call(bob, 'DELETE', {});
  result = await call(alice);
  check('người khác không rút được phiếu của chủ', () => assert.ok(result.data.items.some(x => x.id === id)));
  result = await call(bob, 'POST', { liked: true }, `/api/feedback/${id}/reaction`);
  check('đồng tình được lưu', () => assert.equal(result.status, 200));
  await call(bob, 'POST', { liked: true }, `/api/feedback/${id}/reaction`);
  result = await call(bob);
  check('gửi đồng tình lặp không tăng hai lần', () => { const row = result.data.items.find(x => x.id === id); assert.equal(row.likes, 1); assert.equal(row.liked, true); });
  result = await call(alice, 'POST', { ...data, content: '[KIỂM THỬ HỆ THỐNG] Tôi chưa đồng ý thu phí lúc này. <b>Giữ nguyên chữ</b>' });
  check('sửa một phiếu, giữ nguyên mã', () => { assert.equal(result.status, 200); assert.equal(result.data.id, id); });
  result = await call(alice);
  check('ý kiến phản đối không bị lọc; chỉ một phiếu', () => { const rows = result.data.items.filter(x => x.id === id); assert.equal(rows.length, 1); assert.equal(rows[0].likes, 1); assert.ok(rows[0].content.includes('<b>')); });
  result = await call(alice, 'POST', { ...data, content: 'Gọi 0912 345 678 để trao đổi nhé.' });
  check('từ chối thông tin nhận dạng', () => assert.equal(result.status, 400));
  result = await call(alice, 'POST', { ...data, consent: false });
  check('bắt buộc đồng ý công khai', () => assert.equal(result.status, 400));
  result = await call(bob, 'POST', { liked: false }, `/api/feedback/${id}/reaction`);
  check('rút đồng tình', () => assert.equal(result.status, 200));
} finally {
  await call(alice, 'DELETE', {});
  await call(bob, 'DELETE', {});
}
const final = await call(alice);
check('rút phiếu và dọn đúng dữ liệu thử', () => assert.equal(final.data.items.length, initial.data.items.length));
if (local) {
  let response;
  for (let i = 0; i < 61; i++) response = await call(alice, 'POST', { ...data, consent: false });
  check('chặn gửi quá giới hạn mạng', () => assert.equal(response.status, 429));
}
console.log(`${checks}/${checks} PASS; ${local ? 'LOCAL D1' : 'REMOTE D1, removed own test data'}`);
