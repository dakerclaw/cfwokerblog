// ==================== 前台首页（SSR + 渐进增强分页 / 搜索）====================
//
// 与旧版的关键区别：
//  1. 文章列表、分类、友链、标签云、统计全部服务端渲染（原来要发 4~5 个额外请求，首屏空白）。
//  2. 分页是真实链接（?page=2），爬虫可抓取；无 JS 时仍可翻页。
//  3. 分类 / 标签 / 搜索都由服务端过滤，不再“前端拿到 10 条再筛选”导致结果不全。
//  4. 标题、描述、canonical 按分类 / 标签 / 页码动态生成。
//  5. 渲染函数与客户端共用同一份源码（layout.js 里 toString 注入），不会前后端不一致。

import { jsonScript, absoluteUrl, escapeHtml } from '../lib/utils.js';
import {
  FONT_LINKS, CLIENT_UTILS, sidebarHTML, headerHTML, footerHTML,
  styleBlocks, customJsBlock, tagCloudBoxHTML, postListHTML, listUrl, listSeo,
  escHtml, fmtDateCN
} from '../lib/layout.js';

const PAGE_CSS = `
    .post-list { flex: 1; min-width: 0; }
    #app { display: flex; flex-direction: column; gap: 28px; transition: opacity 0.2s; }
    .post-card { background: var(--card-bg, #f7f3df); border-radius: 20px; overflow: visible; box-shadow: 0 4px 10px rgba(107, 92, 67, 0.42); display: flex; flex-direction: row; transition: all 0.3s ease; border: 2px solid var(--card-border, #e8e0cc); }
    .post-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(114, 93, 66, 0.15); }
    .post-card .post-content { flex: 1; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; overflow: hidden; }
    .post-card h2 { font-size: 1.35em; margin-bottom: 8px; color: var(--text-primary, #794f27); font-weight: 700; }
    .post-card h2 a { color: var(--text-primary, #794f27); text-decoration: none; }
    .post-card .meta { display: flex; flex-wrap: nowrap; align-items: center; gap: 12px; color: var(--text-secondary, #9f927d); font-size: 0.8em; margin-top: 12px; font-weight: 600; }
    .post-card a.read-more { display: inline-block; padding: 6px 16px; background: var(--btn-bg, #19c8b9); color: #fff; text-decoration: none; border-radius: 50px; font-size: 0.8em; font-weight: 600; box-shadow: 0 3px 0 0 var(--btn-shadow, #11a89b); transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); white-space: nowrap; }
    .post-card a.read-more:hover { transform: translateY(-1px); box-shadow: 0 5px 0 0 var(--btn-shadow, #11a89b); }
    .post-card a.read-more:active { transform: translateY(2px); box-shadow: 0 1px 0 0 var(--btn-shadow, #11a89b); }
    .pagination { display: flex; justify-content: center; gap: 8px; margin: 24px 0; flex-wrap: wrap; }
    .pagination a, .pagination span { display: inline-block; padding: 8px 16px; border-radius: 50px; font-weight: 600; font-size: 0.85em; text-decoration: none; transition: all 0.2s; }
    .pagination a { background: var(--card-bg, #f0e8d8); color: var(--text-body, #725d42); border: 2px solid var(--card-border, #e8e0cc); }
    .pagination a:hover { background: var(--btn-bg, #19c8b9); color: #fff; border-color: var(--btn-bg, #19c8b9); }
    .pagination .current { background: var(--btn-bg, #19c8b9); color: #fff; border: 2px solid var(--btn-bg, #19c8b9); }
    #search-input { width: 100%; padding: 12px 18px; border: 2px solid var(--card-border, #e8e0cc); border-radius: 14px; font-size: 15px; background: var(--card-bg, #f7f3df); color: var(--text-body, #725d42); outline: none; transition: border-color 0.2s; box-shadow: 0 2px 8px rgba(107,92,67,0.08); }
    #search-input:focus { border-color: var(--btn-bg, #19c8b9); }
    @media (max-width: 768px) {
      .post-list { width: 100%; }
      #app { gap: 20px; }
      .post-card { flex-direction: column; border-radius: 16px; }
      .post-card .post-content { padding: 14px; }
      .post-card h2 { font-size: 1em; }
      .post-card .meta { font-size: 0.75em; }
    }`;

