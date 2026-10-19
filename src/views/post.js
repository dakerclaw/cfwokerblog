// ==================== 文章详情页 ====================
// 与旧版的关键区别：
//  1. 侧边栏（分类 / 友链 / 标签云 / 统计）改为服务端渲染，不再额外发 3~4 个请求。
//  2. 正文与自定义脚本用 jsonScript 序列化，彻底避免 </script> 截断导致的注入。
//  3. 分享缩略图、结构化数据补全，正文图片排除图标（点击图标不再弹出灯箱）。
//  4. 代码块 / 中文围栏块的解析逻辑保持原样（这段是针对本站研报内容专门调过的）。

import { jsonScript, escapeHtml, absoluteUrl } from '../lib/utils.js';
import {
  FONT_LINKS, CLIENT_UTILS, sidebarHTML, headerHTML, footerHTML,
  styleBlocks, customJsBlock, tagCloudBoxHTML
} from '../lib/layout.js';

const PAGE_CSS = `
    .content-area { flex: 1; min-width: 0; }
    .post-article { background: var(--card-bg, #f7f3df); padding: 36px; border-radius: 20px; box-shadow: 0 4px 10px rgba(107, 92, 67, 0.42); border: 2px solid var(--card-border, #e8e0cc); }
    .post-article h1 { font-size: 1.8em; margin-bottom: 16px; color: var(--text-primary, #794f27); font-weight: 800; }
    .post-article h2 { font-size: 1.35em; margin: 1.2em 0 0.6em; color: var(--text-primary, #794f27); }
    .post-article h3 { font-size: 1.15em; margin: 1em 0 0.5em; color: var(--text-primary, #794f27); }
    .post-article p { margin: 0.8em 0; line-height: 1.8; }
    .post-article ul, .post-article ol { margin: 0.8em 0 0.8em 1.4em; line-height: 1.8; }
    .post-article a { color: var(--btn-shadow, #11a89b); }
    .post-article img { max-width: 100%; height: auto; margin: 1em 0; border-radius: 12px; cursor: zoom-in; }
    .post-article img:hover { transform: scale(1.02); transition: transform 0.2s; }
    .post-article .table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 1em 0; }
    .post-article table { border-collapse: collapse; width: 100%; margin: 0; font-size: 0.95em; overflow: hidden; border-radius: 12px; }
    .post-article th, .post-article td { border: 1px solid var(--card-border, #e8e0cc); padding: 10px 14px; text-align: left; overflow-wrap: break-word; word-break: break-word; }
    .post-article th { background: var(--body-bg, #f8f8f0); font-weight: 700; color: var(--text-primary, #794f27); }
    .post-article tbody tr:nth-child(even) { background: rgba(0, 0, 0, 0.02); }
    .icon-img { cursor: default !important; pointer-events: none; }
    .icon-img:hover { transform: none !important; }
    .post-meta { color: var(--text-secondary, #9f927d); font-size: 0.85em; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid var(--card-border, #e8e0cc); font-weight: 600; }
    .post-meta span { margin-right: 16px; }
    .back-link { display: inline-block; margin-bottom: 20px; padding: 10px 24px; background: var(--btn-bg, #19c8b9); color: #fff; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 0.9em; box-shadow: 0 4px 0 0 var(--btn-shadow, #11a89b); transition: all 0.25s; }
    .back-link:hover { transform: translateY(-1px); box-shadow: 0 5px 0 0 var(--btn-shadow, #11a89b); }
    .lightbox { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.92); z-index: 2000; display: none; align-items: center; justify-content: center; cursor: zoom-out; }
    .lightbox.active { display: flex; }
    .lightbox img { max-width: 85%; max-height: 85%; border-radius: 12px; border: 4px solid rgba(255,255,255,0.3); box-shadow: 0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1); cursor: default; transition: opacity 0.2s; }
    .lightbox-close { position: absolute; top: 20px; right: 20px; width: 44px; height: 44px; background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; color: #fff; font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 1; transition: all 0.2s; }
    .lightbox-close:hover { background: rgba(255,255,255,0.3); border-color: rgba(255,255,255,0.5); }
    .lightbox-bottom { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 16px; background: rgba(0,0,0,0.5); padding: 8px 20px; border-radius: 30px; border: 1px solid rgba(255,255,255,0.15); }
    .lightbox-nav { width: 36px; height: 36px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 50%; color: #fff; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; user-select: none; flex-shrink: 0; }
    .lightbox-nav:hover { background: rgba(255,255,255,0.3); border-color: rgba(255,255,255,0.5); }
    .lightbox-nav:active { transform: scale(0.9); }
    .lightbox-counter { color: rgba(255,255,255,0.8); font-size: 14px; font-weight: 600; white-space: nowrap; min-width: 50px; text-align: center; }
    @media (max-width: 768px) {
      .post-article { padding: 20px; border-radius: 16px; }
      .post-article h1 { font-size: 1.3em; }
    }`;

