// ==================== 数据库模块 ====================
// 设计要点：
// 1. 迁移使用 PRAGMA user_version 记录版本，热启动只读一次版本号即返回，避免每次冷启动重复执行 DDL。
// 2. 设置项分三类：可公开 / 可保存（白名单）/ 保密。公开接口只返回白名单字段，
//    彻底杜绝 site_password、token_version 等内部字段泄露给匿名访客。
// 3. 标签同时保存原始值（tags，展示用）与规范化索引（tags_index = ',a,b,'，检索用），
//    使标签筛选可以在 SQL 层完成且不受 LIKE 模式长度限制。
// 4. 登录限流等临时数据放入独立的 rate_limits 表，不再污染 settings 表（避免 IP 等信息被公开接口带出）。
// 5. 所有 D1 写操作尽量合并为 batch，控制单次 Worker 调用的子请求数量（免费版上限 50）。

import { hashPassword } from './auth.js';
import { stripMarkdown, parseLinks } from './utils.js';

const SCHEMA_VERSION = 4;

/** 允许通过管理接口写入的设置项（同时就是可公开返回的字段，二者一致） */
export const SAVABLE_SETTING_KEYS = [
  'site_name', 'site_description', 'site_favicon', 'site_avatar', 'site_bio', 'site_author',
  'site_footer', 'custom_js', 'site_links', 'links_title', 'category_icon', 'links_icon',
  'tag_cloud_icon', 'enable_tag_cloud', 'profile_position', 'tag_cloud_position', 'pinned_post_id',
  'site_theme', 'allowed_origins', 'allow_robots', 'enable_compression', 'site_created_at'
];

/** 仅内部使用、绝不允许写穿或对外返回的设置项 */
export const SECRET_SETTING_KEYS = ['site_password', 'token_version', 'content_version'];

const DEFAULT_SETTINGS = [
  ['site_name', '我的博客'],
  ['site_description', '一个使用 Cloudflare 构建的博客'],
  ['site_favicon', ''],
  ['site_avatar', ''],
  ['site_bio', ''],
  ['site_author', ''],
  ['site_footer', '© 2026 我的博客'],
  ['custom_js', ''],
  ['site_links', ''],
  ['links_title', '友情链接'],
  ['category_icon', '📂'],
  ['links_icon', '🔗'],
  ['tag_cloud_icon', '🏷️'],
  ['enable_tag_cloud', '1'],
  ['profile_position', 'left'],
  ['tag_cloud_position', 'left'],
  ['pinned_post_id', ''],
  ['site_theme', 'purple-dawn'],
  ['allowed_origins', '*'],
  ['allow_robots', '1'],
  ['enable_compression', '1'],
  ['site_created_at', ''],
  ['content_version', '1']
];

const ALLOWED_TABLES = ['posts', 'categories', 'settings', 'rate_limits'];

/**
 * 获取表的列信息（白名单验证防止 SQL 注入）
 */
async function getTableColumns(DB, tableName) {
  if (!ALLOWED_TABLES.includes(tableName)) return [];
  try {
    const { results } = await DB.prepare(`PRAGMA table_info(${tableName})`).all();
    return results ? results.map(r => r.name) : [];
  } catch {
    return [];
  }
}

/**
 * 检查表是否存在
 */
async function tableExists(DB, tableName) {
  const result = await DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).bind(tableName).first();
  return !!result;
}

/**
 * 初始化数据库（幂等，可安全重复调用；已迁移过的库只做一次版本查询）
 */