export function getFrontendHTML(settings, requestUrl, data, view) {
  settings = settings || {};
  data = data || {};
  view = view || {};
  const base = view.base || {};
  const pagination = view.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };
  const pinnedPostId = view.pinnedPostId || '';
  const siteName = settings.site_name || '我的博客';
  const siteAuthor = settings.site_author || siteName;

  let origin = '';
  if (requestUrl) { try { origin = new URL(requestUrl).origin; } catch (e) { origin = ''; } }
  const ogImage = origin ? origin + '/og-default.png' : '';

  const seo = listSeo(base, pagination.page, siteName, settings.site_description || '');
  const canonical = absoluteUrl(listUrl(base, { page: pagination.page }), requestUrl || '/');

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    description: settings.site_description || '',
    url: origin ? origin + '/' : '/',
    potentialAction: {
      '@type': 'SearchAction',
      target: (origin || '') + '/?q={search_term_string}',
      'query-input': 'required name=search_term_string'
    }
  };

  const listHTML = postListHTML(view.posts || [], pagination, base, pinnedPostId);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(seo.title)}</title>
  <meta name="description" content="${escapeHtml(seo.description)}">
  <meta name="author" content="${escapeHtml(siteAuthor)}">
  <meta name="robots" content="${seo.noindex ? 'noindex, follow' : 'index, follow'}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="sitemap" type="application/xml" href="/sitemap.xml">
  <link rel="icon" href="/icon/favicon.ico">
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(siteName)}" href="/rss.xml">
${pagination.page > 1 ? `  <link rel="prev" href="${escapeHtml(absoluteUrl(listUrl(base, { page: pagination.page - 1 }), requestUrl || '/'))}">\n` : ''}${pagination.page < pagination.totalPages ? `  <link rel="next" href="${escapeHtml(absoluteUrl(listUrl(base, { page: pagination.page + 1 }), requestUrl || '/'))}">\n` : ''}  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(seo.title)}">
  <meta property="og:description" content="${escapeHtml(seo.description)}">
  <meta property="og:site_name" content="${escapeHtml(siteName)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:width" content="600">
  <meta property="og:image:height" content="600">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonScript(structuredData)}</script>
${FONT_LINKS}
${styleBlocks(settings, PAGE_CSS)}
</head>
<body>
  <button class="mobile-nav-toggle" aria-label="打开导航">☰</button>
  <div class="mobile-overlay" id="mobileOverlay"></div>
${headerHTML(settings)}
  <main>
${sidebarHTML(settings, data)}
    <div class="post-list"${settings.profile_position === 'right' ? ' style="order:1"' : ''}>
${tagCloudBoxHTML(settings, data.tags)}
      <div style="margin-bottom:16px">
        <input id="search-input" type="search" value="${escapeHtml(base.q || '')}" placeholder="搜索文章标题或标签……" aria-label="搜索文章">
      </div>
      <div id="app">${listHTML}</div>
    </div>
  </main>
  <button class="back-to-top" aria-label="回到顶部">↑</button>
${footerHTML(settings)}
  <script>
