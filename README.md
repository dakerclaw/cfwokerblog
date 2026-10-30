# cloudflare-blog

基于 Cloudflare Workers + D1 构建的轻量级博客系统（图片内嵌 base64，无需对象存储）。
[预览网址](https://blog.hehudieyiqi.com)

## 功能特性

### 前台
- ✅ 服务端渲染（SSR）：文章列表、分类、友链、标签云、统计都在服务端一次渲染完成，首屏不再空白等 JS
- ✅ 文章列表（真实链接分页、分类筛选、搜索标题和标签 —— 全部在服务端过滤，翻页可被搜索引擎抓取）
- ✅ 文章详情页（Markdown 渲染、代码高亮、代码复制按钮、折叠框、引用样式）
- ✅ 文章目录（客户端按正文 h2/h3 自动生成，少于 2 个标题时自动隐藏）
- ✅ 相关文章（优先同标签、不足时同分类补齐，服务端渲染，零额外请求）
- ✅ 正文外链自动新窗口打开（`target="_blank" rel="noopener noreferrer"`）
- ✅ 图片灯箱（上一张/下一张导航、键盘操作、图片计数器）
- ✅ 侧边栏（个人简介、文章/分类/标签统计、建站时间、分类列表、自定义友链）
- ✅ 标签云模块（自动聚合标签、固定配色、服务端渲染真实链接、点击筛选文章）
- ✅ 密码保护文章（PBKDF2-SHA256 + 随机盐、24小时有效期、5次/15分钟速率限制）
- ✅ 全站密码保护（可选、Cookie 24小时有效期、5次/15分钟速率限制）
- ✅ 搜索栏（350ms 防抖，结果由服务端返回，搜索页自动 noindex）
- ✅ 便签贴纸风格标签
- ✅ 响应式布局（手机端 / 平板端 / 桌面端）
- ✅ 文章置顶（在网站设置中配置置顶文章编号，置顶文章首位显示，带金色边框和📌置顶标识）

### 后台管理
- ✅ 文章管理（表格布局、分页、内联新建/编辑、Markdown 编辑器工具栏、封面图链接、标签列展示）
- ✅ 分类管理（表格布局、增删改，改名自动同步文章，删除时文章自动迁移到「未分类」）
- ✅ 回收站（表格布局、恢复/彻底删除）
- ✅ 个人设置（头像、简介、建站时间、友链标题/内容、图标配置、模块位置开关）
- ✅ 网站设置（标题、图标、主题、页脚、自定义JS、全站密码、CORS 来源、功能开关）
- ✅ 主题切换（动物森林 / 海洋微风 / 紫气东来 / 金光初现，后台与访客前台统一生效）
- ✅ 封面图链接（填外链地址后，文章页的 `og:image` / 微信分享卡片会使用该图片；留空则回退站点默认分享图）
- ✅ Markdown 编辑器（标题、加粗、斜体、链接、图片、代码、列表、引用、分割线、折叠框）
- ✅ 页面刷新保持当前导航页
- ✅ 响应式布局（手机端 / 平板端 / 桌面端）
- ✅ 文章导入（WordPress XML 在浏览器端解析成结构化数据后提交，批量导入文章、分类、标签）
- ✅ 网站设置中配置置顶文章编号（置顶文章首位显示，带金色边框和📌标识）
- ✅ 密码三态管理：文章 / 全站密码均可「保持不变 / 设置新密码 / 取消密码」，彻底避免把哈希当成新密码重复加密

### 安全
- ✅ 管理员认证（HMAC-SHA256 签名 Token + 可撤销的 token_version，48 小时过期）
- ✅ 未配置 `ADMIN_PASSWORD` 时 **fail-closed**（拒绝所有管理操作，不再签发 `no-auth` 免认证令牌）
- ✅ 密码哈希使用 PBKDF2-SHA256（10000 次迭代 + 每密码独立随机盐，兼顾 Workers 免费层 CPU 限制），数据库不存明文
- ✅ 恒定时间比较（timingSafeEqual，防止时序攻击）
- ✅ 历史遗留哈希可平滑升级（旧 HMAC 哈希仍可校验，登录/验证成功后自动改写为新格式）
- ✅ 全站密码保护（Cookie 由密码哈希派生，改密码即令旧 Cookie 全部失效）
- ✅ 登录速率限制（5次/15分钟，记录在独立 rate_limits 表）
- ✅ 密码速率限制（全站密码 + 文章密码，5次/15分钟，按 IP 维度）
- ✅ 设置项白名单（`/api/settings` 不会再泄露 site_password 哈希、token_version 等内部字段）
- ✅ 受保护文章正文必须凭 Cookie 才能获取（列表接口只返回 `has_password` 布尔值，摘要打码）
- ✅ 上传接口需要管理员权限（旧版任何人可匿名写入 base64 图片）
- ✅ XSS 防护（所有内联 JSON 走 jsonScript 转义，杜绝 `</script>` 截断注入）
- ✅ Markdown 内联 HTML 消毒（DOMParser 惰性解析后移除 script/iframe/on* 事件与 javascript: 链接，防 WordPress 导入注入）
- ✅ SQL 注入防护（参数化查询、表名白名单验证）
- ✅ 文件上传限制（1MB、MIME 类型验证）
- ✅ 错误信息隐藏（仅记录截断的错误摘要到服务器日志）
- ✅ CORS 可配置来源（支持多域名逗号分隔，后台设置）
- ✅ HTTP 安全头（X-Content-Type-Options、X-Frame-Options、Referrer-Policy、HSTS）
- ✅ Cookie 安全属性（HttpOnly、SameSite=Lax、Max-Age、HTTPS 下 Secure）
- ✅ 未认证 API 返回 401 JSON（`locked:true`），未认证页面跳密码页；静态资源（图标/字体/vendor）不受门禁影响
- ✅ 开启全站密码后，公开接口、sitemap.xml、rss.xml 同样要求有效 Cookie —— 否则绕过密码页直接请求 `/api/posts` 就能拿走全部标题和摘要

### SEO
- ✅ 服务端渲染的文章列表与真实分页链接（爬虫无需执行 JS）
- ✅ meta 标签（description、robots，搜索结果页自动 noindex）
- ✅ Open Graph 标签（og:title、og:description、og:image、article:tag 等）
- ✅ JSON-LD 结构化数据（首页 WebSite + SearchAction，文章页 BlogPosting）
- ✅ canonical URL（按分类 / 标签 / 页码生成，不会全部指向首页）
- ✅ rel=prev / rel=next 分页关系标注
- ✅ sitemap.xml 自动生成（不含密码保护文章）
- ✅ rss.xml 订阅源
- ✅ robots.txt（后台可开关；开启全站密码时自动 Disallow: /）
- ✅ 图片懒加载（loading="lazy"）
- ✅ 未知路径返回真实 404（不再返回首页 200 造成软 404）
- ✅ 微信分享卡片：文章页输出绝对地址的 `og:url` 与 `og:image`（默认回退站点分享图 `og-default.png`）

### 性能
- ✅ 数据库索引（status、published_at、created_at、slug、category、tags_index）
- ✅ 标签检索走 `tags_index` 列 + instr()，不再依赖 LIKE 模式匹配
- ✅ 边缘缓存：首页整体 SSR 后缓存、`/api/posts`(60s)、`/api/categories`(300s)、`/api/tags`(300s)、`/api/stats`(60s)，缓存键都带内容版本号，任何内容变更即刻失效（无需逐个删除）
- ✅ 关键词搜索、文章详情等随 Cookie 或参数变化的响应一律不缓存
- ✅ 零额外请求首屏（侧边栏数据随页面一起下发，不再由前端再发 3~5 个请求）
- ✅ 冷启动优化（Promise 缓存避免重复初始化；迁移用 `PRAGMA user_version` 记录版本）
- ✅ 分块 base64 编码（修复大图 `String.fromCharCode(...bytes)` 直接抛栈溢出）
- ✅ 系统字体栈，不加载任何外部 Web 字体（已移除 Google Fonts 依赖，国内访问更快更稳）

## 技术栈

- **运行时**: Cloudflare Workers 
- **数据库**: Cloudflare D1
- **图片存储**: 内嵌 base64（无需外部对象存储）
- **前端**: 原生 HTML + Vue 3（后台管理）
- **Markdown**: marked.js + highlight.js
- **部署**: GitHub → Cloudflare Workers 自动部署

## 项目结构

```
src/
├── worker.js              # 主入口（路由、全站密码门禁、SSR、页面缓存、浏览计数、robots.txt/404）
├── api.js                 # API 处理（分页、服务端筛选、输入验证、速率限制、密码认证、Cookie 生成）
├── lib/
│   ├── utils.js           # 工具函数（JSON/HTML 响应、CORS 多域名、HTTP 安全头、jsonScript、parseLinks）
│   ├── db.js              # 数据库（迁移版本管理、设置白名单、标签索引、限流表、列表查询）
│   ├── auth.js            # 认证模块（PBKDF2 密码哈希、HMAC Token、恒定时间比较、各种 Cookie）
│   ├── cache.js           # Workers Cache API（缓存键带内容版本号）
│   ├── layout.js          # 公共布局（样式、页头页脚、侧边栏、标签云、列表渲染、SEO 文案）
│   └── image.js           # 图片处理（分块 base64、1MB 限制、MIME 验证）
└── views/
    ├── frontend.js        # 前台首页（SSR、真实分页、渐进增强搜索、SEO）
    ├── post.js            # 文章详情页（Markdown、代码高亮、灯箱、SEO、懒加载）
    ├── password.js        # 密码验证页（API 认证、速率限制）
    └── admin.js           # 后台管理页（Vue 3、响应式）
public/icon/               # 静态图标资源（随项目部署）
public/vendor/             # 本地化的前端依赖（Vue / axios / marked / highlight）
wrangler.toml              # Cloudflare 配置
```

### 图标资源说明

`public/icon/` 目录下的图片文件用途如下：

| 文件名 | 用途 |
|--------|------|
| `dashboard.png` | 后台管理标题前置图标 |
| `navigate.png` | 导航栏选中项指示器 |
| `logout.png` | 退出登录按钮前置图标 |
| `profile.png` | 个人头像 |
| `favicon.ico` | 网站图标 |
| `category.png` | 分类标题图标 |
| `friend-links.png` | 友链标题图标 |
| `pin-post.png` | 置顶文章标识（首页卡片及文章内页） |

> 替换对应的图片文件即可自定义图标，无需修改代码。

## 部署步骤

### 1. 获取项目代码

**Fork 仓库**

1. 在 GitHub 上 Fork 本仓库到你的账号
2. 后续可同步上游更新

### 2. 创建 D1 数据库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **D1**
3. 点击 **Create database**，名称输入 `blog-db`

### 3. 连接 Cloudflare Workers

1. Cloudflare Dashboard → **Workers & Pages** → **Create Application**
2. 选择 **Workers** → **Connect to Git**
3. 选择你的 GitHub 仓库（Fork 的仓库）
4. 部署

### 4. 配置 D1 数据库绑定

1. 进入 Cloudflare Dashboard → **Workers & Pages** → 你的 Worker
2. 点击 **Settings** → **Bindings** → **Add**
3. 选择 **D1 Database**，变量名（Variable name）填 `DB`，选择你的 `blog-db` 数据库
4. 点击保存，Cloudflare 会自动读取 `wrangler.toml` 配置并**重新部署**

### 5. 设置环境变量

部署完成后，在 Worker 的 **Settings → Variables and Secrets** 中添加：

| 变量名 | 类型 | 说明 |
|--------|------|------|
| `ADMIN_USERNAME` | **Secret** | 管理员账号 |
| `ADMIN_PASSWORD` | **Secret** | 管理员密码 |

> ⚠️ `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 请使用 **Secret** 类型，确保凭据加密存储。
> CORS 来源、全站密码等配置在后台网站设置中管理，无需在此设置。

> 📌 **凭据重置提示：** 若遗忘管理员账号或密码，可前往 Cloudflare Dashboard → Workers & Pages → 你的 Worker → Settings → Variables and Secrets，重新设置 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 的值，保存后触发重新部署即可生效。无需修改代码或推送仓库。

### 6. 后续更新

**Fork 用户：** 在 GitHub 上点击 **Sync fork** 同步上游更新，Cloudflare 会自动重新部署。


## 访问地址

| 页面 | 路径 |
|------|------|
| 前台首页 | `https://你的域名/` |
| 后台管理 | `https://你的域名/admin/` |
| 站点地图 | `https://你的域名/sitemap.xml` |
| RSS 订阅 | `https://你的域名/rss.xml` |
| robots.txt | `https://你的域名/robots.txt` |
| favicon | `https://你的域名/favicon.ico` |
| 健康检查 | `https://你的域名/api/health` |

## 后台设置说明

### 个人设置

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| 个人名称 | 侧边栏显示的作者名 | 空 |
| 个人头像 | 替换 `public/icon/profile.png` 文件即可更换 | profile.png |
| 个人简介 | 侧边栏简介文字 | 空 |
| 建站时间 | 侧边栏显示的建站日期 | 自行选择 |
| 友链标题 | 侧边栏友链模块标题 | 友链 |
| 友链内容 | 名称,地址 每行一个,https开头| 空 |
| 分类标题图标 | 替换 `public/icon/category.png` 文件即可更换 | category.png |
| 友链标题图标 | 替换 `public/icon/friend-links.png` 文件即可更换 | friend-links.png |
| 置顶文章图标 | 替换 `public/icon/pin-post.png` 文件即可更换 | pin-post.png |
| 标签云开关 | 控制是否显示标签云模块 | 显示 |
| 个人简介位置 | 居左 / 居右 | 居左 |
| 标签云位置 | 居左 / 居右 | 居左 |

### 网站设置

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| 网站标题 | 浏览器标题栏和侧边栏 | 我的博客 |
| 网站副标题 | 首页描述文字 | 空 |
| 网站图标 | 替换 `public/icon/favicon.ico` 文件即可更换 | favicon.ico |
| 主题风格 | 动物森林 / 海洋微风 / 紫气东来 / 金光初现 | 动物森林 |
| 网站页脚 | 支持 HTML | © 2026 我的博客 |
| 自定义 JS | 注入到页面的自定义脚本 | 空 |
| 全站密码 | 三态选择：保持不变 / 设置新密码 / 关闭密码保护；开启后访问任何页面都需验证 | 关闭 |
| CORS 允许来源 | 多域名逗号分隔，* 表示全部 | * |
| 允许搜索引擎爬取 | 控制 robots.txt 是否允许爬取 | 开启 |
| 启用压缩 | 控制 Cloudflare 自动压缩（由边缘节点处理） | 开启 |
| 置顶文章ID | 置顶显示的文章编号，留空表示不置顶 | 空 |

> 说明：密码设置不再要求填入已有哈希；选择「设置新密码」并输入明文即可，服务端负责加盐哈希。

## API 接口

<details>
<summary>点击展开 API 接口文档</summary>

### 公开接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/posts?page=1&limit=10&category=slug&tag=xx&q=关键词` | 文章列表（服务端分页 / 分类 / 标签 / 搜索） |
| GET | `/api/post/?slug=xxx` | 文章详情（受保护文章未通过验证返回 401 + `locked:true`） |
| GET | `/api/categories` | 分类列表（含文章数） |
| GET | `/api/tags` | 标签云（名称 + 出现次数） |
| GET | `/api/settings` | 网站设置（仅公开白名单字段） |
| GET | `/api/stats` | 统计信息（文章数、分类数、标签数、最新更新日期） |
| GET | `/api/links` | 友链列表 |
| GET | `/api/health` | 健康检查（数据库连接状态） |
| GET | `/sitemap.xml` | 站点地图 |
| GET | `/rss.xml` | RSS 2.0 订阅源 |
| POST | `/api/site-auth` | 全站密码认证（返回 HttpOnly Cookie） |
| POST | `/api/post-auth` | 文章密码认证（返回 HttpOnly Cookie） |

> 全站密码：一旦在后台设置了全站密码，上表中除 `/api/site-auth`、`/api/health` 之外的接口
> 都必须携带有效的 `site_auth` Cookie，否则返回 `401 {locked:true}`。

### 管理接口（需要 Bearer Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 登录获取 Token（5次/15分钟限制） |
| POST | `/api/logout` | 注销并作废所有已签发 Token（递增 token_version） |
| GET | `/api/admin/posts` | 所有文章（含草稿，返回 `has_password` 而非密码哈希） |
| POST | `/api/admin/post` | 创建文章 |
| PUT | `/api/admin/post?id=x` | 更新文章 |
| DELETE | `/api/admin/post?id=x` | 删除文章（移至回收站） |
| POST | `/api/admin/posts/batch-delete` | 批量移至回收站 |
| GET | `/api/admin/trash` | 回收站列表 |
| POST | `/api/admin/restore` | 恢复文章 |
| POST | `/api/admin/permanent-delete` | 彻底删除 |
| POST | `/api/admin/trash/empty` | 清空回收站 |
| GET | `/api/admin/settings` | 读取设置（含 `has_site_password` 布尔值） |
| POST | `/api/category` | 创建/更新分类（改名自动同步文章） |
| DELETE | `/api/category?id=x` | 删除分类（文章迁移到「未分类」，可用 `fallback=` 指定） |
| POST | `/api/upload` | 上传图片（1MB 限制，返回 base64） |
| POST | `/api/settings` | 保存设置（白名单字段 + 全站密码三态） |
| POST | `/api/links` | 保存友链 |
| POST | `/api/admin/import-wordpress` | 导入文章（接收浏览器解析后的结构化 JSON，单次最多 100 篇） |

> 密码相关字段说明：创建/更新文章使用 `password_action`（`keep` / `set` / `clear`）配合 `password`；
> 保存设置使用 `site_password_action`（`keep` / `set` / `clear`）配合 `site_password_value`。
> 任何情况下都不会把哈希回传给前端。

</details>

## License

MIT
