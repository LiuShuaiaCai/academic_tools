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
    toolsLoading: true,      // 工作台加载状态
    itemsLoading: true,       // 近期任务加载状态
    signedToday: false,
    continuousDays: 0,
    showSigninModal: false,
    creditsInfoLoaded: false,  // 积分信息是否已加载完成（防止加载中误弹窗）
    currentOpenid: '',  // 当前用户的 openid
    banners: []  // 轮播图数据
  },

  onLoad: function() {
    var that = this;
    // 加载轮播图
    that.loadBanners();
    // 获取当前用户的 openid
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserId' }
    }).then(function(res) {
      that.setData({ currentOpenid: res.result.openid });
      // 并行加载工作台和近期任务
      that.loadEnabledTools();
      that.loadUpcomingItems();
    }).catch(function() {
      that.loadEnabledTools();
      that.loadUpcomingItems();
    });
  },
  onShow: function() { 
    this.loadEnabledTools(); 
    this.loadUpcomingItems();  // 每次显示都刷新近期任务
    this.setData({ creditsInfoLoaded: false });
    this.loadCreditsInfo();
  },

  // 获取北京时间日期字符串 YYYY-MM-DD
  getBeijingDateStr: function() {
    var now = new Date();
    var bj = new Date(now.getTime() + 8 * 3600000);
    var y = bj.getFullYear();
    var m = String(bj.getMonth() + 1).padStart(2, '0');
    var d = String(bj.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  },

  checkSigninModal: function() {
    // 积分信息还在加载中，先不弹窗，等加载完再判断
    if (!this.data.creditsInfoLoaded) return;
    if (this.data.signedToday) return;
    var today = this.getBeijingDateStr();
    var dismissed = false;
    try {
      dismissed = wx.getStorageSync('signin_dismissed_' + today);
    } catch(e) {
      dismissed = false;
    }
    if (!dismissed) {
      this.setData({ showSigninModal: true });
    }
  },

  closeSigninModal: function() {
    this.setData({ showSigninModal: false });
    var today = this.getBeijingDateStr();
    wx.setStorageSync('signin_dismissed_' + today, true);
  },

  loadCreditsInfo: function() {
    var that = this;
    var promise;
    try {
      promise = creditsUtil.getCreditsInfo();
    } catch(e) {
      // 同步异常（如 cloud 未初始化），标记加载完成并检查弹窗
      that.setData({ creditsInfoLoaded: true });
      that.checkSigninModal();
      return;
    }
    promise.then(function(res) {
      if (res.success !== false) {
        that.setData({
          signedToday: res.signedToday || false,
          continuousDays: res.continuousDays || 0,
          creditsInfoLoaded: true
        });
      } else {
        that.setData({ creditsInfoLoaded: true });
      }
      that.checkSigninModal();
    }).catch(function() {
      that.setData({ creditsInfoLoaded: true });
      that.checkSigninModal();
    });
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
    that.setData({ toolsLoading: true });

    // 通过云函数获取用户已启用的工具配置
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserTools' }
    }).then(function(res) {
      var userTools = res.result || {};
      // 通过缓存获取所有工具定义
      var toolCache = require('../../utils/toolCache.js');
      return toolCache.getAllTools().then(function(toolDefs) {
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
      that.setData({ enabledTools: [], toolsLoading: false });
      // 工作台失败不影响近期任务（已在 onLoad 中独立启动）
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
    var todayDateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var todayStartStr = todayDateStr + ' 00:00:00';
    var urgentDate = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000); // 4天后（含0-3天）
    var urgentStr = urgentDate.getFullYear() + '-' + String(urgentDate.getMonth() + 1).padStart(2, '0') + '-' + String(urgentDate.getDate()).padStart(2, '0') + ' ' + String(urgentDate.getHours()).padStart(2, '0') + ':' + String(urgentDate.getMinutes()).padStart(2, '0') + ':' + String(urgentDate.getSeconds()).padStart(2, '0');
    var promises = [];
    var TASK_COLLECTION_MAP = {
      submission: 'submissions',
      review: 'reviews',
      conference: 'conferences',
      specialIssue: 'special_issue_tasks'
    };

    for (var i = 0; i < enabledTools.length; i++) {
      (function(tool) {
        if (!tool.isTaskType && tool.id !== 'archive' && tool.id !== 'citation') {
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
        if (tool.id === 'archive') colName = 'archives';
        if (tool.id === 'citation') colName = 'citation_library';
        if (colName) {
          // 总数查询：不过滤 completed，显示全量（仅当前用户）
          // specialIssue 通过云函数查询（避免前端直接查询权限问题）
          var countPromise;
          if (tool.id === 'specialIssue') {
            countPromise = wx.cloud.callFunction({
              name: 'specialIssueAgent',
              data: { action: 'count' }
            }).then(function(res) {
              console.log('[home] specialIssue count 云函数返回:', JSON.stringify(res));
              return { total: (res.result && res.result.success) ? (res.result.count || 0) : 0 };
            }).catch(function(err) {
              console.error('[home] specialIssue count 调用失败:', err);
              return { total: 0 };
            });
          } else {
            countPromise = db.collection(colName).where({ deleteTime: null, _openid: that.data.currentOpenid }).count();
          }

          // 紧急数查询（0-3天内截止的未完成项，deadline存的是字符串格式）
          var urgentPromise;
          if (tool.id === 'submission') {
            urgentPromise = db.collection(colName).where({
              deleteTime: null,
              _openid: that.data.currentOpenid,
              completed: false,
              deadline: _.gte(todayStartStr).and(_.lt(urgentStr))
            }).count();
          } else if (tool.id === 'conference') {
            var startUrgentDate = new Date(now);
            startUrgentDate.setDate(startUrgentDate.getDate() + 3);
            var startUrgentDateStr = startUrgentDate.getFullYear() + '-' + String(startUrgentDate.getMonth() + 1).padStart(2, '0') + '-' + String(startUrgentDate.getDate()).padStart(2, '0');
            urgentPromise = Promise.all([
              db.collection(colName).where({
                deleteTime: null,
                _openid: that.data.currentOpenid,
                completed: _.neq(true),
                deadline: _.gte(todayStartStr).and(_.lt(urgentStr))
              }).count(),
              db.collection(colName).where({
                deleteTime: null,
                _openid: that.data.currentOpenid,
                completed: _.neq(true),
                status: _.neq(null).and(_.neq('')),
                startDate: _.gte(todayDateStr).and(_.lte(startUrgentDateStr + ' 23:59:59'))
              }).count()
            ]).then(function(res) {
              return { total: res[0].total + res[1].total };
            });
          } else if (tool.id === 'review') {
            urgentPromise = db.collection(colName).where({
              deleteTime: null,
              _openid: that.data.currentOpenid,
              completed: _.neq(true),
              deadline: _.gte(todayStartStr).and(_.lt(urgentStr))
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
                isTaskType: tool.isTaskType,
                count: results[0].total, urgent: results[1].total
              };
            }).catch(function() {
              return { id: tool.id, name: tool.name, desc: tool.desc, iconEmoji: tool.iconEmoji || '🔧', color: tool.color, pagePath: tool.pagePath || '', isTaskType: tool.isTaskType, count: 0, urgent: 0 };
            })
          );
        } else {
          promises.push(Promise.resolve({
            id: tool.id, name: tool.name, desc: tool.desc, iconEmoji: tool.iconEmoji || '🔧', color: tool.color, pagePath: tool.pagePath || '', isTaskType: tool.isTaskType, count: 0, urgent: 0
          }));
        }
      })(enabledTools[i]);
    }

    Promise.all(promises).then(function(updatedTools) {
      that.setData({ enabledTools: updatedTools, toolsLoading: false });

      var displayTools = updatedTools.length > 4 ? updatedTools.slice(0, 4) : updatedTools;
      var hasMoreTools = updatedTools.length > 4;

      var totalCount = 0;
      var totalUrgent = 0;
      for (var i = 0; i < updatedTools.length; i++) {
        totalCount += updatedTools[i].count;
        totalUrgent += updatedTools[i].urgent;
      }

      that.setData({ displayTools: displayTools, hasMoreTools: hasMoreTools, totalCount: totalCount, totalUrgent: totalUrgent });
      // 工作台加载完成，不再重复调用 loadUpcomingItems（已在 onLoad 中启动）
    }).catch(function(e) { 
      console.error('[home] 加载数据失败', e); 
      that.setData({ toolsLoading: false });
      // 工作台失败也不影响近期任务（已在 onLoad 中独立启动）
    });
  },

  loadUpcomingItems: function() {
    var that = this;
    that.setData({ itemsLoading: true });  // 开始加载时显示骨架屏
    var db = wx.cloud.database();
    var _ = db.command;
    var now = new Date();
    var todayDateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var todayStartStr = todayDateStr + ' 00:00:00';
    var future = new Date();
    future.setDate(future.getDate() + 30);
    var futureStr = future.getFullYear() + '-' + String(future.getMonth() + 1).padStart(2, '0') + '-' + String(future.getDate()).padStart(2, '0') + ' ' + String(future.getHours()).padStart(2, '0') + ':' + String(future.getMinutes()).padStart(2, '0') + ':' + String(future.getSeconds()).padStart(2, '0');

    // 急需处理会议：有状态 且 startDate 在 0-3 天内
    var urgentDate = new Date(now);
    urgentDate.setDate(urgentDate.getDate() + 3);
    var urgentDateStr = urgentDate.getFullYear() + '-' + String(urgentDate.getMonth() + 1).padStart(2, '0') + '-' + String(urgentDate.getDate()).padStart(2, '0');

    Promise.all([
      db.collection('submissions').where({ deleteTime: null, _openid: that.data.currentOpenid, completed: _.neq(true), deadline: _.gte(todayStartStr).and(_.lte(futureStr)) }).limit(5).orderBy('deadline', 'asc').get().catch(function() { return { data: [] }; }),
      db.collection('reviews').where({ deleteTime: null, _openid: that.data.currentOpenid, completed: _.neq(true), deadline: _.gte(todayStartStr).and(_.lte(futureStr)) }).limit(5).orderBy('deadline', 'asc').get().catch(function() { return { data: [] }; }),
      db.collection('conferences').where({ deleteTime: null, _openid: that.data.currentOpenid, completed: _.neq(true), deadline: _.gte(todayStartStr).and(_.lte(futureStr)) }).limit(5).orderBy('deadline', 'asc').get().catch(function() { return { data: [] }; }),
      db.collection('conferences').where({
        deleteTime: null,
        _openid: that.data.currentOpenid,
        completed: _.neq(true),
        status: _.neq(null).and(_.neq('')),
        startDate: _.gte(todayDateStr).and(_.lte(urgentDateStr + ' 23:59:59'))
      }).limit(5).orderBy('startDate', 'asc').get().catch(function() { return { data: [] }; }),
      // 今天任务（未完成、未删除）
      db.collection('tasks').where({
        deleteTime: null,
        _openid: that.data.currentOpenid,
        completed: _.neq(true),
        date: todayDateStr
      }).limit(5).orderBy('time', 'asc').get().catch(function() { return { data: [] }; })
    ]).then(function(results) {
      // 从数据库工具配置中查找对应工具的图标
      var tools = that.data.enabledTools || [];
      var toolMap = {};
      for (var k = 0; k < tools.length; k++) {
        if (tools[k].pagePath) {
          toolMap[tools[k].pagePath] = tools[k];
        }
      }

      var items = [];
      var i;

      function getIcon(pagePath, fallback) {
        var tool = toolMap[pagePath];
        return (tool && tool.iconEmoji) || fallback;
      }

      for (i = 0; i < results[0].data.length; i++) {
        var s = results[0].data[i];
        items.push({ _id: s._id, title: s.title, type: 'submission', typeLabel: '投稿', icon: getIcon('/pages/submissions/submissions', '📄'), pagePath: '/pages/submissions/submissions', deadline: s.deadline });
      }
      for (i = 0; i < results[1].data.length; i++) {
        var r = results[1].data[i];
        items.push({ _id: r._id, title: r.paperTitle, type: 'review', typeLabel: '审稿', icon: getIcon('/pages/reviews/reviews', '📝'), pagePath: '/pages/reviews/reviews', deadline: r.deadline });
      }
      for (i = 0; i < results[2].data.length; i++) {
        var c = results[2].data[i];
        items.push({ _id: c._id, title: c.name, type: 'conference', typeLabel: '会议', icon: getIcon('/pages/conferences/conferences', '🎤'), pagePath: '/pages/conferences/conferences', deadline: c.deadline });
      }
      // 急需处理的会议（有状态 + startDate 在 0-3 天）
      for (i = 0; i < results[3].data.length; i++) {
        var cu = results[3].data[i];
        // 用 startDate 作为排序日期
        items.push({ _id: cu._id, title: cu.name, type: 'conference', typeLabel: '会议', icon: getIcon('/pages/conferences/conferences', '🎤'), pagePath: '/pages/conferences/conferences', deadline: cu.startDate });
      }
      // 今天任务（点击跳转日历）
      for (i = 0; i < results[4].data.length; i++) {
        var t = results[4].data[i];
        var taskDeadline = t.date + (t.time ? ' ' + t.time : ' 00:00:00');
        items.push({ _id: t._id, title: t.title, type: 'task', typeLabel: '任务', icon: getIcon('/pages/calendar/calendar', '📋'), pagePath: '/pages/calendar/calendar', deadline: taskDeadline });
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

      that.setData({ upcomingItems: formattedItems, itemsLoading: false });
    }).catch(function(e) { 
      console.error('[home] 加载即将到期事项失败', e); 
      that.setData({ itemsLoading: false });
    });
  },

  goToTool: function(e) {
    var pagePath = e.currentTarget.dataset.page;
    if (pagePath) wx.navigateTo({ url: pagePath });
  },

  goToToolManager: function() { wx.navigateTo({ url: '/pages/toolManager/toolManager' }); },
  goToToolbox: function() { wx.navigateTo({ url: '/pages/toolbox/toolbox' }); },
  goToCalendar: function() { wx.switchTab({ url: '/pages/calendar/calendar' }); },

  goToItem: function(e) {
    var pagePath = e.currentTarget.dataset.page;
    var id = e.currentTarget.dataset.id;
    var title = e.currentTarget.dataset.title || '';
    var type = e.currentTarget.dataset.type || '';
    if (type === 'task') {
      // 任务类型：跳转到日历 tab
      wx.switchTab({ url: '/pages/calendar/calendar' });
    } else if (pagePath) {
      var url = pagePath + '?targetId=' + id;
      if (title) url += '&targetTitle=' + encodeURIComponent(title) + '&autoEdit=true';
      wx.navigateTo({ url: url });
    }
  },

  // 加载轮播图（公告/广告）
  loadBanners: function() {
    var that = this;
    var db = wx.cloud.database();
    db.collection('banners')
      .where({ enabled: true })
      .orderBy('sort', 'asc')
      .get()
      .then(function(res) {
        var list = res.data || [];
        that.setData({ banners: list.length > 0 ? list : [] });
      })
      .catch(function(err) {
        // 集合不存在则自动创建
        if (err.errCode === -502005 || String(err.message || '').indexOf('not exist') > -1) {
          that.initBannersCollection();
        }
        that.setData({ banners: [] });
      });
  },

  // 初始化 banners 集合（首次写入自动建集合）
  initBannersCollection: function() {
    var db = wx.cloud.database();
    db.collection('banners').add({
      data: {
        image: '',
        title: '公告示例',
        subTitle: '',
        enabled: false,
        sort: 1,
        linkType: '',
        linkTarget: '',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }).then(function() {
      console.log('[home] banners 集合已创建');
    }).catch(function(e) {
      console.error('[home] banners 创建失败:', e);
    });
  },

  // 点击轮播图
  onBannerTap: function(e) {
    var item = e.currentTarget.dataset.item;
    if (!item) return;
    if (item.linkType === 'miniprogram' && item.linkTarget) {
      wx.navigateTo({ url: item.linkTarget });
    } else if (item.linkType === 'webview' && item.linkTarget) {
      wx.navigateTo({ url: '/pages/webview/webview?url=' + encodeURIComponent(item.linkTarget) });
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