const CODE_CSS = `
    pre { background: #2b2118; border-radius: 20px; padding: 20px 24px; overflow-x: auto; margin: 14px 0; border: 1px solid #3d3028; box-shadow: none; position: relative; }
    .copy-btn { position: absolute; top: 12px; right: 12px; padding: 4px 12px; background: rgba(232,213,188,0.1); border: 1px solid rgba(232,213,188,0.2); border-radius: 6px; color: rgba(232,213,188,0.6); font-size: 12px; cursor: pointer; transition: all 0.2s; z-index: 2; }
    .copy-btn:hover { background: rgba(232,213,188,0.2); color: #e8d5bc; }
    .copy-btn.copied { background: rgba(25,200,185,0.3); color: var(--btn-bg, #19c8b9); border-color: var(--btn-bg, #19c8b9); }
    pre code { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace; font-size: 14px; line-height: 1.7; color: #e8d5bc; background: none; padding: 0; border: none; border-radius: 0; box-shadow: none; display: block; font-weight: 600; white-space: pre; }
    /* 中文正文块（无语言标记的围栏块）：长行折行显示，避免被容器截断而必须横向拖动。
       仍保留等宽字体 —— 清单的方框、决策树的竖线都靠等宽对齐，换成比例字体就会散开。 */
    pre.block-text code { white-space: pre-wrap; overflow-wrap: break-word; }
    code { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace; background: #3d3028; color: #e8d5bc; padding: 3px 10px; border-radius: 6px; font-size: 0.88em; border: 1px solid #4d4038; font-weight: 600; }
    /* 行内代码：跟随主题的浅色小胶囊，避免在正文里出现成块深色方块 */
    code.inline-code { background: var(--card-bg, #f0ece2); color: var(--text-primary, #794f27); border: 1px solid var(--card-border, #ddd6c6); padding: 1px 7px; border-radius: 6px; font-size: 0.88em; font-weight: 600; word-break: break-word; }
    .hljs-keyword, .hljs-selector-tag { color: #d4a0e0; }
    .hljs-string, .hljs-attr { color: #a8d4a0; }
    .hljs-number, .hljs-literal { color: #80c0e0; }
    .hljs-comment { color: #8b8070; font-style: italic; }
    .hljs-function .hljs-title, .hljs-title.function_ { color: #e06c75; }
    .hljs-built_in { color: #f0a870; }
    .hljs-type, .hljs-class .hljs-title { color: #f0a870; }
    .hljs-params { color: #e8d5bc; }
    .hljs-meta { color: #80c0e0; }
    .hljs-punctuation { color: #d4b896; }
    .hljs-property { color: #80c0e0; }
    .hljs-title { color: #e06c75; }
    .hljs-emphasis { font-style: italic; color: #f0a870; }
    .hljs-strong { font-weight: bold; color: #f0a870; }
    .hljs-link { color: #a8d4a0; text-decoration: underline; }
    .hljs-addition { color: #a8d4a0; background: rgba(46,160,67,0.15); }
    .hljs-deletion { color: #e06c75; background: rgba(224,108,117,0.15); }
    blockquote { position: relative; background: var(--card-bg, #f0ece2); border-left: 4px solid var(--input-border, #c4b89e); border-radius: 0 12px 12px 0; padding: 16px 20px 16px 48px; margin: 16px 0; color: var(--text-body, #6b5d45); font-style: italic; line-height: 1.8; }
    blockquote::before { content: '\\201C'; position: absolute; left: 14px; top: 8px; font-size: 48px; color: var(--input-border, #c4b89e); font-family: Georgia, serif; line-height: 1; font-style: normal; }
    blockquote p { margin: 0; }
    blockquote p + p { margin-top: 8px; }
    details { background: var(--card-bg, #f5f2eb); border: 1.5px solid var(--card-border, #ddd6c6); border-radius: 12px; padding: 0; margin: 16px 0; overflow: hidden; }
    summary { padding: 14px 20px; background: var(--card-bg, #ede8dc); cursor: pointer; font-weight: 700; color: var(--text-primary, #794f27); border-bottom: 1.5px solid var(--card-border, #ddd6c6); list-style: none; display: flex; align-items: center; gap: 8px; }
    summary::before { content: '\\25B6'; font-size: 12px; transition: transform 0.2s; display: inline-block; }
    details[open] summary::before { transform: rotate(90deg); }
    summary::-webkit-details-marker { display: none; }
    details > div, details > p { padding: 16px 20px; }`;

