// ==================== 数据库模块（优化初始化）====================

import { hashPassword } from './auth.js';

/**
 * 获取表的列信息（白名单验证防止 SQL 注入）
 */
const ALLOWED_TABLES = ['posts', 'categories', 'settings'];
async function getTableColumns(DB, tableName) {
  if (!ALLOWED_TABLES.includes(tableName)) return [];
  try {
    const { results } = await DB.prepare(
      `PRAGMA table_info(${tableName})`
    ).all();
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
 * 初始化数据库（幂等操作，可安全重复调用）
 */
export async function initDB(env) {
  if (!env.DB) {
    console.error('[DB] D1 数据库未绑定');
    return false;
  }

  try {
    const DB = env.DB;

    // ========== 1. 创建 categories 表 ==========
    if (!(await tableExists(DB, 'categories'))) {
      console.log('[DB] 创建 categories 表...');
      await DB.prepare(`
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          description TEXT DEFAULT ''
        )
      `).run();
    }

    // ========== 2. 创建 posts 表 ==========
    if (!(await tableExists(DB, 'posts'))) {
      console.log('[DB] 创建 posts 表...');
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
          status TEXT DEFAULT 'draft',
          view_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          published_at TEXT
        )
      `).run();
    } else {
      // 检查并添加缺失的列（使用 PRAGMA 替代 try-catch）
      const columns = await getTableColumns(DB, 'posts');
      if (!columns.includes('password')) {
        await DB.prepare("ALTER TABLE posts ADD COLUMN password TEXT DEFAULT ''").run();
        console.log('[DB] 已添加 password 列');
      }
      if (!columns.includes('published_at')) {
        await DB.prepare("ALTER TABLE posts ADD COLUMN published_at TEXT").run();
        console.log('[DB] 已添加 published_at 列');
      }
    }

    // ========== 3. 创建 settings 表 ==========
    if (!(await tableExists(DB, 'settings'))) {
      console.log('[DB] 创建 settings 表...');
      await DB.prepare(`
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT DEFAULT '',
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    }

    // ========== 4. 创建索引 ==========
    try {
      await DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)").run();
      await DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)").run();
      await DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug)").run();
      await DB.prepare("CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category)").run();
      console.log('[DB] 索引创建完成');
    } catch (e) {
      console.error('[DB] 索引创建失败:', e);
    }

    // ========== 5. 插入默认设置（批量操作）==========
    const defaultSettings = [
      ['site_name', '我的博客'],
      ['site_description', '一个使用 Cloudflare 构建的博客'],
      ['site_favicon', ''],
      ['site_avatar', ''],
      ['site_bio', ''],
      ['site_links', ''],
      ['site_footer', '© 2026 我的博客'],
      ['custom_js', ''],
      ['site_author', ''],
      ['category_icon', '📂'],
      ['links_icon', '🔗'],
      ['tag_cloud_icon', '🏷️'],
      ['enable_tag_cloud', '1'],
      ['profile_position', 'left'],
      ['tag_cloud_position', 'left'],
      ['pinned_post_id', '']
    ];

    // 逐条插入默认设置（避免 D1 batch 10条限制）
    for (const [key, value] of defaultSettings) {
      await DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind(key, value).run();
    }

    // ========== 5. 插入示例文章（仅在表为空时）==========
    const postCount = await DB.prepare("SELECT COUNT(*) as cnt FROM posts").first();
    if (postCount && postCount.cnt === 0) {
      const now = new Date().toISOString();
      await DB.prepare(`
        INSERT INTO posts (title, slug, content, excerpt, cover_image, category, tags, status, view_count, created_at, updated_at, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        '欢迎使用 cloudflare-light-blog',
        'welcome',
        '# 欢迎\n\n这是一个基于 Cloudflare Workers + D1 构建的轻量级博客系统。\n\n## 功能特点\n\n- ✅ 简洁的后台管理\n- ✅ 支持文章封面图\n- ✅ 高速部署\n- ✅ 免费额度充足\n\n开始你的博客之旅吧！',
        '这是一个基于 Cloudflare Workers 构建的轻量级博客系统...',
        '',
        '技术教程',
        'Cloudflare,博客',
        'published',
        0,
        now,
        now,
        now
      ).run();
      console.log('[DB] 已添加示例文章');
    }

    console.log('[DB] 数据库初始化完成');
    return true;
  } catch (e) {
    console.error('[DB] 初始化错误:', e.message || 'Error');
    return false;
  }
}

/**
 * 获取所有设置
 */
export async function getSettings(env) {
  const defaults = {
    site_name: '我的博客',
    site_description: '',
    site_favicon: '',
    site_avatar: '',
    site_bio: '',
    site_author: '',
    site_footer: '',
    custom_js: '',
    site_links: '',
    category_icon: '📂',
    links_icon: '🔗',
    tag_cloud_icon: '🏷️',
    enable_tag_cloud: '1',
    profile_position: 'left',
    tag_cloud_position: 'left',
    pinned_post_id: ''
  };

  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
    if (results) {
      results.forEach(s => { defaults[s.key] = s.value || ''; });
    }
  } catch (e) {
    console.error('[DB] 获取设置失败:', e);
  }

  return defaults;
}

/**
 * 保存设置（批量）
 */
export async function saveSettings(env, settingsObj) {
  const entries = Object.entries(settingsObj).filter(([key, value]) => value !== undefined && value !== null);
  for (const [key, value] of entries) {
    // 全站密码需要哈希存储
    if (key === 'site_password' && value && value.trim()) {
      const hashed = await hashPassword(value);
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, hashed).run();
    } else if (key === 'site_password') {
      // 空密码直接存储
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, '').run();
    } else {
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, String(value)).run();
    }
  }
}
