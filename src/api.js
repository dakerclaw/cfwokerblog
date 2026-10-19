// ==================== API 处理模块 ====================
// 安全要点（相对旧版的修复）：
//  1. /api/settings 只返回白名单字段，不再把 site_password 哈希、token_version 等内部数据公开。
//  2. /api/posts、/api/post/ 不再返回 password 哈希，只返回 has_password；受保护文章正文必须凭 Cookie 才能取到。
//  3. /api/upload 移到认证之后（旧版任何人可无限制写入 base64 图片）。
//  4. 全站密码统一走 PBKDF2 哈希 + 三态保存（保持不变 / 设置新密码 / 清除），避免“把哈希再哈希一遍”导致密码失效。
//  5. 登录 / 文章密码限流数据放入独立表，不再写进 settings（否则会被公开接口带出去）。
//  6. 内容变更后自动递增内容版本号，页面缓存立即失效。

import { json, errorResponse, generateSlug, getCorsHeaders, parseLinks } from './lib/utils.js';
import {
  generateToken, authenticateRequest, hashPassword, verifyPasswordHash,
  invalidateAllTokens, generateSiteAuthCookie, verifySiteAuthCookie,
  generatePostAuthCookie, verifyPostAuthCookie, parseCookies, buildCookie
} from './lib/auth.js';
import {
  getSettings, getPublicSettings, saveSettings, setSitePassword, checkRateLimit, clearRateLimit,
  listPosts, normalizeTags, tagsToIndex, getTagCounts, getCategoriesWithCounts, getSiteStats,
  bumpContentVersion, getSetting, postUrl
} from './lib/db.js';
import { handleUpload } from './lib/image.js';
import { getCached, putCached } from './lib/cache.js';

const MAX_CONTENT_BYTES = 1900000;   // D1 单行上限约 2MB，留出余量
const MAX_IMPORT_POSTS = 100;        // 单次导入上限，避免超出 Worker 子请求额度

// 公开读接口（无需管理员 Token，但受全站密码门禁约束）
const PUBLIC_READ_PATHS = ['/api/posts', '/api/post/', '/api/categories', '/api/settings', '/api/stats', '/api/links', '/api/tags'];

// ==================== 入口 ====================

