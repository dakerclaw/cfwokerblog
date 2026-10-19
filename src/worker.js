// ==================== Cloudflare Light Blog - 主入口 ====================
// 路由 / 全站密码门禁 / SSR 首页与文章页 / 页面缓存 / 浏览计数

import { html, json, escapeHtml, handleOptions } from './lib/utils.js';
import { initDB, getSettings, getSiteData, listPosts } from './lib/db.js';
import { verifySiteAuthCookie, verifyPasswordHash, parseCookies } from './lib/auth.js';
import { getCached, putCached } from './lib/cache.js';
import { handleAPI } from './api.js';
import { getFrontendHTML } from './views/frontend.js';
import { getPostHTML } from './views/post.js';
import { getPasswordHTML } from './views/password.js';
import { getAdminHTML } from './views/admin.js';
import { FONT_LINKS, styleBlocks } from './lib/layout.js';

const HOME_PAGE_SIZE = 10;
const HOME_CACHE_TTL = 120;      // 首页缓存 2 分钟（内容变更时版本号变化即刻失效）
const BOT_PATTERN = /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|headless|wget|curl|python-requests|java\/|monitor|uptime|preview/i;

// 数据库初始化状态缓存（每个 isolate 只做一次）
let dbInitPromise = null;

function ensureDB(env) {
  if (!dbInitPromise) {
    dbInitPromise = initDB(env).catch(e => {
      dbInitPromise = null;
      throw e;
    });
  }
  return dbInitPromise;
}

/** 静态资源路径（不参与全站密码门禁，否则密码页自身的图标都加载不出来） */
function isStaticPath(path) {
  return path === '/favicon.ico'
    || path === '/og-default.png'
    || path.startsWith('/icon/')
    || path.startsWith('/vendor/');
}

