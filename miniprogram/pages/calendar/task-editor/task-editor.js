// pages/calendar/task-editor/task-editor.js
// 自定义任务编辑器页面

const app = getApp();
var reminderCheck = require('../../utils/reminder-check');

Page({
  data: {
    taskId: '',           // 编辑时存在
    title: '',
    description: '',
    date: '',             // 任务日期 YYYY-MM-DD
    time: '09:00',        // 提醒时间
    priority: 'medium',   // low, medium, high
    category: 'custom',   // custom, study, research, meeting, other
    categoryOptions: [
      { key: 'custom', name: '自定义', icon: '📝' },
      { key: 'study', name: '学习', icon: '📚' },
      { key: 'research', name: '研究', icon: '🔬' },
      { key: 'meeting', name: '会议', icon: '👥' },
      { key: 'other', name: '其他', icon: '📋' }
    ],
    categoryName: '自定义',
    categoryIcon: '📝',
    reminderMinutes: [1440], // 提前1天提醒
    selectedReminders: [1440],
    isAllDay: false,
    repeatType: 'none',   // none, daily, weekly, monthly
    repeatOptions: [
      { key: 'none', name: '不重复' },
      { key: 'daily', name: '每天' },
      { key: 'weekly', name: '每周' },
      { key: 'monthly', name: '每月' }
    ],
    repeatName: '不重复',
    repeatEndDate: '',
    loading: false,
    deleteConfirm: false,
    showQuotaTip: false
  },

  onLoad: function(options) {
    if (options.taskId) {
      this.setData({ taskId: options.taskId });
      wx.setNavigationBarTitle({ title: '编辑任务' });
      this.loadTask(options.taskId);
    } else {
      // 新建任务，默认日期为今天
      const now = new Date();
      this.setData({
        date: this.formatDate(now)
      });
    }
  },

  formatDate: function(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  loadTask: function(taskId) {
    const that = this;
    const db = wx.cloud.database();

    db.collection('tasks').doc(taskId).get().then(res => {
      const task = res.data;
      const category = task.category || 'custom';
      const repeatType = task.repeatType || 'none';
      const catOpt = that.data.categoryOptions.find(c => c.key === category);
      const repOpt = that.data.repeatOptions.find(r => r.key === repeatType);
      that.setData({
        title: task.title || '',
        description: task.description || '',
        date: that.formatDate(new Date(task.date)),
        time: task.time || '09:00',
        priority: task.priority || 'medium',
        category: category,
        categoryName: catOpt ? catOpt.name : '自定义',
        categoryIcon: catOpt ? catOpt.icon : '📝',
        selectedReminders: task.reminderMinutes || [1440],
        isAllDay: task.isAllDay || false,
        repeatType: repeatType,
        repeatName: repOpt ? repOpt.name : '不重复',
        repeatEndDate: task.repeatEndDate || ''
      });
    }).catch(e => {
      console.error('加载任务失败', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 更新分类显示
  updateCategoryDisplay: function(category) {
    const catOpt = this.data.categoryOptions.find(c => c.key === category);
    this.setData({
      category: category,
      categoryName: catOpt ? catOpt.name : '自定义',
      categoryIcon: catOpt ? catOpt.icon : '📝'
    });
  },

  // 更新重复显示
  updateRepeatDisplay: function(repeatType) {
    const repOpt = this.data.repeatOptions.find(r => r.key === repeatType);
    this.setData({
      repeatType: repeatType,
      repeatName: repOpt ? repOpt.name : '不重复'
    });
  },

  // 标题输入
  onTitleInput: function(e) {
    this.setData({ title: e.detail.value });
  },

  // 描述输入
  onDescInput: function(e) {
    this.setData({ description: e.detail.value });
  },

  // 日期选择
  onDateChange: function(e) {
    this.setData({ date: e.detail.value });
  },

  // 时间选择
  onTimeChange: function(e) {
    this.setData({ time: e.detail.value });
  },

  // 优先级选择（点击方式）
  onPriorityChange: function(e) {
    const priority = e.currentTarget.dataset.priority;
    if (priority) {
      this.setData({ priority: priority });
    }
  },

  // 分类选择（picker方式）
  onCategoryChange: function(e) {
    const index = e.detail.value;
    const option = this.data.categoryOptions[index];
    if (option) {
      this.updateCategoryDisplay(option.key);
    }
  },

  // 全天任务切换
  onAllDayToggle: function() {
    this.setData({ isAllDay: !this.data.isAllDay });
  },

  // 提醒时间选择
  onReminderChange: function(e) {
    const values = e.detail.value; // 字符串数组如 ['30', '1440']
    const minutes = values.map(Number);
    this.setData({ selectedReminders: minutes });
  },

  // 重复类型选择（picker方式）
  onRepeatChange: function(e) {
    const index = e.detail.value;
    const option = this.data.repeatOptions[index];
    if (option) {
      this.updateRepeatDisplay(option.key);
    }
  },

  // 重复结束日期
  onRepeatEndChange: function(e) {
    this.setData({ repeatEndDate: e.detail.value });
  },

  // 保存任务
  saveTask: function() {
    if (!this.data.title.trim()) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    const taskData = {
      title: this.data.title.trim(),
      description: this.data.description.trim(),
      date: this.data.date,
      time: this.data.isAllDay ? '' : this.data.time,
      priority: this.data.priority,
      category: this.data.category,
      reminderEnabled: this.data.selectedReminders.length > 0,
      reminderMinutes: this.data.selectedReminders,
      isAllDay: this.data.isAllDay,
      repeatType: this.data.repeatType,
      repeatEndDate: this.data.repeatEndDate,
      updateTime: new Date()
    };

    // 新建时才设置 completed 和 createTime
    if (!this.data.taskId) {
      taskData.completed = false;
      taskData.completedTime = null;
      taskData.createTime = new Date();
    }

    const db = wx.cloud.database();
    const that = this;

    let savePromise;
    if (this.data.taskId) {
      // 更新
      savePromise = db.collection('tasks').doc(this.data.taskId).update({ data: taskData });
    } else {
      // 新增
      savePromise = db.collection('tasks').add({ data: taskData });
    }

    savePromise.then(res => {
      that.setData({ loading: false });
      wx.showToast({ title: '保存成功', icon: 'success' });
      // 通知前序页面刷新
      var pages = getCurrentPages();
      var prevPage = pages[pages.length - 2];
      if (prevPage) {
        if (typeof prevPage.loadDailyTasks === 'function') {
          prevPage.loadDailyTasks();
        } else if (typeof prevPage.loadMonthEvents === 'function') {
          prevPage.loadMonthEvents();
        }
      }
      reminderCheck.checkAndShowTip(that).catch(err => console.error('[task-editor] 额度检查失败', err));
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }).catch(e => {
      that.setData({ loading: false });
      console.error('保存失败', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  // 删除任务
  showDeleteConfirm: function() {
    this.setData({ deleteConfirm: true });
  },

  cancelDelete: function() {
    this.setData({ deleteConfirm: false });
  },

  confirmDelete: function() {
    if (!this.data.taskId) return;

    const that = this;
    wx.cloud.database().collection('tasks').doc(this.data.taskId).update({
      data: {
        deleteTime: new Date(),
        updateTime: new Date()
      }
    })
      .then(() => {
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      })
      .catch(e => {
        wx.showToast({ title: '删除失败', icon: 'none' });
      });
  },

  onQuotaTipCancel: function() {
    this.setData({ showQuotaTip: false });
  },
  onQuotaTipConfirm: function() {
    this.setData({ showQuotaTip: false });
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  // 完成并继续添加
  completeAndAdd: function() {
    // 先保存当前任务
    this.saveTask();
  }
});