export async function handleAPI(request, env, path) {
  const method = request.method;
  const settings = await getSettings(env);
  const cors = getCorsHeaders(request, settings.allowed_origins || '*');
  const jsonResp = (data, status = 200) => {
    const resp = json(data, status);
    Object.entries(cors).forEach(([k, v]) => resp.headers.set(k, v));
    return resp;
  };
  const secure = new URL(request.url).protocol === 'https:';
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  // 全站密码门禁：设了密码就必须携带有效 Cookie。
  // 否则任何人可以直接请求 /api/posts 等接口拿到全部标题与摘要，密码形同虚设。
  // 注意：密码页自身依赖的 /api/site-auth、/api/health 在此之后才判定，不受影响。
  const siteAuthOK = !settings.site_password || await verifySiteAuthCookie(
    parseCookies(request.headers.get('Cookie') || '')['site_auth'],
    settings.site_password
  );

  try {
    // ========== 文章密码认证（5 次 / 1 小时）==========
    if (path === '/api/post-auth' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const postId = Number(body.postId);
      if (!Number.isFinite(postId) || postId <= 0 || !body.password) {
        return jsonResp({ success: false, error: '参数错误' }, 400);
      }

      const rateKey = 'post_auth:' + clientIP + ':' + postId;
      const limit = await checkRateLimit(env, rateKey);
      if (!limit.allowed) {
        return jsonResp({ success: false, error: `密码错误次数过多，请 ${limit.retryAfter} 分钟后再试` }, 429);
      }

      const post = await env.DB.prepare("SELECT id, password FROM posts WHERE id=? AND status='published'").bind(postId).first();
      if (!post) return jsonResp({ success: false, error: '文章不存在' }, 404);
      if (!post.password) return jsonResp({ success: true, message: '该文章无需密码' });

      if (await verifyPasswordHash(body.password, post.password)) {
        await clearRateLimit(env, rateKey);
        const cookieValue = await generatePostAuthCookie(postId, post.password);
        const resp = jsonResp({ success: true });
        resp.headers.set('Set-Cookie', buildCookie('post_auth_' + postId, cookieValue, { secure }));
        return resp;
      }
      return jsonResp({ success: false, error: '密码错误' }, 401);
    }

    // ========== 全站密码认证（5 次 / 15 分钟）==========
    if (path === '/api/site-auth' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!settings.site_password) {
        return jsonResp({ success: true, message: '未设置全站密码' });
      }
      const rateKey = 'site_auth:' + clientIP;
      const limit = await checkRateLimit(env, rateKey);
      if (!limit.allowed) {
        return jsonResp({ success: false, error: `密码错误次数过多，请 ${limit.retryAfter} 分钟后再试` }, 429);
      }
      if (await verifyPasswordHash(body.password, settings.site_password)) {
        await clearRateLimit(env, rateKey);
        const cookieValue = await generateSiteAuthCookie(settings.site_password);
        const resp = jsonResp({ success: true });
        resp.headers.set('Set-Cookie', buildCookie('site_auth', cookieValue, { secure }));
        return resp;
      }
      return jsonResp({ success: false, error: '密码错误' }, 401);
    }

    // ========== 管理端登录（5 次 / 15 分钟）==========
    if (path === '/api/login' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!env.ADMIN_PASSWORD) return jsonResp({ success: true, token: 'no-auth' });

      const rateKey = 'login:' + clientIP;
      const limit = await checkRateLimit(env, rateKey);
      if (!limit.allowed) {
        return jsonResp({ success: false, error: `登录尝试次数过多，请 ${limit.retryAfter} 分钟后再试` }, 429);
      }
      if (env.ADMIN_USERNAME && body.username !== env.ADMIN_USERNAME) {
        return jsonResp({ success: false, error: '账号或密码错误' }, 401);
      }
      if (body.password === env.ADMIN_PASSWORD) {
        await clearRateLimit(env, rateKey);
        const token = await generateToken(env.ADMIN_PASSWORD, await getTokenVersionSafe(env));
        return jsonResp({ success: true, token });
      }
      return jsonResp({ success: false, error: '账号或密码错误' }, 401);
    }

    // ========== 健康检查 ==========
    if (path === '/api/health' && method === 'GET') {
      try {
        await env.DB.prepare('SELECT 1').first();
        return jsonResp({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
      } catch (e) {
        return jsonResp({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() }, 503);
      }
    }

    // ========== Sitemap / RSS ==========
    // 全站密码开启时同样需要 Cookie，避免通过订阅源/站点地图泄露标题
    if (path === '/sitemap.xml' && method === 'GET') {
      if (!siteAuthOK) return jsonResp({ success: false, error: '需要密码', locked: true }, 401);
      return handleSitemap(request, env);
    }
    if (path === '/rss.xml' && method === 'GET') {
      if (!siteAuthOK) return jsonResp({ success: false, error: '需要密码', locked: true }, 401);
      return handleRss(request, env);
    }

    // ========== 公开 API（无需管理员认证，但受全站密码约束）==========
    if (PUBLIC_READ_PATHS.indexOf(path) >= 0 && method === 'GET') {
      if (!siteAuthOK) return jsonResp({ success: false, error: '需要密码', locked: true }, 401);
      // 读多写少的接口走边缘缓存（键含内容版本号，任何内容变更立即失效）
      if (path === '/api/posts') {
        // 关键词搜索是低频定制请求，不缓存
        if (new URL(request.url).searchParams.get('q')) return handleGetPosts(request, env, settings);
        return withCache(request, settings, 60, () => handleGetPosts(request, env, settings));
      }
      // 文章详情响应随文章密码 Cookie 变化，绝不能缓存
      if (path === '/api/post/') return handleGetPost(request, env);
      if (path === '/api/categories') return withCache(request, settings, 300, () => handleGetCategories(env));
      if (path === '/api/tags') return withCache(request, settings, 300, () => handleGetTags(env));
      if (path === '/api/stats') return withCache(request, settings, 60, () => handleGetStats(env));
      if (path === '/api/settings') return jsonResp(getPublicSettings(settings));
      if (path === '/api/links') return jsonResp(parseLinks(settings.site_links));
    }

    // ========== 登出（需要有效令牌）==========
    if (path === '/api/logout' && method === 'POST') {
      if (!(await authenticateRequest(request, env))) return errorResponse('未授权', 401);
      await invalidateAllTokens(env);
      const resp = jsonResp({ success: true });
      resp.headers.set('Set-Cookie', buildCookie('admin_token', '', { secure, maxAge: 0 }));
      return resp;
    }

    // ========== 以下 API 需要管理员权限 ==========
    if (!(await authenticateRequest(request, env))) {
      return errorResponse('未授权', 401);
    }

    if (path === '/api/upload' && method === 'POST') {
      const result = await handleUpload(request, env);
      if (result.error) return jsonResp({ error: result.error }, result.status || 500);
      return jsonResp(result);
    }

    if (path === '/api/admin/posts' && method === 'GET') return handleAdminGetPosts(env);
    if (path === '/api/admin/post' && method === 'POST') return handleCreatePost(request, env);
    if (path === '/api/admin/post' && method === 'PUT') return handleUpdatePost(request, env);
    if (path === '/api/admin/post' && method === 'DELETE') return handleDeletePost(request, env);
    if (path === '/api/admin/trash' && method === 'GET') return handleGetTrash(env);
    if (path === '/api/admin/restore' && method === 'POST') return handleRestorePost(request, env);
    if (path === '/api/admin/permanent-delete' && method === 'POST') return handlePermanentDelete(request, env);
    if (path === '/api/admin/posts/batch-delete' && method === 'POST') return handleBatchDeletePosts(request, env);
    if (path === '/api/admin/trash/empty' && method === 'POST') return handleEmptyTrash(env);
    if (path === '/api/admin/import-wordpress' && method === 'POST') return handleImportWordPress(request, env, jsonResp);
    if (path === '/api/admin/settings' && method === 'GET') {
      return jsonResp({ ...getPublicSettings(settings), has_site_password: !!(settings.site_password) });
    }

    if (path === '/api/category' && method === 'POST') return handleSaveCategory(request, env, jsonResp);
    if (path.startsWith('/api/category') && method === 'DELETE') return handleDeleteCategory(request, env);
    if (path === '/api/links' && method === 'POST') return handleSaveLinks(request, env);
    if (path === '/api/settings' && method === 'POST') return handleSaveSettings(request, env, jsonResp);

    return errorResponse('未找到接口', 404);
  } catch (e) {
    return errorResponse('服务器错误', 500, e);
  }
}

