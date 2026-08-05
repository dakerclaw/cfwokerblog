// ==================== 工具函数 ====================

/**
 * JSON 响应
 */
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

/**
 * CSP 头（适度宽松，允许 CDN 和内联脚本/样式）
 */
export const CSP_HEADER = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self';";

/**
 * HTTP 安全头（API 响应使用）
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

/**
 * HTML 响应（带安全头，CSP 通过 meta 标签设置以避免阻塞 CDN）
 */
export function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    }
  });
}

/**
 * 错误响应（不暴露内部错误信息）
 */
export function errorResponse(message, status = 500, logError = null) {
  if (logError) {
    console.error(`[Error ${status}]`, logError);
  }
  const safeMessages = {
    400: '请求参数错误',
    401: '未授权访问',
    403: '禁止访问',
    404: '资源不存在',
    500: '服务器内部错误'
  };
  return json({ error: safeMessages[status] || message }, status);
}

/**
 * 生成 URL 友好的 slug
 */
export function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

/**
 * 生成随机文件名
 */
export function generateRandomFilename() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

/**
 * HTML 转义（防 XSS）
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 规范化友链 / 外链地址：
 * - 缺协议（如 example.com、www.example.com、//example.com）自动补 https://，避免被浏览器当作相对路径而带上本站前缀。
 * - 拦截 javascript: / data: / vbscript: 等危险协议，统一回退为 '#' 防止 XSS。
 * @param {string} url 原始地址
 * @returns {string} 规范化后的安全地址
 */
export function normalizeLinkUrl(url) {
  if (!url) return '';
  const raw = String(url).trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  // 危险协议直接拒绝
  if (/^(javascript|data|vbscript):/i.test(lower)) return '#';
  // 已有安全协议（含协议相对 //）原样返回
  if (/^(https?:\/\/|\/\/)/i.test(lower)) return raw;
  // 其余一律补 https://
  return 'https://' + raw;
}

/**
 * 去除 Markdown 语法符号，返回纯文本预览（同时去除 HTML 标签并解码常见实体）。
 * 用于首页文章摘要、SEO description 等场景，避免把 #、** 、>、链接等 markdown 符号展示出来。
 * 注意：返回结果可能仍含原始 < > &，调用方在插入 HTML 时应自行 escapeHtml。
 * @param {string} str 原始 markdown 文本
 * @param {number} maxLen 截取长度，超过则截断并加 '...'
 * @returns {string}
 */
export function stripMarkdown(str, maxLen = 120) {
  if (!str) return '';
  let text = String(str);
  // 代码块（``` 或 ~~~ 包裹）替换为空格
  text = text.replace(/```[\s\S]*?```/g, ' ').replace(/~~~[\s\S]*?~~~/g, ' ');
  // 行内代码 `code` -> code
  text = text.replace(/`([^`\n]+)`/g, '$1');
  // 图片 ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // 链接 [text](url) -> text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // 裸链接 <https://...> -> 内容
  text = text.replace(/<(https?:\/\/[^>]+)>/g, '$1');
  // 行首符号：标题 #~######、引用 >、无序列表 - * +
  text = text.replace(/^#{1,6}\s+/gm, '').replace(/^>\s?/gm, '').replace(/^[-*+]\s+/gm, '');
  // 粗体/斜体 **text** __text__ *text*
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*)(.*?)\1/g, '$2');
  // 删除线 ~~text~~
  text = text.replace(/~~(.*?)~~/g, '$1');
  // 剩余 HTML 标签
  text = text.replace(/<[^>]+>/g, ' ');
  // 常见 HTML 实体解码
  text = text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  // 压缩空白
  text = text.replace(/\s+/g, ' ').trim();
  if (maxLen && text.length > maxLen) {
    text = text.substring(0, maxLen).trim() + '...';
  }
  return text;
}

/**
 * 获取 CORS 头（支持多域名，从请求头 Origin 匹配）
 * @param {Request} request - 请求对象
 * @param {string} allowedOrigins - 逗号分隔的允许来源，"*" 表示全部允许
 */
export function getCorsHeaders(request, allowedOrigins) {
  const origins = (allowedOrigins || '*').split(',').map(s => s.trim()).filter(Boolean);
  const requestOrigin = request.headers.get('Origin') || '';
  let allowOrigin = '*';
  if (origins.length === 1 && origins[0] === '*') {
    allowOrigin = '*';
  } else if (origins.includes(requestOrigin)) {
    allowOrigin = requestOrigin;
  } else {
    allowOrigin = origins[0] || '*';
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

/**
 * 处理 OPTIONS 预检请求
 */
export function handleOptions(request, allowedOrigins) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(request, allowedOrigins) });
  }
  return null;
}
