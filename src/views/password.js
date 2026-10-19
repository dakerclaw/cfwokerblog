// ==================== 文章密码页 ====================
// 说明：这里只渲染输入框，真正的校验在 /api/post-auth（服务端 PBKDF2 + 限流），
// 校验通过后下发 post_auth_<id> Cookie 再刷新页面。

import { escapeHtml } from '../lib/utils.js';
import { FONT_LINKS } from '../lib/layout.js';
import { getThemeStyle } from '../lib/themes.js';

export function getPasswordHTML(post, settings) {
  settings = settings || {};
  const siteName = settings.site_name || '我的博客';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(post.title)} - 需要密码 - ${escapeHtml(siteName)}</title>
  <link rel="icon" href="/icon/favicon.ico">
${FONT_LINKS}
  <style>${getThemeStyle(settings.site_theme)}</style>
  <style>
    body { font-family: Nunito, 'Noto Sans SC', sans-serif; background: var(--body-bg, #f8f8f0); display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .box { background: var(--card-bg, #f7f3df); padding: 40px; border-radius: 20px; box-shadow: 0 4px 10px rgba(107,92,67,0.42); text-align: center; border: 2px solid var(--card-border, #e8e0cc); max-width: 420px; width: 100%; box-sizing: border-box; }
    h2 { margin-bottom: 8px; color: var(--text-primary, #794f27); font-weight: 700; font-size: 1.3em; word-break: break-word; }
    p { color: var(--text-secondary, #9f927d); margin-bottom: 24px; font-size: 0.9em; }
    input { width: 100%; padding: 14px 20px; border: 2.5px solid var(--input-border, #c4b89e); border-radius: 50px; font-size: 15px; margin-bottom: 16px; background: var(--body-bg, #f8f8f0); color: var(--text-body, #725d42); box-sizing: border-box; outline: none; box-shadow: 0 3px 0 0 var(--input-shadow, #d4c9b4); transition: all 0.25s; }
    input:focus { border-color: var(--btn-bg, #19c8b9); box-shadow: 0 3px 0 0 var(--btn-shadow, #11a89b); }
    button { width: 100%; padding: 14px; background: var(--btn-bg, #19c8b9); color: #fff; border: none; border-radius: 50px; font-size: 16px; font-weight: 600; cursor: pointer; box-shadow: 0 5px 0 0 var(--btn-shadow, #11a89b); transition: all 0.25s; }
    button:hover { transform: translateY(-1px); box-shadow: 0 6px 0 0 var(--btn-shadow, #11a89b); }
    button:active { transform: translateY(2px); box-shadow: 0 1px 0 0 var(--btn-shadow, #11a89b); }
    .error { color: var(--danger-bg, #e05a5a); margin-top: 12px; font-size: 0.9em; display: none; }
    a.back { display: inline-block; margin-top: 18px; color: var(--text-secondary, #9f927d); font-size: 0.85em; text-decoration: none; }
  </style>
</head>
<body>
  <div class="box">
    <h2>🔒 ${escapeHtml(post.title)}</h2>
    <p>该文章已加密，请输入密码查看</p>
    <form id="authForm">
      <input type="password" id="pwd" placeholder="请输入密码" autocomplete="current-password" autofocus>
      <button type="submit" id="submitBtn">查看内容</button>
    </form>
    <div class="error" id="error">密码错误，请重试</div>
    <a class="back" href="/">← 返回首页</a>
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
      fetch('/api/post-auth', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ postId: ${Number(post.id) || 0}, password: pwd })
      }).then(function(r){ return r.json(); }).then(function(d){
        if (d && d.success) {
          window.location.reload();
        } else {
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
</html>`;
}