async function getTokenVersionSafe(env) {
  try {
    const v = await getSetting(env, 'token_version');
    return parseInt(v, 10) || 0;
  } catch (e) {
    return 0;
  }
}

/**
 * 公共读接口的边缘缓存。
 * 缓存键 = 完整 URL + 内容版本号：任何内容变更都会 bumpContentVersion()，旧键立即不可达，
 * 不需要（也无法）按前缀批量删除。缓存故障一律降级为直接查库，绝不影响接口可用性。
 */
async function withCache(request, settings, ttl, producer) {
  const version = (settings && settings.content_version) || '1';
  const hit = await getCached(request, version);
  if (hit) return hit;
  const resp = await producer();
  if (resp && resp.status === 200) await putCached(request, version, resp, ttl);
  return resp;
}

// ==================== 公开 API ====================

/**
 * 文章列表（分页 + 分类 / 标签 / 关键词，全部服务端过滤）
 */
async function handleGetPosts(request, env, settings) {
  const url = new URL(request.url);
  const result = await listPosts(env, {
    page: url.searchParams.get('page'),
    limit: url.searchParams.get('limit'),
    category: url.searchParams.get('category'),
    tag: url.searchParams.get('tag'),
    q: url.searchParams.get('q'),
    pinnedPostId: settings ? settings.pinned_post_id : ''
  });

  const resp = json({
    data: result.posts,
    pagination: result.pagination,
    query: result.query,
    pinned_post_id: (settings && settings.pinned_post_id) || ''
  });
  // 搜索结果是动态的，不缓存；普通列表可以短暂缓存
  resp.headers.set('Cache-Control', result.query.q ? 'no-store' : 'public, max-age=60');
  return resp;
}

/**
 * 单篇文章（受保护文章必须凭 Cookie 才能拿到正文）
 */
