import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { validateFeedback } from '../worker/index.js';

const valid = { scope: '2-10', stance: 'adjust', topic: 'price', content: 'Mong có gói 3 MST, giá 29.000đ mỗi tháng.', consent: true };
test('nhận đề xuất mức phí bình thường', () => assert.equal(validateFeedback(valid), null));
test('bắt buộc đủ lựa chọn và đồng ý công khai', () => {
  for (const key of ['scope', 'stance', 'topic', 'consent']) assert.ok(validateFeedback({ ...valid, [key]: '' }));
});
test('chặn nội dung ngắn, dài và sai kiểu', () => {
  for (const content of ['', '123', 'a'.repeat(2001), null, {}]) assert.ok(validateFeedback({ ...valid, content }));
});
test('hạn chế lộ email, điện thoại, MST và link', () => {
  for (const content of ['Liên hệ tôi abc@example.com', 'Điện thoại 0912 345 678 nhé', 'MST của tôi là 0312345678', 'Xem https://example.com', 'Email Ａ＠example.com nhé']) assert.ok(validateFeedback({ ...valid, content }));
});
test('không cấm ý kiến phản đối hoặc ký tự HTML', () => {
  assert.equal(validateFeedback({ ...valid, content: 'Tôi chưa đồng ý thu phí ở thời điểm này.' }), null);
  assert.equal(validateFeedback({ ...valid, content: '<script>alert("test")</script>' }), null);
});
const env = { ALLOWED_ORIGINS: 'https://datkep92.github.io', DB: { prepare() { throw new Error('offline'); } } };
test('từ chối origin lạ trước khi đọc dữ liệu', async () => {
  const res = await worker.fetch(new Request('https://test/api/feedback', { headers: { Origin: 'https://evil.example' } }), env);
  assert.equal(res.status, 403); assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'null');
});
test('từ chối token không hợp lệ', async () => {
  const res = await worker.fetch(new Request('https://test/api/feedback', { headers: { Origin: 'https://datkep92.github.io', 'X-Participant-Token': 'fake' } }), env);
  assert.equal(res.status, 401);
});
test('lỗi dịch vụ không trả thông tin nội bộ', async () => {
  const res = await worker.fetch(new Request('https://test/api/feedback', { headers: { Origin: 'https://datkep92.github.io', 'X-Participant-Token': 'a'.repeat(64) } }), env);
  assert.equal(res.status, 503); assert.ok(!(await res.text()).includes('offline'));
});
