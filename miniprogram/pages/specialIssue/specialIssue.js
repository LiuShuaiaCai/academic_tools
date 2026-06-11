// pages/specialIssue/specialIssue.js
// V5: 列表页 - 搜索框 + 创建按钮 + 任务列表
var i18nUtil = require('../../utils/i18n.js');
var creditsUtil = require('../../utils/credits.js');

Page({
  data: {
    _lang: 'zh',
    locale: {},
    t: null,

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
    var ctx = i18nUtil.createI18n(this);
    this._i18n = ctx;
    this.loadCredits();
    this.loadTaskList(false);
    this.startListPolling();
  },

  onShow: function() {
    if (this._i18n) this._i18n.refresh();
    this.loadCredits();
    this.loadTaskList(true); // 静默刷新
  },

  onUnload: function() {
    this.stopListPolling();
  },

  i18n: function(key, lang) {
    return i18nUtil.translate(key, lang || this.data._lang);
  },

  // ========== 积分 ==========

  loadCredits: function() {
    var that = this;
    creditsUtil.getCreditsInfo().then(function(info) {
      that.setData({ userCredits: info.balance || 0 });
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
      if (!result || !result.success) {
        that.setData({ loadingList: false });
        return;
      }

      var list = result.list || [];
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

    // 2. 确认弹窗
    wx.showModal({
      title: '确认创建',
      content: '创建「' + keyword + '」话题将消耗 30 积分\n当前余额：' + balance + ' 积分',
      confirmText: '确认创建(30积分)',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          that.doCreateTopic(keyword, that.data.createConstraints);
        }
      }
    });
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
        that.setData({
          showCreateModal: false,
          createKeyword: '',
          createConstraints: '',
          listPage: 0
        });
        that.loadTaskList(false);
        that.loadCredits(); // 刷新积分
      } else {
        wx.showToast({ title: result.error || '创建失败', icon: 'none' });
      }
    }).catch(function(err) {
      that.setData({ createLoading: false });
      wx.showToast({ title: '创建失败: ' + (err.message || '网络错误'), icon: 'none' });
    });
  },

  // ========== 进度弹窗 ==========

  onShowProgress: function(e) {
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
    if (status === 'processing') return '进行中';
    if (status === 'failed') return '失败';
    return '未知';
  },

  getStatusClass: function(status) {
    if (status === 'completed') return 'status-done';
    if (status === 'processing') return 'status-ing';
    return 'status-fail';
  },

  getProgressPercent: function(task) {
    var steps = task.steps || [];
    if (steps.length === 0) return 0;
    var done = steps.filter(function(s) { return s.status === 'completed'; }).length;
    return Math.round(done / steps.length * 100);
  },

  getProgressClass: function(percent) {
    if (percent >= 100) return 'bar-done';
    if (percent >= 50) return 'bar-half';
    return 'bar-start';
  }
});
