// ==================== API 处理模块（分页 + 错误处理）====================

import { json, errorResponse, generateSlug, getCorsHeaders, normalizeLinkUrl } from './lib/utils.js';
import { generateToken, verifyToken, authenticateRequest, hashPassword, verifyPasswordHash } from './lib/auth.js';
import { initDB, getSettings, saveSettings } from './lib/db.js';
import { handleUpload } from './lib/image.js';

// ==================== 常量 ====================
const RATE_MAX_5 = 5;                    // 最大尝试次数
const RATE_WINDOW_10M = 10 * 60 * 1000;  // 10分钟窗口
const RATE_WINDOW_1H = 60 * 60 * 1000;   // 1小时窗口
const COOKIE_MAX_AGE = 86400;            // Cookie 有效期 24小时（秒）

// ==================== 公共函数 ====================

/**
 * 速率限制：检查并记录（合并为单次操作减少竞态窗口）
 * @returns {boolean} true=允许, false=超限
 */
async function checkRateLimit(env, key, maxAttempts, windowMs) {
  try {
    const now = Date.now();
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
    let attempts = [];
    if (row) { try { attempts = JSON.parse(row.value); } catch (e) {} }
    // 清理过期记录
    attempts = attempts.filter(t => now - t < windowMs);
    if (attempts.length >= maxAttempts) return false;
    // 记录本次尝试
    attempts.push(now);
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, JSON.stringify(attempts)).run();
    return true;
  } catch (e) { console.error('[RateLimit]', e.message || 'Error'); return true; }
}

/**
 * 清除速率限制记录
 */
async function clearRateLimit(env, key) {
  try { await env.DB.prepare("DELETE FROM settings WHERE key=?").bind(key).run(); } catch (e) {}
}

/**
 * 使用 HKDF 派生 HMAC 密钥（不直接使用密码原文）
 */
async function deriveHMACKey(password, info) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'HKDF', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('cloudflare-light-blog-cookie-v1'), info: encoder.encode(info) },
    keyMaterial, 256
  );
  return crypto.subtle.importKey('raw', derivedBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/**
 * 生成站点认证 Cookie
 */
async function generateSiteAuthCookie(password) {
  const timestamp = Date.now();
  const key = await deriveHMACKey(password, 'site-auth');
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('site_auth:' + timestamp));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return timestamp + '.' + sigHex;
}

/**
 * 生成文章认证 Cookie
 */
async function generatePostAuthCookie(postId, passwordHash) {
  const timestamp = Date.now();
  const encoder = new TextEncoder();
  const key = await deriveHMACKey(passwordHash, 'post-auth-' + postId);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode('post_auth:' + timestamp));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return timestamp + '.' + sigHex;
}

/**
 * 处理所有 API 请求
 */