export function getPostHTML(post, settings, requestUrl, data) {
  settings = settings || {};
  data = data || {};
  const siteName = settings.site_name || '我的博客';
  const siteAuthor = settings.site_author || siteName;
  const postExcerpt = post.excerpt || '';

  let origin = '';
  if (requestUrl) { try { origin = new URL(requestUrl).origin; } catch (e) { origin = ''; } }
  const canonical = absoluteUrl(requestUrl || '/', origin || undefined);
  const ogImage = origin ? origin + '/og-default.png' : '';
  const tags = (post.tags || '').split(',').map(t => t.trim()).filter(Boolean);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: postExcerpt,
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at,
    author: { '@type': 'Person', name: siteAuthor },
    publisher: { '@type': 'Organization', name: siteName },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    articleSection: post.category || '',
    keywords: tags.join(','),
    wordCount: (post.content || '').length,
    image: ogImage || undefined
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(post.title)} - ${escapeHtml(siteName)}</title>
  <meta name="description" content="${escapeHtml(postExcerpt)}">
  <meta name="author" content="${escapeHtml(siteAuthor)}">
  <meta name="robots" content="index, follow">
  <link rel="icon" href="/icon/favicon.ico">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(post.title)}">
  <meta property="og:description" content="${escapeHtml(postExcerpt)}">
  <meta property="og:site_name" content="${escapeHtml(siteName)}">
  ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:width" content="600">
  <meta property="og:image:height" content="600">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta property="article:published_time" content="${post.published_at || post.created_at}">
  <meta property="article:modified_time" content="${post.updated_at}">
  ${post.category ? `<meta property="article:section" content="${escapeHtml(post.category)}">` : ''}
  ${tags.map(t => `<meta property="article:tag" content="${escapeHtml(t)}">`).join('\n  ')}
  <script type="application/ld+json">${jsonScript(structuredData)}</script>
${FONT_LINKS}
${styleBlocks(settings, PAGE_CSS + CODE_CSS)}
  <link rel="stylesheet" href="/vendor/atom-one-dark.min.css">
</head>
<body>
  <button class="mobile-nav-toggle" aria-label="打开导航">☰</button>
  <div class="mobile-overlay" id="mobileOverlay"></div>
${headerHTML(settings)}
  <main>
${sidebarHTML(settings, data)}
    <div class="content-area"${settings.profile_position === 'right' ? ' style="order:1"' : ''}>