${CLIENT_UTILS}
    (function(){
      var escHtml = ${escHtml.toString()};
      var fmtDateCN = ${fmtDateCN.toString()};
      var listUrl = ${listUrl.toString()};
      var listSeo = ${listSeo.toString()};
      var postListHTML = ${postListHTML.toString()};

      var SITE_NAME = ${jsonScript(siteName)};
      var SITE_DESC = ${jsonScript(settings.site_description || '')};
      var ORIGIN = ${jsonScript(origin)};
      var PINNED = ${jsonScript(pinnedPostId)};
      var LIMIT = ${jsonScript(pagination.limit || 10)};

      var appEl = document.getElementById('app');
      var searchEl = document.getElementById('search-input');
      var requestSeq = 0;

      function stateFromLocation() {
        var u = new URL(window.location.href);
        return {
          page: parseInt(u.searchParams.get('page'), 10) || 1,
          category: u.searchParams.get('category') || '',
          tag: u.searchParams.get('tag') || '',
          q: u.searchParams.get('q') || ''
        };
      }

      function apiUrl(st) {
        var p = ['page=' + st.page, 'limit=' + LIMIT];
        if (st.category) p.push('category=' + encodeURIComponent(st.category));
        if (st.tag) p.push('tag=' + encodeURIComponent(st.tag));
        if (st.q) p.push('q=' + encodeURIComponent(st.q));
        return '/api/posts?' + p.join('&');
      }

      function setMeta(selector, attr, value) {
        var el = document.querySelector(selector);
        if (el) el.setAttribute(attr, value);
      }

      function updateHead(st, categoryName) {
        var base = { category: st.category, categoryName: categoryName || '', tag: st.tag, q: st.q };
        var seo = listSeo(base, st.page, SITE_NAME, SITE_DESC);
        document.title = seo.title;
        setMeta('meta[name="description"]', 'content', seo.description);
        setMeta('meta[name="robots"]', 'content', seo.noindex ? 'noindex, follow' : 'index, follow');
        setMeta('link[rel="canonical"]', 'href', ORIGIN + listUrl(base, { page: st.page }));
        setMeta('meta[property="og:title"]', 'content', seo.title);
        setMeta('meta[property="og:description"]', 'content', seo.description);
        setMeta('meta[property="og:url"]', 'content', ORIGIN + listUrl(base, { page: st.page }));
      }

      function navigate(st, mode) {
        if (mode === 'push' || mode === 'replace') {
          var url = listUrl(st, { page: st.page });
          try {
            if (mode === 'push') window.history.pushState(st, '', url);
            else window.history.replaceState(st, '', url);
          } catch (e) { /* 忽略 */ }
        }
        var seq = ++requestSeq;
        appEl.style.opacity = '0.5';
        fetch(apiUrl(st))
          .then(function(r){ return r.json(); })
          .then(function(res){
            if (seq !== requestSeq) return;
            var categoryName = (res.query && res.query.categoryName) || '';
            var base = { category: st.category, categoryName: categoryName, tag: st.tag, q: st.q };
            appEl.innerHTML = postListHTML(res.data || [], res.pagination || {}, base, res.pinned_post_id || '');
            updateHead(st, categoryName);
            if (mode === 'push') window.scrollTo({ top: 0, behavior: 'smooth' });
          })
          .catch(function(){
            if (seq !== requestSeq) return;
            appEl.innerHTML = '<p style="text-align:center;color:var(--danger-bg, #e05a5a);">加载失败，请刷新重试</p>';
          })
          .then(function(){ if (seq === requestSeq) appEl.style.opacity = ''; });
      }

      // 站内列表链接统一走前端接管（无 JS 时就是普通链接，可直接翻页）
      document.addEventListener('click', function(e) {
        var el = e.target;
        while (el && el !== document) {
          if (el.tagName === 'A' && el.hasAttribute('data-nav')) break;
          el = el.parentNode;
        }
        if (!el || el === document) return;
        var href = el.getAttribute('href') || '';
        if (href.charAt(0) !== '/' && href.charAt(0) !== '?') return;
        e.preventDefault();
        var u = new URL(href, window.location.origin);
        navigate({
          page: parseInt(u.searchParams.get('page'), 10) || 1,
          category: u.searchParams.get('category') || '',
          tag: u.searchParams.get('tag') || '',
          q: u.searchParams.get('q') || ''
        }, 'push');
        if (searchEl) searchEl.value = u.searchParams.get('q') || '';
      });

      window.addEventListener('popstate', function() { navigate(stateFromLocation(), 'none'); });

      if (searchEl) {
        var timer;
        searchEl.addEventListener('input', function() {
          clearTimeout(timer);
          var keyword = this.value.trim();
          timer = setTimeout(function() {
            var st = stateFromLocation();
            st.page = 1;
            st.q = keyword;
            navigate(st, 'replace');
          }, 350);
        });
      }
    })();
  </script>
${customJsBlock(settings, jsonScript)}
</body>
</html>`;
}
