// pages/specialIssue/trend/trend.js
// 趋势领域分析页面：展示方向面板、趋势对比图、方向详情弹窗、方案生成
var creditsUtil = require('../../../utils/credits.js');
var theme = require('../../../utils/theme.js');

Page({
  data: {
    taskId: '',
    keyword: '',

    // 方向选择面板
    plans: [],
    showDirectionPanel: false,
    expandedDirection: '',
    selectingDirection: false,
    compareHeights: [],
    schemeCount: 0,
    generatingSchemeId: '',

    // 方向详情弹窗
    showDetailModal: false,
    detailModalPlan: null,

    // 方案进度弹窗
    showProgressModal: false,
    selectedSchemeSteps: [],
    selectedSchemeProgress: '',

    // 状态
    loading: true,
    error: '',
    progressText: '',

    // 主题色
    theme: {}
  },

  onLoad: function(options) {
    this.loadToolTheme();
    var taskId = options.taskId || '';
    this.setData({ taskId: taskId, keyword: options.keyword || '' });
    this.loadTrendDetail();
  },

  loadToolTheme: function() {
    var that = this;
    theme.loadToolTheme('specialIssue').then(function(t) {
      that.setData({ theme: t });
    });
  },

  onShow: function() {
    this.loadTrendDetail();
  },

  onUnload: function() {
    this.stopPolling();
  },

  // ---- 方向数据预处理（公共函数，供 loadTrendDetail 和 onViewHistory 共用） ----
  preprocessPlans: function(plans, schemesByDir) {
    schemesByDir = schemesByDir || {};
    for (var p = 0; p < plans.length; p++) {
      plans[p]._topicLabel = 'Topic' + (p + 1);
      plans[p]._paperCount = plans[p].paperCount || 0;
      plans[p]._avgCitationsStr = (plans[p].avgCitations || 0).toFixed(1);
      plans[p]._avgFWCIStr = (plans[p].avgFWCI || 0).toFixed(2);
      plans[p]._hotRecentAvgStr = (plans[p].hotRecentAvg || 0).toFixed(1);
      plans[p]._topJournalRatioStr = ((plans[p].topJournalRatio || 0) * 100).toFixed(0) + '%';
      plans[p]._matchedPapers = plans[p].sourcePapers || [];

      var h = plans[p].topicHeat || 0;
      if (h >= 800) plans[p]._heatColor = 'linear-gradient(135deg, #DC2626, #EF4444)';
      else if (h >= 600) plans[p]._heatColor = 'linear-gradient(135deg, #EA580C, #F97316)';
      else if (h >= 400) plans[p]._heatColor = 'linear-gradient(135deg, #CA8A04, #EAB308)';
      else plans[p]._heatColor = 'linear-gradient(135deg, #2563EB, #3B82F6)';

      // 方案状态关联
      plans[p]._schemes = schemesByDir[plans[p].key] || [];
      var dirSchemes = plans[p]._schemes;
      var hasGenerating = false, hasCompleted = false, hasFailed = false;
      var latestSchemeId = '';
      for (var s = 0; s < dirSchemes.length; s++) {
        if (dirSchemes[s].status === 'generating') { hasGenerating = true; latestSchemeId = dirSchemes[s].schemeId; }
        if (dirSchemes[s].status === 'completed') { hasCompleted = true; }
        if (dirSchemes[s].status === 'failed') { hasFailed = true; latestSchemeId = dirSchemes[s].schemeId; }
      }
      if (hasGenerating) {
        plans[p]._schemeStatus = 'generating';
        plans[p]._schemeId = latestSchemeId;
        plans[p]._progressPercent = plans[p]._progressPercent || 0;
      } else if (hasCompleted) {
        plans[p]._schemeStatus = 'completed';
        plans[p]._schemeId = (dirSchemes.find(function(s) { return s.status === 'completed'; }) || {}).schemeId || '';
      } else if (hasFailed) {
        plans[p]._schemeStatus = 'failed';
        plans[p]._schemeId = latestSchemeId;
      } else {
        plans[p]._schemeStatus = 'idle';
      }
    }
    return plans;
  },

  // ---- 加载趋势分析详情 ----
  loadTrendDetail: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'getTrendDetail', taskId: that.data.taskId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      console.log('[trend] getTrendDetail返回:', JSON.stringify(data));
      if (!data) {
        that.setData({ loading: false, error: '任务不存在' });
        return;
      }

      // 任务还在处理中（重新分析进行中），保持 loading 状态，避免旧数据残留
      if (data.status === 'processing') {
        if (!that.data.progressText) {
          that.setData({ loading: true, progressText: '正在分析中...' });
        }
        return;
      }

      var plans = data.directions || [];
      var schemesByDir = data.schemesByDir || {};

      plans = that.preprocessPlans(plans, schemesByDir);
      plans.sort(function(a, b) { return (b.topicHeat || 0) - (a.topicHeat || 0); });

      var maxHeat = 1;
      for (var p = 0; p < plans.length; p++) maxHeat = Math.max(maxHeat, plans[p].topicHeat || 0);
      var compareHeights = plans.map(function(p) { return Math.max(Math.round((p.topicHeat || 0) / maxHeat * 100), 4); });

      that.setData({
        loading: false,
        showDirectionPanel: true,
        keyword: data.keyword || '',
        plans: plans,
        compareHeights: compareHeights,
        schemeCount: data.schemeCount || 0,
        generatingSchemeId: data.generatingSchemeId || '',
        error: ''
      });
      wx.setNavigationBarTitle({ title: '趋势领域分析' });

      if (data.generatingSchemeId) {
        that.addPollingScheme(data.generatingSchemeId);
      }
    }).catch(function(err) {
      console.error('[trend] 加载趋势失败:', err);
      that.setData({ loading: false, error: that.getDisplayError(err.message || '网络错误') });
    });
  },

  // ---- 轮询方案进度 ----
  _pollingSchemeIds: {},

  addPollingScheme: function(schemeId) {
    var that = this;
    if (!that._pollingSchemeIds) that._pollingSchemeIds = {};
    that._pollingSchemeIds[schemeId] = true;
    that.startSchemePolling();
  },

  removePollingScheme: function(schemeId) {
    var that = this;
    if (that._pollingSchemeIds) {
      delete that._pollingSchemeIds[schemeId];
      if (Object.keys(that._pollingSchemeIds).length === 0) {
        that.stopPolling();
      }
    }
  },

  startSchemePolling: function() {
    var that = this;
    if (that._pollTimer) return;
    that._pollTimer = setInterval(function() {
      that.pollSchemeStatus();
    }, 3000);
  },

  pollSchemeStatus: function() {
    var that = this;
    var ids = Object.keys(that._pollingSchemeIds || {});
    if (ids.length === 0) {
      that.stopPolling();
      return;
    }
    // 同时轮询所有活跃方案的进度
    for (var k = 0; k < ids.length; k++) {
      (function(schemeId) {
        wx.cloud.callFunction({
          name: 'specialIssueAgent',
          data: { action: 'getSchemeStatus', schemeId: schemeId }
        }).then(function(res) {
          var data = res.result && res.result.data;
          if (!data) return;
          if (data.status === 'generating') {
            var steps = data.steps || [];
            var done = steps.filter(function(s) { return s.status === 'completed' || s.status === 'failed'; }).length;
            var pct = steps.length > 0 ? Math.round(done / steps.length * 100) : 0;
            var plans = that.data.plans;
            for (var i = 0; i < plans.length; i++) {
              // 只更新匹配该 schemeId 的方案，不再广播到所有 generating 方案
              if (plans[i]._schemeId === schemeId) {
                plans[i]._progressPercent = pct;
                plans[i]._schemeSteps = steps;
              }
            }
            that.setData({ plans: plans });
          } else if (data.status === 'completed') {
            that.removePollingScheme(schemeId);
            that.loadTrendDetail();
          } else if (data.status === 'failed') {
            that.removePollingScheme(schemeId);
            that.loadTrendDetail();
          }
        }).catch(function() {});
      })(ids[k]);
    }
  },

  startPolling: function() {
    var that = this;
    that.stopPolling();
    that._pollTimer = setInterval(function() {
      that.loadTrendDetail();
    }, 3000);
  },

  stopPolling: function() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  // ---- 生成方案 ----
  onGenerateScheme: function(e) {
    var that = this;
    var directionKey = e.currentTarget.dataset.key;
    if (!directionKey) return;
    if (that.data.selectingDirection) return;
    that.setData({ selectingDirection: true });
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'startScheme', taskId: that.data.taskId, directionKey: directionKey }
    }).then(function(res) {
      var result = res.result || {};
      if (result.success && result.schemeId) {
        wx.showToast({ title: '方案生成已启动', icon: 'none' });
        that.addPollingScheme(result.schemeId);
        that.loadTrendDetail();
      } else {
        wx.showToast({ title: result.error || '启动失败', icon: 'none' });
        that.setData({ selectingDirection: false });
      }
    }).catch(function() {
      that.setData({ selectingDirection: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // ---- 查看已完成方案 -> 跳转到方案详情页 ----
  onViewScheme: function(e) {
    var schemeId = e.currentTarget.dataset.schemeId;
    var key = e.currentTarget.dataset.key;
    if (!schemeId && key) {
      var plan = this.data.plans.find(function(p) { return p.key === key; });
      schemeId = (plan && plan._schemeId) || '';
    }
    if (!schemeId) return;
    wx.navigateTo({
      url: '../detail/detail?schemeId=' + schemeId + '&taskId=' + encodeURIComponent(this.data.taskId) + '&keyword=' + encodeURIComponent(this.data.keyword || '')
    });
  },

  // ---- 查看生成中方案进度（弹窗） ----
  onViewSchemeProgress: function(e) {
    var that = this;
    var key = e.currentTarget.dataset.key;
    var schemeId = e.currentTarget.dataset.schemeId;
    var plan = that.data.plans.find(function(p) { return p.key === key; }) || {};

    if (plan._schemeSteps && plan._schemeSteps.length > 0) {
      that.setData({
        showProgressModal: true,
        selectedSchemeSteps: plan._schemeSteps,
        selectedSchemeProgress: (plan._progressPercent || 0) + '%'
      });
      return;
    }

    if (!schemeId) return;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'getSchemeStatus', schemeId: schemeId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      if (!data) return;
      var steps = data.steps || [];
      that.setData({
        showProgressModal: true,
        selectedSchemeSteps: steps,
        selectedSchemeProgress: data.progress || ''
      });
    }).catch(function() {
      wx.showToast({ title: '查询进度失败', icon: 'none' });
    });
  },

  onHideProgress: function() {
    this.setData({ showProgressModal: false });
  },

  getStepStatusIcon: function(status) {
    if (status === 'completed') return '✅';
    if (status === 'running') return '⏳';
    if (status === 'failed') return '❌';
    return '⏸️';
  },

  // ---- 重试失败方案 ----
  onRetryScheme: function(e) {
    var that = this;
    var key = e.currentTarget.dataset.key;
    var schemeId = e.currentTarget.dataset.schemeId;
    if (!key) return;
    wx.showModal({
      title: '重试方案',
      content: '将重新为此方向生成方案，是否继续？',
      confirmText: '确认重试',
      success: function(res) {
        if (!res.confirm) return;
        that.onGenerateScheme({ currentTarget: { dataset: { key: key, schemeId: schemeId } } });
      }
    });
  },

  // ---- 方向卡片展开/收起 ----
  onExpandDirection: function(e) {
    var key = e.currentTarget.dataset.key;
    this.setData({ expandedDirection: key });
  },

  onCollapseDirection: function() {
    this.setData({ expandedDirection: '' });
  },

  // ---- 弹窗显示方向详情 ----
  onOpenDetail: function(e) {
    var key = e.currentTarget.dataset.key;
    var plan = this.data.plans.find(function(p) { return p.key === key; });
    if (plan) {
      this.setData({ showDetailModal: true, detailModalPlan: plan });
    }
  },

  hideDetailModal: function() {
    this.setData({ showDetailModal: false, detailModalPlan: null });
  },

  onSelectFromModal: function(e) {
    var key = e.currentTarget.dataset.key;
    if (!key) return;
    this.hideDetailModal();
    this.onGenerateScheme({ currentTarget: { dataset: { key: key } } });
  },

  onViewDetailSchemeProgress: function(e) {
    this.onViewSchemeProgress(e);
  },

  onViewSchemeFromModal: function(e) {
    var schemeId = e.currentTarget.dataset.schemeId;
    if (!schemeId) {
      var plan = this.data.detailModalPlan;
      schemeId = (plan && plan._schemeId) || '';
    }
    if (!schemeId) return;
    this.hideDetailModal();
    wx.navigateTo({
      url: '../detail/detail?schemeId=' + schemeId + '&taskId=' + encodeURIComponent(this.data.taskId) + '&keyword=' + encodeURIComponent(this.data.keyword || '')
    });
  },

  onRetrySchemeFromModal: function(e) {
    var key = e.currentTarget.dataset.key;
    if (!key) return;
    this.hideDetailModal();
    this.onRetryScheme({ currentTarget: { dataset: { key: key } } });
  },

  // ---- 重新分析（删除旧方向和方案 → 重新生成趋势分析） ----
  onRegenerate: function() {
    var that = this;
    wx.showModal({
      title: '重新分析',
      content: '将删除当前任务的趋势分析方向和所有方案，消耗 30 积分重新分析趋势，确认？',
      confirmText: '确认',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '重新分析中...' });
          wx.cloud.callFunction({
            name: 'specialIssueAgent',
            data: { action: 'regenerate', taskId: that.data.taskId }
          }).then(function(res) {
            wx.hideLoading();
            if (res.result.success) {
              // 清空旧方向数据和方案计数，避免异步删除完成前残留显示
              that.setData({
                loading: true,
                error: '',
                progressText: '正在重新分析...',
                showDirectionPanel: false,
                plans: [],
                compareHeights: [],
                schemeCount: 0,
                generatingSchemeId: '',
                showDetailModal: false,
                detailModalPlan: null,
                showProgressModal: false
              });
              that.startPolling();
            } else {
              wx.showToast({ title: res.result.error || '重新分析失败', icon: 'none' });
            }
          }).catch(function(err) {
            wx.hideLoading();
            wx.showToast({ title: '请求失败: ' + (err.message || ''), icon: 'none' });
          });
        }
      }
    });
  },

  // ---- 查看历史方向 ----
  onViewHistory: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'poll', taskId: that.data.taskId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      var history = data && data.regenerateHistory || [];
      if (history.length === 0) {
        wx.showToast({ title: '暂无历史记录', icon: 'none' });
        return;
      }
      var items = history.map(function(h, i) {
        var firstDir = (h.directions && h.directions[0]) || {};
        var title = (firstDir.zh && firstDir.zh.title) || (firstDir.en && firstDir.en.title) || ('方向 ' + (i + 1));
        return '第' + (i + 1) + '次: ' + title;
      });
      wx.showActionSheet({
        itemList: items,
        success: function(actionRes) {
          var selected = history[actionRes.tapIndex];
          var dirs = selected.directions || [];
          var processedPlans = that.preprocessPlans(dirs, {});
          var maxHeat = 1;
          for (var p2 = 0; p2 < processedPlans.length; p2++) maxHeat = Math.max(maxHeat, processedPlans[p2].topicHeat || 0);
          var compareHeights = processedPlans.map(function(p) { return Math.max(Math.round((p.topicHeat || 0) / maxHeat * 100), 4); });
          that.setData({
            plans: processedPlans,
            compareHeights: compareHeights,
            showDirectionPanel: true,
            hasResult: false,
            schemeCount: 0
          });
          wx.setNavigationBarTitle({ title: '历史方向' });
        }
      });
    });
  },

  // ---- 选择方向 ----
  onSelectDirection: function(e) {
    var that = this;
    var key = e.currentTarget.dataset.key;
    var plan = that.data.plans.find(function(p) { return p.key === key; });
    if (!plan) return;
    var zhTitle = (plan.zh && plan.zh.title) || '';
    wx.showModal({
      title: '确认选择',
      content: '选择方向「' + zhTitle + '」生成详细方案？',
      confirmText: '确认',
      success: function(res) {
        if (res.confirm) {
          that.doSelectDirection(key);
        }
      }
    });
  },

  doSelectDirection: function(key) {
    var that = this;
    that.setData({ selectingDirection: true });
    wx.showLoading({ title: '启动方案生成...' });
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'startScheme', taskId: that.data.taskId, directionKey: key }
    }).then(function(res) {
      wx.hideLoading();
      var result = res.result || {};
      if (result.success && result.schemeId) {
        wx.showToast({ title: '方案生成已启动', icon: 'none' });
        that.addPollingScheme(result.schemeId);
        that.loadTrendDetail();
      } else {
        that.setData({ selectingDirection: false });
        wx.showToast({ title: result.error || '启动失败', icon: 'none' });
      }
    }).catch(function(err) {
      wx.hideLoading();
      that.setData({ selectingDirection: false });
      wx.showToast({ title: '请求失败: ' + (err.message || ''), icon: 'none' });
    });
  },

  // ---- 文章标题点击 ----
  onTapArticle: function(e) {
    var url = e.currentTarget.dataset.url;
    if (url) {
      wx.setClipboardData({
        data: url,
        success: function() {
          wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none' });
        }
      });
    }
  },

  // ---- 补扣积分 ----
  onRetryDeduct: function() {
    var that = this;
    creditsUtil.spendCredits('special_issue', 30, '特刊策划补扣', that.data.taskId).then(function(res) {
      if (res.success) {
        that.setData({ creditsDeducted: true });
        wx.showToast({ title: '扣费成功', icon: 'success' });
      } else if (!res.insufficient) {
        wx.showToast({ title: '扣费失败，请稍后重试', icon: 'none' });
      }
    });
  },

  // ---- 工具函数 ----
  getDisplayError: function(error) {
    var msg = error || '';
    if (!msg) return '执行失败，请稍后重试';
    if (msg.indexOf('429') >= 0 || msg.indexOf('rate_limit') >= 0 || msg.indexOf('TPD') >= 0) {
      return 'AI 服务今日额度已用完，请稍后重试';
    }
    if (msg.indexOf('超时') >= 0 || msg.indexOf('timeout') >= 0 || msg.indexOf('ETIMEDOUT') >= 0) {
      return 'AI 服务响应超时，请稍后重试';
    }
    if (msg.indexOf('Kimi API') >= 0 || msg.indexOf('openai API') >= 0 || msg.indexOf('deepseek API') >= 0 || msg.indexOf('tencent API') >= 0 || msg.indexOf('alibaba API') >= 0 || msg.indexOf('organization') >= 0 || msg.indexOf('project') >= 0) {
      return 'AI 服务暂时不可用，请稍后重试';
    }
    return '执行失败，请稍后重试';
  },

  formatNumber: function(num) {
    if (!num && num !== 0) return '0';
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  formatTime: function(ts) {
    if (!ts) return '--';
    var d = new Date(ts);
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  getHeatBarWidth: function(heat) {
    return Math.min(heat / 10, 100);
  },

  stopBubble: function() {}
});
