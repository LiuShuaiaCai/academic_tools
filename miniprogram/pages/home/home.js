// pages/home/home.js
var app = getApp();

Page({
  data: {
    enabledTools: [],
    displayTools: [],
    hasMoreTools: false,
    totalCount: 0,
    upcomingItems: [],
    loading: true
  },

  onLoad: function() { this.loadEnabledTools(); },
  onShow: function() { this.loadEnabledTools(); },

  loadEnabledTools: function() {
    var that = this;
    that.setData({ loading: true });

    // 通过云函数获取用户已启用的工具配置
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserTools' }
    }).then(function(res) {
      var userTools = res.result || {};
      // 通过云函数获取所有工具定义（客户端自行过滤未发布的）
      return wx.cloud.callFunction({
        name: 'academicAPI',
        data: { action: 'getAllTools' }
      }).then(function(toolRes) {
        var toolDefs = toolRes.result || [];
        return { userTools: userTools, toolDefs: toolDefs };
      });
    }).then(function(data) {
      var userTools = data.userTools;
      var toolDefs = data.toolDefs;
      var enabledTools = [];

      // 筛选出用户已启用的工具
      for (var i = 0; i < toolDefs.length; i++) {
        var t = toolDefs[i];
        var isEnabled = userTools[t.id] === true;
        if (isEnabled) {
          enabledTools.push({
            id: t.id,
            name: t.name,
            desc: t.desc,
            iconEmoji: t.iconEmoji || '🔧',
            color: t.color || 'blue',
            pagePath: t.pagePath || '',
            count: 0,
            urgent: 0
          });
        }
      }

      that.setData({ enabledTools: enabledTools });
      that.loadHomeData();
    }).catch(function(e) {
      console.error('[home] 获取工具配置失败:', e);
      that.setData({ enabledTools: [], loading: false });
      that.loadUpcomingItems();
    });
  },

  loadHomeData: function() {
    var that = this;
    var enabledTools = that.data.enabledTools;

    if (enabledTools.length === 0) {
      that.setData({ displayTools: [], hasMoreTools: false, totalCount: 0 });
      that.loadUpcomingItems();
      return;
    }

    var db = wx.cloud.database();
    var promises = [];
    var COUNT_MAP = {
      submission: 'submissions',
      review: 'reviews',
      conference: 'conferences',
      archive: 'archives'
    };

    for (var i = 0; i < enabledTools.length; i++) {
      (function(tool) {
        var colName = COUNT_MAP[tool.id];
        if (colName) {
          promises.push(
            db.collection(colName).where({ deleteTime: null }).count().then(function(res) {
              return { id: tool.id, name: tool.name, desc: tool.desc, iconEmoji: tool.iconEmoji || '🔧', color: tool.color, pagePath: tool.pagePath || '', count: res.total, urgent: 0 };
            }).catch(function() {
              return { id: tool.id, name: tool.name, desc: tool.desc, iconEmoji: tool.iconEmoji || '🔧', color: tool.color, pagePath: tool.pagePath || '', count: 0, urgent: 0 };
            })
          );
        } else {
          // 没有对应集合的工具，count 直接给 0
          promises.push(Promise.resolve({
            id: tool.id, name: tool.name, desc: tool.desc, iconEmoji: tool.iconEmoji || '🔧', color: tool.color, pagePath: tool.pagePath || '', count: 0, urgent: 0
          }));
        }
      })(enabledTools[i]);
    }

    Promise.all(promises).then(function(updatedTools) {
      that.setData({ enabledTools: updatedTools });

      // 计算显示的工具列表（最多4个）
      var displayTools = updatedTools.length > 4 ? updatedTools.slice(0, 4) : updatedTools;
      var hasMoreTools = updatedTools.length > 4;

      // 计算任务总数
      var totalCount = 0;
      for (var i = 0; i < updatedTools.length; i++) {
        totalCount += updatedTools[i].count;
      }

      that.setData({ displayTools: displayTools, hasMoreTools: hasMoreTools, totalCount: totalCount });
      that.loadUpcomingItems();
    }).catch(function(e) { console.error('[home] 加载数据失败', e); });
  },

  loadUpcomingItems: function() {
    var that = this;
    var db = wx.cloud.database();
    var _ = db.command;
    var now = new Date();
    var future = new Date();
    future.setDate(future.getDate() + 30);

    Promise.all([
      db.collection('submissions').where({ deleteTime: null, revisionDeadline: _.gte(now).and(_.lte(future)) }).limit(5).orderBy('revisionDeadline', 'asc').get().catch(function() { return { data: [] }; }),
      db.collection('reviews').where({ deleteTime: null, deadline: _.gte(now).and(_.lte(future)) }).limit(5).orderBy('deadline', 'asc').get().catch(function() { return { data: [] }; }),
      db.collection('conferences').where({ deleteTime: null, deadline: _.gte(now).and(_.lte(future)) }).limit(5).orderBy('deadline', 'asc').get().catch(function() { return { data: [] }; })
    ]).then(function(results) {
      var items = [];
      var i;
      for (i = 0; i < results[0].data.length; i++) {
        var s = results[0].data[i];
        items.push({ _id: s._id, title: s.title, type: 'submission', typeLabel: '投稿', icon: '📄', pagePath: '/pages/submissions/submissions', deadline: s.revisionDeadline });
      }
      for (i = 0; i < results[1].data.length; i++) {
        var r = results[1].data[i];
        items.push({ _id: r._id, title: r.paperTitle, type: 'review', typeLabel: '审稿', icon: '📝', pagePath: '/pages/reviews/reviews', deadline: r.deadline });
      }
      for (i = 0; i < results[2].data.length; i++) {
        var c = results[2].data[i];
        items.push({ _id: c._id, title: c.name, type: 'conference', typeLabel: '会议', icon: '🎤', pagePath: '/pages/conferences/conferences', deadline: c.deadline });
      }

      items.sort(function(a, b) { return new Date(a.deadline) - new Date(b.deadline); });
      items = items.slice(0, 5);

      var formattedItems = [];
      for (i = 0; i < items.length; i++) {
        var item = items[i];
        var d = item.deadline;
        var daysLeft = Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24));
        formattedItems.push({
          _id: item._id,
          title: item.title,
          type: item.type,
          typeLabel: item.typeLabel,
          iconEmoji: item.icon,
          pagePath: item.pagePath,
          deadlineLabel: that.formatDate(d),
          countdownLabel: daysLeft <= 0 ? '已超期' : daysLeft + '天',
          urgent: daysLeft <= 7
        });
      }

      that.setData({ upcomingItems: formattedItems, loading: false });
    }).catch(function(e) { console.error('[home] 加载即将到期事项失败', e); });
  },

  goToTool: function(e) {
    var pagePath = e.currentTarget.dataset.page;
    if (pagePath) wx.navigateTo({ url: pagePath });
  },

  goToToolManager: function() { wx.navigateTo({ url: '/pages/toolManager/toolManager' }); },
  goToToolbox: function() { wx.switchTab({ url: '/pages/toolbox/toolbox' }); },
  goToCalendar: function() { wx.switchTab({ url: '/pages/calendar/calendar' }); },

  goToItem: function(e) {
    var pagePath = e.currentTarget.dataset.page;
    var id = e.currentTarget.dataset.id;
    if (pagePath) wx.navigateTo({ url: pagePath + '?id=' + id });
  },

  showSearch: function() { wx.showToast({ title: '搜索功能开发中', icon: 'none' }); },
  showNotifications: function() { wx.showToast({ title: '通知功能开发中', icon: 'none' }); },

  formatDate: function(d) {
    if (!d) return '';
    var date = new Date(d);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
});
