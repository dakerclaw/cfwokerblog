// ==================== 后台管理页面 ====================

import { escapeHtml } from '../lib/utils.js';
import { themes } from '../lib/themes.js';

export function getAdminHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>博客管理后台</title>
  <link rel="icon" href="/icon/favicon.ico">
  <script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js" crossorigin="anonymous"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js" crossorigin="anonymous"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Nunito, 'Noto Sans SC', sans-serif; background: var(--body-bg, #f8f8f0); color: var(--text-body, #725d42); }
    .login { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--header-bg, linear-gradient(135deg, #7DC395, #5BAF7A)); }
    .login-box { background: #f7f3df; padding: 40px; border-radius: 20px; width: 100%; max-width: 400px; text-align: center; border: 2px solid #e8e0cc; box-shadow: 0 4px 10px rgba(107, 92, 67, 0.42); }
    .login-box h1 { margin-bottom: 20px; color: #794f27; font-weight: 700; }
    .login-box input { width: 100%; padding: 12px 18px; margin-bottom: 16px; border: 2.5px solid #c4b89e; border-radius: 50px; font-size: 14px; background: #f8f8f0; color: #725d42; box-shadow: 0 3px 0 0 #d4c9b4; outline: none; }
    .login-box input:focus { border-color: #ffcc00; box-shadow: 0 3px 0 0 #e0b800; }
    .login-box button { width: 100%; padding: 14px; background: #19c8b9; color: #fff; border: none; border-radius: 50px; font-size: 16px; font-weight: 600; cursor: pointer; box-shadow: 0 5px 0 0 #11a89b; }
    .admin-layout { display: flex; min-height: 100vh; }
    .sidebar { width: 240px; background: var(--sidebar-bg, #8ac68a); color: #fff; flex-shrink: 0; }
    .sidebar-header { padding: 24px 20px; text-align: center; border-bottom: 2px solid rgba(255,255,255,0.2); }
    .sidebar-header h1 { font-size: 20px; display: flex; align-items: center; justify-content: center; }
    .sidebar-menu { padding: 16px 12px; }
    .sidebar-menu a { display: flex; align-items: center; justify-content: center; padding: 14px 16px; color: rgba(255,255,255,0.85); text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px; margin-bottom: 6px; transition: all 0.25s ease; }
    .sidebar-menu a:hover { background: #d6dff0; color: #fff; }
    .sidebar-menu a.active { background: #B7C6E5; color: #fff; box-shadow: 0 3px 0 0 #9aaed4; }
    .sidebar-footer .nav-home { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 14px; padding: 14px 16px; color: rgba(255,255,255,0.85); text-decoration: none; font-weight: 600; font-size: 15px; border-radius: 12px; transition: all 0.25s ease; }
    .sidebar-footer .nav-home:hover { background: #d6dff0; color: #fff; }
    .sidebar-footer .nav-home .nav-home-icon { font-size: 16px; line-height: 1; }
    .sidebar-menu a .nav-icon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; margin-right: 10px; }
    .sidebar-menu a .nav-icon img { width: 100%; height: 100%; }
    .sidebar-header-icon { width: 24px; height: 24px; margin-right: 10px; }
    .sidebar-footer-icon { width: 18px; height: 18px; margin-right: 8px; }
    .sidebar-footer { padding: 16px 20px; border-top: 2px solid rgba(255,255,255,0.2); }
    .sidebar-footer button { width: 100%; padding: 10px; background: rgba(255,255,255,0.2); color: #fff; border: none; border-radius: 50px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 15px; transition: all 0.25s ease; }
    .sidebar-footer button:hover { background: #d6dff0; color: #fff; }
    .main-content { flex: 1; padding: 30px; }
    .page-header { margin-bottom: 24px; }
    .page-header h2 { color: #794f27; font-size: 1.5em; }
    .btn { padding: 10px 24px; background: var(--btn-bg, #19c8b9); color: #fff; border: none; border-radius: 50px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 0 0 var(--btn-shadow, #11a89b); }
    .btn:hover { transform: translateY(-1px); }
    .btn-danger { background: var(--danger-bg, #e05a5a); box-shadow: 0 4px 0 0 var(--danger-shadow, #c94444); }
    .btn-cancel { background: #e8e0d0; color: #725d42; border: none; border-radius: 50px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 0 0 #c4b89e; padding: 10px 24px; }
    .btn-cancel:hover { transform: translateY(-1px); box-shadow: 0 5px 0 0 #c4b89e; }
    .btn-back { background: linear-gradient(135deg, #7DC395, #5BAF7A); color: #fff; border: none; border-radius: 50px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 0 0 #4a9a68; padding: 8px 20px; font-size: 14px; }
    .btn-back:hover { transform: translateY(-1px); box-shadow: 0 5px 0 0 #4a9a68; }
    .btn-import { background: #19c8b9; box-shadow: 0 4px 0 0 #11a89b; }
    .btn-import:hover { transform: translateY(-1px); box-shadow: 0 5px 0 0 #11a89b; }
    .btn-pin { background: #FFB74D; box-shadow: 0 4px 0 0 #E8A33D; color: #fff; }
    .btn-pin:hover { transform: translateY(-1px); box-shadow: 0 5px 0 0 #E8A33D; }
    /* 美化单选按钮样式 */
    .radio-item { position: relative; display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .radio-item input[type="radio"] { position: absolute; opacity: 0; width: 0; height: 0; }
    .radio-item .radio-custom { width: 20px; height: 20px; border: 2.5px solid #c4b89e; border-radius: 50%; background: #f8f8f0; transition: all 0.25s ease; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 0 0 #d4c9b4; }
    .radio-item .radio-custom::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: transparent; transition: all 0.25s ease; }
    .radio-item input[type="radio"]:checked + .radio-custom { border-color: #19c8b9; box-shadow: 0 2px 0 0 #11a89b; }
    .radio-item input[type="radio"]:checked + .radio-custom::after { background: linear-gradient(135deg, #19c8b9, #11a89b); }
    .radio-item:hover .radio-custom { border-color: #19c8b9; }
    .radio-item .radio-label { font-size: 14px; color: #725d42; font-weight: 500; user-select: none; }
    .card { background: var(--card-bg, #f7f3df); border-radius: 20px; padding: 24px; box-shadow: 0 4px 10px rgba(107,92,67,0.42); border: 2px solid var(--card-border, #e8e0cc); margin-bottom: 16px; }
    .form-group { margin-bottom: 18px; }
    .form-group > label { display: block; margin-bottom: 8px; font-weight: 600; color: #794f27; }
    .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 12px 18px; border: 2.5px solid var(--input-border, #c4b89e); border-radius: 50px; font-size: 14px; background-color: #f8f8f0; color: var(--text-body, #725d42); box-shadow: 0 3px 0 0 var(--input-shadow, #d4c9b4); font-weight: 500; }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus { border-color: #ffcc00; box-shadow: 0 3px 0 0 #e0b800; outline: none; }
    .form-group textarea { border-radius: 18px; min-height: 80px; resize: vertical; }
    .custom-select { position: relative; }
    .custom-select-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 18px;
      background: #f8f8f0;
      border: 2.5px solid #c4b89e;
      border-radius: 50px;
      cursor: pointer;
      box-shadow: 0 3px 0 0 #d4c9b4;
      transition: all 0.25s;
      font-weight: 500;
      color: #725d42;
      min-height: 45px;
    }
    .custom-select-trigger:hover { border-color: #a89878; }
    .custom-select-trigger.active { border-color: #ffcc00; box-shadow: 0 3px 0 0 #e0b800; }
    .custom-select-trigger::after {
      content: '';
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 6px solid #725d42;
      transition: transform 0.2s;
    }
    .custom-select-trigger.active::after { transform: rotate(180deg); }
    .custom-select-dropdown {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      background: #f8f8f0;
      border: 2px solid #c4b89e;
      border-radius: 12px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
      box-shadow: 0 8px 24px rgba(107, 92, 67, 0.2);
    }
    .custom-select-dropdown.show { display: block; }
    .custom-select-option {
      padding: 10px 16px;
      cursor: pointer;
      transition: all 0.15s;
      font-weight: 500;
    }
    .custom-select-option:first-child { border-radius: 10px 10px 0 0; }
    .custom-select-option:last-child { border-radius: 0 0 10px 10px; }
    .custom-select-option:hover { background: #e6f9f6; color: #11a89b; }
    .custom-select-option.selected { background: #19c8b9; color: #fff; }
    .custom-select-option.disabled { color: #c4b89e; cursor: default; }
    .custom-select-option.disabled:hover { background: transparent; color: #c4b89e; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .actions { display: flex; gap: 6px; }
    .actions button { padding: 6px 14px; border: none; border-radius: 50px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .actions .edit, .edit { background: #79ade9; color: #fff; box-shadow: 0 3px 0 0 #6299d4; }
    .actions .edit:hover, .edit:hover { transform: translateY(-1px); box-shadow: 0 4px 0 0 #6299d4; }
    .actions .delete, .delete { background: #fc736d; color: #fff; box-shadow: 0 3px 0 0 #e05a54; }
    .actions .delete:hover, .delete:hover { transform: translateY(-1px); box-shadow: 0 4px 0 0 #e05a54; }
    .editor-layout { display: flex; gap: 20px; align-items: stretch; }
    .editor-main { flex: 3; }
    .editor-side { flex: 1; }
    .modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(107,92,67,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-box { background: #f7f3df; border-radius: 20px; padding: 32px; max-width: 400px; width: 90%; border: 2px solid #e8e0cc; }
    .toast { position: fixed; bottom: 20px; right: 20px; padding: 16px 24px; background: #6fba2c; color: #fff; border-radius: 50px; font-weight: 600; }
    .w-33 { width: 640px; }
    .w-50 { width: 740px; }
    .w-60 { width: 100%; }
    .main-content { min-width: 0; max-width: 100%; overflow-x: auto; }
    /* ========== 平板端 (768px - 1024px) ========== */
    @media (min-width: 769px) and (max-width: 1024px) {
      .admin-layout { flex-direction: column; }
      .sidebar {
        width: 100%;
        flex-direction: row;
        overflow-x: auto;
        padding: 0;
        flex-shrink: 0;
      }
      .sidebar-header {
        padding: 12px 16px;
        white-space: nowrap;
        display: flex;
        align-items: center;
      }
      .sidebar-header h1 { font-size: 16px; }
      .sidebar-menu {
        display: flex;
        padding: 8px 12px;
        gap: 6px;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        flex: 1;
      }
      .sidebar-menu a {
        white-space: nowrap;
        padding: 10px 16px;
        margin: 0;
        font-size: 14px;
        border-radius: 10px;
      }
      .sidebar-footer {
        padding: 8px 16px;
        white-space: nowrap;
        display: flex;
        align-items: center;
      }
      .sidebar-footer button {
        padding: 8px 18px;
        font-size: 14px;
      }
      .main-content { padding: 20px; }
      .page-header h2 { font-size: 1.4em; }
      .card { padding: 20px; border-radius: 18px; }
      .editor-layout { flex-direction: column; }
      .editor-main, .editor-side { width: 100%; }
      .form-row { grid-template-columns: 1fr 1fr; }
      table { font-size: 14px; }
      th, td { padding: 12px 14px !important; }
      .w-33 { width: 50% !important; }
      .w-50 { width: 50% !important; }
      .w-66 { width: 100% !important; }
    }

    /* ========== 手机端 (≤768px) ========== */
    @media (max-width: 768px) {
      .admin-layout { flex-direction: column; }
      .sidebar {
        width: 100%;
        flex-direction: row;
        overflow-x: auto;
        padding: 0;
        flex-shrink: 0;
        position: sticky;
        top: 0;
        z-index: 100;
      }
      .sidebar-header {
        padding: 10px 12px;
        white-space: nowrap;
        display: flex;
        align-items: center;
      }
      .sidebar-header h1 { font-size: 15px; }
      .sidebar-menu {
        display: flex;
        padding: 6px 8px;
        gap: 4px;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        flex: 1;
      }
      .sidebar-menu a {
        white-space: nowrap;
        padding: 8px 12px;
        margin: 0;
        font-size: 12px;
        border-radius: 8px;
      }
      .sidebar-footer {
        padding: 6px 10px;
        white-space: nowrap;
        display: flex;
        align-items: center;
      }
      .sidebar-footer button {
        padding: 6px 14px;
        font-size: 12px;
      }
      .main-content { padding: 12px; }
      .page-header { margin-bottom: 12px; }
      .page-header h2 { font-size: 1.2em; }
      .card { padding: 14px; border-radius: 14px; margin-bottom: 12px; }
      .btn { padding: 10px 20px; font-size: 14px; }
      .btn-cancel { padding: 10px 20px; font-size: 14px; }
      .editor-layout { flex-direction: column; }
      .editor-main, .editor-side { width: 100%; }
      .form-row { grid-template-columns: 1fr; }
      .form-group { margin-bottom: 14px; }
      .form-group label { font-size: 14px; margin-bottom: 6px; }
      .form-group input, .form-group textarea, .form-group select { font-size: 15px; padding: 12px 16px; }
      .custom-select-trigger { font-size: 14px; padding: 12px 16px; min-height: 44px; }
      .custom-select-option { padding: 12px 16px; font-size: 14px; }
      /* 表格横向滚动 */
      .card[style*="padding:0"] { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      table { min-width: 600px; font-size: 13px; }
      th { font-size: 13px !important; padding: 10px 12px !important; }
      td { font-size: 13px !important; padding: 10px 12px !important; }
      /* 自定义下拉 */
      .custom-select-dropdown { max-height: 200px; }
      .w-33, .w-50, .w-60 { width: 100% !important; }
    }

</style>
</head>
<body>
  <div id="app">
    <div v-if="!logged" class="login" role="main" aria-label="登录">
      <div class="login-box">
        <h1>博客管理后台</h1>
        <input v-model="username" type="text" placeholder="请输入账号" aria-label="管理员账号">
        <input v-model="password" type="password" placeholder="请输入密码" @keyup.enter="login" aria-label="管理员密码">
        <button @click="login" aria-label="登录">登录</button>
      </div>
    </div>
    <div v-else class="admin-layout">
      <nav class="sidebar" role="navigation" aria-label="主导航">
        <div class="sidebar-header"><h1><img src="/icon/dashboard.png" alt="" class="sidebar-header-icon">管理后台</h1></div>
        <div class="sidebar-menu" role="menubar">
          <a href="#" role="menuitem" :class="{active:currentPage==='posts'}" @click.prevent="currentPage='posts'" aria-label="文章管理"><span v-if="currentPage==='posts'" class="nav-icon"><img src="/icon/navigate.png" alt=""></span>文章管理</a>
          <a href="#" role="menuitem" :class="{active:currentPage==='category'}" @click.prevent="currentPage='category'" aria-label="分类管理"><span v-if="currentPage==='category'" class="nav-icon"><img src="/icon/navigate.png" alt=""></span>分类管理</a>
          <a href="#" role="menuitem" :class="{active:currentPage==='profile'}" @click.prevent="currentPage='profile'" aria-label="个人设置"><span v-if="currentPage==='profile'" class="nav-icon"><img src="/icon/navigate.png" alt=""></span>个人设置</a>
          <a href="#" role="menuitem" :class="{active:currentPage==='settings'}" @click.prevent="currentPage='settings'" aria-label="网站设置"><span v-if="currentPage==='settings'" class="nav-icon"><img src="/icon/navigate.png" alt=""></span>网站设置</a>
          <a href="#" role="menuitem" :class="{active:currentPage==='trash'}" @click.prevent="currentPage='trash'" aria-label="回收站"><span v-if="currentPage==='trash'" class="nav-icon"><img src="/icon/navigate.png" alt=""></span>回收站</a>
        </div>
        <div class="sidebar-footer">
          <button @click="logout"><img src="/icon/logout.png" alt="" class="sidebar-footer-icon">退出登录</button>
          <a href="/" class="nav-home" aria-label="返回主页"><span class="nav-home-icon">🏠</span>返回主页</a>
        </div>
      </nav>
      <div class="main-content" role="main" aria-label="主要内容">
        <div v-if="currentPage==='posts'">
          <!-- 文章列表 -->
          <div v-if="!editingId">
          <div class="page-header"><h2>文章管理</h2></div>
          <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
            <button class="btn" @click="openAdd()">新建文章</button>
            <button class="btn btn-import" @click="showImportModal=true">导入文章</button>
          </div>
          <div class="w-60"><div class="card" style="padding:0;overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#f0e8d8">
                  <th style="padding:16px 16px;text-align:center;color:#794f27;font-weight:700;font-size:15px;width:70px;white-space:nowrap">删除</th>
                  <th style="padding:16px 16px;text-align:center;color:#794f27;font-weight:700;font-size:15px;width:70px;white-space:nowrap">编辑</th>
                  <th style="padding:16px 16px;text-align:center;color:#794f27;font-weight:700;font-size:15px;width:60px">ID</th>
                  <th style="padding:16px 16px;text-align:left;color:#794f27;font-weight:700;font-size:15px">文章标题</th>
                  <th style="padding:16px 16px;text-align:left;color:#794f27;font-weight:700;font-size:15px;width:120px;white-space:nowrap">分类</th>
                  <th style="padding:16px 16px;text-align:left;color:#794f27;font-weight:700;font-size:15px;width:200px">标签</th>
                  <th style="padding:16px 16px;text-align:center;color:#794f27;font-weight:700;font-size:15px;width:100px">状态</th>
                  <th style="padding:16px 16px;text-align:right;color:#794f27;font-weight:700;font-size:15px;width:120px">发布日期</th>
                  <th style="padding:16px 16px;text-align:right;color:#794f27;font-weight:700;font-size:15px;width:120px">最后更新</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(post, idx) in posts.slice((postPage-1)*postPageSize, postPage*postPageSize)" :key="post.id">
                  <tr style="border-top:1px solid #e8e0cc">
                    <td style="padding:14px 16px;text-align:center;white-space:nowrap"><button class="delete" @click="deletePost(post.id)" style="padding:5px 14px;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;white-space:nowrap">删除</button></td>
                    <td style="padding:14px 16px;text-align:center;white-space:nowrap"><button class="edit" @click="toggleEdit(post)" style="padding:5px 14px;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;white-space:nowrap">编辑</button></td>
                    <td style="padding:14px 16px;text-align:center;color:#9f927d;font-size:14px">#{{post.id}}</td>
                    <td style="padding:14px 16px;color:#794f27;font-weight:600;font-size:16px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                      <span v-if="currentPinnedId == post.id" style="color:#ff6b00;margin-right:4px" title="已置顶">📌</span>{{post.title}}
                    </td>
                    <td style="padding:14px 16px;color:#9f927d;font-size:15px;white-space:nowrap">{{post.category}}</td>
                    <td style="padding:14px 16px">
                      <div style="display:flex;flex-wrap:wrap;gap:4px">
                        <template v-for="(tag, i) in (post.tags || '').split(',').filter(t => t.trim())" :key="i">
                          <span style="display:inline-block;padding:2px 8px;background:#e6f9f6;color:#11a89b;font-size:12px;font-weight:600;border-radius:12px;border:1px solid #19c8b9">{{tag.trim()}}</span>
                        </template>
                      </div>
                    </td>
                    <td style="padding:14px 16px;text-align:center;white-space:nowrap"><span :style="{display:'inline-block',width:'8px',height:'8px',borderRadius:'50%',background:post.status==='published'?'#22c55e':'#9f927d',marginRight:'6px',verticalAlign:'middle'}"></span><span style="font-size:15px;color:#725d42;vertical-align:middle">{{post.status==='published'?'已发布':'草稿'}}</span></td>
                    <td style="padding:14px 16px;text-align:right;color:#9f927d;font-size:15px">{{new Date(post.published_at || post.created_at).toLocaleDateString('zh-CN')}}</td>
                    <td style="padding:14px 16px;text-align:right;color:#9f927d;font-size:15px">{{post.updated_at ? new Date(post.updated_at).toLocaleDateString('zh-CN') : '-'}}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div v-if="Math.ceil(posts.length / postPageSize) > 1" style="display:flex;justify-content:center;gap:8px;margin-top:16px">
            <button class="btn btn-cancel" @click="postPage=Math.max(1,postPage-1)" :style="{opacity:postPage<=1?0.4:1}" :disabled="postPage<=1" style="padding:8px 16px;font-size:14px">上一页</button>
            <span style="display:flex;align-items:center;color:#725d42;font-weight:600;font-size:14px">{{postPage}} / {{Math.ceil(posts.length / postPageSize)}}</span>
            <button class="btn btn-cancel" @click="postPage=Math.min(Math.ceil(posts.length/postPageSize),postPage+1)" :style="{opacity:postPage>=Math.ceil(posts.length/postPageSize)?0.4:1}" :disabled="postPage>=Math.ceil(posts.length/postPageSize)" style="padding:8px 16px;font-size:14px">下一页</button>
          </div>
          </div>
          </div>

          <!-- 编辑/新建文章 -->
          <div v-if="editingId" class="card" style="margin-top:20px">
            <div class="page-header" style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
              <button class="btn-back" @click="cancelNewPost">返回</button>
              <h2>{{editingId === 'new' ? '新建文章' : '编辑文章'}}</h2>
            </div>
            <div class="editor-layout">
              <div class="editor-main" style="display:flex;flex-direction:column">
                <div class="form-group"><label>文章标题</label><input v-model="form.title"></div>
                <div class="form-group" style="flex:1;display:flex;flex-direction:column">
                  <label>文章内容</label>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
                    <button type="button" @click="insertMd('heading')" style="padding:4px 10px;background:#f0e8d8;border:2px solid #c4b89e;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:#725d42">标题</button>
                    <button type="button" @click="insertMd('bold')" style="padding:4px 10px;background:#f0e8d8;border:2px solid #c4b89e;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;color:#725d42">B</button>
                    <button type="button" @click="insertMd('italic')" style="padding:4px 10px;background:#f0e8d8;border:2px solid #c4b89e;border-radius:6px;cursor:pointer;font-size:12px;font-style:italic;color:#725d42">I</button>
                    <button type="button" @click="insertMd('link')" style="padding:4px 10px;background:#f0e8d8;border:2px solid #c4b89e;border-radius:6px;cursor:pointer;font-size:12px;color:#725d42">🔗</button>
                    <button type="button" @click="insertMd('image')" style="padding:4px 10px;background:#f0e8d8;border:2px solid #c4b89e;border-radius:6px;cursor:pointer;font-size:12px;color:#725d42">🖼</button>
                    <button type="button" @click="insertMd('code')" style="padding:4px 10px;background:#f0e8d8;border:2px solid #c4b89e;border-radius:6px;cursor:pointer;font-size:12px;color:#725d42">代码</button>
                    <button type="button" @click="insertMd('ul')" style="padding:4px 10px;background:#f0e8d8;border:2px solid #c4b89e;border-radius:6px;cursor:pointer;font-size:12px;color:#725d42">•列表</button>
                    <button type="button" @click="insertMd('ol')" style="padding:4px 10px;background:#f0e8d8;border:2px solid #c4b89e;border-radius:6px;cursor:pointer;font-size:12px;color:#725d42">1.序号</button>
                    <button type="button" @click="insertMd('quote')" style="padding:4px 10px;background:#f0e8d8;border:2px solid #c4b89e;border-radius:6px;cursor:pointer;font-size:12px;color:#725d42">❝引用</button>
                    <button type="button" @click="insertMd('hr')" style="padding:4px 10px;background:#f0e8d8;border:2px solid #c4b89e;border-radius:6px;cursor:pointer;font-size:12px;color:#725d42">—分割线</button>
                    <button type="button" @click="insertMd('details')" style="padding:4px 10px;background:#f0e8d8;border:2px solid #c4b89e;border-radius:6px;cursor:pointer;font-size:12px;color:#725d42">▼折叠</button>
                  </div>
                  <textarea v-model="form.content" style="flex:1;min-height:400px"></textarea>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:auto;padding-top:12px"><button class="btn" @click="savePost">保存</button><button class="btn btn-cancel" @click="cancelNewPost">取消</button></div>
              </div>
              <div class="editor-side">
                <div class="form-group"><label>发布状态</label>
                  <div class="custom-select" @click.stop>
                    <div class="custom-select-trigger" :class="{active: customSelects['status']}" @click="toggleSelect('status')">{{ form.status === 'draft' ? '草稿' : '已发布' }}</div>
                    <div class="custom-select-dropdown" :class="{show: customSelects['status']}">
                      <div class="custom-select-option" :class="{selected: form.status==='draft'}" @click="selectOption('status', 'draft', 'status')">草稿</div>
                      <div class="custom-select-option" :class="{selected: form.status==='published'}" @click="selectOption('status', 'published', 'status')">已发布</div>
                    </div>
                  </div>
                </div>
                <div class="form-group"><label>发布日期</label><input type="date" v-model="form.published_at"></div>
                <div class="form-group"><label>文章分类</label>
                  <div class="custom-select" @click.stop>
                    <div class="custom-select-trigger" :class="{active: customSelects['category']}" @click="toggleSelect('category')">{{ form.category || '请选择' }}</div>
                    <div class="custom-select-dropdown" :class="{show: customSelects['category']}">
                      <div class="custom-select-option" @click="selectOption('category', '', 'category')">请选择</div>
                      <div v-for="cat in categories" :key="cat.id" class="custom-select-option" :class="{selected: form.category===cat.name}" @click="selectOption('category', cat.name, 'category')">{{ cat.name }}</div>
                    </div>
                  </div>
                </div>
                <div class="form-group"><label>文章标签</label><input v-model="form.tags" placeholder="多个标签用英文逗号隔开，如：JavaScript,Vue,React"></div>
                <div class="form-group">
                  <label>文章密码</label>
                  <div style="display:flex;align-items:center;gap:12px">
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="" v-model="form.passwordType">
                      <span class="radio-custom"></span>
                      <span class="radio-label">无</span>
                    </label>
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="has" v-model="form.passwordType">
                      <span class="radio-custom"></span>
                      <span class="radio-label">有</span>
                    </label>
                    <input v-if="form.passwordType === 'has'" v-model="form.password" type="password" placeholder="请输入密码" style="flex:1">
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="currentPage==='category'">
          <div class="page-header"><h2>分类管理</h2></div>
          <button class="btn" @click="editingCategory='new';categoryForm={name:'',slug:'',description:''}" style="margin-bottom:16px">添加分类</button>
          <div v-if="editingCategory==='new'" class="card w-33">
            <div class="form-row">
              <div class="form-group"><label>英文ID</label><input v-model="categoryForm.slug"></div>
              <div class="form-group"><label>中文名称</label><input v-model="categoryForm.name"></div>
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn" @click="saveCategory">保存</button><button class="btn btn-cancel" @click="editingCategory=null">取消</button></div>
          </div>
          <div class="w-33">
            <div class="card" style="padding:0;overflow:hidden">
              <table style="width:100%;border-collapse:collapse">
                <thead>
                  <tr style="background:#f0e8d8">
                    <th style="padding:14px 16px;text-align:center;color:#794f27;font-weight:700;font-size:15px;width:70px;white-space:nowrap">删除</th>
                    <th style="padding:14px 16px;text-align:center;color:#794f27;font-weight:700;font-size:15px;width:70px;white-space:nowrap">编辑</th>
                    <th style="padding:14px 16px;text-align:left;color:#794f27;font-weight:700;font-size:15px">英文ID</th>
                    <th style="padding:14px 16px;text-align:left;color:#794f27;font-weight:700;font-size:15px">中文名称</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="cat in categories" :key="cat.id">
                    <tr style="border-top:1px solid #e8e0cc">
                      <td style="padding:14px 16px;text-align:center;white-space:nowrap"><button class="delete" @click="deleteCategory(cat.id)" style="padding:5px 14px;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;white-space:nowrap">删除</button></td>
                      <td style="padding:14px 16px;text-align:center;white-space:nowrap"><button class="edit" @click="editingCategory===cat.id?editingCategory=null:editCategory(cat)" style="padding:5px 14px;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;white-space:nowrap">{{editingCategory===cat.id?'收起':'编辑'}}</button></td>
                      <td style="padding:14px 16px;color:#9f927d;font-size:15px">/{{cat.slug}}</td>
                      <td style="padding:14px 16px;color:#794f27;font-weight:600;font-size:16px">{{cat.name}}</td>
                    </tr>
                    <tr v-if="editingCategory===cat.id">
                      <td colspan="4" style="padding:16px;background:#faf8f2;border-top:2px solid #e8e0cc">
                        <div class="form-row">
                          <div class="form-group"><label>英文ID</label><input v-model="categoryForm.slug"></div>
                          <div class="form-group"><label>中文名称</label><input v-model="categoryForm.name"></div>
                        </div>
                        <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn" @click="saveCategory">保存</button><button class="btn btn-cancel" @click="editingCategory=null">取消</button></div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div v-if="currentPage==='trash'">
          <div class="page-header"><h2>回收站</h2></div>
          <div v-if="trashPosts.length===0" class="card" style="text-align:center;color:#9f927d">回收站是空的</div>
          <div class="w-33"><div v-if="trashPosts.length > 0" class="card" style="padding:0;overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:#f0e8d8">
                  <th style="padding:16px 16px;text-align:center;color:#794f27;font-weight:700;font-size:15px;width:80px;white-space:nowrap">删除</th>
                  <th style="padding:16px 16px;text-align:center;color:#794f27;font-weight:700;font-size:15px;width:80px;white-space:nowrap">恢复</th>
                  <th style="padding:16px 16px;text-align:center;color:#794f27;font-weight:700;font-size:15px;width:60px">ID</th>
                  <th style="padding:16px 16px;text-align:left;color:#794f27;font-weight:700;font-size:15px">文章标题</th>
                  <th style="padding:16px 16px;text-align:left;color:#794f27;font-weight:700;font-size:15px;width:150px;white-space:nowrap">分类</th>
                  <th style="padding:16px 16px;text-align:right;color:#794f27;font-weight:700;font-size:15px;width:120px">发布日期</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="post in trashPosts" :key="post.id" style="border-top:1px solid #e8e0cc">
                  <td style="padding:14px 16px;text-align:center;white-space:nowrap"><button class="delete" @click="permanentDelete(post.id)" style="padding:5px 14px;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;white-space:nowrap">删除</button></td>
                  <td style="padding:14px 16px;text-align:center;white-space:nowrap"><button class="edit" @click="restorePost(post.id)" style="padding:5px 14px;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;white-space:nowrap">恢复</button></td>
                  <td style="padding:14px 16px;text-align:center;color:#9f927d;font-size:14px">#{{post.id}}</td>
                  <td style="padding:14px 16px;color:#794f27;font-weight:600;font-size:16px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{post.title}}</td>
                  <td style="padding:14px 16px;color:#9f927d;font-size:15px;white-space:nowrap">{{post.category}}</td>
                  
                  <td style="padding:14px 16px;text-align:right;color:#9f927d;font-size:15px">{{new Date(post.published_at || post.created_at).toLocaleDateString('zh-CN')}}</td>
                </tr>
              </tbody>
            </table>
          </div></div>
        </div>
        <div v-if="currentPage==='settings'">
          <div class="page-header"><h2>网站设置</h2></div>
          <button class="btn" @click="saveSettings" style="margin-bottom:16px">保存设置</button>
          <div style="display:flex;gap:20px;flex-wrap:wrap">
            <!-- 第一栏：网站设置 -->
            <div style="flex:0 0 33.33%;max-width:33.33%;min-width:300px">
              <div class="card">
                <h3 style="color:#794f27;font-size:18px;font-weight:700;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e8e0cc">基本设置</h3>
                <div class="form-group"><label>网站标题</label><input v-model="settingsForm.site_name"></div>
                <div class="form-group"><label>网站副标题</label><input v-model="settingsForm.site_description"></div>
                <div class="form-group">
                  <label>网站图标</label>
                  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                    <div style="width:36px;height:36px;border:2px solid #e8e0cc;border-radius:8px;background:#f0e8d8;display:flex;align-items:center;justify-content:center;overflow:hidden">
                      <img src="/icon/favicon.ico" style="width:32px;height:32px;object-fit:cover">
                    </div>
                    <span style="color:#9f927d;font-size:13px">替换 <code style="background:#f0e8d8;padding:2px 6px;border-radius:4px;font-size:12px">public/icon/favicon.ico</code> 文件即可更换</span>
                  </div>
                </div>
                <div class="form-group">
                  <label>置顶文章（输入编号）</label>
                  <div style="display:flex;align-items:center;gap:12px">
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="" v-model="settingsForm.pinnedType">
                      <span class="radio-custom"></span>
                      <span class="radio-label">无</span>
                    </label>
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="has" v-model="settingsForm.pinnedType">
                      <span class="radio-custom"></span>
                      <span class="radio-label">有</span>
                    </label>
                    <input v-if="settingsForm.pinnedType === 'has'" v-model="settingsForm.pinned_post_id" type="number" min="0" step="1" placeholder="输入文章编号" style="flex:1" @input="settingsForm.pinned_post_id = settingsForm.pinned_post_id.replace(/[^0-9]/g, '')">
                  </div>
                </div>
                <div class="form-group">
                  <label>主题风格</label>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="animal-forest" v-model="settingsForm.site_theme" @change="applyTheme()">
                      <span class="radio-custom"></span>
                      <span class="radio-label">🌲 动物森林</span>
                    </label>
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="ocean-breeze" v-model="settingsForm.site_theme" @change="applyTheme()">
                      <span class="radio-custom"></span>
                      <span class="radio-label">🌊 海洋微风</span>
                    </label>
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="purple-dawn" v-model="settingsForm.site_theme" @change="applyTheme()">
                      <span class="radio-custom"></span>
                      <span class="radio-label">💜 紫气东来</span>
                    </label>
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="golden-light" v-model="settingsForm.site_theme" @change="applyTheme()">
                      <span class="radio-custom"></span>
                      <span class="radio-label">🌟 金光初现</span>
                    </label>
                  </div>
                </div>
                <div class="form-group"><label>网站页脚（HTML）</label><textarea v-model="settingsForm.site_footer" rows="3"></textarea></div>
                <div class="form-group"><label>自定义JS</label><textarea v-model="settingsForm.custom_js" rows="4" placeholder="请输入完整的 <script>...</script> 标签，例如：&#10;<script src=&quot;https://cdn.jsdelivr.net/npm/xxx.js&quot;></script>"></textarea></div>
              </div>
            </div>
            <!-- 第二栏：安全与优化 -->
            <div style="flex:0 0 33.33%;max-width:33.33%;min-width:300px">
              <div class="card">
                <h3 style="color:#794f27;font-size:18px;font-weight:700;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e8e0cc">安全与优化</h3>
                <div class="form-group"><label>全站密码（留空则不启用）</label><input v-model="settingsForm.site_password" type="password" placeholder="留空则公开访问"></div>
                <div class="form-group"><label>CORS 允许来源（多域名用逗号分隔，* 表示全部）</label><input v-model="settingsForm.allowed_origins" placeholder="*"></div>
                <div class="form-group">
                  <label>是否允许搜索引擎爬取</label>
                  <div style="display:flex;align-items:center;gap:12px">
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="1" v-model="settingsForm.allow_robots">
                      <span class="radio-custom"></span>
                      <span class="radio-label">是</span>
                    </label>
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="0" v-model="settingsForm.allow_robots">
                      <span class="radio-custom"></span>
                      <span class="radio-label">否</span>
                    </label>
                  </div>
                </div>
                <div class="form-group">
                  <label>是否启用压缩</label>
                  <div style="display:flex;align-items:center;gap:12px">
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="1" v-model="settingsForm.enable_compression">
                      <span class="radio-custom"></span>
                      <span class="radio-label">是</span>
                    </label>
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="0" v-model="settingsForm.enable_compression">
                      <span class="radio-custom"></span>
                      <span class="radio-label">否</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="currentPage==='profile'">
          <div class="page-header"><h2>个人设置</h2></div>
          <button class="btn" @click="saveSettings" style="margin-bottom:16px">保存设置</button>
          <div style="display:flex;gap:20px;flex-wrap:wrap">
            <!-- 第一栏：个人设置 -->
            <div style="flex:0 0 33.33%;max-width:33.33%;min-width:300px">
              <div class="card">
                <h3 style="color:#794f27;font-size:18px;font-weight:700;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e8e0cc">个人信息</h3>
                <div class="form-group"><label>个人名称</label><input v-model="settingsForm.site_author"></div>
                <div class="form-group">
                  <label>个人头像</label>
                  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                    <div style="width:36px;height:36px;border:2px solid #e8e0cc;border-radius:8px;background:#f0e8d8;display:flex;align-items:center;justify-content:center;overflow:hidden">
                      <img src="/icon/profile.png" style="width:32px;height:32px;object-fit:cover">
                    </div>
                    <span style="color:#9f927d;font-size:13px">替换 <code style="background:#f0e8d8;padding:2px 6px;border-radius:4px;font-size:12px">public/icon/profile.png</code> 文件即可更换</span>
                  </div>
                </div>
                <div class="form-group"><label>个人简介</label><textarea v-model="settingsForm.site_bio" rows="3"></textarea></div>
                <div class="form-group"><label>建站时间</label><input type="date" v-model="settingsForm.site_created_at"></div>
                <div class="form-group"><label>友链标题</label><input v-model="settingsForm.links_title" placeholder="友链"></div>
                <div class="form-group"><label>友链内容（名称,地址 每行一个）</label><textarea v-model="settingsForm.site_links" rows="4"></textarea></div>
              </div>
            </div>
            <!-- 第二栏：其他设置 -->
            <div style="flex:0 0 33.33%;max-width:33.33%;min-width:300px">
              <div class="card">
                <h3 style="color:#794f27;font-size:18px;font-weight:700;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #e8e0cc">模块与图标</h3>
                <div class="form-group">
                  <label>分类标题图标</label>
                  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                    <div style="width:36px;height:36px;border:2px solid #e8e0cc;border-radius:8px;background:#f0e8d8;display:flex;align-items:center;justify-content:center;overflow:hidden">
                      <img src="/icon/category.png" style="width:32px;height:32px;object-fit:cover">
                    </div>
                    <span style="color:#9f927d;font-size:13px">替换 <code style="background:#f0e8d8;padding:2px 6px;border-radius:4px;font-size:12px">public/icon/category.png</code> 文件即可更换</span>
                  </div>
                </div>
                <div class="form-group">
                  <label>友链标题图标</label>
                  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                    <div style="width:36px;height:36px;border:2px solid #e8e0cc;border-radius:8px;background:#f0e8d8;display:flex;align-items:center;justify-content:center;overflow:hidden">
                      <img src="/icon/friend-links.png" style="width:32px;height:32px;object-fit:cover">
                    </div>
                    <span style="color:#9f927d;font-size:13px">替换 <code style="background:#f0e8d8;padding:2px 6px;border-radius:4px;font-size:12px">public/icon/friend-links.png</code> 文件即可更换</span>
                  </div>
                </div>
                <div class="form-group">
                  <label>置顶文章图标</label>
                  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                    <div style="width:36px;height:36px;border:2px solid #e8e0cc;border-radius:8px;background:#f0e8d8;display:flex;align-items:center;justify-content:center;overflow:hidden">
                      <img src="/icon/pin-post.png" style="width:32px;height:32px;object-fit:cover">
                    </div>
                    <span style="color:#9f927d;font-size:13px">替换 <code style="background:#f0e8d8;padding:2px 6px;border-radius:4px;font-size:12px">public/icon/pin-post.png</code> 文件即可更换</span>
                  </div>
                </div>
                <div class="form-group">
                  <label>标签云开关</label>
                  <div style="display:flex;align-items:center;gap:12px">
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="1" v-model="settingsForm.enable_tag_cloud">
                      <span class="radio-custom"></span>
                      <span class="radio-label">显示</span>
                    </label>
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="0" v-model="settingsForm.enable_tag_cloud">
                      <span class="radio-custom"></span>
                      <span class="radio-label">不显示</span>
                    </label>
                  </div>
                </div>
                <div class="form-group">
                  <label>标签云位置</label>
                  <div style="display:flex;align-items:center;gap:12px">
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="left" v-model="settingsForm.tag_cloud_position">
                      <span class="radio-custom"></span>
                      <span class="radio-label">居左</span>
                    </label>
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="right" v-model="settingsForm.tag_cloud_position">
                      <span class="radio-custom"></span>
                      <span class="radio-label">居右</span>
                    </label>
                  </div>
                </div>
                <div class="form-group">
                  <label>个人简介位置</label>
                  <div style="display:flex;align-items:center;gap:12px">
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="left" v-model="settingsForm.profile_position">
                      <span class="radio-custom"></span>
                      <span class="radio-label">居左</span>
                    </label>
                    <label class="radio-item" style="margin:0">
                      <input type="radio" value="right" v-model="settingsForm.profile_position">
                      <span class="radio-custom"></span>
                      <span class="radio-label">居右</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- 导入弹窗 -->
      <div v-if="showImportModal" class="modal" @click.self="showImportModal=false">
        <div class="modal-box" style="max-width:500px">
          <h3 style="color:#794f27;margin-bottom:12px">导入文章</h3>
          <p style="margin-bottom:16px;color:#725d42;font-size:14px">支持 WordPress 导出的 XML 文件</p>
          <div style="margin-bottom:16px">
            <input type="file" ref="importFile" accept=".xml" style="display:none" @change="handleImportFile">
            <button class="btn" @click="$refs.importFile.click()" style="width:100%">选择 XML 文件</button>
          </div>
          <div v-if="importFileName" style="margin-bottom:16px;padding:12px;background:#f8f8f0;border-radius:12px;border:2px solid #e8e0cc">
            <p style="color:#725d42;font-size:14px">已选择: {{importFileName}}</p>
          </div>
          <div v-if="importResult" style="margin-bottom:16px;padding:12px;background:#f8f8f0;border-radius:12px;border:2px solid #e8e0cc">
            <p style="color:#725d42;font-size:14px;margin-bottom:8px">导入结果:</p>
            <p style="color:#6fba2c;font-size:14px">成功: {{importResult.success}} 篇</p>
            <p v-if="importResult.failed > 0" style="color:#e05a5a;font-size:14px">失败: {{importResult.failed}} 篇</p>
          </div>
          <div style="display:flex;gap:12px;justify-content:center">
            <button class="btn btn-cancel" @click="showImportModal=false;importFileName='';importResult=null">关闭</button>
            <button class="btn" @click="importPosts" :disabled="!importFileName || importing">
              {{importing ? '导入中...' : '开始导入'}}
            </button>
          </div>
        </div>
      </div>
      <div v-if="confirmModal.show" class="modal" @click.self="confirmModal.show=false">
        <div class="modal-box">
          <h3 style="color:#794f27;margin-bottom:12px">{{confirmModal.title}}</h3>
          <p style="margin-bottom:16px" v-html="confirmModal.message"></p>
          <div v-if="confirmModal.checkbox" style="margin-bottom:20px;display:flex;align-items:center;gap:8px;justify-content:center">
            <input type="checkbox" id="confirmCheckbox" v-model="confirmModal.checkboxValue" style="width:16px;height:16px;cursor:pointer">
            <label for="confirmCheckbox" style="cursor:pointer;color:#725d42;font-size:14px">{{confirmModal.checkboxLabel}}</label>
          </div>
          <div style="display:flex;gap:12px;justify-content:center">
            <button class="btn btn-cancel" @click="confirmModal.onCancel && confirmModal.onCancel()">取消</button>
            <button class="btn" @click="confirmModal.onConfirm && confirmModal.onConfirm(confirmModal.checkboxValue)">确认</button>
          </div>
        </div>
      </div>
      <div v-if="toast" class="toast">{{toast}}</div>
    </div>
  </div>
  </div>
  <script>
    const { createApp, ref, onMounted, watch } = Vue;
    createApp({
      setup() {
        const logged = ref(false);
        const username = ref('');
        const password = ref('');
        const posts = ref([]);
        const editingId = ref(null);
        const form = ref({ title: '', content: '', category: '', tags: '', status: 'draft', password: '', passwordType: '', published_at: new Date().toISOString().split('T')[0] });
        const toast = ref('');
        const categories = ref([]);
        const currentPage = ref('posts');
        const settingsForm = ref({ site_name: '', site_description: '', site_bio: '', site_links: '', site_author: '', site_footer: '', custom_js: '', site_theme: 'animal-forest', enable_tag_cloud: '1', profile_position: 'left', tag_cloud_position: 'left', pinned_post_id: '', pinnedType: '' });
        const categoryForm = ref({ name: '', slug: '', description: '' });
        const editingCategory = ref(null);
        const trashPosts = ref([]);
        const confirmModal = ref({ show: false, title: '', message: '', onConfirm: null });
        // 导入相关状态
        const showImportModal = ref(false);
        const importFileName = ref('');
        const importFileData = ref(null);
        const importing = ref(false);
        const importResult = ref(null);
        // 置顶相关状态
        const currentPinnedId = ref('');
        const check = () => { const t = localStorage.getItem('token'); if (t) { logged.value = true; currentPage.value = localStorage.getItem('adminPage') || 'posts'; loadPosts(); loadCategories(); loadSettings(); loadTrash(); } };
        const api = (url, o = {}) => {
          o.headers = o.headers || {};
          o.headers['Authorization'] = 'Bearer ' + localStorage.getItem('token');
          return axios(url, o).catch(function(e) {
            if (e.response && e.response.status === 401) {
              localStorage.removeItem('token');
              logged.value = false;
            }
            throw e;
          });
        };
        const login = async () => { try { const r = await axios.post('/api/login', { username: username.value, password: password.value }); if (r.data.success) { localStorage.setItem('token', r.data.token); logged.value = true; loadPosts(); loadCategories(); loadSettings(); loadTrash(); } } catch (e) { alert(e.response ? e.response.data.error || '登录失败' : '登录失败'); } };
        const logout = () => { localStorage.removeItem('token'); logged.value = false; };
        const loadPosts = async () => { try { const r = await api('/api/admin/posts'); posts.value = r.data; } catch (e) { showToast('加载文章失败'); } };
        const loadCategories = async () => { try { const r = await api('/api/categories?_=' + Date.now()); categories.value = r.data; } catch (e) { showToast('加载分类失败'); } };
        const loadSettings = async () => { try { const r = await api('/api/settings'); const pinnedId = r.data.pinned_post_id || ''; settingsForm.value = { site_name: r.data.site_name || '', site_description: r.data.site_description || '', site_bio: r.data.site_bio || '', site_links: r.data.site_links || '', site_author: r.data.site_author || '', site_footer: r.data.site_footer || '', custom_js: r.data.custom_js || '', site_theme: r.data.site_theme || 'animal-forest', allow_robots: r.data.allow_robots || '1', enable_compression: r.data.enable_compression || '1', links_title: r.data.links_title || '友链', site_created_at: r.data.site_created_at || '2020-02-02', site_password: r.data.site_password || '', allowed_origins: r.data.allowed_origins || '*', enable_tag_cloud: r.data.enable_tag_cloud || '1', profile_position: r.data.profile_position || 'left', tag_cloud_position: r.data.tag_cloud_position || 'left', pinned_post_id: pinnedId, pinnedType: pinnedId ? 'has' : '' }; currentPinnedId.value = pinnedId; applyTheme(); } catch (e) { showToast('加载设置失败'); } };
        const loadTrash = async () => { try { const r = await api('/api/admin/trash'); trashPosts.value = r.data; } catch (e) { showToast('加载回收站失败'); } };
        const showToast = (m) => { toast.value = m; setTimeout(() => toast.value = '', 2000); };
        const showConfirm = (t, m, options = {}) => new Promise(r => {
          confirmModal.value = {
            show: true,
            title: t,
            message: m,
            checkbox: options.checkbox || false,
            checkboxLabel: options.checkboxLabel || '',
            checkboxValue: options.checkboxDefault !== undefined ? options.checkboxDefault : true,
            onConfirm: (checkboxVal) => { confirmModal.value.show = false; r({ confirmed: true, checkboxValue: checkboxVal }); },
            onCancel: () => { confirmModal.value.show = false; r({ confirmed: false, checkboxValue: false }); }
          };
        });
        const postPage = ref(1);
        const postPageSize = 10;
        const openAdd = () => { editingId.value = 'new'; form.value = { title: '', content: '', category: '', tags: '', status: 'draft', password: '', passwordType: '', published_at: new Date().toISOString().split('T')[0] }; };
        const cancelNewPost = async () => { const { confirmed } = await showConfirm('确认取消', '未保存的内容将丢失'); if (confirmed) { editingId.value = null; } };
        const toggleEdit = (p) => { if (editingId.value === p.id) { editingId.value = null; } else { editingId.value = p.id; form.value = { title: p.title, content: p.content, category: p.category, tags: p.tags, status: p.status, password: p.password || '', passwordType: p.password ? 'has' : '', published_at: p.published_at ? p.published_at.split('T')[0] : new Date().toISOString().split('T')[0] }; } };
        const savePost = async () => { if (form.value.passwordType === 'has' && !form.value.password) { alert('请输入文章密码'); return; } const { confirmed } = await showConfirm('确认保存', '确定保存？'); if (!confirmed) return; try { const postData = { ...form.value }; if (postData.passwordType !== 'has') { postData.password = ''; } delete postData.passwordType; if (editingId.value === 'new') { await api('/api/admin/post', { method: 'POST', data: postData }); } else { await api('/api/admin/post?id=' + editingId.value, { method: 'PUT', data: postData }); } editingId.value = null; loadPosts(); showToast('保存成功'); } catch (e) { alert('保存失败'); } };
        const deletePost = async (id) => { const { confirmed } = await showConfirm('确认删除', '移到回收站？'); if (!confirmed) return; try { await api('/api/admin/post?id=' + id, { method: 'DELETE' }); loadPosts(); loadTrash(); showToast('已移到回收站'); } catch (e) { showToast('删除失败'); } };
        const editCategory = (c) => { editingCategory.value = c.id; categoryForm.value = { name: c.name, slug: c.slug, description: c.description || '' }; };
        const saveCategory = async () => { if (!categoryForm.value.name || !categoryForm.value.slug) { alert('请填写'); return; } const { confirmed } = await showConfirm('确认保存', '确定？'); if (!confirmed) return; try { const d = { ...categoryForm.value }; if (editingCategory.value && editingCategory.value !== 'new') d.id = editingCategory.value; await api('/api/category', { method: 'POST', data: d }); loadCategories(); editingCategory.value = null; categoryForm.value = { name: '', slug: '', description: '' }; showToast('保存成功'); } catch (e) { alert('保存失败'); } };
        const deleteCategory = async (id) => { const { confirmed } = await showConfirm('确认删除', '确定？'); if (!confirmed) return; try { await api('/api/category?id=' + id, { method: 'DELETE' }); loadCategories(); showToast('已删除'); } catch (e) { showToast('删除分类失败'); } };
        const saveSettings = async () => { if (settingsForm.value.pinnedType === 'has' && !settingsForm.value.pinned_post_id) { alert('请输入置顶文章编号'); return; } try { const data = { ...settingsForm.value }; if (data.pinnedType !== 'has') { data.pinned_post_id = ''; } delete data.pinnedType; const r = await api('/api/settings', { method: 'POST', data: data }); if (r.data && r.data.success) { showToast('保存成功'); } else { alert('保存失败: ' + (r.data ? r.data.error : '未知错误')); } } catch (e) { console.error('保存设置错误:', e); alert('保存失败: ' + (e.response ? e.response.data.error || e.response.statusText : e.message)); } };
        const restorePost = async (id) => { const { confirmed } = await showConfirm('确认恢复', '将文章恢复为草稿？'); if (!confirmed) return; try { await api('/api/admin/restore', { method: 'POST', data: { id } }); loadPosts(); loadTrash(); showToast('已恢复'); } catch (e) { showToast('恢复失败'); } };
        const permanentDelete = async (id) => { const { confirmed } = await showConfirm('确认删除', '彻底删除？不可恢复！'); if (!confirmed) return; try { await api('/api/admin/permanent-delete', { method: 'POST', data: { id } }); loadTrash(); showToast('已删除'); } catch (e) { showToast('删除失败'); } };

        
        const insertMd = (type) => {
          const ta = document.querySelector('textarea:focus') || document.querySelector('textarea');
          if (!ta) return;
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const text = form.value.content || '';
          const selected = text.substring(start, end);
          let insert = '';
          switch(type) {
            case 'heading': insert = '## ' + (selected || '标题'); break;
            case 'bold': insert = '**' + (selected || '加粗') + '**'; break;
            case 'italic': insert = '*' + (selected || '斜体') + '*'; break;
            case 'link': insert = '[' + (selected || '链接') + '](https://)'; break;
            case 'image': insert = '![' + (selected || '图片') + '](https://)'; break;
            case 'code': var hasNL = selected.indexOf(String.fromCharCode(10)) >= 0; var cb = String.fromCharCode(96)+String.fromCharCode(96)+String.fromCharCode(96); insert = hasNL ? cb + String.fromCharCode(10) + (selected || '代码') + String.fromCharCode(10) + cb : String.fromCharCode(96) + (selected || '代码') + String.fromCharCode(96); break;
            case 'ul': insert = '- ' + (selected || '列表项'); break;
            case 'ol': insert = '1. ' + (selected || '列表项'); break;
            case 'quote': insert = '> ' + (selected || '引用'); break;
            case 'hr': insert = String.fromCharCode(10) + '---' + String.fromCharCode(10); break;
            case 'details': insert = String.fromCharCode(10) + '<details>' + String.fromCharCode(10) + '<summary>' + (selected || '折叠标题') + '</summary>' + String.fromCharCode(10) + String.fromCharCode(10) + '折叠内容' + String.fromCharCode(10) + String.fromCharCode(10) + '</details>' + String.fromCharCode(10); break;
          }
          form.value.content = text.substring(0, start) + insert + text.substring(end);
          setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + insert.length; }, 0);
        };

        // 置顶文章方法
        const setPinnedPost = async (postId) => {
          console.log('[setPinnedPost] clicked, postId:', postId);
          try {
            // 如果点击的是已置顶的文章，则为取消置顶
            if (currentPinnedId.value == postId) {
              const post = posts.value.find(p => p.id == postId);
              const postTitle = post ? post.title : '未知文章';
              const { confirmed } = await showConfirm('取消置顶', '确定取消置顶文章？<br><br>文章编号：' + postId + '<br>文章标题：' + postTitle);
              if (!confirmed) return;
              await api('/api/settings', { method: 'POST', data: { pinned_post_id: '' } });
              currentPinnedId.value = '';
              showToast('已取消置顶');
              return;
            }
            
            // 置顶文章
            const post = posts.value.find(p => p.id == postId);
            if (!post) {
              showToast('文章不存在');
              return;
            }
            
            const { confirmed } = await showConfirm('置顶文章', '确定置顶文章？<br><br>文章编号：' + postId + '<br>文章标题：' + post.title);
            if (!confirmed) return;
            
            await api('/api/settings', { method: 'POST', data: { pinned_post_id: String(postId) } });
            currentPinnedId.value = String(postId);
            // 将置顶文章移到列表最前面
            const pinnedIndex = posts.value.findIndex(p => p.id == postId);
            if (pinnedIndex > 0) {
              const pinnedPost = posts.value.splice(pinnedIndex, 1)[0];
              posts.value.unshift(pinnedPost);
            }
            showToast('置顶成功');
          } catch (e) {
            console.error('[setPinnedPost] error:', e);
            showToast('操作失败: ' + (e.message || '未知错误'));
          }
        };

        // 主题配置（来源：src/lib/themes.js，前后台共用，避免重复）
        const themes = ${JSON.stringify(themes)};

        const applyTheme = () => {
          const theme = themes[settingsForm.value.site_theme] || themes['animal-forest'];
          const root = document.documentElement;
          root.style.setProperty('--header-bg', theme.headerBg);
          root.style.setProperty('--sidebar-bg', theme.sidebarBg);
          root.style.setProperty('--btn-bg', theme.btnBg);
          root.style.setProperty('--btn-shadow', theme.btnShadow);
          root.style.setProperty('--danger-bg', theme.dangerBg);
          root.style.setProperty('--danger-shadow', theme.dangerShadow);
          root.style.setProperty('--card-bg', theme.cardBg);
          root.style.setProperty('--card-border', theme.cardBorder);
          root.style.setProperty('--body-bg', theme.bodyBg);
          root.style.setProperty('--text-primary', theme.textPrimary);
          root.style.setProperty('--text-body', theme.textBody);
          root.style.setProperty('--text-secondary', theme.textSecondary);
          root.style.setProperty('--input-border', theme.inputBorder);
          root.style.setProperty('--input-shadow', theme.inputShadow);
        };

        // 自定义下拉组件
        const customSelects = ref({});
        
        const toggleSelect = (id) => {
          Object.keys(customSelects.value).forEach(key => {
            if (key !== id) customSelects.value[key] = false;
          });
          customSelects.value[id] = !customSelects.value[id];
        };
        
        const selectOption = (id, value, field) => {
          if (field === 'category') form.value.category = value;
          else if (field === 'status') form.value.status = value;
          else if (field === 'theme') settingsForm.value.site_theme = value;
          customSelects.value[id] = false;
        };
        
        const getSelectLabel = (options, value) => {
          const opt = options.find(o => o.value === value);
          return opt ? opt.label : '请选择';
        };
        
        const closeAllSelects = () => {
          Object.keys(customSelects.value).forEach(key => {
            customSelects.value[key] = false;
          });
        };

        // 导入相关方法
        const handleImportFile = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          if (!file.name.endsWith('.xml')) {
            alert('请选择 XML 文件');
            return;
          }
          importFileName.value = file.name;
          importFileData.value = await file.text();
          importResult.value = null;
        };

        const importPosts = async () => {
          if (!importFileData.value) {
            alert('请先选择文件');
            return;
          }
          importing.value = true;
          try {
            const r = await api('/api/admin/import-wordpress', {
              method: 'POST',
              data: { xml: importFileData.value },
              headers: { 'Content-Type': 'application/json' }
            });
            importResult.value = r.data;
            loadPosts();
            loadCategories();
            if (r.data.failed === 0) {
              showToast('导入完成');
            }
          } catch (e) {
            alert('导入失败: ' + (e.response ? e.response.data.error : e.message));
          } finally {
            importing.value = false;
          }
        };

        watch(currentPage, (v) => { localStorage.setItem('adminPage', v); });
        onMounted(() => { check(); document.addEventListener('click', closeAllSelects); });
        return { logged, username, password, login, logout, posts, editingId, form, toast, openAdd, cancelNewPost, toggleEdit, savePost, deletePost, categories, currentPage, postPage, postPageSize, categoryForm, saveCategory, deleteCategory, editCategory, editingCategory, settingsForm, saveSettings, trashPosts, restorePost, permanentDelete, confirmModal, showConfirm, insertMd, applyTheme, customSelects, toggleSelect, selectOption, getSelectLabel, showImportModal, importFileName, importFileData, importing, importResult, handleImportFile, importPosts, currentPinnedId, setPinnedPost };
      }
    }).mount('#app');
  <\/script>
</body>
</html>`;
}