async function handleGetPost(request, env) {
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return errorResponse('缺少 slug', 400);

  const post = await env.DB.prepare(
    "SELECT id, title, slug, content, excerpt, category, tags, cover_image, status, view_count, created_at, updated_at, published_at, password FROM posts WHERE slug=? AND status='published'"
  ).bind(slug).first();

  if (!post) return errorResponse('文章不存在', 404);

  const hasPassword = !!(post.password && post.password !== '');
  if (hasPassword) {
    const cookies = parseCookies(request.headers.get('Cookie'));
    const ok = await verifyPostAuthCookie(cookies['post_auth_' + post.id], post.password, post.id);
    if (!ok) return json({ error: '该文章需要密码', locked: true, id: post.id, title: post.title }, 401);
  }

  return json({
    id: post.id,
    title: post.title,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    category: post.category,
    tags: post.tags,
    cover_image: post.cover_image,
    view_count: post.view_count,
    created_at: post.created_at,
    updated_at: post.updated_at,
    published_at: post.published_at,
    has_password: hasPassword,
    url: postUrl(post)
  });
}

async function handleGetCategories(env) {
  const resp = json(await getCategoriesWithCounts(env));
  resp.headers.set('Cache-Control', 'public, max-age=300');
  return resp;
}

async function handleGetTags(env) {
  const resp = json(await getTagCounts(env));
  resp.headers.set('Cache-Control', 'public, max-age=300');
  return resp;
}

async function handleGetStats(env) {
  const [stats, tags] = await Promise.all([getSiteStats(env), getTagCounts(env)]);
  const resp = json({
    postCount: stats.postCount,
    catCount: stats.categoryCount,
    tagCount: tags.length,
    latestDate: stats.latestPost ? stats.latestPost.date : ''
  });
  resp.headers.set('Cache-Control', 'public, max-age=60');
  return resp;
}

/**
 * Sitemap（仅收录已发布、非密码保护的文章，避免把加密页提交给搜索引擎）
 */
async function handleSitemap(request, env) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const { results } = await env.DB.prepare(
    "SELECT id, created_at, updated_at, published_at FROM posts " +
    "WHERE status='published' AND (password IS NULL OR password = '') " +
    'ORDER BY published_at DESC'
  ).all();

  const urls = (results || []).map(p => {
    const loc = baseUrl + postUrl(p);
    const lastmod = (p.updated_at || p.published_at || p.created_at || '').substring(0, 10);
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }).join('\n');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${urls}
</urlset>`;

  return new Response(sitemap, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' }
  });
}

/**
 * RSS 2.0 订阅源（取最近 20 篇）
 */
async function handleRss(request, env) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const settings = await getSettings(env);
  const siteName = settings.site_name || '我的博客';

  const { results } = await env.DB.prepare(
    "SELECT id, title, excerpt, content, created_at, updated_at, published_at FROM posts " +
    "WHERE status='published' AND (password IS NULL OR password = '') " +
    'ORDER BY published_at DESC LIMIT 20'
  ).all();

  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const items = (results || []).map(p => {
    const link = baseUrl + postUrl(p);
    const desc = p.excerpt || (p.content || '').substring(0, 200);
    const date = new Date(p.published_at || p.created_at).toUTCString();
    return `  <item>
    <title>${esc(p.title)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <pubDate>${date}</pubDate>
    <description>${esc(desc)}</description>
  </item>`;
  }).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${esc(siteName)}</title>
  <link>${baseUrl}/</link>
  <description>${esc(settings.site_description || siteName)}</description>
  <language>zh-CN</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;

  return new Response(rss, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' }
  });
}

// ==================== 管理 API ====================

async function handleAdminGetPosts(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, title, content, excerpt, category, tags, status, cover_image, view_count, created_at, updated_at, published_at, " +
    "CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END AS has_password " +
    "FROM posts WHERE status != 'trash' ORDER BY published_at DESC, id DESC"
  ).all();
  return json(results || []);
}

/**
 * 校验正文体积（base64 图片很容易把单行顶到 D1 的 2MB 上限）
 */
function checkSize(...fields) {
  const total = fields.reduce((sum, f) => sum + (f ? String(f).length : 0), 0);
  if (total > MAX_CONTENT_BYTES) {
    return '内容过大（含图片约 ' + Math.round(total / 1024) + 'KB）。请压缩图片或拆分文章后重试。';
  }
  return null;
}

async function handleCreatePost(request, env) {
  const body = await request.json();
  if (!body.title || !body.title.trim()) return errorResponse('标题不能为空', 400);
  if (!body.content || !body.content.trim()) return errorResponse('内容不能为空', 400);
  const sizeError = checkSize(body.content, body.excerpt, body.cover_image);
  if (sizeError) return json({ error: sizeError }, 413);

  const slug = body.slug || generateSlug(body.title) || ('post-' + Date.now());
  const tags = normalizeTags(body.tags);
  const now = new Date().toISOString();
  const publishedAt = body.published_at ? new Date(body.published_at).toISOString() : now;

  let coverImage = body.cover_image || '';
  if (coverImage.startsWith('data:')) {
    const { uploadImage } = await import('./lib/image.js');
    coverImage = await uploadImage(env, coverImage, slug);
  }

  const password = body.password_action === 'set' && body.password
    ? await hashPassword(String(body.password))
    : '';

  const result = await env.DB.prepare(`
    INSERT INTO posts (title, slug, content, excerpt, cover_image, category, tags, tags_index, status, password, created_at, updated_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.title,
    slug,
    body.content,
    body.excerpt || (body.content ? body.content.substring(0, 200) : ''),
    coverImage,
    body.category || '未分类',
    tags,
    tagsToIndex(tags),
    body.status === 'published' ? 'published' : 'draft',
    password,
    now,
    now,
    publishedAt
  ).run();

  await bumpContentVersion(env);
  return json({ success: true, id: result.meta ? result.meta.last_row_id : null });
}

