// ==================== 公共布局模块 ====================
// 首页与文章页共用的：样式、页头页脚、侧边栏、文章列表渲染、SEO 文案。
//
// 关键设计：escHtml / fmtDateCN / listUrl / postListHTML / listSeo 会被 toString()
// 内联进页面脚本，由服务端与浏览器端共用同一份渲染代码，避免“服务端渲染一套、
// 客户端又写一套”逐渐跑偏。因此这几个函数必须：
//   1. 自包含（只调用同模块内的其他被注入函数）；
//   2. 源码中不出现反引号与 ${（它们会被嵌进页面模板字符串）。

import { escapeHtml } from './utils.js';
import { getThemeStyle } from './themes.js';

/**
 * 字体：改用**系统字体栈**，不再加载外部 Web 字体。
 *
 * 为什么改（2026-10-30）：
 *   fonts.googleapis.com / fonts.gstatic.com 在国内不稳定，被阻断时会静默回退到 sans-serif，
 *   多一次跨域往返、首屏还可能出现字体闪烁。系统字体栈零请求、零阻断风险。
 * 保留这个导出的名字，是为了不动各视图里的 ${FONT_LINKS} 插值位置（现在恒为空串）；
 * 将来若想恢复 Web 字体，把 <link> 写回这里即可。
 */
export const FONT_LINKS = '';

