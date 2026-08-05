// ==================== Cloudflare Light Blog - 主入口 ====================
// 模块化架构 | HMAC 认证 | 分页 | 缓存 | SEO

import { html, errorResponse, handleOptions, getCorsHeaders, escapeHtml } from './lib/utils.js';
import { initDB, getSettings } from './lib/db.js';
import { authenticateRequest, verifyPasswordHash } from './lib/auth.js';
import { handleAPI } from './api.js';
import { getFrontendHTML } from './views/frontend.js';
import { getPostHTML } from './views/post.js';
import { getPasswordHTML } from './views/password.js';
import { getThemeStyle } from './lib/themes.js';
import { getAdminHTML } from './views/admin.js';

// 数据库初始化状态缓存
let dbInitPromise = null;

function ensureDB(env) {
  if (!dbInitPromise) {
    dbInitPromise = initDB(env).catch(e => {
      dbInitPromise = null; // 失败时重置，允许重试
      throw e;
    });
  }
  return dbInitPromise;
}

export default {
  async fetch(request, env, ctx) {
    // 初始化数据库并获取设置
    await ensureDB(env);
    const siteSettings = await getSettings(env);

    // 处理 CORS 预检请求
    const optionsResponse = handleOptions(request, siteSettings.allowed_origins || '*');
    if (optionsResponse) return optionsResponse;

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 全站密码保护检查
      if (siteSettings.site_password && path !== '/api/site-auth') {
        const cookie = request.headers.get('Cookie') || '';
        const authMatch = cookie.match(/site_auth=([^;]+)/);
        if (authMatch) {
          // 验证 cookie 有效性（HMAC + 24小时过期）
          const valid = await verifySiteAuth(authMatch[1], siteSettings.site_password);
          if (!valid) {
            return showSitePasswordPage(siteSettings);
          }
        } else {
          // API 请求返回 401
          if (path.startsWith('/api/')) {
            return json({ error: '需要全站密码' }, 401);
          }
          return showSitePasswordPage(siteSettings);
        }
      }

      // ========== 路由分发 ==========

      // Sitemap
      if (path === '/sitemap.xml') {
        return handleAPI(request, env, path);
      }

      // robots.txt
      if (path === '/robots.txt') {
        return handleRobots(env);
      }

      // favicon.ico（从 settings 读取或返回空）
      if (path === '/favicon.ico') {
        return handleFavicon(env);
      }

      // API 路由
      if (path.startsWith('/api/')) {
        return handleAPI(request, env, path);
      }

      // 后台路由
      if (path.startsWith('/admin')) {
        return handleAdmin(request, env, path);
      }

      // Icon 图标
      if (path.startsWith('/icon/')) {
        return handleIcon(env, path);
      }

      // 文章详情页
      if (path.startsWith('/post/')) {
        return handlePostPage(request, env, path, ctx);
      }

      // 默认微信分享缩略图（Open Graph 图片）
      if (path === '/og-default.png') {
        if (env.ASSETS) {
          const r = await env.ASSETS.fetch(new Request('/og-default.png'));
          if (r && r.status !== 404) return r;
        }
        return new Response('Not Found', { status: 404 });
      }

      // 首页（带缓存）
      return handleFrontendPage(request, env, ctx);

    } catch (e) {
      console.error('[Worker] 未捕获错误:', e.message || 'Error');
      return errorResponse('服务器错误', 500, e);
    }
  }
};

// ==================== 页面处理 ====================

/**
 * 首页
 * 注意：首页会被 Cloudflare 边缘缓存（Dashboard 的 Edge Cache TTL 规则）。
 * 这里不让浏览器长效缓存（no-cache，每次重新校验），主题/资料改动后能尽快生效；
 * 边缘层缓存在后台“保存设置”时由 purgeFrontendCache 主动清除。
 */
async function handleFrontendPage(request, env, ctx) {
  const settings = await getSettings(env);
  const res = html(getFrontendHTML(settings));
  res.headers.set('Cache-Control', 'no-cache');
  return res;
}

/**
 * 使用 HKDF 派生 HMAC 密钥（与 api.js 保持一致）
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
 * 验证文章密码 cookie
 */
async function verifyPostAuth(cookieValue, passwordHash, postId) {
  try {
    const parts = cookieValue.split('.');
    if (parts.length !== 2) return false;
    const timestamp = parseInt(parts[0]);
    if (isNaN(timestamp)) return false;
    if (Date.now() - timestamp > 86400000) return false;
    const key = await deriveHMACKey(passwordHash, 'post-auth-' + postId);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('post_auth:' + timestamp));
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return parts[1] === expected;
  } catch { return false; }
}

/**
 * 验证全站密码 cookie
 */
async function verifySiteAuth(cookieValue, password) {
  try {
    const parts = cookieValue.split('.');
    if (parts.length !== 2) return false;
    const timestamp = parseInt(parts[0]);
    if (isNaN(timestamp)) return false;
    if (Date.now() - timestamp > 86400000) return false;
    const key = await deriveHMACKey(password, 'site-auth');
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('site_auth:' + timestamp));
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return parts[1] === expected;
  } catch { return false; }
}

/**
 * 显示全站密码页面
 */
