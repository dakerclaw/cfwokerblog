// ==================== 认证模块 ====================
// 1. 密码哈希：PBKDF2-SHA256 + 每个密码独立随机盐（旧版固定密钥 HMAC 哈希仍可校验，便于平滑升级）
// 2. 令牌：HMAC-SHA256(token) + 版本号（可整体吊销）
// 3. Cookie：全站密码 / 文章密码共用同一套派生与校验逻辑，避免 worker.js 与 api.js 各写一份
// 4. 比较：恒定时间比较，防止时序攻击

const TOKEN_EXPIRY = 48 * 60 * 60 * 1000;      // 令牌 48 小时过期
const COOKIE_MAX_AGE = 24 * 60 * 60;           // Cookie 24 小时（秒）
const COOKIE_TTL_MS = COOKIE_MAX_AGE * 1000;
const AUTH_HKDF_SALT = 'cloudflare-light-blog-auth-v1';    // 令牌派生用的 HKDF salt
const COOKIE_HKDF_SALT = 'cloudflare-light-blog-cookie-v1'; // Cookie 派生用的 HKDF salt（保持旧值，老 Cookie 仍有效）
const LEGACY_HASH_SALT = 'cloudflare-light-blog-auth-v1';   // 旧版哈希用的固定 salt（仅用于兼容校验）
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_PREFIX = 'pbkdf2$';

const encoder = new TextEncoder();

// ==================== 基础工具 ====================

/**
 * 字节数组转十六进制
 */
function bytesToHex(bytes) {
  const arr = new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, '0');
  return out;
}

/**
 * 十六进制转字节数组（非法输入返回 null）
 */
function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const v = parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(v)) return null;
    out[i] = v;
  }
  return out;
}

/**
 * 统一的字节视图（支持 string / TypedArray / ArrayBuffer）
 */
function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'string') return encoder.encode(value);
  return new Uint8Array(0);
}

/**
 * 恒定时间比较（长度不同或空值直接返回 false）
 */
export function timingSafeEqual(a, b) {
  const ua = toBytes(a);
  const ub = toBytes(b);
  if (ua.length === 0 || ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

/**
 * 从任意密钥材料派生 HMAC 密钥（HKDF，不直接使用密码原文）
 */
async function deriveHmacKey(material, info, salt) {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(material), 'HKDF', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(salt), info: encoder.encode(info) },
    keyMaterial,
    256
  );
  return crypto.subtle.importKey('raw', derivedBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/**
 * 生成随机十六进制串
 */
function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bytesToHex(arr);
}

// ==================== 密码哈希 ====================

/**
 * 旧版哈希（HMAC-SHA256 + 全局固定密钥）。
 * 保留只为兼容历史数据：这种哈希的密钥是公开常量，安全性等价于 SHA256(password)。
 * 校验通过后应尽快用 hashPassword 重写为 PBKDF2 格式。
 */
async function legacyHashPassword(password) {
  const key = await deriveHmacKey('password-salt-' + LEGACY_HASH_SALT, 'hmac-key', LEGACY_HASH_SALT);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(password));
  return bytesToHex(sig);
}

/**
 * 哈希密码（存储用）：PBKDF2-SHA256 + 随机盐
 * 格式：pbkdf2$<iterations>$<saltHex>$<hashHex>
 */
export async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    256
  );
  return PBKDF2_PREFIX + PBKDF2_ITERATIONS + '$' + bytesToHex(salt) + '$' + bytesToHex(bits);
}

/**
 * 校验密码（兼容旧版哈希）
 * @returns {Promise<boolean>}
 */
export async function verifyPasswordHash(password, stored) {
  if (!password || !stored || typeof stored !== 'string') return false;

  if (stored.startsWith(PBKDF2_PREFIX)) {
    const parts = stored.split('$');
    // ['pbkdf2', iterations, saltHex, hashHex]
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const salt = hexToBytes(parts[2]);
    const expected = hexToBytes(parts[3]);
    if (!iterations || iterations < 1000 || !salt || !expected) return false;
    try {
      const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
        keyMaterial,
        expected.length * 8
      );
      return timingSafeEqual(bits, expected);
    } catch (e) {
      console.error('[Auth] PBKDF2 校验失败:', e.message || 'Error');
      return false;
    }
  }

  // 旧格式：64 位十六进制 HMAC
  try {
    const legacy = await legacyHashPassword(String(password));
    return timingSafeEqual(legacy, stored);
  } catch (e) {
    return false;
  }
}

/**
 * 判断存储的哈希是否需要升级到新格式
 */
export function needsRehash(stored) {
  return typeof stored === 'string' && stored.length > 0 && !stored.startsWith(PBKDF2_PREFIX);
}

// ==================== 管理端令牌 ====================

/**
 * 生成认证令牌（带过期时间与版本号）
 * 格式：timestamp.signature
 */
export async function generateToken(password, version = 0) {
  const timestamp = Date.now();
  const key = await deriveHmacKey(password, 'hmac-key', AUTH_HKDF_SALT);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode('auth:' + timestamp + ':' + version));
  return timestamp + '.' + bytesToHex(signature);
}

