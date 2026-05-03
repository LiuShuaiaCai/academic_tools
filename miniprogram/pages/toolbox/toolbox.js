// pages/toolbox/toolbox.js

// 集合名称映射
var COUNT_MAP = {
  submission: 'submissions',
  review: 'reviews',
  conference: 'conferences',
  archive: 'archives'
};

var MAX_RETRY = 3;

Page({
  data: {
    tools: [],
    enabledCount: 0,
    loading: true
  },

  onLoad: function() {
    this.loadTools(0);
  },

  onShow: function() {
    this.loadTools(0);
  },

  loadTools: function(retryCount) {
    var that = this;
    that.setData({ loading: true });

    // 通过云函数获取所有工具定义（客户端自行过滤未发布的）
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getAllTools' }
    }).then(function(res) {
      var toolDefs = res.result;
      if (!toolDefs || toolDefs.length === 0) {
        if (retryCount < MAX_RETRY) {
          console.log('[toolbox] 工具定义为空，第' + (retryCount + 1) + '次重试...');
          setTimeout(function() { that.loadTools(retryCount + 1); }, 1500);
        } else {
          console.log('[toolbox] 重试次数用尽，无工具数据');
          that.setData({ tools: [], enabledCount: 0, loading: false });
        }
        return;
      }
      that.loadUserTools(toolDefs);
    }).catch(function(e) {
      console.error('[toolbox] 获取工具定义失败:', e);
      that.setData({ tools: [], enabledCount: 0, loading: false });
    });
  },

  loadUserTools: function(toolDefs) {
    var that = this;

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserTools' }
    }).then(function(res) {
      var userTools = res.result || {};
      that.mergeAndRender(toolDefs, userTools);
    }).catch(function(e) {
      console.warn('[toolbox] 获取用户工具配置失败，使用默认配置');
      that.mergeAndRender(toolDefs, {});
    });
  },

  mergeAndRender: function(toolDefs, userTools) {
    var that = this;
    var db = wx.cloud.database();
    var tools = [];
    var i, t, enabled;

    // 只添加用户已开启的工具
    for (i = 0; i < toolDefs.length; i++) {
      t = toolDefs[i];
      enabled = userTools[t.id] === true;
      if (!enabled) continue;

      tools.push({
        id: t.id,
        name: t.name,
        desc: t.desc,
        icon: t.icon,
        iconEmoji: t.iconEmoji || '🔧',
        color: t.color,
        category: t.category,
        order: t.order,
        comingSoon: t.comingSoon,
        pagePath: t.pagePath || '',
        enabled: true,
        count: 0
      });
    }

    if (tools.length === 0) {
      that.setData({ tools: [], enabledCount: 0, loading: false });
      return;
    }

    that.loadToolCounts(db, tools, function(finalTools) {
      var enabledCount = 0;
      for (var j = 0; j < finalTools.length; j++) {
        if (!finalTools[j].comingSoon) enabledCount++;
      }
      that.setData({ tools: finalTools, enabledCount: enabledCount, loading: false });
    });
  },

  loadToolCounts: function(db, tools, callback) {
    var promises = [];
    for (var i = 0; i < tools.length; i++) {
      (function(tool) {
        var colName = COUNT_MAP[tool.id];
        if (colName) {
          promises.push(
            db.collection(colName).where({ deleteTime: null }).count().then(function(res) {
              tool.count = res.total;
            }).catch(function() {})
          );
        }
      })(tools[i]);
    }
    Promise.all(promises).then(function() {
      callback(tools);
    });
  },

  goToTool: function(e) {
    var pagePath = e.currentTarget.dataset.page;
    if (pagePath) {
      wx.navigateTo({ url: pagePath });
    } else {
      wx.showToast({ title: '即将上线，敬请期待', icon: 'none' });
    }
  },

  goToToolManager: function() {
    wx.navigateTo({ url: '/pages/toolManager/toolManager' });
  }
});