async function handleUpdatePost(request, env) {
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10);
  if (!Number.isInteger(id) || id <= 0) return errorResponse('缺少 id', 400);

  const body = await request.json();
  if (!body.title || !body.title.trim()) return errorResponse('标题不能为空', 400);
  if (!body.content || !body.content.trim()) return errorResponse('内容不能为空', 400);
  const sizeError = checkSize(body.content, body.excerpt, body.cover_image);
  if (sizeError) return json({ error: sizeError }, 413);

  const existing = await env.DB.prepare('SELECT password, published_at FROM posts WHERE id=?').bind(id).first();
  if (!existing) return errorResponse('文章不存在', 404);

  const tags = normalizeTags(body.tags);
  const now = new Date().toISOString();

  // published_at：显式传入才更新，否则保持原值（旧版每次编辑都会把发布日期改成当前时间）
  let publishedAt = existing.published_at || now;
  if (body.published_at) {
    const parsed = new Date(body.published_at);
    if (!isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
  }

  // password 三态：set 覆盖 / clear 清除 / keep（缺省）保持不变
  let password = existing.password || '';
  if (body.password_action === 'set') {
    if (!body.password) return errorResponse('请输入新密码', 400);
    password = await hashPassword(String(body.password));
  } else if (body.password_action === 'clear') {
    password = '';
  }

  let coverImage = body.cover_image || '';
  if (coverImage.startsWith('data:')) {
    const { uploadImage } = await import('./lib/image.js');
    coverImage = await uploadImage(env, coverImage, String(id));
  }

  await env.DB.prepare(`
    UPDATE posts SET title=?, content=?, excerpt=?, cover_image=?, category=?, tags=?, tags_index=?, status=?, password=?, updated_at=?, published_at=? WHERE id=?
  `).bind(
    body.title,
    body.content,
    body.excerpt || (body.content ? body.content.substring(0, 200) : ''),
    coverImage,
    body.category || '未分类',
    tags,
    tagsToIndex(tags),
    body.status === 'published' ? 'published' : 'draft',
    password,
    now,
    publishedAt,
    id
  ).run();

  await bumpContentVersion(env);
  return json({ success: true });
}

async function handleDeletePost(request, env) {
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10);
  if (!Number.isInteger(id) || id <= 0) return errorResponse('缺少 id', 400);
  await env.DB.prepare("UPDATE posts SET status='trash' WHERE id=?").bind(id).run();
  await bumpContentVersion(env);
  return json({ success: true });
}

async function handleGetTrash(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, title, category, status, created_at, updated_at FROM posts WHERE status='trash' ORDER BY created_at DESC"
  ).all();
  return json(results || []);
}

