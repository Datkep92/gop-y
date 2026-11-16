export const SCOPES = ['1', '2-10', '11-25', '26-50', '50+'];
export const STANCES = ['reasonable', 'adjust', 'unsuitable', 'undecided'];
export const TOPICS = ['price', 'scope', 'payment', 'free', 'features', 'other'];

export function validateFeedback(data) {
  if (!data || !SCOPES.includes(data.scope) || !STANCES.includes(data.stance) || !TOPICS.includes(data.topic)) return 'Vui lòng chọn đầy đủ các mục trong phiếu.';
  if (typeof data.content !== 'string' || data.content.trim().length < 10 || data.content.trim().length > 2000) return 'Ý kiến cần có từ 10 đến 2.000 ký tự.';
  const text = data.content.trim().normalize('NFKC');
  // Simple first guard only. Readers can still report identifying content.
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) || /(?:\d[\s.()-]*){9,}/.test(text)) return 'Vui lòng bỏ email, số điện thoại, MST hoặc dãy số nhận dạng khỏi nội dung công khai.';
  if (/https?:\/\/|www\./i.test(text)) return 'Vui lòng góp ý bằng văn bản, không chèn đường dẫn.';
  if (data.consent !== true) return 'Vui lòng xác nhận nội dung sẽ hiển thị công khai.';
  return null;
}