export async function handleAPI(request, env, path) {
  const method = request.method;
  const settings = await getSettings(env);
  const cors = getCorsHeaders(request, settings.allowed_origins || '*');
  const jsonResp = (data, status = 200) => {
    const resp = json(data, status);
    Object.entries(cors).forEach(([k, v]) => resp.headers.set(k, v));
    return resp;
  };

  try {
    // ========== 文章密码认证（5次/1小时限制）==========
    if (path === '/api/post-auth' && method === 'POST') {
      try {
        const body = await request.json();
        const { postId, password } = body;
        if (!postId || !password) return json({ success: false, error: '参数错误' }, 400);
        if (!Number.isFinite(Number(postId))) return json({ success: false, error: '参数错误' }, 400);

        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateKey = 'post_auth_rate_' + clientIP + '_' + postId;
        if (!await checkRateLimit(env, rateKey, RATE_MAX_5, RATE_WINDOW_1H)) {
          return json({ success: false, error: '密码错误次数过多，请 1 小时后再试' }, 429);
        }

        const post = await env.DB.prepare("SELECT password FROM posts WHERE id=? AND status='published'").bind(postId).first();
        if (!post) return json({ success: false, error: '文章不存在' }, 404);
        if (await verifyPasswordHash(password, post.password)) {
          await clearRateLimit(env, rateKey);
          const cookieValue = await generatePostAuthCookie(postId, post.password);
          const resp = json({ success: true });
          resp.headers.set('Set-Cookie', 'post_auth_' + postId + '=' + cookieValue + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + COOKIE_MAX_AGE);
          return resp;
        }
        return json({ success: false, error: '密码错误' }, 401);
      } catch (e) {
        return json({ success: false, error: '认证失败' }, 500);
      }
    }

    // ========== 全站密码认证（5次/1小时限制）==========
    if (path === '/api/site-auth' && method === 'POST') {
      try {
        const body = await request.json();
        const settings = await getSettings(env);
        if (!settings.site_password) {
          return json({ success: true, message: '未设置全站密码' });
        }

        // 速率限制检查（5次/1小时）
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateKey = 'site_auth_rate_' + clientIP;
        if (!await checkRateLimit(env, rateKey, RATE_MAX_5, RATE_WINDOW_1H)) {
          return json({ success: false, error: '密码错误次数过多，请 1 小时后再试' }, 429);
        }

        // 使用哈希验证密码
        if (await verifyPasswordHash(body.password, settings.site_password)) {
          await clearRateLimit(env, rateKey);
          const cookieValue = await generateSiteAuthCookie(settings.site_password);
          const resp = json({ success: true });
          resp.headers.set('Set-Cookie', 'site_auth=' + cookieValue + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + COOKIE_MAX_AGE);
          return resp;
        }
        // 记录失败尝试
        return json({ success: false, error: '密码错误' }, 401);
      } catch (e) {
        console.error((e.message || 'Error').substring(0, 100));
        return json({ success: false, error: '认证失败' }, 500);
      }
    }

    // ========== 登录接口 ==========
    if (path === '/api/login' && method === 'POST') {
      const body = await request.json();
      if (!env.ADMIN_PASSWORD) {
        return json({ success: true, token: 'no-auth' });
      }

      // 速率限制（5次/10分钟）
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateKey = 'login_rate_' + clientIP;
      if (!await checkRateLimit(env, rateKey, RATE_MAX_5, RATE_WINDOW_10M)) {
        return json({ success: false, error: '登录尝试次数过多，请 10 分钟后再试' }, 429);
      }

      // 验证账号
      if (env.ADMIN_USERNAME && body.username !== env.ADMIN_USERNAME) {
        return json({ success: false, error: '账号错误' }, 401);
      }

      if (body.password === env.ADMIN_PASSWORD) {
        await clearRateLimit(env, rateKey);
        const token = await generateToken(env.ADMIN_PASSWORD);
        return json({ success: true, token });
      }

      return json({ success: false, error: '密码错误' }, 401);
    }

    // ========== 健康检查 ==========
  if (path === '/api/health' && method === 'GET') {
    try {
      await env.DB.prepare("SELECT 1").first();
      return json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
    } catch (e) {
      return json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() }, 503);
    }
  }

  // ========== Sitemap ==========
    if (path === '/sitemap.xml' && method === 'GET') {
      return handleSitemap(request, env);
    }

    // ========== 公开 API（不需要认证）==========
    if (path === '/api/posts' && method === 'GET') {
      return handleGetPosts(request, env);
    }
    if (path === '/api/post/' && method === 'GET') {
      return handleGetPost(request, env);
    }
    if (path === '/api/categories' && method === 'GET') {
      return handleGetCategories(env);
    }
    if (path === '/api/settings' && method === 'GET') {
      return handleGetSettings(env);
    }
    if (path === '/api/stats' && method === 'GET') {
      return handleGetStats(env);
    }
    if (path === '/api/links' && method === 'GET') {
      return handleGetLinks(env);
    }
    if (path === '/api/upload' && method === 'POST') {
      return handleUploadAPI(request, env);
    }

    // ========== 认证检查（以下 API 需要管理员权限）==========
    const isAuthed = await authenticateRequest(request, env);
    if (!isAuthed) {
      return errorResponse('未授权', 401);
    }

    // ========== 管理 API ==========
    if (path === '/api/admin/posts' && method === 'GET') {
      return handleAdminGetPosts(env);
    }
    if (path === '/api/admin/post' && method === 'POST') {
      return handleCreatePost(request, env);
    }
    if (path === '/api/admin/post' && method === 'PUT') {
      return handleUpdatePost(request, env);
    }
    if (path === '/api/admin/post' && method === 'DELETE') {
      return handleDeletePost(request, env);
    }
    if (path === '/api/admin/trash' && method === 'GET') {
      return handleGetTrash(env);
    }
    if (path === '/api/admin/restore' && method === 'POST') {
      return handleRestorePost(request, env);
    }
    if (path === '/api/admin/permanent-delete' && method === 'POST') {
      return handlePermanentDelete(request, env);
    }
    if (path === '/api/admin/import-wordpress' && method === 'POST') {
      return handleImportWordPress(request, env);
    }

    // 分类管理
    if (path === '/api/category' && method === 'POST') {
      return handleSaveCategory(request, env);
    }
    if (path.startsWith('/api/category') && method === 'DELETE') {
      return handleDeleteCategory(request, env);
    }

    // 友链管理
    if (path === '/api/links' && method === 'POST') {
      return handleSaveLinks(request, env);
    }

    // 设置管理
    if (path === '/api/settings' && method === 'POST') {
      return handleSaveSettings(request, env);
    }

    return errorResponse('未找到接口', 404);
  } catch (e) {
    return errorResponse('服务器错误', 500, e);
  }
}

