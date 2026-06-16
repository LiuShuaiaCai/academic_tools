// pages/toolManager/toolManager.js

Page({
  data: { coreTools: [], extTools: [], loading: true },

  // icon 名称到 emoji 的映射
  emojiMap: {
    'paper-plane': '📄',
    'glasses': '👓',
    'calendar-alt': '📅',
    'folder-open': '📁',
    'quote-right': '📚',
    'exclamation-triangle': '⚠️',
    'trophy': '🏆',
    'sticky-note': '📝'
  },

  getEmoji: function(icon) {
    return this.emojiMap[icon] || '🔧';
  },

  onLoad: function() { this.loadTools(); },
  onShow: function() { this.loadTools(); },

  loadTools: function() {
    var that = this;
    that.setData({ loading: true });

    // 通过缓存获取工具定义
    var toolCache = require('../../utils/toolCache.js');
    toolCache.getAllTools().then(function(toolDefs) {
      if (!toolDefs || toolDefs.length === 0) {
        that.setData({ coreTools: [], extTools: [], loading: false });
        return null;
      }
      return toolDefs;
    }).then(function(toolDefs) {
      if (!toolDefs) return;
      // 获取用户工具配置
      return wx.cloud.callFunction({
        name: 'academicAPI',
        data: { action: 'getUserTools' }
      }).then(function(res) {
        return { toolDefs: toolDefs, userTools: res.result || {} };
      }).catch(function() {
        return { toolDefs: toolDefs, userTools: {} };
      });
    }).then(function(result) {
      if (!result) return;

      var toolDefs = result.toolDefs;
      var userTools = result.userTools;
      var coreTools = [];
      var extTools = [];
      var i, t, enabled, item;

      for (i = 0; i < toolDefs.length; i++) {
        t = toolDefs[i];
        enabled = userTools[t.id] === true;
        item = {
          id: t.id,
          name: t.name,
          desc: t.desc,
          icon: t.icon,
          iconEmoji: t.iconEmoji || that.getEmoji(t.icon),
          color: t.color,
          category: t.category,
          order: t.order,
          comingSoon: t.comingSoon,
          enabled: enabled
        };
        if (t.category === 'core') {
          coreTools.push(item);
        } else {
          extTools.push(item);
        }
      }

      that.setData({ coreTools: coreTools, extTools: extTools, loading: false });
    }).catch(function(e) {
      console.error('[toolManager] 加载失败:', e);
      that.setData({ coreTools: [], extTools: [], loading: false });
    });
  },

  toggleTool: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    var newVal = e.detail.value;  // switch 组件的新值直接用 e.detail.value

    wx.showLoading({ title: '保存中...' });

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'toggleUserTool',
        toolId: id,
        enabled: newVal
      }
    }).then(function() {
      wx.hideLoading();
      // 本地更新状态，不刷新页面
      var coreTools = that.data.coreTools.slice();
      var extTools = that.data.extTools.slice();
      var updated = false;
      // 在 coreTools 中查找
      for (var i = 0; i < coreTools.length; i++) {
        if (coreTools[i].id === id) {
          coreTools[i].enabled = newVal;
          updated = true;
          break;
        }
      }
      // 在 extTools 中查找
      if (!updated) {
        for (var j = 0; j < extTools.length; j++) {
          if (extTools[j].id === id) {
            extTools[j].enabled = newVal;
            updated = true;
            break;
          }
        }
      }
      if (updated) {
        that.setData({ coreTools: coreTools, extTools: extTools });
      }
    }).catch(function(e) {
      wx.hideLoading();
      console.error('[toolManager] 切换工具失败:', e);
      // 回退本地状态（云函数失败，switch 可能已视觉切换）
      var coreTools = that.data.coreTools.slice();
      var extTools = that.data.extTools.slice();
      var updated = false;
      for (var i = 0; i < coreTools.length; i++) {
        if (coreTools[i].id === id) {
          coreTools[i].enabled = !newVal;
          updated = true;
          break;
        }
      }
      if (!updated) {
        for (var j = 0; j < extTools.length; j++) {
          if (extTools[j].id === id) {
            extTools[j].enabled = !newVal;
            updated = true;
            break;
          }
        }
      }
      if (updated) {
        that.setData({ coreTools: coreTools, extTools: extTools });
      }
      var errMsg = (e && e.errMsg) || (e && e.message) || '未知错误';
      wx.showToast({ title: '操作失败: ' + errMsg, icon: 'none', duration: 2500 });
    });
  }
});
