// ==================== 认证模块（HMAC + HKDF + 恒定时间比较）====================

const TOKEN_EXPIRY = 48 * 60 * 60 * 1000; // 48小时过期
const HKDF_SALT = 'cloudflare-light-blog-auth-v1'; // HKDF 固定 salt

/**
 * 恒定时间比较（防止时序攻击）
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) {
    diff |= ua[i] ^ ub[i];
  }
  return diff === 0;
}

/**
 * 使用 HKDF 从密码派生 32 字节密钥
 */
async function deriveKey(password) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'HKDF',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(HKDF_SALT),
      info: encoder.encode('hmac-key')
    },
    keyMaterial,
    256
  );
  return crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * 哈希密码（用于存储，HMAC-SHA256 + 固定 salt）
 */
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const key = await deriveKey('password-salt-' + HKDF_SALT);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(password));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 验证密码哈希
 */
export async function verifyPasswordHash(password, hash) {
  const computed = await hashPassword(password);
  return timingSafeEqual(
    new Uint8Array(computed.match(/.{2}/g).map(b => parseInt(b, 16))),
    new Uint8Array(hash.match(/.{2}/g).map(b => parseInt(b, 16)))
  );
}

/**
 * 生成认证令牌（带过期时间）
 * 格式: timestamp.signature
 */
export async function generateToken(password) {
  const timestamp = Date.now();
  const key = await deriveKey(password);
  const encoder = new TextEncoder();
  const data = encoder.encode(`auth:${timestamp}`);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const sigHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${timestamp}.${sigHex}`;
}

/**
 * 验证认证令牌（恒定时间比较）
 */
export async function verifyToken(token, password) {
  if (!token || !password) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestampStr, sigHex] = parts;
  const timestamp = parseInt(timestampStr, 10);

  if (isNaN(timestamp)) return false;
  if (Date.now() - timestamp > TOKEN_EXPIRY) return false;

  try {
    const key = await deriveKey(password);
    const encoder = new TextEncoder();
    const data = encoder.encode(`auth:${timestamp}`);
    const expectedSig = await crypto.subtle.sign('HMAC', key, data);
    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    // 恒定时间比较
    return timingSafeEqual(
      new Uint8Array(sigHex.match(/.{2}/g).map(b => parseInt(b, 16))),
      new Uint8Array(expectedHex.match(/.{2}/g).map(b => parseInt(b, 16)))
    );
  } catch (e) {
    console.error('[Auth]', e.message || 'Error');
    return false;
  }
}

/**
 * 从请求中提取并验证 token
 */
export async function authenticateRequest(request, env) {
  if (!env.ADMIN_PASSWORD) return true;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;

  const token = authHeader.replace('Bearer ', '');
  return verifyToken(token, env.ADMIN_PASSWORD);
}

/**
 * 手动注销：递增 token 版本使所有旧 token 失效
 */
export async function invalidateAllTokens(env) {
  if (!env.DB) return;
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='token_version'").first();
    const current = row ? parseInt(row.value) || 0 : 0;
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('token_version', ?)").bind(String(current + 1)).run();
  } catch (e) {
    console.error('[Auth] 注销失败:', e);
  }
}