/** 首页与文章页完全一致的样式（单一来源，避免两处复制粘贴后逐渐分叉） */
export const COMMON_CSS = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'Helvetica Neue', Arial, sans-serif; background: var(--body-bg, #f8f8f0); color: var(--text-body, #725d42); }
    header { background: var(--header-bg, linear-gradient(135deg, #7DC395 0%, #5BAF7A 100%)); color: #fff; padding: 40px 20px; text-align: center; position: relative; overflow: hidden; }
    header::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 40px; background: linear-gradient(transparent, rgba(0,0,0,0.05)); }
    header h1 { font-size: 2.5em; font-weight: 800; margin-bottom: 8px; letter-spacing: 0.02em; text-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    header a { color: #fff; text-decoration: none; }
    header p { opacity: 0.9; font-size: 1.1em; font-weight: 500; }
    main { max-width: 1124px; margin: 30px auto; padding: 0 20px; display: flex; gap: 24px; align-items: flex-start; }
    .sidebar { width: 280px; flex-shrink: 0; }
    .profile-card { background: var(--card-bg, #f7f3df); border-radius: 20px; padding: 24px; box-shadow: 0 4px 10px rgba(107, 92, 67, 0.42); border: 2px solid var(--card-border, #e8e0cc); }
    .profile-card .avatar { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; margin: 0 auto 14px; display: block; border: 3px solid var(--input-border, #c4b89e); background: var(--card-border, #e8e0cc); }
    .profile-card a.avatar-link { display: block; width: fit-content; margin: 0 auto 14px; text-decoration: none; outline: none; }
    .profile-card a.avatar-link .avatar { margin: 0; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease; }
    .profile-card a.avatar-link:hover .avatar { transform: scale(1.06); box-shadow: 0 4px 12px rgba(107, 92, 67, 0.4); }
    .profile-card .name { font-size: 1.1em; font-weight: 700; text-align: center; margin-bottom: 4px; color: var(--text-primary, #794f27); }
    .profile-card .bio { color: var(--text-body, #725d42); font-size: 0.85em; text-align: center; margin-bottom: 14px; font-weight: 500; }
    .profile-card .stats { display: flex; justify-content: center; gap: 16px; padding-bottom: 14px; }
    .profile-card .stat-item { text-align: center; }
    .profile-card .stat-num { font-size: 1.1em; font-weight: 800; color: var(--btn-bg, #19c8b9); }
    .profile-card .stat-label { font-size: 0.75em; color: var(--text-secondary, #9f927d); font-weight: 600; }
    .profile-card h4 { font-size: 0.85em; color: var(--text-secondary, #9f927d); margin: 14px 0 8px; font-weight: 700; letter-spacing: 0.5px; }
    .profile-card .category-list a, .profile-card .link-list a { display: block; padding: 8px 12px; margin: 0 0 6px 0; color: var(--text-body, #725d42); text-decoration: none; background: var(--card-bg, #f0e8d8); border-radius: 12px; font-size: 0.85em; font-weight: 600; transition: all 0.2s; border: 2px solid transparent; outline: none; }
    .profile-card .category-list a:hover, .profile-card .link-list a:hover { background: var(--card-bg, #e6f9f6); border-color: var(--btn-bg, #19c8b9); color: var(--btn-shadow, #11a89b); }
    .tag-item { display: inline-block; padding: 5px 14px; border-radius: 50px; text-decoration: none; white-space: nowrap; font-size: 13px; font-weight: 600; transition: all 0.25s ease; cursor: pointer; }
    .tag-item:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); filter: brightness(0.95); }
    footer { text-align: center; padding: 30px 20px; color: var(--text-secondary, #9f927d); font-size: 0.85em; font-weight: 500; }
    .back-to-top { position: fixed; bottom: 30px; right: 30px; width: 44px; height: 44px; background: var(--btn-bg, #19c8b9); color: #fff; border: none; border-radius: 50%; font-size: 20px; cursor: pointer; box-shadow: 0 4px 0 0 var(--btn-shadow, #11a89b); transition: all 0.25s; display: flex; align-items: center; justify-content: center; z-index: 998; opacity: 0; pointer-events: none; }
    .back-to-top.show { opacity: 1; pointer-events: auto; }
    .back-to-top:hover { transform: translateY(-2px); box-shadow: 0 6px 0 0 var(--btn-shadow, #11a89b); }
    .mobile-nav-toggle { display: none; position: fixed; top: 12px; left: 12px; z-index: 1004; width: 40px; height: 40px; background: var(--btn-bg, #19c8b9); border: none; border-radius: 12px; color: #fff; font-size: 20px; cursor: pointer; box-shadow: 0 3px 0 var(--btn-shadow, #11a89b); transition: left 0.3s; }
    .mobile-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999; }
    .mobile-overlay.show { display: block; }
    @media (max-width: 768px) {
      header { padding: 16px; }
      header h1 { font-size: 1.4em; }
      header p { font-size: 0.85em; }
      .mobile-nav-toggle { display: flex; align-items: center; justify-content: center; }
      main { flex-direction: row; padding: 0 12px; gap: 0; margin-top: 12px; position: relative; }
      .sidebar { width: 260px; position: fixed; top: 0; left: -260px; height: 100vh; z-index: 1002; transition: left 0.3s ease; overflow-y: auto; background: var(--body-bg, #f8f8f0); padding: 16px; box-shadow: 2px 0 8px rgba(0,0,0,0.1); }
      .sidebar.open { left: 0; }
      .profile-card { border-radius: 16px; padding: 16px; }
      .profile-card .avatar { width: 56px; height: 56px; }
      .profile-card .name { font-size: 1em; }
      footer { padding: 20px 16px; font-size: 0.8em; }
    }`;

/** 页面共用的浏览器端脚本（移动端导航 / 回到顶部） */
export const CLIENT_UTILS = `    function toggleNav() {
      var sidebar = document.querySelector('.sidebar');
      var overlay = document.getElementById('mobileOverlay');
      var toggle = document.querySelector('.mobile-nav-toggle');
      if (sidebar) sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('show');
      if (toggle) toggle.classList.toggle('nav-open');
    }
    window.addEventListener('scroll', function() {
      var btn = document.querySelector('.back-to-top');
      if (btn) btn.classList.toggle('show', window.scrollY > 300);
    });
    document.getElementById('mobileOverlay').addEventListener('click', toggleNav);
    document.querySelector('.mobile-nav-toggle').addEventListener('click', toggleNav);`;

/** 标签云配色（固定顺序，保证 SSR 与客户端渲染结果一致） */
const TAG_COLORS = [
  { bg: '#f8a6b2', color: '#fff', border: '#f8a6b2' },
  { bg: '#b77dee', color: '#fff', border: '#b77dee' },
  { bg: '#889df0', color: '#fff', border: '#889df0' },
  { bg: 'rgb(247,243,223)', color: 'var(--text-body, #725d42)', border: '#e8dcc8' },
  { bg: '#e59266', color: '#fff', border: '#e59266' },
  { bg: '#82d5bb', color: '#fff', border: '#82d5bb' },
  { bg: '#8ac68a', color: '#fff', border: '#8ac68a' },
  { bg: '#fc736d', color: '#fff', border: '#fc736d' },
  { bg: '#e18c6f', color: '#fff', border: '#e18c6f' }
];

/**
 * 标签云 HTML（服务端渲染，含真实可爬取的链接）
 */
export function tagCloudHTML(tags, limit) {
  const list = (tags || []).slice(0, limit || 18);
  if (list.length === 0) {
    return '<span style="color:var(--text-secondary, #9f927d);font-size:0.85em">暂无标签</span>';
  }
  return list.map((tag, i) => {
    const c = TAG_COLORS[i % TAG_COLORS.length];
    return `<a href="/?tag=${encodeURIComponent(tag.name)}" data-nav class="tag-item" style="background:${c.bg};color:${c.color};border:1.5px solid ${c.border}">${escapeHtml(tag.name)}</a>`;
  }).join('');
}

/**
 * 右侧（正文列）标签云容器
 */
export function tagCloudBoxHTML(settings, tags) {
  if (settings.enable_tag_cloud === '0' || settings.tag_cloud_position !== 'right') return '';
  return `      <div style="margin-bottom:16px;padding:16px;background:var(--card-bg, #f7f3df);border-radius:20px;border:2px solid var(--card-border, #e8e0cc)">
        <div class="tag-cloud" style="display:flex;flex-wrap:wrap;gap:8px">${tagCloudHTML(tags)}</div>
      </div>`;
}

/**
 * 侧边栏（资料卡 + 分类 + 友链 + 标签云），全部服务端渲染，无额外请求
 */
export function sidebarHTML(settings, data) {
  const siteName = settings.site_name || '我的博客';
  const siteAuthor = settings.site_author || siteName;
  const stats = (data && data.stats) || { postCount: 0, categoryCount: 0 };
  const tags = (data && data.tags) || [];
  const categories = (data && data.categories) || [];
  const links = (data && data.links) || [];
  const created = new Date(settings.site_created_at || '2020-02-02');
  const createdText = created.getFullYear() + '年' + (created.getMonth() + 1) + '月' + created.getDate() + '日';

  const categoryItems = categories.map(c =>
    `<a href="/?category=${encodeURIComponent(c.slug)}" data-nav>${escapeHtml(c.name)}${c.count ? '（' + c.count + '）' : ''}</a>`
  ).join('');
  const linkItems = links.map(l =>
    `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.name)}</a>`
  ).join('');

  const tagCard = (settings.enable_tag_cloud !== '0' && settings.tag_cloud_position === 'left')
    ? `
      <div class="profile-card" style="margin-top:16px">
        <div class="tag-cloud" style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 0">${tagCloudHTML(tags)}</div>
      </div>`
    : '';

  return `    <aside class="sidebar"${settings.profile_position === 'right' ? ' style="order:2"' : ''}>
      <div class="profile-card">
        <a href="/admin/" class="avatar-link" title="进入后台" aria-label="进入后台"><img class="avatar" src="/icon/profile.png" alt="${escapeHtml(siteAuthor)}" width="72" height="72"></a>
        <div class="name">${escapeHtml(siteAuthor)}</div>
        ${settings.site_bio ? `<div class="bio">${escapeHtml(settings.site_bio)}</div>` : ''}
        <div class="stats">
          <div class="stat-item"><div class="stat-num">${stats.postCount || 0}</div><div class="stat-label">文章</div></div>
          <div class="stat-item"><div class="stat-num">${stats.categoryCount || 0}</div><div class="stat-label">分类</div></div>
          <div class="stat-item"><div class="stat-num">${tags.length}</div><div class="stat-label">标签</div></div>
        </div>
        <div style="font-size:0.78em;color:var(--text-secondary, #9f927d);text-align:center;padding-bottom:14px;border-bottom:2px solid var(--card-border, #e8e0cc);margin-bottom:14px">
          建站时间：${createdText}
        </div>
        <h4><img src="/icon/category.png" alt="" width="22" height="22" style="width:22px;height:22px;vertical-align:middle;margin-right:6px">分类</h4>
        <div class="category-list"><a href="/" data-nav>全部</a>${categoryItems}</div>
        ${links.length ? `<h4><img src="/icon/friend-links.png" alt="" width="22" height="22" style="width:22px;height:22px;vertical-align:middle;margin-right:6px">${escapeHtml(settings.links_title || '友链')}</h4>
        <div class="link-list">${linkItems}</div>` : ''}
      </div>${tagCard}
    </aside>`;
}

/** 页头 */
export function headerHTML(settings) {
  const siteName = settings.site_name || '我的博客';
  return `  <header>
    <h1><a href="/" data-nav>${escapeHtml(siteName)}</a></h1>
    ${settings.site_description ? `<p>${escapeHtml(settings.site_description)}</p>` : ''}
  </header>`;
}

/** 页脚 */
export function footerHTML(settings) {
  const siteName = settings.site_name || '我的博客';
  return `  <footer>${settings.site_footer ? escapeHtml(settings.site_footer) : '&copy; 2026 ' + escapeHtml(siteName)}</footer>`;
}

/** 主题样式 + 公共样式 */
export function styleBlocks(settings, extraCss) {
  return `  <style>${getThemeStyle(settings ? settings.site_theme : '')}</style>
  <style>${COMMON_CSS}${extraCss || ''}</style>`;
}

/**
 * 注入自定义 JS。
 * 必须用 jsonScript（转义 < > &）而非裸 JSON.stringify：自定义脚本里只要出现
 * </script> 就会提前关闭脚本块，后面的内容会被浏览器当作 HTML 解析执行。
 */
export function customJsBlock(settings, jsonScriptFn) {
  const raw = settings && settings.custom_js ? settings.custom_js : '';
  if (!raw || !raw.trim()) return '';
  return `  <script>
  (function(){
    var s = ${jsonScriptFn(raw)};
    if(s && s.trim()){
      var d=document.createElement('div');d.innerHTML=s;
      var scripts=d.querySelectorAll('script');
      scripts.forEach(function(old){
        var n=document.createElement('script');
        for(var i=0;i<old.attributes.length;i++)n.setAttribute(old.attributes[i].name,old.attributes[i].value);
        if(old.textContent)n.textContent=old.textContent;
        document.body.appendChild(n);
      });
      if(!scripts.length)document.body.appendChild(d);
    }
  })();
  </script>`;
}

// ==================== 以下函数会被内联进页面，必须自包含 ====================

/** HTML 转义（浏览器端与服务端同名同实现） */
export function escHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 中文日期（与 postUrl 一致，统一用 UTC，避免时区造成前后不一致） */
export function fmtDateCN(d) {
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.getUTCFullYear() + '年' + (dt.getUTCMonth() + 1) + '月' + dt.getUTCDate() + '日';
}

/**
 * 拼接列表页 URL（保留 category / tag / q 筛选）
 */
export function listUrl(base, overrides) {
  var b = base || {};
  var o = overrides || {};
  var category = o.category !== undefined ? o.category : b.category;
  var tag = o.tag !== undefined ? o.tag : b.tag;
  var q = o.q !== undefined ? o.q : b.q;
  var page = o.page !== undefined ? o.page : b.page;
  var params = [];
  if (category) params.push('category=' + encodeURIComponent(category));
  if (tag) params.push('tag=' + encodeURIComponent(tag));
  if (q) params.push('q=' + encodeURIComponent(q));
  if (page && page > 1) params.push('page=' + page);
  return params.length ? '/?' + params.join('&') : '/';
}

/**
 * 列表页标题 / 描述 / 是否允许收录
 */
export function listSeo(base, page, siteName, siteDesc) {
  var b = base || {};
  var name = siteName || '我的博客';
  var fallback = name + ' - 基于 Cloudflare Workers 构建的轻量级博客';
  var title = name;
  var description = siteDesc || fallback;
  var noindex = false;
  if (b.q) {
    title = '搜索：' + b.q + ' - ' + name;
    description = '“' + b.q + '”的搜索结果 - ' + name;
    noindex = true;
  } else if (b.tag) {
    title = '标签：' + b.tag + ' - ' + name;
    description = '标签“' + b.tag + '”下的文章 - ' + name;
  } else if (b.category) {
    var cat = b.categoryName || b.category;
    title = cat + ' - ' + name;
    description = cat + ' 分类下的文章 - ' + (siteDesc || name);
  }
  if (page && page > 1) title = '第 ' + page + ' 页 - ' + title;
  return { title: title, description: description, noindex: noindex };
}

/**
 * 整个列表（筛选提示 + 卡片 + 分页），服务端与客户端共用同一份实现
 */
export function postListHTML(posts, pagination, base, pinnedId) {
  function card(post) {
    var isPinned = !!pinnedId && String(post.id) === String(pinnedId);
    var url = post.url || ('/post/' + post.id);
    var tagHtml = '';
    if (post.tags && post.tags.length) {
      tagHtml = '<div style="margin:8px 0 0">' + post.tags.map(function (t) {
        return '<span style="display:inline-block;padding:3px 10px;background:var(--card-bg, #e6f9f6);color:var(--btn-shadow, #11a89b);font-size:0.72em;font-weight:700;margin-right:6px;border:1.5px solid var(--btn-bg, #19c8b9);border-radius:50px">' + escHtml(t) + '</span>';
      }).join('') + '</div>';
    }
    var excerpt = post.has_password ? '🔒 该文章受到密码保护' : escHtml(post.excerpt_text || '');
    var pinBadge = isPinned ? '<img src="/icon/pin-post.png" alt="置顶" width="28" height="28" style="position:absolute;top:12px;right:12px;width:28px;height:28px;z-index:1">' : '';
    return '<article class="post-card" style="position:relative' + (isPinned ? ';border:2px solid #ffd700;box-shadow:0 4px 16px rgba(255,215,0,0.3)' : '') + '">' +
      pinBadge +
      '<div class="post-content">' +
        '<h2><a href="' + escHtml(url) + '">' + escHtml(post.title) + '</a></h2>' +
        '<p style="color:var(--text-body, #725d42);font-size:0.9em;line-height:1.7;margin:8px 0">' + excerpt + '</p>' +
        tagHtml +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">' +
          '<div class="meta"><span><img src="/icon/category.png" alt="" width="16" height="16" style="width:16px;height:16px;vertical-align:middle;margin-right:4px">' + escHtml(post.category) + '</span><span>' + fmtDateCN(post.published_at || post.created_at) + '</span></div>' +
          '<a class="read-more" href="' + escHtml(url) + '">阅读更多</a>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  var b = base || {};
  var out = '';
  var filterLabel = b.q ? ('搜索：' + escHtml(b.q)) : (b.tag ? ('标签：' + escHtml(b.tag)) : (b.category ? ('当前分类：' + escHtml(b.categoryName || b.category)) : ''));
  if (filterLabel) {
    out += '<div style="margin-bottom:16px"><a href="/" data-nav style="display:inline-block;padding:8px 20px;background:var(--btn-bg, #19c8b9);color:#fff;text-decoration:none;border-radius:50px;font-weight:600;font-size:0.9em;box-shadow:0 4px 0 0 var(--btn-shadow, #11a89b)">← 返回首页</a> <span style="color:var(--text-primary, #794f27);font-weight:600;margin-left:8px">' + filterLabel + '</span></div>';
  }
  if (!posts || posts.length === 0) {
    out += '<p style="text-align:center;color:var(--text-secondary, #9f927d);">' + (b.q || b.tag || b.category ? '没有匹配的文章' : '暂无文章') + '</p>';
    return out;
  }
  out += posts.map(card).join('');

  var page = pagination ? (pagination.page || 1) : 1;
  var totalPages = pagination ? (pagination.totalPages || 1) : 1;
  if (totalPages > 1) {
    out += '<div class="pagination">';
    if (page > 1) out += '<a href="' + listUrl(b, { page: page - 1 }) + '" data-nav rel="prev">上一页</a>';
    for (var i = 1; i <= totalPages; i++) {
      if (i === page) {
        out += '<span class="current">' + i + '</span>';
      } else if (Math.abs(i - page) <= 2 || i === 1 || i === totalPages) {
        out += '<a href="' + listUrl(b, { page: i }) + '" data-nav>' + i + '</a>';
      } else if (Math.abs(i - page) === 3) {
        out += '<span style="padding:8px 8px">...</span>';
      }
    }
    if (page < totalPages) out += '<a href="' + listUrl(b, { page: page + 1 }) + '" data-nav rel="next">下一页</a>';
    out += '</div>';
  }
  return out;
}

export { escapeHtml };