// ==================== 公开 API 实现 ====================

/**
 * 获取文章列表（支持分页 + 分类筛选）
 */
async function handleGetPosts(request, env) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit')) || 10));
  const offset = (page - 1) * limit;

  let where = "WHERE status='published'";
  const params = [];

  if (category) {
    const catResult = await env.DB.prepare(
      "SELECT name FROM categories WHERE slug=?"
    ).bind(category).first();
    const catName = catResult ? catResult.name : category;
    where += " AND category=?";
    params.push(catName);
  }

  // 获取总数
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM posts ${where}`
  ).bind(...params).first();
  const total = countResult?.total || 0;

  // 获取分页数据
  const { results } = await env.DB.prepare(
    `SELECT id, title, slug, excerpt, cover_image, category, tags, view_count, created_at, password FROM posts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();

  // 获取置顶文章 ID
  const pinnedSetting = await env.DB.prepare(
    "SELECT value FROM settings WHERE key='pinned_post_id'"
  ).first();
  const pinned_post_id = pinnedSetting?.value || '';

  const resp = json({
    data: results,
    pinned_post_id,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  });
  resp.headers.set('Cache-Control', 'public, max-age=60');
  return resp;
}

/**
 * 获取单篇文章
 */
async function handleGetPost(request, env) {
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return errorResponse('缺少 slug', 400);

  const post = await env.DB.prepare(
    "SELECT * FROM posts WHERE slug=? AND status='published'"
  ).bind(slug).first();

  if (!post) return errorResponse('文章不存在', 404);

  // 异步更新浏览次数（不阻塞响应）
  env.DB.prepare("UPDATE posts SET view_count = view_count + 1 WHERE id=?").bind(post.id).run();

  return json(post);
}

/**
 * 获取分类列表
 */
async function handleGetCategories(env) {
  const { results } = await env.DB.prepare("SELECT * FROM categories ORDER BY name").all();
  const resp = json(results || []);
  resp.headers.set('Cache-Control', 'public, max-age=300');
  return resp;
}

/**
 * 获取网站设置
 */
async function handleGetSettings(env) {
  const settings = await getSettings(env);
  return json(settings);
}

/**
 * 获取统计信息
 */
async function handleGetStats(env) {
  const [postCount, catCount, tagCount, latestPost] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as cnt FROM posts WHERE status='published'").first(),
    env.DB.prepare("SELECT COUNT(*) as cnt FROM categories").first(),
    env.DB.prepare("SELECT tags FROM posts WHERE status='published' AND tags IS NOT NULL AND tags != ''").all(),
    env.DB.prepare("SELECT created_at FROM posts WHERE status='published' ORDER BY created_at DESC LIMIT 1").first()
  ]);

  // 统计去重标签数
  const tagSet = new Set();
  if (tagCount.results) {
    tagCount.results.forEach(r => {
      if (r.tags) r.tags.split(',').forEach(t => { const s = t.trim(); if (s) tagSet.add(s); });
    });
  }

  const resp = json({
    postCount: postCount?.cnt ?? 0,
    catCount: catCount?.cnt ?? 0,
    tagCount: tagSet.size,
    latestDate: latestPost?.created_at || ''
  });
  resp.headers.set('Cache-Control', 'public, max-age=60');
  return resp;
}

/**
 * 获取友链列表
 */
async function handleGetLinks(env) {
  const links = await env.DB.prepare("SELECT value FROM settings WHERE key='site_links'").first();
  const linksData = links?.value || '';
  if (!linksData) return json([]);

  const result = linksData.split('\n').reduce((acc, line) => {
    const idx = line.indexOf(',');
    if (idx > 0) {
      const name = line.substring(0, idx).trim();
      const url = normalizeLinkUrl(line.substring(idx + 1));
      if (name && url) acc.push({ name, url });
    }
    return acc;
  }, []);

  return json(result);
}