export default {
  async fetch(request, env, ctx) {
    try {
      await ensureDB(env);
    } catch (e) {
      // 初始化失败也要能给出明确响应，避免直接 1101
      console.error('[Worker] 数据库初始化失败:', e.message || 'Error');
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 预检
    const settings = await getSettings(env);
    const optionsResponse = handleOptions(request, settings.allowed_origins || '*');
    if (optionsResponse) return optionsResponse;

    try {
      // ========== 1. 静态资源 ==========
      if (isStaticPath(path)) {
        if (path === '/favicon.ico') return handleAsset(env, request, '/icon/favicon.ico', { emptyStatus: 204 });
        return handleAsset(env, request, path);
      }

      // 全站密码认证接口本身必须在门禁之外
      if (path === '/api/site-auth' || path === '/api/health') {
        return handleAPI(request, env, path);
      }

      // robots.txt 始终可读（加密站点会直接输出 Disallow: /）
      if (path === '/robots.txt') return handleRobots(settings);

      // ========== 2. 全站密码门禁 ==========
      if (settings.site_password) {
        const cookies = parseCookies(request.headers.get('Cookie'));
        const ok = await verifySiteAuthCookie(cookies.site_auth, settings.site_password);
        if (!ok) {
          if (path.startsWith('/api/')) {
            return json({ error: '需要全站密码' }, 401);
          }
          // 搜索/订阅源在未通过验证时同样只回密码页
          return showSitePasswordPage(settings);
        }
      }

      // ========== 3. 路由分发 ==========
      if (path === '/sitemap.xml' || path === '/rss.xml') return handleAPI(request, env, path);
      if (path.startsWith('/api/')) return handleAPI(request, env, path);
      if (path === '/admin' || path === '/admin/' || path.startsWith('/admin/')) {
        return handleAdmin(request, env, path);
      }
      if (path.startsWith('/post/')) return handlePostPage(request, env, path, ctx);
      if (path === '/' || path === '') return handleFrontendPage(request, env, settings);

      return renderNotFound(settings);
    } catch (e) {
      console.error('[Worker] 未捕获错误:', e.message || 'Error');
      return new Response('服务器内部错误', {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  }
};

// ==================== 静态资源 ====================

/**
 * 从静态资源绑定读取文件；不存在时返回 404（绝不抛出，否则 Cloudflare 会回 1101）
 */
async function handleAsset(env, request, assetPath, options = {}) {
  if (!env.ASSETS) {
    return new Response(null, { status: options.emptyStatus || 404 });
  }
  try {
    const assetUrl = new URL(assetPath, request.url).toString();
    const resp = await env.ASSETS.fetch(new Request(assetUrl, { cf: { cacheEverything: true } }));
    if (resp && resp.status !== 404 && resp.status !== 500) return resp;
  } catch (e) {
    // 资源不存在时 ASSETS.fetch 会抛异常，这里降级为 404
  }
  if (options.emptyStatus) return new Response(null, { status: options.emptyStatus });
  return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// ==================== 页面 ====================

/**
 * 首页：服务端渲染列表 + 带内容版本号的缓存
 */
async function handleFrontendPage(request, env, settings) {
  const url = new URL(request.url);
  const base = {
    category: (url.searchParams.get('category') || '').trim(),
    tag: (url.searchParams.get('tag') || '').trim(),
    q: (url.searchParams.get('q') || '').trim().slice(0, 50),
    page: Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1)
  };

  // 全站加密时（Cookie 相关）不缓存，避免把已解锁页面缓存给他人
  const cacheable = !settings.site_password;
  if (cacheable) {
    const cached = await getCached(request, settings.content_version || '1');
    if (cached) return cached;
  }

  const [list, data] = await Promise.all([
    listPosts(env, {
      page: base.page,
      limit: HOME_PAGE_SIZE,
      category: base.category,
      tag: base.tag,
      q: base.q,
      pinnedPostId: settings.pinned_post_id
    }),
    getSiteData(env, settings)
  ]);

  const response = html(getFrontendHTML(settings, request.url, data, {
    posts: list.posts,
    pagination: list.pagination,
    pinnedPostId: settings.pinned_post_id || '',
    base: {
      category: base.category,
      categoryName: list.query.categoryName || '',
      tag: base.tag,
      q: base.q
    }
  }));
  response.headers.set('Cache-Control', 'no-cache');

  if (cacheable && !base.q) {
    // 搜索页结果变化快，不缓存
    await putCached(request, settings.content_version || '1', response, HOME_CACHE_TTL);
  }
  return response;
}

/**
 * 文章详情
 */
async function handlePostPage(request, env, path, ctx) {
  const match = path.match(/^\/post\/(\d{6})\/(\d+)\/?$/);
  const settings = await getSettings(env);
  if (!match) return renderNotFound(settings);

  const id = parseInt(match[2], 10);
  if (!Number.isInteger(id) || id <= 0) return renderNotFound(settings);

  const post = await env.DB.prepare("SELECT * FROM posts WHERE id=? AND status='published'").bind(id).first();
  if (!post) return renderNotFound(settings);

  // 密码保护：Cookie 优先，同时兼容 ?password= 旧链接
  if (post.password && post.password !== '') {
    const cookies = parseCookies(request.headers.get('Cookie'));
    let authenticated = await verifyPostAuthCookie(cookies['post_auth_' + id], post.password, id);
    if (!authenticated) {
      const provided = new URL(request.url).searchParams.get('password');
      if (provided) authenticated = await verifyPasswordHash(provided, post.password);
    }
    if (!authenticated) {
      const resp = html(getPasswordHTML(post, settings));
      resp.headers.set('Cache-Control', 'no-store');
      return resp;
    }
  }

  const data = await getSiteData(env, settings);
  const resp = html(getPostHTML(post, settings, request.url, data));
  resp.headers.set('Cache-Control', 'no-cache');

  // 浏览计数：只在真正返回文章内容时统计，且忽略明显的爬虫
  const ua = request.headers.get('User-Agent') || '';
  if (request.method === 'GET' && !BOT_PATTERN.test(ua)) {
    const increment = env.DB.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id=?').bind(id).run();
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(increment.catch(() => {}));
    } else {
      increment.catch(() => {});
    }
  }
  return resp;
}

/**
 * 全站密码页
 */
function showSitePasswordPage(settings) {
  const siteName = settings.site_name || '我的博客';
  const resp = html(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>访问验证 - ${escapeHtml(siteName)}</title>
  <link rel="icon" href="/icon/favicon.ico">
${FONT_LINKS}
${styleBlocks(settings, `
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .box { background: var(--card-bg, #f7f3df); padding: 44px; border-radius: 20px; box-shadow: 0 4px 10px rgba(107,92,67,0.42); text-align: center; border: 2px solid var(--card-border, #e8e0cc); max-width: 400px; width: 100%; box-sizing: border-box; }
    h2 { margin-bottom: 8px; color: var(--text-primary, #794f27); font-weight: 700; font-size: 1.4em; }
    p { color: var(--text-secondary, #9f927d); margin-bottom: 24px; font-size: 0.9em; }
    input { width: 100%; padding: 14px 20px; border: 2.5px solid var(--input-border, #c4b89e); border-radius: 50px; font-size: 15px; margin-bottom: 16px; background: var(--body-bg, #f8f8f0); color: var(--text-body, #725d42); box-sizing: border-box; outline: none; box-shadow: 0 3px 0 0 var(--input-shadow, #d4c9b4); transition: all 0.25s; }
    input:focus { border-color: var(--btn-bg, #19c8b9); box-shadow: 0 3px 0 0 var(--btn-shadow, #11a89b); }
    button { width: 100%; padding: 14px; background: var(--btn-bg, #19c8b9); color: #fff; border: none; border-radius: 50px; font-size: 16px; font-weight: 600; cursor: pointer; box-shadow: 0 5px 0 0 var(--btn-shadow, #11a89b); transition: all 0.25s; }
    button:hover { transform: translateY(-1px); box-shadow: 0 6px 0 0 var(--btn-shadow, #11a89b); }
    button:active { transform: translateY(2px); box-shadow: 0 1px 0 0 var(--btn-shadow, #11a89b); }
    .error { color: var(--danger-bg, #e05a5a); margin-top: 12px; font-size: 0.9em; display: none; }
`)}
</head>
<body>
  <div class="box">
    <h2>🔒 ${escapeHtml(siteName)}</h2>
    <p>请输入访问密码</p>
    <form id="authForm">
      <input type="password" id="pwd" placeholder="请输入密码" autocomplete="current-password" autofocus>
      <button type="submit" id="submitBtn">进入</button>
    </form>
    <div class="error" id="error">密码错误，请重试</div>
  </div>
  <script>
    document.getElementById('authForm').onsubmit = function(e) {
      e.preventDefault();
      var pwd = document.getElementById('pwd').value;
      var errEl = document.getElementById('error');
      var btn = document.getElementById('submitBtn');
      if (!pwd) return;
      errEl.style.display = 'none';
      btn.disabled = true;
      fetch('/api/site-auth', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ password: pwd })
      }).then(function(r){ return r.json(); }).then(function(d){
        if (d && d.success) { window.location.reload(); }
        else {
          errEl.textContent = (d && d.error) ? d.error : '密码错误，请重试';
          errEl.style.display = 'block';
          btn.disabled = false;
        }
      }).catch(function(){
        errEl.textContent = '网络错误，请重试';
        errEl.style.display = 'block';
        btn.disabled = false;
      });
    };
  </script>
</body>
</html>`);
  resp.headers.set('Cache-Control', 'no-store');
  return resp;
}

/**
 * 404 页（真实 404 状态码，避免“未知路径返回首页 200”的软 404 拖累 SEO）
 */
function renderNotFound(settings) {
  settings = settings || {};
  const resp = html(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, follow">
  <title>页面不存在 - ${escapeHtml(settings.site_name || '我的博客')}</title>
  <link rel="icon" href="/icon/favicon.ico">
${FONT_LINKS}
${styleBlocks(settings, `
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; text-align: center; }
    .box { max-width: 460px; }
    h1 { font-size: 3em; color: var(--text-primary, #794f27); margin-bottom: 8px; }
    p { color: var(--text-secondary, #9f927d); margin-bottom: 24px; }
    a { display: inline-block; padding: 12px 28px; background: var(--btn-bg, #19c8b9); color: #fff; text-decoration: none; border-radius: 50px; font-weight: 600; box-shadow: 0 4px 0 0 var(--btn-shadow, #11a89b); }
    a:active { transform: translateY(2px); box-shadow: 0 1px 0 0 var(--btn-shadow, #11a89b); }
`)}
</head>
<body>
  <div class="box">
    <h1>404</h1>
    <p>你访问的页面不存在或已被删除</p>
    <a href="/">返回首页</a>
  </div>
</body>
</html>`, 404);
  resp.headers.set('Cache-Control', 'no-store');
  return resp;
}

/**
 * robots.txt
 * 加密站点直接禁止收录（否则搜索引擎会抓到密码页并索引标题）
 */
function handleRobots(settings) {
  const allowRobots = settings.allow_robots !== '0' && !settings.site_password;
  const content = allowRobots
    ? `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: /sitemap.xml
`
    : `User-agent: *
Disallow: /
`;

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
  });
}

/**
 * 后台页面
 */
async function handleAdmin(request, env, path) {
  if (path === '/admin' || path === '/admin/') {
    const resp = html(getAdminHTML());
    resp.headers.set('Cache-Control', 'no-store');
    return resp;
  }
  // 后台子路径不存在（避免 /admin/anything 也返回后台首页造成困惑）
  const settings = await getSettings(env);
  return renderNotFound(settings);
}