${tagCloudBoxHTML(settings, data.tags)}
      <a class="back-link" href="/">← 返回首页</a>
      <article class="post-article" style="position:relative">
        ${settings.pinned_post_id && String(post.id) === String(settings.pinned_post_id) ? '<img src="/icon/pin-post.png" class="icon-img" alt="置顶" width="36" height="36" style="position:absolute;top:24px;right:24px;width:36px;height:36px">' : ''}
        <h1>${escapeHtml(post.title)}</h1>
        <div class="post-meta">
          <span><img src="/icon/category.png" class="icon-img" alt="" width="18" height="18" style="width:18px;height:18px;vertical-align:middle;margin-right:6px">${escapeHtml(post.category)}</span>
          <span>${(function (d) { return isNaN(d.getTime()) ? '' : d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'; })(new Date(post.published_at || post.created_at))}</span>
        </div>
        <div id="post-content" style="line-height:1.8"></div>
        ${tags.length ? `<div style="margin-top:24px;padding-top:16px;border-top:2px solid var(--card-border, #e8e0cc);display:flex;flex-wrap:wrap;gap:8px">${tags.map(t =>
          `<a href="/?tag=${encodeURIComponent(t)}" style="display:inline-block;padding:5px 14px;background:var(--card-bg, #e6f9f6);color:var(--btn-shadow, #11a89b);font-size:0.85em;font-weight:700;border:1.5px solid var(--btn-bg, #19c8b9);border-radius:50px;text-decoration:none">${escapeHtml(t)}</a>`
        ).join('')}</div>` : ''}
      </article>
    </div>
  </main>
  <div class="lightbox" id="lightbox" onclick="closeLightbox(event)">
    <button class="lightbox-close" onclick="closeLightbox(event)" aria-label="关闭">×</button>
    <img id="lightbox-img" src="" alt="">
    <div class="lightbox-bottom">
      <button class="lightbox-nav" onclick="event.stopPropagation();navLightbox(-1)" aria-label="上一张">‹</button>
      <div class="lightbox-counter" id="lightbox-counter"></div>
      <button class="lightbox-nav" onclick="event.stopPropagation();navLightbox(1)" aria-label="下一张">›</button>
    </div>
  </div>
  <button class="back-to-top" aria-label="回到顶部">↑</button>
${footerHTML(settings)}
  <script>
${CLIENT_UTILS}
    var lightboxImages = [];
    var lightboxIndex = 0;
    (function(){
      function initLightbox() {
        // 排除图标类图片（置顶徽标、分类小图标），否则点图标也会弹出灯箱
        lightboxImages = Array.prototype.slice.call(document.querySelectorAll('.post-article img'))
          .filter(function (img) { return img.className.indexOf('icon-img') === -1; });
        lightboxImages.forEach(function(img, index) {
          img.addEventListener('click', function() { openLightbox(index); });
        });
      }
      window.initLightbox = initLightbox;
      window.openLightbox = function(index) {
        lightboxIndex = index;
        updateLightbox();
        document.getElementById('lightbox').classList.add('active');
        document.body.style.overflow = 'hidden';
      };
      window.updateLightbox = function() {
        if (!lightboxImages[lightboxIndex]) return;
        document.getElementById('lightbox-img').src = lightboxImages[lightboxIndex].src;
        var counter = document.getElementById('lightbox-counter');
        if (lightboxImages.length > 1) {
          counter.textContent = (lightboxIndex + 1) + ' / ' + lightboxImages.length;
          counter.style.display = 'block';
        } else {
          counter.style.display = 'none';
        }
      };
      window.navLightbox = function(dir) {
        var newIndex = lightboxIndex + dir;
        if (newIndex < 0) newIndex = lightboxImages.length - 1;
        if (newIndex >= lightboxImages.length) newIndex = 0;
        lightboxIndex = newIndex;
        window.updateLightbox();
      };
      window.closeLightbox = function(e) {
        if (e.target.id === 'lightbox' || e.target.classList.contains('lightbox-close')) {
          document.getElementById('lightbox').classList.remove('active');
          document.body.style.overflow = '';
        }
      };
      document.addEventListener('keydown', function(e) {
        var lb = document.getElementById('lightbox');
        if (!lb.classList.contains('active')) return;
        if (e.key === 'Escape') { lb.classList.remove('active'); document.body.style.overflow = ''; }
        else if (e.key === 'ArrowLeft') window.navLightbox(-1);
        else if (e.key === 'ArrowRight') window.navLightbox(1);
      });
    })();
    document.querySelector('.back-to-top').addEventListener('click', function(){ window.scrollTo({ top: 0, behavior: 'smooth' }); });
  </script>
  <script src="/vendor/marked.min.js"></script>
  <script src="/vendor/highlight.min.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      var raw = ${jsonScript(post.content || '')};
      var fence = String.fromCharCode(96)+String.fromCharCode(96)+String.fromCharCode(96);
      var tick = String.fromCharCode(96);
      var nl = String.fromCharCode(10);

      // 第一步：提取代码，转义 HTML
      // codeBlocks  → 三反引号围栏代码块，还原为块级 pre+code
      // inlineCodes → 单反引号行内代码，还原为行内 code（必须与围栏块分开，
      //               否则行内代码会被包成块级 pre 撑成整块，正文被切成碎片）
      // 注意：本段位于模板字符串内，注释里不能出现反引号字面量。
      var codeBlocks = [];
      var inlineCodes = [];
      var content = raw;
      // 围栏块里装的不一定是代码。本站研报的围栏块几乎都是中文正文——
      // 每周监测清单、破位决策树、股权结构图这类靠等宽字体对齐的模板。
      // 对中文正文跑 hljs.highlightAuto 会瞎猜一个语言，把数字、百分号、
      // 箭头随机染成五颜六色，所以这里先把它和代码区分开。
      // 判定：写了语言标记就算代码；没写标记时看中文字符占比（阈值 0.15）。
      function isPlainTextBlock(text) {
        var total = 0;
        var cjk = 0;
        for (var i = 0; i < text.length; i++) {
          var c = text.charCodeAt(i);
          if (c === 32 || c === 9 || c === 10 || c === 13) continue;
          total++;
          if (c >= 0x4e00 && c <= 0x9fff) cjk++;
        }
        if (!total) return true;
        return (cjk / total) >= 0.15;
      }
      // 先处理三反引号代码块
      while (true) {
        var fs = content.indexOf(nl + fence);
        var lead = nl.length;
        if (fs === -1) { fs = content.indexOf(fence); lead = 0; }
        if (fs === -1) break;
        var bodyFrom = fs + lead + fence.length;
        var af = content.indexOf(fence, bodyFrom);
        if (af === -1) break;
        var cc = content.substring(bodyFrom, af);
        var fn = cc.indexOf(nl);
        var lang = '';
        if (fn !== -1) {
          lang = cc.substring(0, fn).trim();
          cc = cc.substring(fn + 1);
        }
        var esc = cc.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
        var idx = codeBlocks.length;
        codeBlocks.push({ raw: cc, esc: esc, lang: lang, asCode: !!lang || !isPlainTextBlock(cc) });
        content = content.substring(0, fs) + nl + '%%CB_' + idx + '%%' + nl + content.substring(af + fence.length);
      }
      // 再处理单反引号行内代码
      while (true) {
        var si = content.indexOf(tick);
        if (si === -1) break;
        var ei = content.indexOf(tick, si + 1);
        var sc = ei !== -1 ? content.substring(si + 1, ei) : content.substring(si + 1);
        var esc2 = sc.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
        var idx2 = inlineCodes.length;
        inlineCodes.push(esc2);
        content = ei !== -1
          ? content.substring(0, si) + '%%IC_' + idx2 + '%%' + content.substring(ei + 1)
          : content.substring(0, si) + '%%IC_' + idx2 + '%%';
      }

      // 第二步：用 marked 解析（代码块已被占位符替换，不会有 HTML 问题）
      var html;
      if (typeof marked !== 'undefined' && marked.parse) {
        marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
        html = marked.parse(content);
      } else {
        html = '<p>' + content.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split(String.fromCharCode(10)).join('<br>') + '</p>';
      }

      // 第三步：先还原行内代码（用行内 <code>，不撑成整块、不加复制按钮）
      for (var m = 0; m < inlineCodes.length; m++) {
        html = html.split('%%IC_' + m + '%%').join('<code class="inline-code">' + inlineCodes[m] + '</code>');
      }

      // 第四步：还原围栏块（真代码高亮不折行；中文正文不高亮并允许折行）
      for (var j = 0; j < codeBlocks.length; j++) {
        var blk = codeBlocks[j];
        var highlighted = blk.esc;
        if (blk.asCode && typeof hljs !== 'undefined') {
          try {
            if (blk.lang && hljs.getLanguage(blk.lang)) {
              highlighted = hljs.highlight(blk.raw, { language: blk.lang, ignoreIllegals: true }).value;
            } else {
              highlighted = hljs.highlightAuto(blk.raw).value;
            }
          } catch(e) { highlighted = blk.esc; }
        }
        var preOpen = blk.asCode ? '<pre>' : '<pre class="block-text">';
        html = html.split('%%CB_' + j + '%%').join(preOpen + '<code class="hljs">' + highlighted + '</code></pre>');
      }

      // 给所有图片添加懒加载（在插入 DOM 前）
      html = html.split('<img ').join('<img loading="lazy" ');
      document.getElementById('post-content').innerHTML = html;

      // 为代码块添加复制按钮
      var pres = document.querySelectorAll('pre');
      for (var p = 0; p < pres.length; p++) {
        var btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = '复制';
        btn.onclick = (function(pre, button) {
          return function() {
            var code = pre.querySelector('code');
            var text = code ? code.textContent : pre.textContent;
            if (!navigator.clipboard) return;
            navigator.clipboard.writeText(text).then(function() {
              button.textContent = '已复制';
              button.classList.add('copied');
              setTimeout(function() { button.textContent = '复制'; button.classList.remove('copied'); }, 2000);
            });
          };
        })(pres[p], btn);
        pres[p].appendChild(btn);
      }

      // 表格包裹横向滚动容器（移动端防止溢出页面；幂等避免重复包裹）
      document.querySelectorAll('.post-article table').forEach(function(tbl) {
        var p = tbl.parentNode;
        if (p && p.classList && p.classList.contains('table-wrapper')) return;
        var wrap = document.createElement('div');
        wrap.className = 'table-wrapper';
        tbl.parentNode.insertBefore(wrap, tbl);
        wrap.appendChild(tbl);
      });

      window.initLightbox();
    });
  </script>
${customJsBlock(settings, jsonScript)}
</body>
</html>`;
}
