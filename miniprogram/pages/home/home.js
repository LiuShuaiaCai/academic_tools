// pages/home/home.js
var app = getApp();
var creditsUtil = require('../../utils/credits.js');

Page({
  data: {
    enabledTools: [],
    displayTools: [],
    hasMoreTools: false,
    totalCount: 0,
    upcomingItems: [],
    loading: true,
    signedToday: false,
    continuousDays: 0,
    showSigninModal: false
  },

  onLoad: function() {
    this.loadEnabledTools();
  },
  onShow: function() { this.loadEnabledTools(); this.loadCreditsInfo(); },

  checkSigninModal: function() {
    if (this.data.signedToday) return;
    var today = new Date().toISOString().slice(0, 10);
    var dismissed = wx.getStorageSync('signin_dismissed_' + today);
    if (!dismissed) {
      this.setData({ showSigninModal: true });
    }
  },

  closeSigninModal: function() {
    this.setData({ showSigninModal: false });
    var today = new Date().toISOString().slice(0, 10);
    wx.setStorageSync('signin_dismissed_' + today, true);
  },

  loadCreditsInfo: function() {
    var that = this;
    creditsUtil.getCreditsInfo().then(function(res) {
      if (res.success !== false) {
        that.setData({
          signedToday: res.signedToday || false,
          continuousDays: res.continuousDays || 0
        });
        that.checkSigninModal();
      }
    }).catch(function() {});
  },

  doSignin: function() {
    var that = this;
    if (that.data.signedToday) return;
    that.setData({ showSigninModal: false });
    creditsUtil.doSignin().then(function(res) {
      if (res.success) {
        var msg = '签到成功 +' + res.earnedPoints + '积分';
        if (res.bonusPoints > 0) msg += '（连续签到奖励 +' + res.bonusPoints + '）';
        wx.showToast({ title: msg, icon: 'none' });
        that.setData({
          signedToday: true,
          continuousDays: res.continuousDays || that.data.continuousDays + 1
        });
      } else if (res.alreadySigned) {
        wx.showToast({ title: '今日已签到', icon: 'none' });
        that.setData({ signedToday: true });
      }
    }).catch(function() {
      wx.showToast({ title: '签到失败', icon: 'none' });
    });
  },

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
            // 云函数 getAllTools 已对 isTaskType 做缺省推断，前端直接用
            isTaskType: t.isTaskType !== false,
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
    var _ = db.command;
    // deadline 存的是字符串格式 "2026-05-03 23:53:50"，比较也要用字符串
    var now = new Date();
    var nowStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
    var urgentDate = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000); // 4天后（含0-3天）
    var urgentStr = urgentDate.getFullYear() + '-' + String(urgentDate.getMonth() + 1).padStart(2, '0') + '-' + String(urgentDate.getDate()).padStart(2, '0') + ' ' + String(urgentDate.getHours()).padStart(2, '0') + ':' + String(urgentDate.getMinutes()).padStart(2, '0') + ':' + String(urgentDate.getSeconds()).padStart(2, '0');
    var promises = [];
    var TASK_COLLECTION_MAP = {
      submission: 'submissions',
      review: 'reviews',
      conference: 'conferences'
    };

    for (var i = 0; i < enabledTools.length; i++) {
      (function(tool) {
        if (!tool.isTaskType) {
          // 非任务型工具（如资料归档）：不查 count，不显示任务数
          promises.push(Promise.resolve({
            id: tool.id, name: tool.name, desc: tool.desc,
            iconEmoji: tool.iconEmoji || '🔧', color: tool.color,
            pagePath: tool.pagePath || '',
            isTaskType: false,
            count: 0, urgent: 0
          }));
          return;
        }
        var colName = TASK_COLLECTION_MAP[tool.id];
        if (colName) {
          // 总数查询：投稿排除已完成
          var countWhere = { deleteTime: null };
          if (tool.id === 'submission') countWhere.completed = false;
          var countPromise = db.collection(colName).where(countWhere).count();

          // 紧急数查询（0-3天内截止的未完成项，deadline存的是字符串格式）
          var urgentPromise;
          if (tool.id === 'submission') {
            urgentPromise = db.collection(colName).where({
              deleteTime: null,
              completed: false,
              deadline: _.gte(nowStr).and(_.lt(urgentStr))
            }).count();
          } else if (tool.id === 'review' || tool.id === 'conference') {
            urgentPromise = db.collection(colName).where({
              deleteTime: null,
              deadline: _.gte(nowStr).and(_.lt(urgentStr))
            }).count();
          } else {
            urgentPromise = Promise.resolve({ total: 0 });
          }

          promises.push(
            Promise.all([countPromise, urgentPromise]).then(function(results) {
              return {
                id: tool.id, name: tool.name, desc: tool.desc,
                iconEmoji: tool.iconEmoji || '🔧', color: tool.color,
                pagePath: tool.pagePath || '',
                isTaskType: true,
                count: results[0].total, urgent: results[1].total
              };
            }).catch(function() {
              return { id: tool.id, name: tool.name, desc: tool.desc, iconEmoji: tool.iconEmoji || '🔧', color: tool.color, pagePath: tool.pagePath || '', isTaskType: true, count: 0, urgent: 0 };
            })
          );
        } else {
          promises.push(Promise.resolve({
            id: tool.id, name: tool.name, desc: tool.desc, iconEmoji: tool.iconEmoji || '🔧', color: tool.color, pagePath: tool.pagePath || '', isTaskType: true, count: 0, urgent: 0
          }));
        }
      })(enabledTools[i]);
    }

    Promise.all(promises).then(function(updatedTools) {
      that.setData({ enabledTools: updatedTools });

      var displayTools = updatedTools.length > 4 ? updatedTools.slice(0, 4) : updatedTools;
      var hasMoreTools = updatedTools.length > 4;

      var totalCount = 0;
      var totalUrgent = 0;
      for (var i = 0; i < updatedTools.length; i++) {
        totalCount += updatedTools[i].count;
        totalUrgent += updatedTools[i].urgent;
      }

      that.setData({ displayTools: displayTools, hasMoreTools: hasMoreTools, totalCount: totalCount, totalUrgent: totalUrgent });
      that.loadUpcomingItems();
    }).catch(function(e) { console.error('[home] 加载数据失败', e); });
  },

  loadUpcomingItems: function() {
    var that = this;
    var db = wx.cloud.database();
    var _ = db.command;
    var now = new Date();
    var nowStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
    var future = new Date();
    future.setDate(future.getDate() + 30);
    var futureStr = future.getFullYear() + '-' + String(future.getMonth() + 1).padStart(2, '0') + '-' + String(future.getDate()).padStart(2, '0') + ' ' + String(future.getHours()).padStart(2, '0') + ':' + String(future.getMinutes()).padStart(2, '0') + ':' + String(future.getSeconds()).padStart(2, '0');

    // 急需处理会议：有状态 且 startDate 在 0-3 天内
    var todayDateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var urgentDate = new Date(now);
    urgentDate.setDate(urgentDate.getDate() + 3);
    var urgentDateStr = urgentDate.getFullYear() + '-' + String(urgentDate.getMonth() + 1).padStart(2, '0') + '-' + String(urgentDate.getDate()).padStart(2, '0');

    Promise.all([
      db.collection('submissions').where({ deleteTime: null, deadline: _.gte(nowStr).and(_.lte(futureStr)) }).limit(5).orderBy('deadline', 'asc').get().catch(function() { return { data: [] }; }),
      db.collection('reviews').where({ deleteTime: null, deadline: _.gte(nowStr).and(_.lte(futureStr)) }).limit(5).orderBy('deadline', 'asc').get().catch(function() { return { data: [] }; }),
      db.collection('conferences').where({ deleteTime: null, deadline: _.gte(nowStr).and(_.lte(futureStr)) }).limit(5).orderBy('deadline', 'asc').get().catch(function() { return { data: [] }; }),
      db.collection('conferences').where({
        deleteTime: null,
        status: _.neq(null).and(_.neq('')),
        startDate: _.gte(todayDateStr).and(_.lte(urgentDateStr + ' 23:59:59'))
      }).limit(5).orderBy('startDate', 'asc').get().catch(function() { return { data: [] }; })
    ]).then(function(results) {
      var items = [];
      var i;
      for (i = 0; i < results[0].data.length; i++) {
        var s = results[0].data[i];
        items.push({ _id: s._id, title: s.title, type: 'submission', typeLabel: '投稿', icon: '📄', pagePath: '/pages/submissions/submissions', deadline: s.deadline });
      }
      for (i = 0; i < results[1].data.length; i++) {
        var r = results[1].data[i];
        items.push({ _id: r._id, title: r.paperTitle, type: 'review', typeLabel: '审稿', icon: '📝', pagePath: '/pages/reviews/reviews', deadline: r.deadline });
      }
      for (i = 0; i < results[2].data.length; i++) {
        var c = results[2].data[i];
        items.push({ _id: c._id, title: c.name, type: 'conference', typeLabel: '会议', icon: '🎤', pagePath: '/pages/conferences/conferences', deadline: c.deadline });
      }
      // 急需处理的会议（有状态 + startDate 在 0-3 天）
      for (i = 0; i < results[3].data.length; i++) {
        var cu = results[3].data[i];
        // 用 startDate 作为排序日期
        items.push({ _id: cu._id, title: cu.name, type: 'conference', typeLabel: '会议', icon: '🎤', pagePath: '/pages/conferences/conferences', deadline: cu.startDate });
      }

      items.sort(function(a, b) { return new Date(String(a.deadline).replace(' ', 'T')) - new Date(String(b.deadline).replace(' ', 'T')); });
      items = items.slice(0, 5);

      var formattedItems = [];
      for (i = 0; i < items.length; i++) {
        var item = items[i];
        var d = item.deadline;
        // iOS 兼容：把 "2026-05-06 00:00:00" 转为 "2026-05-06T00:00:00"
        var dIso = d ? String(d).replace(' ', 'T') : d;
        var daysLeft = Math.ceil((new Date(dIso) - new Date()) / (1000 * 60 * 60 * 24));
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
    var title = e.currentTarget.dataset.title || '';
    if (pagePath) {
      var url = pagePath + '?targetId=' + id;
      if (title) url += '&targetTitle=' + encodeURIComponent(title) + '&autoEdit=true';
      wx.navigateTo({ url: url });
    }
  },

  showSearch: function() { wx.showToast({ title: '搜索功能开发中', icon: 'none' }); },
  showNotifications: function() { wx.showToast({ title: '通知功能开发中', icon: 'none' }); },

  formatDate: function(d) {
    if (!d) return '';
    var date = new Date(String(d).replace(' ', 'T'));
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
});
