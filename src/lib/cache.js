// ==================== 缓存模块（Workers Cache API）====================
// 缓存键带上「内容版本号」：任何内容变更只需把版本号 +1，旧缓存立即不可达，
// 无需逐个 URL 去删除（Cache API 不支持按前缀批量清理）。
// 所有缓存操作都包在 try/catch 里：缓存故障绝不能影响页面正常输出。

const DEFAULT_TTL = 300;

/**
 * 生成带版本的缓存键
 */
export function versionedCacheKey(request, version) {
  // 兼容传入 Request 或 URL 字符串，避免调用方写错类型直接抛错
  const u = new URL(typeof request === 'string' ? request : request.url);
  u.searchParams.set('__v', String(version || '1'));
  return new Request(u.toString(), { method: 'GET' });
}

/**
 * 读取缓存
 */
export async function getCached(request, version) {
  try {
    return await caches.default.match(versionedCacheKey(request, version));
  } catch (e) {
    return null;
  }
}

/**
 * 写入缓存（TTL 由写入时指定的 max-age 决定）
 */
export async function putCached(request, version, response, ttl = DEFAULT_TTL) {
  try {
    const cloned = response.clone();
    cloned.headers.set('Cache-Control', `public, max-age=${ttl}`);
    await caches.default.put(versionedCacheKey(request, version), cloned);
  } catch (e) {
    console.error('[Cache] 写入失败(可忽略):', e.message || 'Error');
  }
}

/**
 * 说明：这里**不再提供按 URL 删除缓存**的能力。
 * 因为所有缓存键都带 `__v=<内容版本号>`，删一个无版本号的 URL 匹配不到任何条目；
 * 内容变更时统一走 `bumpContentVersion()`，旧键立即不可达，比逐个删除更可靠。
 */
