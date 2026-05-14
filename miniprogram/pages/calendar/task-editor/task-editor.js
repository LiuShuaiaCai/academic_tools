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
    reminderMinutes: [1440], // 提前1天提醒
    selectedReminders: [1440],
    isAllDay: false,
    repeatType: 'none',   // none, daily, weekly, monthly
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
      that.setData({
        title: task.title || '',
        description: task.description || '',
        date: that.formatDate(new Date(task.date)),
        time: task.time || '09:00',
        priority: task.priority || 'medium',
        category: task.category || 'custom',
        selectedReminders: task.reminderMinutes || [30],
        isAllDay: task.isAllDay || false,
        repeatType: task.repeatType || 'none',
        repeatEndDate: task.repeatEndDate || ''
      });
    }).catch(e => {
      console.error('加载任务失败', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
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

  // 优先级选择
  onPriorityChange: function(e) {
    const priorities = ['low', 'medium', 'high'];
    this.setData({ priority: priorities[e.detail.value] });
  },

  // 分类选择
  onCategoryChange: function(e) {
    const categories = ['custom', 'study', 'research', 'meeting', 'other'];
    this.setData({ category: categories[e.detail.value] });
  },

  // 全天任务切换
  onAllDayToggle: function() {
    this.setData({ isAllDay: !this.data.isAllDay });
  },

  // 提醒时间选择
  onReminderChange: function(e) {
    const minutes = [30, 60, 1440]; // 30分钟、1小时、1天
    this.setData({ selectedReminders: minutes.map((_, i) => e.detail.value.includes(i)).filter(Boolean).map((_, i) => minutes[e.detail.value.split(',')[i]]) });
  },

  // 重复类型选择
  onRepeatChange: function(e) {
    const repeatTypes = ['none', 'daily', 'weekly', 'monthly'];
    this.setData({ repeatType: repeatTypes[e.detail.value] });
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
      reminderEnabled: true,
      reminderMinutes: this.data.selectedReminders,
      isAllDay: this.data.isAllDay,
      repeatType: this.data.repeatType,
      repeatEndDate: this.data.repeatEndDate,
      completed: false,
      completedTime: null,
      createTime: this.data.taskId ? undefined : new Date(),
      updateTime: new Date()
    };

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
    wx.cloud.database().collection('tasks').doc(this.data.taskId).remove()
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
