// pages/toolbox/toolbox.js

// 集合名称映射
var themeUtil = require('../../utils/theme.js');
var toolCache = require('../../utils/toolCache.js');
var VERBOSE = false;

var TASK_COLLECTION_MAP = {
  submission: 'submissions',
  review: 'reviews',
  conference: 'conferences',
  specialIssue: 'special_issue_tasks'
};

Page({
  data: {
    tools: [],
    enabledCount: 0,
    totalCount: 0,
    totalUrgent: 0,
    loading: true,
    currentOpenid: '' // 当前用户的 openid
  },

  onLoad: function() {
    var that = this;
    // 获取当前用户的 openid
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserId' }
    }).then(function(res) {
      that.setData({ currentOpenid: res.result.openid });
      that.loadTools();
    }).catch(function() {
      that.loadTools();
    });
  },

  onShow: function() {
    this.loadTools();
  },

  loadTools: function() {
    var that = this;
    that.setData({ loading: true });

    // 通过云函数获取用户已启用的工具配置
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserTools' }
    }).then(function(res) {
      var userTools = res.result || {};
      // 通过缓存获取所有工具定义（首次查云函数，后续走本地缓存）
      return toolCache.getAllTools().then(function(toolDefs) {
        VERBOSE && console.log('[toolbox] 工具定义:', toolDefs);
        return { userTools: userTools, toolDefs: toolDefs };
      });
    }).then(function(data) {
      var userTools = data.userTools;
      var toolDefs = data.toolDefs;
      var tools = [];

      // 筛选出用户已启用的工具
      for (var i = 0; i < toolDefs.length; i++) {
        var t = toolDefs[i];
        var isEnabled = userTools[t.id] === true;
        if (!isEnabled) continue;

        var toolTheme = themeUtil.getThemeByColor(t.color || 'blue');
        tools.push({
          id: t.id,
          name: t.name,
          desc: t.desc,
          iconEmoji: t.iconEmoji || '🔧',
          color: t.color || 'blue',
          themePrimary: toolTheme.primary,
          themePrimaryLight: toolTheme.primaryLight,
          pagePath: t.pagePath || '',
          isTaskType: t.isTaskType !== false,
          count: 0,
          urgent: 0
        });
      }

      VERBOSE && console.log('[toolbox] 启用的工具:', tools);
      that.setData({ tools: tools, enabledCount: tools.length });
      that.loadToolCounts();
    }).catch(function(e) {
      console.error('[toolbox] 获取工具配置失败:', e);
      that.setData({ tools: [], enabledCount: 0, loading: false });
    });
  },

  loadToolCounts: function() {
    var that = this;
    var tools = that.data.tools;
    var db = wx.cloud.database();
    var _ = db.command;
    var now = new Date();
    var nowStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
    var urgentDate = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    var urgentStr = urgentDate.getFullYear() + '-' + String(urgentDate.getMonth() + 1).padStart(2, '0') + '-' + String(urgentDate.getDate()).padStart(2, '0') + ' ' + String(urgentDate.getHours()).padStart(2, '0') + ':' + String(urgentDate.getMinutes()).padStart(2, '0') + ':' + String(urgentDate.getSeconds()).padStart(2, '0');

    var promises = [];
    for (var i = 0; i < tools.length; i++) {
      (function(tool) {
        // 非任务型工具：不查 count
        if (!tool.isTaskType && tool.id !== 'archive' && tool.id !== 'citation') {
          promises.push(Promise.resolve({
            id: tool.id, name: tool.name, desc: tool.desc,
            iconEmoji: tool.iconEmoji, color: tool.color,
            themePrimary: tool.themePrimary, themePrimaryLight: tool.themePrimaryLight,
            pagePath: tool.pagePath, isTaskType: false, count: 0, urgent: 0
          }));
          return;
        }

        var colName = TASK_COLLECTION_MAP[tool.id];
        if (tool.id === 'archive') colName = 'archives';
        if (tool.id === 'citation') colName = 'citation_library';
        VERBOSE && console.log('[toolbox] 查询工具:', tool.id, '->', colName, 'isTaskType:', tool.isTaskType);

        if (colName) {
          // 总数查询：不过滤 completed，显示全量（仅当前用户）
          // specialIssue 通过云函数查询（避免前端直接查询权限问题）
          var countPromise;
          if (tool.id === 'specialIssue') {
            countPromise = wx.cloud.callFunction({
              name: 'specialIssueAgent',
              data: { action: 'count' }
            }).then(function(res) {
              VERBOSE && console.log('[toolbox] specialIssue count 云函数返回:', JSON.stringify(res));
              return { total: (res.result && res.result.success) ? (res.result.count || 0) : 0 };
            }).catch(function(err) {
              console.error('[toolbox] specialIssue count 调用失败:', err);
              return { total: 0 };
            });
          } else {
            countPromise = db.collection(colName).where({ deleteTime: null, _openid: that.data.currentOpenid }).count();
          }

          // 紧急数查询（0-3天内截止的未完成项）
          var urgentPromise;
          if (tool.id === 'submission') {
            urgentPromise = db.collection(colName).where({
              deleteTime: null,
              _openid: that.data.currentOpenid,
              completed: false,
              deadline: _.gte(nowStr).and(_.lt(urgentStr))
            }).count();
          } else if (tool.id === 'conference') {
            var todayDateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            var startUrgentDate = new Date(now);
            startUrgentDate.setDate(startUrgentDate.getDate() + 3);
            var startUrgentDateStr = startUrgentDate.getFullYear() + '-' + String(startUrgentDate.getMonth() + 1).padStart(2, '0') + '-' + String(startUrgentDate.getDate()).padStart(2, '0');
            urgentPromise = Promise.all([
              db.collection(colName).where({
                deleteTime: null,
                _openid: that.data.currentOpenid,
                completed: _.neq(true),
                deadline: _.gte(nowStr).and(_.lt(urgentStr))
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
              deadline: _.gte(nowStr).and(_.lt(urgentStr))
            }).count();
          } else {
            urgentPromise = Promise.resolve({ total: 0 });
          }

          promises.push(
            Promise.all([countPromise, urgentPromise]).then(function(results) {
              VERBOSE && console.log('[toolbox] 查询结果:', tool.id, 'count:', results[0].total, 'urgent:', results[1].total);
              return {
                id: tool.id, name: tool.name, desc: tool.desc,
                iconEmoji: tool.iconEmoji, color: tool.color,
                themePrimary: tool.themePrimary, themePrimaryLight: tool.themePrimaryLight,
                pagePath: tool.pagePath, isTaskType: tool.isTaskType,
                count: results[0].total, urgent: results[1].total
              };
            }).catch(function(e) {
              console.error('[toolbox] 查询失败:', tool.id, e);
              return { id: tool.id, name: tool.name, desc: tool.desc, iconEmoji: tool.iconEmoji, color: tool.color, themePrimary: tool.themePrimary, themePrimaryLight: tool.themePrimaryLight, pagePath: tool.pagePath, isTaskType: tool.isTaskType, count: 0, urgent: 0 };
            })
          );
        } else {
          VERBOSE && console.log('[toolbox] 工具不在映射中:', tool.id);
          promises.push(Promise.resolve({
            id: tool.id, name: tool.name, desc: tool.desc,
            iconEmoji: tool.iconEmoji, color: tool.color,
            themePrimary: tool.themePrimary, themePrimaryLight: tool.themePrimaryLight,
            pagePath: tool.pagePath, isTaskType: tool.isTaskType, count: 0, urgent: 0
          }));
        }
      })(tools[i]);
    }

    Promise.all(promises).then(function(updatedTools) {
      VERBOSE && console.log('[toolbox] 更新后的工具:', updatedTools);

      var totalCount = 0;
      var totalUrgent = 0;
      for (var i = 0; i < updatedTools.length; i++) {
        totalCount += updatedTools[i].count;
        totalUrgent += updatedTools[i].urgent;
      }

      that.setData({
        tools: updatedTools,
        totalCount: totalCount,
        totalUrgent: totalUrgent,
        loading: false
      });
    }).catch(function(e) {
      console.error('[toolbox] 加载数据失败', e);
      that.setData({ loading: false });
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