const hash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
function reply(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origin || 'null', 'Vary': 'Origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function dispatch(request, env, ctx) {
  const origin = request.headers.get('Origin');
  const origins = (env.ALLOWED_ORIGINS || '').split(',');
  const allowed = origins.includes(origin);
  const respond = (data, status = 200) => reply(data, status, allowed ? origin : null);
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    if (!allowed) return respond({ error: 'Nguồn truy cập không được phép.' }, 403);
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Participant-Token', 'Access-Control-Max-Age': '3600', 'Vary': 'Origin' } });
  }
  if (url.pathname === '/api/health' && request.method === 'GET') {
    await env.DB.prepare('SELECT 1').first();
    return respond({ ok: true });
  }
  if (url.pathname !== '/api/feedback' && !/^\/api\/feedback\/[a-f0-9-]{36}\/reaction$/.test(url.pathname)) return respond({ error: 'Không tìm thấy.' }, 404);
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) return respond({ error: 'Cách gửi không được hỗ trợ.' }, 405);
  if (!allowed) return respond({ error: 'Vui lòng truy cập trang góp ý chính thức.' }, 403);
  const token = request.headers.get('X-Participant-Token') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) return respond({ error: 'Mã trình duyệt không hợp lệ. Vui lòng tải lại trang.' }, 401);
  const owner = await hash(token);
  if (request.method === 'GET' && url.pathname === '/api/feedback') {
    // Share the expensive list read across visitors. Cache stays server-side;
    // owner hashes are removed before returning any public response.
    const cache = globalThis.caches?.default;
    const cacheKey = new Request(`${url.origin}/_internal/feedback-cache-v1`);
    const cached = cache ? await cache.match(cacheKey) : null;
    let rows;
    if (cached) rows = await cached.json();
    else {
      const result = await env.DB.prepare(`SELECT f.id, f.owner_hash, f.scope, f.stance, f.topic, f.content, f.created_at, f.updated_at,
        (SELECT COUNT(*) FROM reactions r WHERE r.feedback_id = f.id) AS likes
        FROM feedback f ORDER BY f.created_at DESC LIMIT 1000`).all();
      rows = result.results;
      if (cache && ctx) ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(rows), { headers: { 'Cache-Control': 'public, max-age=10', 'Content-Type': 'application/json' } })));
    }
    const { results: votes } = await env.DB.prepare('SELECT feedback_id FROM reactions WHERE voter_hash=?').bind(owner).all();
    const liked = new Set(votes.map(x => x.feedback_id));
    return respond({ items: rows.map(({ owner_hash, ...row }) => ({ ...row, mine: owner_hash === owner, liked: liked.has(row.id) })), serverTime: new Date().toISOString() });
  }
  if (request.method === 'GET') return respond({ error: 'Không tìm thấy.' }, 404);
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return respond({ error: 'Định dạng không hợp lệ.' }, 415);
  const reader = request.body?.getReader();
  const chunks = []; let bytes = 0;
  if (reader) while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 12000) { await reader.cancel(); return respond({ error: 'Nội dung quá dài.' }, 413); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  const raw = new TextDecoder().decode(buffer);
  let data;
  try { data = JSON.parse(raw); } catch { return respond({ error: 'Nội dung gửi không hợp lệ.' }, 400); }
  // IP never stored in clear text. Buckets expire and use a new key each UTC hour.
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const bucket = await hash(`${ip}:${Math.floor(now / 3600000)}:gop-y-rate-v1`);
  const limit = await env.DB.prepare('INSERT INTO rate_limits(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket, now + 3600000).first();
  if (limit.count > 60) return respond({ error: 'Mạng này đã gửi nhiều yêu cầu. Vui lòng thử lại sau một giờ.' }, 429);
  await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now).run();
  // Invalidate the serving location after a successful mutation, not before.
  const invalidate = async () => { if (globalThis.caches?.default) await caches.default.delete(new Request(`${url.origin}/_internal/feedback-cache-v1`)); };
  if (url.pathname.endsWith('/reaction')) {
    if (request.method !== 'POST' || typeof data?.liked !== 'boolean') return respond({ error: 'Yêu cầu không hợp lệ.' }, 400);
    const id = url.pathname.split('/')[3];
    if (!uuid(id) || !await env.DB.prepare('SELECT id FROM feedback WHERE id = ?').bind(id).first()) return respond({ error: 'Ý kiến không còn tồn tại.' }, 404);
    if (data.liked) await env.DB.prepare('INSERT OR IGNORE INTO reactions(feedback_id,voter_hash) VALUES (?,?)').bind(id, owner).run();
    else await env.DB.prepare('DELETE FROM reactions WHERE feedback_id=? AND voter_hash=?').bind(id, owner).run();
    await invalidate();
    return respond({ ok: true });
  }
  if (request.method === 'DELETE') {
    const existing = await env.DB.prepare('SELECT id FROM feedback WHERE owner_hash=?').bind(owner).first();
    if (existing) await env.DB.batch([env.DB.prepare('DELETE FROM reactions WHERE feedback_id=?').bind(existing.id), env.DB.prepare('DELETE FROM feedback WHERE owner_hash=?').bind(owner)]);
    await invalidate();
    return respond({ ok: true });
  }
  const error = validateFeedback(data);
  if (error) return respond({ error }, 400);
  const existing = await env.DB.prepare('SELECT id FROM feedback WHERE owner_hash=?').bind(owner).first();
  if (!existing) {
    const total = await env.DB.prepare('SELECT COUNT(*) AS total FROM feedback').first();
    if (total.total >= 1000) return respond({ error: 'Trang đã đạt giới hạn nhận phiếu. Vui lòng liên hệ tác giả.' }, 409);
  }
  const stamp = new Date().toISOString();
  const id = existing?.id || crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO feedback(id,owner_hash,scope,stance,topic,content,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(owner_hash) DO UPDATE SET scope=excluded.scope,stance=excluded.stance,topic=excluded.topic,content=excluded.content,updated_at=excluded.updated_at`)
    .bind(id, owner, data.scope, data.stance, data.topic, data.content.trim().normalize('NFKC'), stamp, stamp).run();
  await invalidate();
  return respond({ ok: true, id }, existing ? 200 : 201);
}

export default { async fetch(request, env, ctx) {
  try { return await dispatch(request, env, ctx); }
  catch { return reply({ error: 'Chưa kết nối được nơi lưu ý kiến. Vui lòng thử lại; nội dung đang nhập vẫn được giữ.' }, 503, (env.ALLOWED_ORIGINS || '').split(',').includes(request.headers.get('Origin')) ? request.headers.get('Origin') : null); }
} };