/**
 * 图片上传
 */
async function handleUploadAPI(request, env) {
  const result = await handleUpload(request, env);
  if (result.error) {
    return json({ error: result.error }, result.status || 500);
  }
  return json(result);
}

/**
 * 生成 Sitemap
 */
async function handleSitemap(request, env) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const { results } = await env.DB.prepare(
    "SELECT slug, created_at, updated_at FROM posts WHERE status='published' ORDER BY updated_at DESC"
  ).all();

  const urls = results.map(p => {
    // 详情页路由要求 /post/YYYYMM/ID 格式（见 worker.js handlePostPage），sitemap 必须与之保持一致
    const d = new Date(p.created_at);
    const ym = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
    return `  <url>
    <loc>${baseUrl}/post/${ym}/${p.id}</loc>
    <lastmod>${p.updated_at || p.created_at}</lastmod>
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
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  });
}

// ==================== 管理 API 实现 ====================

async function handleAdminGetPosts(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM posts WHERE status != 'trash' ORDER BY created_at DESC"
  ).all();
  return json(results || []);
}

async function handleCreatePost(request, env) {
  const body = await request.json();
  if (!body.title || !body.title.trim()) return errorResponse('标题不能为空', 400);
  if (!body.content || !body.content.trim()) return errorResponse('内容不能为空', 400);
  const slug = body.slug || generateSlug(body.title);

  let coverImage = body.cover_image;
  if (coverImage && coverImage.startsWith('data:')) {
    const { uploadImage } = await import('./lib/image.js');
    coverImage = await uploadImage(env, coverImage, slug);
  }

  const now = new Date().toISOString();
  const published_at = body.published_at ? new Date(body.published_at).toISOString() : now;

  const result = await env.DB.prepare(`
    INSERT INTO posts (title, slug, content, excerpt, cover_image, category, tags, status, password, created_at, updated_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.title,
    slug,
    body.content,
    body.excerpt || (body.content ? body.content.substring(0, 200) : ''),
    coverImage || '',
    body.category || '未分类',
    body.tags || '',
    body.status || 'draft',
    body.password ? await hashPassword(body.password) : '',
    now,
    now,
    published_at
  ).run();

  return json({ success: true, id: result.meta?.last_row_id });
}

async function handleUpdatePost(request, env) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse('缺少 id', 400);

  const body = await request.json();
  if (!body.title || !body.title.trim()) return errorResponse('标题不能为空', 400);
  if (!body.content || !body.content.trim()) return errorResponse('内容不能为空', 400);
  let coverImage = body.cover_image;
  if (coverImage && coverImage.startsWith('data:')) {
    const { uploadImage } = await import('./lib/image.js');
    coverImage = await uploadImage(env, coverImage, id);
  }

  const now = new Date().toISOString();
  const published_at = body.published_at ? new Date(body.published_at).toISOString() : now;

  await env.DB.prepare(`
    UPDATE posts SET title=?, content=?, excerpt=?, cover_image=?, category=?, tags=?, status=?, password=?, updated_at=?, published_at=? WHERE id=?
  `).bind(
    body.title,
    body.content,
    body.excerpt || (body.content ? body.content.substring(0, 200) : ''),
    coverImage || body.cover_image || '',
    body.category || '未分类',
    body.tags || '',
    body.status || 'draft',
    body.password ? await hashPassword(body.password) : '',
    now,
    published_at,
    id
  ).run();

  return json({ success: true });
}

async function handleDeletePost(request, env) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse('缺少 id', 400);

  await env.DB.prepare("UPDATE posts SET status='trash' WHERE id=?").bind(id).run();
  return json({ success: true });
}

async function handleGetTrash(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM posts WHERE status='trash' ORDER BY created_at DESC"
  ).all();
  return json(results || []);
}

async function handleRestorePost(request, env) {
  const body = await request.json();
  await env.DB.prepare("UPDATE posts SET status='draft' WHERE id=?").bind(body.id).run();
  return json({ success: true });
}

async function handlePermanentDelete(request, env) {
  const body = await request.json();
  await env.DB.prepare("DELETE FROM posts WHERE id=? AND status='trash'").bind(body.id).run();
  return json({ success: true });
}