export async function initDB(env) {
  if (!env.DB) {
    console.error('[DB] D1 数据库未绑定');
    return false;
  }

  try {
    const DB = env.DB;

    // ========== 0. 版本检查 ==========
    let current = 0;
    try {
      const row = await DB.prepare('PRAGMA user_version').first();
      current = row ? (parseInt(row.user_version, 10) || 0) : 0;
    } catch {
      current = 0;
    }
    if (current >= SCHEMA_VERSION) return true;

    // ========== 1. 建表 ==========
    if (!(await tableExists(DB, 'categories'))) {
      await DB.prepare(`
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          description TEXT DEFAULT ''
        )
      `).run();
    }

    if (!(await tableExists(DB, 'posts'))) {
      await DB.prepare(`
        CREATE TABLE posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          content TEXT NOT NULL,
          excerpt TEXT DEFAULT '',
          password TEXT DEFAULT '',
          cover_image TEXT DEFAULT '',
          category TEXT DEFAULT '未分类',
          tags TEXT DEFAULT '',
          tags_index TEXT DEFAULT '',
          status TEXT DEFAULT 'draft',
          view_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          published_at TEXT
        )
      `).run();
    }

    if (!(await tableExists(DB, 'settings'))) {
      await DB.prepare(`
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT DEFAULT '',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    }

    if (!(await tableExists(DB, 'rate_limits'))) {
      await DB.prepare(`
        CREATE TABLE rate_limits (
          key TEXT PRIMARY KEY,
          attempts TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    }

    // ========== 2. 补齐 posts 缺失的列 ==========
    const columns = await getTableColumns(DB, 'posts');
    if (!columns.includes('password')) {
      await DB.prepare("ALTER TABLE posts ADD COLUMN password TEXT DEFAULT ''").run();
    }
    if (!columns.includes('published_at')) {
      await DB.prepare("ALTER TABLE posts ADD COLUMN published_at TEXT").run();
    }
    if (!columns.includes('tags_index')) {
      await DB.prepare("ALTER TABLE posts ADD COLUMN tags_index TEXT DEFAULT ''").run();
    }

    // ========== 3. 数据回填（合并为一次 batch）==========
    // published_at 为空的历史数据用 created_at 补上，保证 ORDER BY published_at 可走索引
    // tags_index 由 tags 归一化而来（处理中英文逗号、逗号前后空格）
    await DB.batch([
      DB.prepare("UPDATE posts SET published_at = created_at WHERE published_at IS NULL OR published_at = ''"),
      DB.prepare(
        "UPDATE posts SET tags_index = ',' || replace(replace(replace(replace(replace(replace(tags, '，', ','), ', ', ','), ' ,', ','), '、', ','), ';', ','), '；', ',') || ',' " +
        "WHERE (tags_index IS NULL OR tags_index = '') AND tags IS NOT NULL AND tags != ''"
      )
    ]);

    // ========== 4. 索引（合并为一次 batch）==========
    await DB.batch([
      DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)"),
      DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_status_published ON posts(status, published_at DESC)"),
      DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)"),
      DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug)"),
      DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category)"),
      DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_tags_index ON posts(tags_index)")
    ]);

    // ========== 5. 补齐默认设置（只写缺失的键）==========
    const { results: settingRows } = await DB.prepare('SELECT key FROM settings').all();
    const existingKeys = new Set((settingRows || []).map(r => r.key));
    const missing = DEFAULT_SETTINGS.filter(([key]) => !existingKeys.has(key));
    if (missing.length > 0) {
      // 分块 batch，避免单次语句过多
      for (let i = 0; i < missing.length; i += 10) {
        const chunk = missing.slice(i, i + 10);
        await DB.batch(chunk.map(([key, value]) =>
          DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(key, value)
        ));
      }
    }

    // ========== 6. 示例文章（仅空库）==========
    const postCount = await DB.prepare('SELECT COUNT(*) as cnt FROM posts').first();
    if (postCount && postCount.cnt === 0) {
      const now = new Date().toISOString();
      await DB.prepare(`
        INSERT INTO posts (title, slug, content, excerpt, cover_image, category, tags, tags_index, status, view_count, created_at, updated_at, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        '欢迎使用 cloudflare-light-blog',
        'welcome',
        '# 欢迎\n\n这是一个基于 Cloudflare Workers + D1 构建的轻量级博客系统。\n\n## 功能特点\n\n- ✅ 简洁的后台管理\n- ✅ 支持文章密码\n- ✅ 高速部署\n- ✅ 免费额度充足\n\n开始你的博客之旅吧！',
        '这是一个基于 Cloudflare Workers 构建的轻量级博客系统...',
        '',
        '技术教程',
        'Cloudflare,博客',
        ',Cloudflare,博客,',
        'published',
        0,
        now,
        now,
        now
      ).run();
    }

    await DB.prepare(`PRAGMA user_version = ${SCHEMA_VERSION}`).run();
    console.log(`[DB] 数据库初始化完成（schema v${SCHEMA_VERSION}）`);
    return true;
  } catch (e) {
    console.error('[DB] 初始化错误:', e.message || 'Error');
    return false;
  }
}

// ==================== 设置 ====================

/**
 * 获取全部设置（含保密项，仅限内部使用）
 */
export async function getSettings(env) {
  const all = {};
  DEFAULT_SETTINGS.forEach(([key, value]) => { all[key] = value; });
  all['site_password'] = '';
  all['token_version'] = '0';

  try {
    const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
    if (results) {
      results.forEach(s => { all[s.key] = s.value === null ? '' : s.value; });
    }
  } catch (e) {
    console.error('[DB] 获取设置失败:', e);
  }

  return all;
}

/**
 * 过滤出可公开的设置项（白名单）
 */
export function getPublicSettings(settings) {
  const out = {};
  if (!settings) return out;
  SAVABLE_SETTING_KEYS.forEach(key => {
    if (settings[key] !== undefined) out[key] = settings[key];
  });
  return out;
}

/**
 * 读取单个设置
 */
export async function getSetting(env, key) {
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
    return row ? (row.value || '') : '';
  } catch {
    return '';
  }
}

/**
 * 写入单个设置
 */
export async function setSetting(env, key, value) {
  return env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .bind(key, value === null || value === undefined ? '' : String(value)).run();
}

/**
 * 保存设置（只允许白名单字段，规避任意键写入 / 覆盖内部字段）
 * @returns {Promise<string[]>} 实际保存的字段名
 */
export async function saveSettings(env, settingsObj) {
  const saved = [];
  const statements = [];
  for (const key of SAVABLE_SETTING_KEYS) {
    const value = settingsObj[key];
    if (value === undefined || value === null) continue;
    statements.push(env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .bind(key, typeof value === 'object' ? JSON.stringify(value) : String(value)));
    saved.push(key);
  }
  if (statements.length === 0) return saved;
  for (let i = 0; i < statements.length; i += 10) {
    await env.DB.batch(statements.slice(i, i + 10));
  }
  return saved;
}

/**
 * 设置全站密码（null / 空字符串表示清除保护）
 * 使用 PBKDF2+随机盐哈希，绝不保存明文
 */
export async function setSitePassword(env, plainPassword) {
  if (plainPassword === null || plainPassword === undefined || String(plainPassword).trim() === '') {
    return setSetting(env, 'site_password', '');
  }
  const hashed = await hashPassword(String(plainPassword));
  return setSetting(env, 'site_password', hashed);
}

// ==================== 内容版本（用于缓存键，内容变更即整站失效）====================

export async function getContentVersion(env) {
  return (await getSetting(env, 'content_version')) || '1';
}

export async function bumpContentVersion(env) {
  try {
    const current = parseInt(await getContentVersion(env), 10) || 1;
    await setSetting(env, 'content_version', String(current + 1));
    return true;
  } catch (e) {
    console.error('[DB] 内容版本更新失败:', e.message || 'Error');
    return false;
  }
}

// ==================== 限流（独立表，避免污染设置）====================

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

/**
 * 检查是否允许尝试（滑动窗口）
 */
export async function checkRateLimit(env, key) {
  try {
    const row = await env.DB.prepare('SELECT attempts FROM rate_limits WHERE key = ?').bind(key).first();
    const now = Date.now();
    let attempts = [];
    if (row && row.attempts) {
      try { attempts = JSON.parse(row.attempts); } catch { attempts = []; }
      if (!Array.isArray(attempts)) attempts = [];
    }
    attempts = attempts.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

    if (attempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
      const oldest = attempts[0];
      const retryAfterMinutes = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 60000);
      return { allowed: false, retryAfter: Math.max(1, retryAfterMinutes) };
    }

    attempts.push(now);
    await env.DB.prepare('INSERT OR REPLACE INTO rate_limits (key, attempts, updated_at) VALUES (?, ?, ?)')
      .bind(key, JSON.stringify(attempts), new Date().toISOString()).run();

    return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS - attempts.length };
  } catch (e) {
    console.error('[DB] 限流检查失败:', e.message || 'Error');
    return { allowed: true };
  }
}

/**
 * 清除限流记录（登录成功后调用）
 */
export async function clearRateLimit(env, key) {
  try {
    await env.DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();
  } catch {
    // 忽略
  }
}

// ==================== 标签 ====================

/**
 * 规范化标签字符串：'a, b，c' -> 'a,b,c'（去重、去空白、统一分隔符）
 */
export function normalizeTags(tags) {
  if (!tags) return '';
  const seen = new Set();
  const out = [];
  String(tags).split(/[,，、;；|]/).forEach(function (part) {
    const name = part.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  });
  return out.join(',');
}

/**
 * 由规范化标签生成检索索引：'a,b' -> ',a,b,'
 */
export function tagsToIndex(normalizedTags) {
  return normalizedTags ? ',' + normalizedTags + ',' : '';
}

/**
 * 切分展示用标签数组
 */
export function splitTags(tags) {
  return normalizeTags(tags).split(',').filter(Boolean);
}

/**
 * 标签云数据（按出现次数倒序）
 */
export async function getTagCounts(env) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT tags_index, tags FROM posts WHERE status = 'published' AND tags != ''"
    ).all();
    const counter = new Map();
    (results || []).forEach(row => {
      splitTags(row.tags).forEach(tag => {
        counter.set(tag, (counter.get(tag) || 0) + 1);
      });
    });
    return Array.from(counter, ([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
  } catch (e) {
    console.error('[DB] 标签统计失败:', e.message || 'Error');
    return [];
  }
}

// ==================== 文章查询（供页面 SSR 与公开 API 共用）====================

/**
 * 生成文章固定链接
 */
export function postUrl(post) {
  const date = new Date(post.published_at || post.created_at || Date.now());
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `/post/${y}${m}/${post.id}`;
}

/**
 * 分页查询已发布文章
 * @param {object} options { page, limit, category, tag, q, pinnedPostId }
 */
export async function listPosts(env, options = {}) {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit, 10) || 10));
  const category = options.category ? String(options.category).trim() : '';
  const tag = options.tag ? String(options.tag).trim() : '';
  const q = options.q ? String(options.q).trim() : '';

  const where = ["status = 'published'"];
  const params = [];
  let categoryName = category;
  if (category) {
    // 既支持分类 slug 也支持分类名（旧链接里两者都出现过）
    try {
      const catRow = await env.DB.prepare('SELECT name FROM categories WHERE slug = ? OR name = ? LIMIT 1')
        .bind(category, category).first();
      if (catRow && catRow.name) categoryName = catRow.name;
    } catch (e) {
      // 查询分类失败时按原值匹配
    }
    where.push('category = ?');
    params.push(categoryName);
  }
  if (tag) {
    where.push('instr(tags_index, ?) > 0');
    params.push(',' + normalizeTags(tag) + ',');
  }
  if (q) {
    where.push('(instr(lower(title), lower(?)) > 0 OR instr(lower(tags_index), lower(?)) > 0)');
    params.push(q, q);
  }
  const whereSql = where.join(' AND ');

  const countRow = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM posts WHERE ' + whereSql)
    .bind(...params).first();
  const total = countRow ? (countRow.cnt || 0) : 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;

  // excerpt 为空时用正文前 300 字兜底，避免整篇正文被读入内存
  const { results } = await env.DB.prepare(
    'SELECT id, title, slug, category, tags, cover_image, view_count, created_at, published_at, ' +
    "CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END AS has_password, " +
    "CASE WHEN password IS NOT NULL AND password != '' THEN '' " +
    "     WHEN excerpt IS NULL OR excerpt = '' THEN substr(content, 1, 300) ELSE excerpt END AS excerpt_src " +
    'FROM posts WHERE ' + whereSql + ' ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?'
  ).bind(...params, limit, offset).all();

  const posts = (results || []).map(row => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    category: row.category,
    tags: splitTags(row.tags),
    cover_image: row.cover_image || '',
    view_count: row.view_count || 0,
    created_at: row.created_at,
    published_at: row.published_at || row.created_at,
    has_password: !!row.has_password,
    excerpt_text: stripMarkdown(row.excerpt_src || '', 120),
    url: postUrl(row)
  }));

  // 置顶：仅在首页且无筛选时生效，置顶文章不在首页时补到最前面
  const pinnedPostId = options.pinnedPostId ? String(options.pinnedPostId) : '';
  if (pinnedPostId && safePage === 1 && !category && !tag && !q) {
    const idx = posts.findIndex(p => String(p.id) === pinnedPostId);
    if (idx > 0) {
      const [pinned] = posts.splice(idx, 1);
      posts.unshift(pinned);
    } else if (idx < 0) {
      const pinnedRow = await env.DB.prepare(
        'SELECT id, title, slug, category, tags, cover_image, view_count, created_at, published_at, ' +
        "CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END AS has_password, " +
        "CASE WHEN password IS NOT NULL AND password != '' THEN '' " +
        "     WHEN excerpt IS NULL OR excerpt = '' THEN substr(content, 1, 300) ELSE excerpt END AS excerpt_src " +
        "FROM posts WHERE id = ? AND status = 'published' LIMIT 1"
      ).bind(pinnedPostId).first();
      if (pinnedRow) {
        posts.unshift({
          id: pinnedRow.id,
          title: pinnedRow.title,
          slug: pinnedRow.slug,
          category: pinnedRow.category,
          tags: splitTags(pinnedRow.tags),
          cover_image: pinnedRow.cover_image || '',
          view_count: pinnedRow.view_count || 0,
          created_at: pinnedRow.created_at,
          published_at: pinnedRow.published_at || pinnedRow.created_at,
          has_password: !!pinnedRow.has_password,
          excerpt_text: stripMarkdown(pinnedRow.excerpt_src || '', 120),
          url: postUrl(pinnedRow)
        });
      }
    }
  }

  return {
    posts,
    pagination: { page: safePage, limit, total, totalPages },
    query: { category, categoryName, tag, q }
  };
}

/**
 * 分类列表（含文章数）
 */
export async function getCategoriesWithCounts(env) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT c.id, c.name, c.slug, c.description, " +
      "(SELECT COUNT(*) FROM posts p WHERE p.category = c.name AND p.status = 'published') AS count " +
      'FROM categories c ORDER BY c.name'
    ).all();
    return results || [];
  } catch (e) {
    console.error('[DB] 获取分类失败:', e.message || 'Error');
    return [];
  }
}

/**
 * 站点统计
 */
export async function getSiteStats(env) {
  try {
    const [postRow, catRow, latestRow] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS cnt FROM posts WHERE status = 'published'").first(),
      env.DB.prepare('SELECT COUNT(*) AS cnt FROM categories').first(),
      env.DB.prepare("SELECT title, published_at, created_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 1").first()
    ]);
    return {
      postCount: postRow ? (postRow.cnt || 0) : 0,
      categoryCount: catRow ? (catRow.cnt || 0) : 0,
      latestPost: latestRow ? {
        title: latestRow.title,
        date: latestRow.published_at || latestRow.created_at
      } : null
    };
  } catch (e) {
    console.error('[DB] 统计失败:', e.message || 'Error');
    return { postCount: 0, categoryCount: 0, latestPost: null };
  }
}

/**
 * 一次性取得侧边栏所需的全部数据（分类 / 友链 / 标签云 / 统计）
 * 页面 SSR 与客户端复用，避免前端再发起 3~5 个额外请求。
 */
export async function getSiteData(env, settings) {
  const [categories, tags, stats] = await Promise.all([
    getCategoriesWithCounts(env),
    getTagCounts(env),
    getSiteStats(env)
  ]);
  return {
    categories,
    tags,
    stats,
    links: parseLinks(settings ? settings.site_links : '')
  };
}