function showSitePasswordPage(settings) {
  const siteName = settings.site_name || '我的博客';
  return new Response(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>访问验证 - ${escapeHtml(siteName)}</title>
  <link rel="icon" href="/icon/favicon.ico">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
  <style>${getThemeStyle(settings.site_theme)}</style>
  <style>
    body { font-family: Nunito, 'Noto Sans SC', sans-serif; background: var(--body-bg, #f8f8f0); display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { background: var(--card-bg, #f7f3df); padding: 48px; border-radius: 20px; box-shadow: 0 4px 10px rgba(107,92,67,0.42); text-align: center; border: 2px solid var(--card-border, #e8e0cc); max-width: 400px; width: 90%; }
    h2 { margin-bottom: 8px; color: var(--text-primary, #794f27); font-weight: 700; font-size: 1.4em; }
    p { color: var(--text-secondary, #9f927d); margin-bottom: 24px; font-size: 0.9em; }
    input { width: 100%; padding: 14px 20px; border: 2.5px solid var(--input-border, #c4b89e); border-radius: 50px; font-size: 15px; margin-bottom: 16px; background: var(--body-bg, #f8f8f0); color: var(--text-body, #725d42); box-sizing: border-box; outline: none; box-shadow: 0 3px 0 0 var(--input-shadow, #d4c9b4); transition: all 0.25s; }
    input:focus { border-color: var(--btn-bg, #19c8b9); box-shadow: 0 3px 0 0 var(--btn-shadow, #11a89b); }
    button { width: 100%; padding: 14px; background: var(--btn-bg, #19c8b9); color: #fff; border: none; border-radius: 50px; font-size: 16px; font-weight: 600; cursor: pointer; box-shadow: 0 5px 0 0 var(--btn-shadow, #11a89b); transition: all 0.25s; }
    button:hover { transform: translateY(-1px); box-shadow: 0 6px 0 0 var(--btn-shadow, #11a89b); }
    button:active { transform: translateY(2px); box-shadow: 0 1px 0 0 var(--btn-shadow, #11a89b); }
    .error { color: var(--danger-bg, #e05a5a); margin-top: 12px; font-size: 0.9em; display: none; }
  </style>
</head>
<body>
  <div class="box">
    <h2>🔒 ${escapeHtml(siteName)}</h2>
    <p>请输入访问密码</p>
    <form id="authForm">
      <input type="password" id="pwd" placeholder="请输入密码" autofocus>
      <button type="submit">进入</button>
    </form>
    <div class="error" id="error">密码错误，请重试</div>
  </div>
  <script>
    document.getElementById('authForm').onsubmit = async function(e) {
      e.preventDefault();
      var pwd = document.getElementById('pwd').value;
      if (!pwd) return;
      try {
        var r = await fetch('/api/site-auth', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({password: pwd})
        });
        var d = await r.json();
        if (d.success) {
          window.location.reload();
        } else {
          document.getElementById('error').style.display = 'block';
        }
      } catch(e) {
        document.getElementById('error').style.display = 'block';
      }
    };
  </script>
</body>
</html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

/**
 * robots.txt
 */
async function handleRobots(env) {
  const settings = await getSettings(env);
  const allowRobots = settings.allow_robots !== '0';
  const host = settings.site_name || 'Blog';

  const content = allowRobots
    ? `User-agent: *
Allow: /
Sitemap: /sitemap.xml
`
    : `User-agent: *
Disallow: /
`;

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

/**
 * favicon.ico
 */
async function handleFavicon(env) {
  if (!env.ASSETS) {
    return new Response(null, { status: 204 });
  }

  const response = await env.ASSETS.fetch(new Request('/favicon.ico'));
  if (response && response.status !== 404) {
    return response;
  }

  return new Response(null, { status: 204 });
}

/**
 * Icon 图标（从静态资源读取）
 */
async function handleIcon(env, path) {
  const filename = path.replace('/icon/', '');
  
  if (!env.ASSETS) {
    return new Response('Not Found', { status: 404 });
  }

  const assetPath = '/' + filename;
  const response = await env.ASSETS.fetch(new Request(assetPath));
  
  if (!response || response.status === 404) {
    return new Response('Not Found', { status: 404 });
  }

  return response;
}

/**
 * 文章详情页（带缓存）
 */
async function handlePostPage(request, env, path, ctx) {
  const match = path.match(/^\/post\/(\d{6})\/(\d+)$/);
  if (!match) {
    return html('无效的文章链接', 404);
  }

  const id = parseInt(match[2]);
  const url = new URL(request.url);
  const providedPassword = url.searchParams.get('password');

  // 如果带密码参数，不缓存
  if (providedPassword) {
    return renderPostPage(request, env, id, providedPassword);
  }

  // 文章详情页不缓存（编辑后立即生效）
  return renderPostPage(request, env, id, null);
}

/**
 * 渲染文章详情页
 */
async function renderPostPage(request, env, id, providedPassword) {
  const settings = await getSettings(env);

  const post = await env.DB.prepare(
    "SELECT * FROM posts WHERE id=? AND status='published'"
  ).bind(id).first();

  if (!post) {
    return html('文章不存在', 404);
  }

  // 检查密码保护
  if (post.password && post.password !== '') {
    // 检查 cookie
    const cookie = request.headers.get('Cookie') || '';
    const authMatch = cookie.match(new RegExp('post_auth_' + id + '=([^;]+)'));
    let authenticated = false;
    if (authMatch) {
      authenticated = await verifyPostAuth(authMatch[1], post.password, id);
    }
    // 兼容 URL 参数（旧方式，使用哈希比较）
    if (providedPassword) {
      authenticated = await verifyPasswordHash(providedPassword, post.password);
    }
    if (!authenticated) {
      return html(getPasswordHTML(post, settings));
    }
  }

  return html(getPostHTML(post, settings, request.url));
}

/**
 * 后台管理页面
 */
async function handleAdmin(request, env, path) {
  // 登录页面不需要认证
  if (path === '/admin/' || path === '/admin') {
    return html(getAdminHTML());
  }

  // 其他后台路径需要认证
  if (env.ADMIN_PASSWORD) {
    const isAuthed = await authenticateRequest(request, env);
    if (!isAuthed) {
      return new Response(JSON.stringify({ error: '未授权' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return html(getAdminHTML());
}