async function handleRestorePost(request, env) {
  const body = await request.json().catch(() => ({}));
  const id = parseInt(body.id, 10);
  if (!Number.isInteger(id) || id <= 0) return errorResponse('缺少 id', 400);
  await env.DB.prepare("UPDATE posts SET status='draft' WHERE id=?").bind(id).run();
  await bumpContentVersion(env);
  return json({ success: true });
}

async function handlePermanentDelete(request, env) {
  const body = await request.json().catch(() => ({}));
  const id = parseInt(body.id, 10);
  if (!Number.isInteger(id) || id <= 0) return errorResponse('缺少 id', 400);
  await env.DB.prepare("DELETE FROM posts WHERE id=? AND status='trash'").bind(id).run();
  return json({ success: true });
}

async function handleBatchDeletePosts(request, env) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(id => Number.isInteger(id) && id > 0) : [];
  if (ids.length === 0) return errorResponse('缺少有效的 ids', 400);
  const placeholders = ids.map(() => '?').join(',');
  await env.DB.prepare(`UPDATE posts SET status='trash' WHERE id IN (${placeholders})`).bind(...ids).run();
  await bumpContentVersion(env);
  return json({ success: true, count: ids.length });
}

async function handleEmptyTrash(env) {
  await env.DB.prepare("DELETE FROM posts WHERE status='trash'").run();
  return json({ success: true });
}

async function handleSaveCategory(request, env, jsonResp) {
  const body = await request.json();
  if (!body.name || !body.name.trim()) return jsonResp({ success: false, error: '分类名不能为空' }, 400);
  const name = body.name.trim();
  const slug = (body.slug || generateSlug(name) || '').trim();
  const oldName = body.old_name || body.previous_name || null;

  let previousName = oldName;
  if (body.id && !previousName) {
    const row = await env.DB.prepare('SELECT name FROM categories WHERE id=?').bind(body.id).first();
    if (row) previousName = row.name;
  }

  try {
    if (body.id) {
      await env.DB.prepare('UPDATE categories SET name=?, slug=?, description=? WHERE id=?')
        .bind(name, slug, body.description || '', body.id).run();
      // 分类改名后同步文章上的分类字段，否则文章会“掉”到不存在的分类里
      if (previousName && previousName !== name) {
        await env.DB.prepare('UPDATE posts SET category=? WHERE category=?').bind(name, previousName).run();
      }
    } else {
      await env.DB.prepare('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)')
        .bind(name, slug, body.description || '').run();
    }
  } catch (e) {
    if (String(e.message || '').indexOf('UNIQUE') >= 0) {
      return jsonResp({ success: false, error: '分类名或别名已存在' }, 409);
    }
    throw e;
  }

  await bumpContentVersion(env);
  return jsonResp({ success: true });
}

async function handleDeleteCategory(request, env) {
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id'), 10);
  if (!Number.isInteger(id) || id <= 0) return errorResponse('缺少 id', 400);

  const row = await env.DB.prepare('SELECT name FROM categories WHERE id=?').bind(id).first();
  if (!row) return errorResponse('分类不存在', 404);

  const fallback = url.searchParams.get('fallback') || '未分类';
  // 先迁移文章再删分类，避免文章挂在已删除的分类上
  if (url.searchParams.get('keep_posts') !== '1') {
    await env.DB.prepare('UPDATE posts SET category=? WHERE category=?').bind(fallback, row.name).run();
  }
  await env.DB.prepare('DELETE FROM categories WHERE id=?').bind(id).run();
  await bumpContentVersion(env);
  return json({ success: true, movedTo: fallback });
}

async function handleSaveLinks(request, env) {
  const body = await request.json();
  const text = Array.isArray(body)
    ? body.map(l => `${String(l.name || '').trim()},${String(l.url || '').trim()}`).join('\n')
    : '';
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('site_links', ?)").bind(text).run();
  await bumpContentVersion(env);
  return json({ success: true });
}

/**
 * 保存设置
 * - 只允许白名单字段（防止任意键写入 / 覆盖 token_version 等内部字段）
 * - 全站密码三态：keep / set / clear
 */