/**
 * 验证认证令牌（恒定时间比较）
 */
export async function verifyToken(token, password, version = 0) {
  if (!token || !password || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const timestamp = parseInt(parts[0], 10);
  if (isNaN(timestamp)) return false;
  if (Date.now() - timestamp > TOKEN_EXPIRY) return false;

  const provided = hexToBytes(parts[1]);
  if (!provided) return false;

  try {
    const key = await deriveHmacKey(password, 'hmac-key', AUTH_HKDF_SALT);
    const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode('auth:' + timestamp + ':' + version));
    return timingSafeEqual(expectedSig, provided);
  } catch (e) {
    console.error('[Auth]', e.message || 'Error');
    return false;
  }
}

/**
 * 读取当前令牌版本（用于整体吊销）
 */
export async function getTokenVersion(env) {
  if (!env || !env.DB) return 0;
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key='token_version'").first();
    return row ? parseInt(row.value, 10) || 0 : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * 递增令牌版本，使所有已签发令牌立即失效（登出 / 改密码后调用）
 */
export async function invalidateAllTokens(env) {
  if (!env || !env.DB) return false;
  try {
    const current = await getTokenVersion(env);
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('token_version', ?)")
      .bind(String(current + 1)).run();
    return true;
  } catch (e) {
    console.error('[Auth] 注销失败:', e.message || 'Error');
    return false;
  }
}

/**
 * 从请求中提取并验证令牌
 * 未配置 ADMIN_PASSWORD 时视为免认证（保持既有行为）
 */
export async function authenticateRequest(request, env) {
  if (!env.ADMIN_PASSWORD) return true;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  const token = authHeader.slice(7).trim();
  const version = await getTokenVersion(env);
  return verifyToken(token, env.ADMIN_PASSWORD, version);
}

// ==================== Cookie（全站密码 / 文章密码）====================

/**
 * 解析 Cookie 头为对象
 */
export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  String(cookieHeader).split(';').forEach(function (part) {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const name = part.slice(0, idx).trim();
    let value = part.slice(idx + 1).trim();
    if (!name) return;
    // 与 buildCookie 里的 encodeURIComponent 配对解码；
    // 遇到非法百分号编码（可能被人为构造）时退回原始值，绝不抛异常。
    if (value.indexOf('%') >= 0) {
      try { value = decodeURIComponent(value); } catch (e) { /* 保留原值 */ }
    }
    out[name] = value;
  });
  return out;
}

/**
 * 生成全站密码认证 Cookie
 */
export async function generateSiteAuthCookie(passwordHash) {
  const timestamp = Date.now();
  const key = await deriveHmacKey(passwordHash, 'site-auth', COOKIE_HKDF_SALT);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode('site_auth:' + timestamp));
  return timestamp + '.' + bytesToHex(sig);
}

/**
 * 校验全站密码认证 Cookie
 */
export async function verifySiteAuthCookie(cookieValue, passwordHash) {
  if (!cookieValue || !passwordHash) return false;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return false;
  const timestamp = parseInt(parts[0], 10);
  if (isNaN(timestamp) || Date.now() - timestamp > COOKIE_TTL_MS) return false;
  const provided = hexToBytes(parts[1]);
  if (!provided) return false;
  try {
    const key = await deriveHmacKey(passwordHash, 'site-auth', COOKIE_HKDF_SALT);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode('site_auth:' + timestamp));
    return timingSafeEqual(sig, provided);
  } catch (e) {
    return false;
  }
}

/**
 * 生成文章密码认证 Cookie
 */
export async function generatePostAuthCookie(postId, passwordHash) {
  const timestamp = Date.now();
  const key = await deriveHmacKey(passwordHash, 'post-auth-' + postId, COOKIE_HKDF_SALT);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode('post_auth:' + timestamp));
  return timestamp + '.' + bytesToHex(sig);
}

/**
 * 校验文章密码认证 Cookie
 */
export async function verifyPostAuthCookie(cookieValue, passwordHash, postId) {
  if (!cookieValue || !passwordHash) return false;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return false;
  const timestamp = parseInt(parts[0], 10);
  if (isNaN(timestamp) || Date.now() - timestamp > COOKIE_TTL_MS) return false;
  const provided = hexToBytes(parts[1]);
  if (!provided) return false;
  try {
    const key = await deriveHmacKey(passwordHash, 'post-auth-' + postId, COOKIE_HKDF_SALT);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode('post_auth:' + timestamp));
    return timingSafeEqual(sig, provided);
  } catch (e) {
    return false;
  }
}

/**
 * 组装 Set-Cookie 字符串
 */
export function buildCookie(name, value, options = {}) {
  // 注意 maxAge=0 表示“立即失效”，这里必须用 !== undefined 判断，
  // 否则 0 会被当成缺省值而回退到 24 小时，导致退出登录清不掉 Cookie。
  const maxAge = options.maxAge !== undefined ? options.maxAge : COOKIE_MAX_AGE;
  const parts = [name + '=' + encodeURIComponent(value === undefined || value === null ? '' : value), 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAge > 0) parts.push('Max-Age=' + maxAge);
  else parts.push('Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export { COOKIE_MAX_AGE };
