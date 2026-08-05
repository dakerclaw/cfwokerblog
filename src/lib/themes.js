// ==================== 主题定义（前后台共用）====================
//
// 每个主题对应一组 CSS 变量值，注入到页面的 :root 后，
// 前台（frontend.js / post.js）与后台（admin.js）即可统一换肤。
//
// 变量说明：
//   --header-bg     头图渐变
//   --sidebar-bg    侧边栏背景
//   --btn-bg        主按钮背景
//   --btn-shadow    主按钮阴影
//   --danger-bg     危险/错误按钮背景
//   --danger-shadow 危险/错误按钮阴影
//   --card-bg       卡片背景
//   --card-border   卡片边框
//   --body-bg       页面背景
//   --text-primary  标题/强调文字
//   --text-body     正文文字
//   --text-secondary 次要文字（meta/标签）
//   --input-border  输入框/头像边框
//   --input-shadow  输入框阴影

export const themes = {
  'animal-forest': {
    name: '动物森林',
    headerBg: 'linear-gradient(180deg, #8ac68a 0%, #6fba2c 100%)',
    sidebarBg: '#8ac68a',
    btnBg: '#19c8b9',
    btnShadow: '#11a89b',
    dangerBg: '#e05a5a',
    dangerShadow: '#c94444',
    cardBg: '#f7f3df',
    cardBorder: '#e8e0cc',
    bodyBg: '#f8f8f0',
    textPrimary: '#794f27',
    textBody: '#725d42',
    textSecondary: '#9f927d',
    inputBorder: '#c4b89e',
    inputShadow: '#d4c9b4'
  },
  'ocean-breeze': {
    name: '海洋微风',
    headerBg: 'linear-gradient(180deg, #4ECDC4 0%, #2C9C93 100%)',
    sidebarBg: '#4ECDC4',
    btnBg: '#4ECDC4',
    btnShadow: '#2C9C93',
    dangerBg: '#E74C3C',
    dangerShadow: '#C0392B',
    cardBg: '#F0F9F8',
    cardBorder: '#B8E6E1',
    bodyBg: '#F5FCFB',
    textPrimary: '#1A535C',
    textBody: '#2C3E50',
    textSecondary: '#7F8C8D',
    inputBorder: '#B8E6E1',
    inputShadow: '#A0D8D2'
  },
  'purple-dawn': {
    name: '紫气东来',
    headerBg: 'linear-gradient(180deg, #A569BD 0%, #76448A 100%)',
    sidebarBg: '#A569BD',
    btnBg: '#9B59B6',
    btnShadow: '#7D3C98',
    dangerBg: '#E74C3C',
    dangerShadow: '#C0392B',
    cardBg: '#F8F4FB',
    cardBorder: '#E2D4F0',
    bodyBg: '#FAF6FE',
    textPrimary: '#5B2C6F',
    textBody: '#4A235A',
    textSecondary: '#A569BD',
    inputBorder: '#D2B4DE',
    inputShadow: '#E8DAF2'
  },
  'golden-light': {
    name: '金光初现',
    headerBg: 'linear-gradient(180deg, #F4D03F 0%, #D4AC0D 100%)',
    sidebarBg: '#F4D03F',
    btnBg: '#D4AC0D',
    btnShadow: '#B7950B',
    dangerBg: '#E74C3C',
    dangerShadow: '#C0392B',
    cardBg: '#FCFAF0',
    cardBorder: '#F0E2B0',
    bodyBg: '#FDFCF5',
    textPrimary: '#7E6B0F',
    textBody: '#6B5B16',
    textSecondary: '#B7950B',
    inputBorder: '#E8D68A',
    inputShadow: '#F5ECC9'
  }
};

/**
 * 根据主题 key 生成可注入 <style> 的 :root 变量块。
 * 未知 key 回退到动物森林。
 * @param {string} themeKey
 * @returns {string}
 */
export function getThemeStyle(themeKey) {
  const t = themes[themeKey] || themes['animal-forest'];
  return `:root{` +
    `--header-bg:${t.headerBg};` +
    `--sidebar-bg:${t.sidebarBg};` +
    `--btn-bg:${t.btnBg};` +
    `--btn-shadow:${t.btnShadow};` +
    `--danger-bg:${t.dangerBg};` +
    `--danger-shadow:${t.dangerShadow};` +
    `--card-bg:${t.cardBg};` +
    `--card-border:${t.cardBorder};` +
    `--body-bg:${t.bodyBg};` +
    `--text-primary:${t.textPrimary};` +
    `--text-body:${t.textBody};` +
    `--text-secondary:${t.textSecondary};` +
    `--input-border:${t.inputBorder};` +
    `--input-shadow:${t.inputShadow};` +
    `}`;
}
