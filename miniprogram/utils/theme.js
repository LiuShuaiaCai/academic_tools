// utils/theme.js - 共享主题色系统
// 颜色名 → 色值映射在此定义
// 数据库 tools 集合 color 字段决定使用哪个配色
// 在 DB 改 color 字段即可全局生效

var THEME_PALETTE = {
  blue: {
    primary: '#2563EB',
    primaryDark: '#1D4ED8',
    primaryLight: '#DBEAFE',
    primaryLightText: '#2563EB',
    primaryShadow: 'rgba(37,99,235,0.4)',
    // 渐变 header 背景
    headerBg: 'linear-gradient(135deg, #2563EB, #1D4ED8)'
  },
  red: {
    primary: '#EF4444',
    primaryDark: '#DC2626',
    primaryLight: '#FEE2E2',
    primaryLightText: '#EF4444',
    primaryShadow: 'rgba(239,68,68,0.4)',
    headerBg: 'linear-gradient(135deg, #EF4444, #DC2626)'
  },
  green: {
    primary: '#10B981',
    primaryDark: '#059669',
    primaryLight: '#D1FAE5',
    primaryLightText: '#059669',
    primaryShadow: 'rgba(16,185,129,0.4)',
    headerBg: 'linear-gradient(135deg, #10B981, #059669)'
  },
  orange: {
    primary: '#F59E0B',
    primaryDark: '#D97706',
    primaryLight: '#FEF3C7',
    primaryLightText: '#92400E',
    primaryShadow: 'rgba(245,158,11,0.4)',
    headerBg: 'linear-gradient(135deg, #F59E0B, #D97706)'
  },
  purple: {
    primary: '#7C3AED',
    primaryDark: '#6D28D9',
    primaryLight: '#EDE9FE',
    primaryLightText: '#7C3AED',
    primaryShadow: 'rgba(124,58,237,0.4)',
    headerBg: 'linear-gradient(135deg, #7C3AED, #6D28D9)'
  },
  teal: {
    primary: '#0F766E',
    primaryDark: '#115E59',
    primaryLight: '#CCFBF1',
    primaryLightText: '#0F766E',
    primaryShadow: 'rgba(15,118,110,0.4)',
    headerBg: 'linear-gradient(135deg, #0F766E, #115E59)'
  }
};

// 根据 color 名获取主题色（找不到返回默认 blue）
function getThemeByColor(colorName) {
  return THEME_PALETTE[colorName] || THEME_PALETTE['blue'];
}

var toolCache = require('./toolCache.js');

// 页面调用：根据 toolId 加载主题色（复用工具缓存，避免重复请求）
function loadToolTheme(toolId) {
  // 先用缓存同步取颜色名，同时异步预热缓存
  var colorName = toolCache.getColorByToolId(toolId);
  return toolCache.getAllTools().then(function() {
    // 缓存就绪后二次确认（可能 DB 有更新）
    return getThemeByColor(toolCache.getColorByToolId(toolId));
  }).catch(function() {
    return getThemeByColor(colorName || 'blue');
  });
}

module.exports = {
  PALETTE: THEME_PALETTE,
  getThemeByColor: getThemeByColor,
  loadToolTheme: loadToolTheme
};
