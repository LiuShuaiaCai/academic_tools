// pages/specialIssue/specialIssue.js
// V5: 列表页 - 搜索框 + 创建按钮 + 任务列表
var creditsUtil = require('../../utils/credits.js');

Page({
  data: {
    // 搜索
    keyword: '',

    // 列表
    taskList: [],
    loadingList: false,
    listPage: 0,
    listPageSize: 20,
    hasMore: true,

    // 创建弹窗
    showCreateModal: false,
    createKeyword: '',
    createConstraints: '',
    createLoading: false,

    // 进度弹窗
    showProgressModal: false,
    selectedTaskSteps: [],
    selectedTaskProgress: '',
    selectedTaskId: '',

    // 积分
    userCredits: 0
  },

  onLoad: function() {
    this.loadCredits();
    this.loadTaskList(false);
    this.startListPolling();
  },

  onShow: function() {
    this.loadCredits();
    this.loadTaskList(true); // 静默刷新
  },

  onUnload: function() {
    this.stopListPolling();
  },

  // ========== 积分 ==========

  loadCredits: function() {
    var that = this;
    creditsUtil.getCreditsInfo().then(function(info) {
      that.setData({ userCredits: info.credits || 0 });
    }).catch(function() {});
  },

  // ========== 列表加载 ==========

  loadTaskList: function(silent) {
    var that = this;
    if (!silent) {
      that.setData({ loadingList: true, listPage: 0, hasMore: true });
    }

    var page = silent ? 0 : that.data.listPage;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: {
        action: 'list',
        page: page,
        pageSize: that.data.listPageSize,
        keyword: that.data.keyword
      }
    }).then(function(res) {
      var result = res.result;
      console.log('[list] 云函数返回:', JSON.stringify(result));
      if (!result || !result.success) {
        that.setData({ loadingList: false });
        if (!silent) {
          wx.showToast({ title: (result && result.error) || '加载列表失败', icon: 'none' });
        }
        return;
      }

      var list = result.list || [];
      // 预处理列表数据（WXML中避免调用方法）
      list.forEach(function(item) {
        item._statusLabel = that.getStatusLabel(item.status);
        item._statusClass = that.getStatusClass(item.status);
        item._displayError = that.getDisplayError(item.error);
        item._progressPercent = that.getProgressPercent(item);
        item._progressClass = that.getProgressClass(item._progressPercent);
        item._createdTime = that.formatTime(item.createdAt);
        item._completedTime = item.completedAt ? that.formatTime(item.completedAt) : '';
      });

      if (!silent) {
        that.setData({
          taskList: list,
          loadingList: false,
          hasMore: list.length >= that.data.listPageSize
        });
      } else {
        // 静默刷新：更新进行中的任务状态
        var existing = that.data.taskList;
        for (var i = 0; i < list.length; i++) {
          for (var j = 0; j < existing.length; j++) {
            if (existing[j]._id === list[i]._id) {
              existing[j] = list[i];
              break;
            }
          }
        }
        that.setData({ taskList: existing });
      }
    }).catch(function(err) {
      that.setData({ loadingList: false });
      console.error('[list] 加载列表失败:', err);
      if (!silent) {
        wx.showToast({ title: '网络错误: ' + (err.message || '未知'), icon: 'none' });
      }
    });
  },

  loadMoreTasks: function() {
    var that = this;
    if (!that.data.hasMore || that.data.loadingList) return;

    var page = that.data.listPage + 1;
    that.setData({ loadingList: true });
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: {
        action: 'list',
        page: page,
        pageSize: that.data.listPageSize,
        keyword: that.data.keyword
      }
    }).then(function(res) {
      var result = res.result;
      if (!result || !result.success) {
        that.setData({ loadingList: false });
        return;
      }
      var list = result.list || [];
      that.setData({
        taskList: that.data.taskList.concat(list),
        listPage: page,
        loadingList: false,
        hasMore: list.length >= that.data.listPageSize
      });
    }).catch(function(err) {
      that.setData({ loadingList: false });
    });
  },

  // ========== 轮询 ==========

  startListPolling: function() {
    var that = this;
    that._listPollTimer = setInterval(function() {
      var hasProcessing = that.data.taskList.some(function(t) { return t.status === 'processing'; });
      if (hasProcessing) {
        that.loadTaskList(true);
      }
    }, 5000);
  },

  stopListPolling: function() {
    if (this._listPollTimer) {
      clearInterval(this._listPollTimer);
      this._listPollTimer = null;
    }
  },

  // ========== 搜索 ==========

  onKeywordInput: function(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch: function() {
    this.setData({ listPage: 0 });
    this.loadTaskList(false);
  },

  // ========== 创建弹窗 ==========

  onShowCreateModal: function() {
    this.setData({
      showCreateModal: true,
      createKeyword: '',
      createConstraints: ''
    });
  },

  onHideCreateModal: function() {
    this.setData({ showCreateModal: false });
  },

  onCreatKeywordInput: function(e) {
    this.setData({ createKeyword: e.detail.value });
  },

  onCreatConstraintsInput: function(e) {
    this.setData({ createConstraints: e.detail.value });
  },

  onCreateTopicConfirm: function() {
    var that = this;
    var keyword = that.data.createKeyword.trim();
    if (!keyword) {
      wx.showToast({ title: '请输入研究关键词', icon: 'none' });
      return;
    }

    // 1. 检查积分
    var balance = that.data.userCredits;
    if (balance < 30) {
      creditsUtil.showInsufficientDialog(balance, 30);
      return;
    }

    // 2. 直接创建
    that.doCreateTopic(keyword, that.data.createConstraints);
  },

  doCreateTopic: function(keyword, constraints) {
    var that = this;
    that.setData({ createLoading: true });

    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: {
        keyword: keyword,
        constraints: constraints || ''
      }
    }).then(function(res) {
      that.setData({ createLoading: false });
      var result = res.result;
      if (result.success) {
        wx.showToast({ title: '任务创建成功', icon: 'success' });
        // 重置搜索关键词 + 弹窗状态 + 分页
        that.setData({
          showCreateModal: false,
          createKeyword: '',
          createConstraints: '',
          keyword: '',
          listPage: 0
        });
        // 稍等再刷新列表，避免数据库写入延迟
        setTimeout(function() {
          that.loadTaskList(false);
        }, 300);
        that.loadCredits();
      } else {
        wx.showToast({ title: that.getDisplayError(result.error) || '创建失败', icon: 'none' });
      }
    }).catch(function(err) {
      that.setData({ createLoading: false });
      wx.showToast({ title: that.getDisplayError(err.message || '网络错误'), icon: 'none' });
    });
  },

  // ========== 卡片点击 → 进入详情（仅已完成/待选/失败） ==========

  onCardTap: function(e) {
    var taskId = e.currentTarget.dataset.taskid;
    var task = this.data.taskList.find(function(t) { return t._id === taskId; });
    if (!task) return;
    if (task.status === 'processing') {
      wx.showToast({ title: '分析中，请稍后查看', icon: 'none' });
      return;
    }
    // 允许 awaited_selection、completed、failed 进入详情
    wx.navigateTo({
      url: '/pages/specialIssue/detail/detail?taskId=' + taskId + '&keyword=' + encodeURIComponent(task.keyword || '')
    });
  },

  // ========== 重新执行失败任务 ==========

  onRetryTask: function(e) {
    var that = this;
    var taskId = e.currentTarget.dataset.taskid;
    wx.showModal({
      title: '重新执行',
      content: '将从失败阶段继续执行，不重复已完成阶段',
      confirmColor: '#2563EB',
      success: function(res) {
        if (!res.confirm) return;
        wx.showLoading({ title: '重新启动中...' });
        wx.cloud.callFunction({
          name: 'specialIssueAgent',
          data: { action: 'retry', taskId: taskId }
        }).then(function(res) {
          wx.hideLoading();
          if (res.result && res.result.success) {
            wx.showToast({
              title: res.result.phase === 'phase2' ? '已继续第二阶段' : '已重新开始执行',
              icon: 'success'
            });
            that.loadTaskList(false);
          } else {
            wx.showToast({ title: that.getDisplayError(res.result && res.result.error) || '重新执行失败', icon: 'none' });
          }
        }).catch(function(err) {
          wx.hideLoading();
          wx.showToast({ title: that.getDisplayError(err.message || '未知'), icon: 'none' });
        });
      }
    });
  },

  // ========== 删除任务 ==========

  onDeleteTask: function(e) {
    var that = this;
    var taskId = e.currentTarget.dataset.taskid;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该任务吗？',
      confirmColor: '#DC2626',
      success: function(res) {
        if (!res.confirm) return;
        // 先立即从列表中移除（乐观更新）
        var list = that.data.taskList.filter(function(t) { return t._id !== taskId; });
        that.setData({ taskList: list });
        // 后台删除
        wx.cloud.callFunction({
          name: 'specialIssueAgent',
          data: { action: 'delete', taskId: taskId }
        }).then(function(res) {
          if (!res.result || !res.result.success) {
            wx.showToast({ title: '删除失败', icon: 'none' });
            that.loadTaskList(false);
          }
        }).catch(function() {
          wx.showToast({ title: '删除失败', icon: 'none' });
          that.loadTaskList(false);
        });
      }
    });
  },

  // ========== 状态点击 → 查看进度 ==========

  onStatusTap: function(e) {
    var taskId = e.currentTarget.dataset.taskid;
    var task = this.data.taskList.find(function(t) { return t._id === taskId; });
    if (!task) return;
    this.setData({
      showProgressModal: true,
      selectedTaskSteps: task.steps || [],
      selectedTaskProgress: task.progress || '',
      selectedTaskId: taskId
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

  // ========== 跳转详情 ==========

  onViewDetail: function(e) {
    var taskId = e.currentTarget.dataset.taskid;
    var task = this.data.taskList.find(function(t) { return t._id === taskId; });
    var keyword = task ? task.keyword : '';
    wx.navigateTo({
      url: '/pages/specialIssue/detail/detail?taskId=' + taskId + '&keyword=' + encodeURIComponent(keyword)
    });
  },

  // ========== 格式化 ==========

  formatTime: function(ts) {
    if (!ts) return '--';
    var d = new Date(ts);
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  getStatusLabel: function(status) {
    if (status === 'completed') return '已完成';
    if (status === 'awaiting_selection') return '待选方向';
    if (status === 'processing') return '进行中';
    if (status === 'failed') return '失败';
    return '未知';
  },

  getStatusClass: function(status) {
    if (status === 'completed') return 'status-done';
    if (status === 'awaiting_selection') return 'status-select';
    if (status === 'processing') return 'status-ing';
    return 'status-fail';
  },

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

  isPhase2Processing: function(task) {
    // Phase 2 steps 有不同 key (search_papers_2, fetch_authors_2, generate_plan, parse_result_2)
    var steps = task.steps || [];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].key.indexOf('_2') >= 0) return true;
    }
    return false;
  },

  getProgressPercent: function(task) {
    var steps = task.steps || [];
    if (steps.length === 0) return 0;
    var done = steps.filter(function(s) { return s.status === 'completed' || s.status === 'failed'; }).length;
    return Math.round(done / steps.length * 100);
  },

  getProgressClass: function(percent) {
    if (percent >= 100) return 'bar-done';
    if (percent >= 50) return 'bar-half';
    return 'bar-start';
  }
});