async function handleSaveCategory(request, env) {
  const body = await request.json();
  if (body.id) {
    await env.DB.prepare("UPDATE categories SET name=?, slug=?, description=? WHERE id=?")
      .bind(body.name, body.slug, body.description || '', body.id).run();
  } else {
    await env.DB.prepare("INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)")
      .bind(body.name, body.slug, body.description || '').run();
  }
  return json({ success: true });
}

async function handleDeleteCategory(request, env) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return errorResponse('缺少 id', 400);
  await env.DB.prepare("DELETE FROM categories WHERE id=?").bind(id).run();
  return json({ success: true });
}

async function handleSaveLinks(request, env) {
  const body = await request.json();
  const text = Array.isArray(body) ? body.map(l => `${l.name},${l.url}`).join('\n') : '';
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
    .bind('site_links', text).run();
  return json({ success: true });
}

async function handleSaveSettings(request, env) {
  try {
    const body = await request.json();
    await saveSettings(env, body);
    return json({ success: true });
  } catch (e) {
    console.error('[API] 保存设置失败:', e);
    return json({ success: false, error: '保存设置失败: ' + e.message }, 500);
  }
}

/**
 * 导入 WordPress 文章
 */
async function handleImportWordPress(request, env) {
  try {
    const { xml } = await request.json();
    if (!xml) return json({ success: false, error: '缺少 XML 数据' }, 400);

    // 解析 XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    
    // 检查解析错误
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return json({ success: false, error: 'XML 格式错误' }, 400);
    }

    const items = doc.querySelectorAll('item');
    let success = 0;
    let failed = 0;
    const errors = [];

    for (const item of items) {
      try {
        // 只导入文章类型
        const postType = item.getElementsByTagName('wp:post_type')[0]?.textContent;
        if (postType !== 'post') continue;

        const title = item.getElementsByTagName('title')[0]?.textContent || '';
        const content = item.getElementsByTagName('content:encoded')[0]?.textContent || '';
        const excerpt = item.getElementsByTagName('excerpt:encoded')[0]?.textContent || '';
        const wpStatus = item.getElementsByTagName('wp:status')[0]?.textContent || 'draft';
        const wpPostName = item.getElementsByTagName('wp:post_name')[0]?.textContent || '';
        const wpPostDate = item.getElementsByTagName('wp:post_date')[0]?.textContent || '';

        // 获取分类
        const categories = [];
        const tags = [];
        const categoryElements = item.querySelectorAll('category');
        categoryElements.forEach(cat => {
          const domain = cat.getAttribute('domain');
          const name = cat.textContent;
          if (domain === 'category' && name) {
            categories.push(name);
          } else if (domain === 'post_tag' && name) {
            tags.push(name);
          }
        });

        // 生成 slug
        let slug = wpPostName || generateSlug(title);
        // 确保 slug 唯一性（添加随机后缀以防冲突）
        slug = slug + '-' + Math.random().toString(36).substring(2, 7);

        // 确定状态
        let status = 'draft';
        if (wpStatus === 'publish') status = 'published';
        else if (wpStatus === 'draft') status = 'draft';
        else if (wpStatus === 'private') status = 'draft';

        // 处理日期
        const now = new Date().toISOString();
        let publishedAt = null;
        if (wpPostDate) {
          try {
            publishedAt = new Date(wpPostDate.replace(' ', 'T')).toISOString();
          } catch (e) {}
        }

        // 创建文章分类（如果不存在）
        for (const catName of categories) {
          const existingCat = await env.DB.prepare(
            "SELECT id FROM categories WHERE name=?"
          ).bind(catName).first();
          
          if (!existingCat) {
            const catSlug = generateSlug(catName);
            await env.DB.prepare(
              "INSERT INTO categories (name, slug, description) VALUES (?, ?, '')"
            ).bind(catName, catSlug).run();
          }
        }

        // 插入文章
        await env.DB.prepare(`
          INSERT INTO posts (title, slug, content, excerpt, category, tags, status, created_at, updated_at, published_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          title,
          slug,
          content,
          excerpt || (content ? content.substring(0, 200) : ''),
          categories[0] || '未分类',
          tags.join(', '),
          status,
          publishedAt || now,
          now,
          publishedAt
        ).run();

        success++;
      } catch (e) {
        failed++;
        errors.push(e.message);
        console.error('[Import] 导入文章失败:', e);
      }
    }

    return json({ 
      success, 
      failed, 
      total: items.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined
    });
  } catch (e) {
    console.error('[API] 导入失败:', e);
    return json({ success: false, error: '导入失败: ' + e.message }, 500);
  }
}
