/**
 * i18n 国际化工具
 *
 * 使用方式:
 *   const i18n = require('../../utils/i18n.js');
 *   Page({ onLoad() { i18n.initPage(this); } })
 *   模板中: {{t('common.loading')}} 或 {{locale.common.loading}}
 *
 * 语言切换:
 *   i18n.setLocale('en');  // 全局切换
 *
 * 页面级使用:
 *   const { t } = i18n.createI18n(this);
 */

// 语言包缓存
var localeCache = {};

function loadLocale(lang) {
  if (localeCache[lang]) return localeCache[lang];
  try {
    var locale = require('./locales/' + lang + '.js');
    localeCache[lang] = locale;
    return locale;
  } catch (e) {
    console.error('[i18n] 加载语言包失败:', lang, e);
    // fallback to zh
    if (lang !== 'zh') return loadLocale('zh');
    return {};
  }
}

/**
 * 获取当前语言
 */
function getLocale() {
  try {
    var g = getApp();
    if (g && g.globalData && g.globalData.locale) return g.globalData.locale;
  } catch (e) { /* ignore */ }
  try {
    var stored = wx.getStorageSync('app_locale');
    if (stored) return stored;
  } catch (e) { /* ignore */ }
  return 'zh';
}

/**
 * 设置当前语言
 * @param {string} lang - 'zh' | 'en'
 */
function setLocale(lang) {
  if (lang !== 'zh' && lang !== 'en') lang = 'zh';
  try {
    var g = getApp();
    if (g && g.globalData) g.globalData.locale = lang;
  } catch (e) { /* ignore */ }
  try {
    wx.setStorageSync('app_locale', lang);
  } catch (e) { /* ignore */ }
}

/**
 * 切换语言
 */
function toggleLocale() {
  var current = getLocale();
  var next = current === 'zh' ? 'en' : 'zh';
  setLocale(next);
  return next;
}

/**
 * 获取翻译文本
 * @param {string} path - 用点分隔的路径，如 'specialIssue.title'
 * @param {string} [lang] - 可选指定语言
 */
function translate(path, lang) {
  var l = lang || getLocale();
  var locale = loadLocale(l);
  var keys = path.split('.');
  var result = locale;
  for (var i = 0; i < keys.length; i++) {
    if (result && typeof result === 'object') {
      result = result[keys[i]];
    } else {
      return path; // fallback to key path
    }
  }
  return result !== undefined ? result : path;
}

/**
 * 创建页面级 i18n 上下文
 * 在 Page 的 onLoad 中调用: i18n.createI18n(this)
 * 返回 { t, locale, getLocale, toggleLocale }
 */
function createI18n(page) {
  function refresh() {
    var lang = getLocale();
    var locale = loadLocale(lang);
    page.setData({
      _lang: lang,
      locale: locale,
      t: function(key) { return translate(key, lang); }
    });
  }

  var lang = getLocale();
  var locale = loadLocale(lang);

  // 设置初始数据
  var data = {
    _lang: lang,
    locale: locale,
    t: function(key) { return translate(key, lang); }
  };
  page.setData(data);

  return {
    t: function(key) { return translate(key, getLocale()); },
    locale: locale,
    getLocale: getLocale,
    toggleLocale: function() {
      var newLang = toggleLocale();
      refresh();
      return newLang;
    },
    refresh: refresh
  };
}

/**
 * 简化版：在 Page 中初始化
 * 自动注入 locale 数据到页面
 */
function initPage(page) {
  createI18n(page);
}

module.exports = {
  getLocale: getLocale,
  setLocale: setLocale,
  toggleLocale: toggleLocale,
  t: translate,
  translate: translate,
  createI18n: createI18n,
  initPage: initPage
};