async function handleSaveSettings(request, env, jsonResp) {
  try {
    const body = await request.json();
    const action = body.site_password_action || 'keep';
    const value = body.site_password_value || '';

    const payload = Object.assign({}, body);
    delete payload.site_password;
    delete payload.site_password_action;
    delete payload.site_password_value;

    if (action === 'set') {
      if (!String(value).trim()) {
        return jsonResp({ success: false, error: '请输入新的全站密码' }, 400);
      }
      if (String(value).trim().length < 4) {
        return jsonResp({ success: false, error: '密码至少 4 位' }, 400);
      }
      await setSitePassword(env, value);
    } else if (action === 'clear') {
      await setSitePassword(env, '');
    }

    const saved = await saveSettings(env, payload);
    // 内容版本号 +1 后，旧的首页缓存键（带 __v=旧版本）立即不可达，无需逐个 URL 删除。
    await bumpContentVersion(env);
    return jsonResp({ success: true, saved, has_site_password: action === 'set' ? true : (action === 'clear' ? false : undefined) });
  } catch (e) {
    console.error('[API] 保存设置失败:', e.message || 'Error');
    return jsonResp({ success: false, error: '保存设置失败' }, 500);
  }
}

/**
 * 导入 WordPress 文章。
 * 旧版在这里用 DOMParser 解析 XML —— Workers 运行时不提供 DOM API，导入必然失败。
 * 现在由后台页面用浏览器自带的 DOMParser 解析好后，POST 结构化数据过来。
 */
async function handleImportWordPress(request, env, jsonResp) {
  const body = await request.json().catch(() => ({}));

  if (body.xml) {
    return jsonResp({
      success: false,
      error: '导入接口已改为接收解析后的数据，请在最新版后台页面中重新导入'
    }, 400);
  }

  const list = Array.isArray(body.posts) ? body.posts : [];
  if (list.length === 0) return jsonResp({ success: false, error: '没有可导入的文章' }, 400);
  if (list.length > MAX_IMPORT_POSTS) {
    return jsonResp({ success: false, error: `单次最多导入 ${MAX_IMPORT_POSTS} 篇，请分批导入` }, 400);
  }

  let success = 0;
  let failed = 0;
  const errors = [];
  const now = new Date().toISOString();

  // 先补齐分类，避免逐篇重复查询
  const categoryNames = new Set();
  list.forEach(p => {
    const cats = Array.isArray(p.categories) ? p.categories : [];
    cats.forEach(c => { if (c && String(c).trim()) categoryNames.add(String(c).trim()); });
  });
  const existingCats = await env.DB.prepare('SELECT name FROM categories').all();
  const knownCats = new Set(((existingCats && existingCats.results) || []).map(r => r.name));
  for (const name of categoryNames) {
    if (knownCats.has(name)) continue;
    try {
      await env.DB.prepare('INSERT OR IGNORE INTO categories (name, slug, description) VALUES (?, ?, ?)')
        .bind(name, generateSlug(name) || name, '').run();
      knownCats.add(name);
    } catch (e) {
      // 分类建失败不影响文章导入
    }
  }

  for (const item of list) {
    try {
      const title = String(item.title || '').trim();
      const content = String(item.content || '');
      if (!title || !content) { failed++; continue; }

      const status = item.status === 'published' ? 'published' : 'draft';
      const cats = Array.isArray(item.categories) ? item.categories.filter(Boolean) : [];
      const tags = normalizeTags(Array.isArray(item.tags) ? item.tags.join(',') : item.tags);

      let publishedAt = now;
      if (item.date) {
        const d = new Date(item.date);
        if (!isNaN(d.getTime())) publishedAt = d.toISOString();
      }

      const slug = (String(item.slug || generateSlug(title) || 'post') + '-' + Math.random().toString(36).substring(2, 7)).substring(0, 90);

      await env.DB.prepare(`
        INSERT INTO posts (title, slug, content, excerpt, category, tags, tags_index, status, created_at, updated_at, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        title,
        slug,
        content,
        String(item.excerpt || content.substring(0, 200)),
        cats[0] || '未分类',
        tags,
        tagsToIndex(tags),
        status,
        publishedAt,
        now,
        publishedAt
      ).run();
      success++;
    } catch (e) {
      failed++;
      if (errors.length < 5) errors.push(e.message || 'Error');
    }
  }

  await bumpContentVersion(env);
  const result = { success: true, imported: success, failed, total: list.length };
  if (errors.length) result.errors = errors;
  return jsonResp(result);
}
