// pages/calendar/daily-tasks/daily-tasks.js
// 每日任务页面

Page({
  data: {
    selectedDate: '',
    selectedDateLabel: '',
    tasks: [],
    completedTasks: [],
    pendingTasks: [],
    loading: false,
    refreshing: false,
    showAddSheet: false,
    quickAddTitle: '',
    // 学术任务模板
    academicTemplates: [
      { icon: '📚', title: '文献阅读', desc: '阅读论文/书籍' },
      { icon: '✍️', title: '论文写作', desc: '撰写或修改论文' },
      { icon: '📊', title: '数据分析', desc: '处理实验数据' },
      { icon: '🔬', title: '实验记录', desc: '记录实验过程' },
      { icon: '📧', title: '邮件回复', desc: '回复学术邮件' },
      { icon: '📝', title: '会议笔记', desc: '整理会议内容' },
      { icon: '🎓', title: '组会汇报', desc: '准备组会汇报' },
      { icon: '📄', title: '论文投稿', desc: '提交论文' }
    ],
    // 统计数据
    stats: {
      total: 0,
      completed: 0,
      pending: 0,
      completionRate: 0
    }
  },

  onLoad: function(options) {
    if (options.date) {
      this.setData({ selectedDate: options.date });
    } else {
      this.setData({ selectedDate: this.formatDate(new Date()) });
    }
    this.loadDailyTasks();
  },

  prevDay: function() {
    const d = new Date(this.data.selectedDate);
    d.setDate(d.getDate() - 1);
    this.setData({ selectedDate: this.formatDate(d), loading: true });
    this.loadDailyTasks();
  },

  nextDay: function() {
    const d = new Date(this.data.selectedDate);
    d.setDate(d.getDate() + 1);
    this.setData({ selectedDate: this.formatDate(d), loading: true });
    this.loadDailyTasks();
  },

  goToToday: function() {
    this.setData({ selectedDate: this.formatDate(new Date()), loading: true });
    this.loadDailyTasks();
  },

  onShow: function() {
    this.loadDailyTasks();
  },

  onPullDownRefresh: function() {
    this.setData({ refreshing: true });
    this.loadDailyTasks();
  },

  formatDate: function(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  getWeekday: function(dateStr) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const d = new Date(dateStr);
    return weekdays[d.getDay()];
  },

  loadDailyTasks: function() {
    const that = this;
    const selectedDate = this.data.selectedDate;
    const db = wx.cloud.database();
    const _ = db.command;

    // 计算日期范围
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 查询该日期的任务
    db.collection('tasks').where({
      deleteTime: null,
      date: selectedDate
    }).get().then(res => {
      const tasks = res.data || [];
      const completedTasks = tasks.filter(t => t.completed);
      const pendingTasks = tasks.filter(t => !t.completed);

      that.setData({
        tasks: tasks,
        completedTasks: completedTasks,
        pendingTasks: pendingTasks,
        selectedDateLabel: that.getDateLabel(selectedDate),
        refreshing: false,
        loading: false
      });

      that.calculateStats(tasks, completedTasks);
      wx.stopPullDownRefresh();
    }).catch(e => {
      console.error('加载任务失败', e);
      that.setData({ refreshing: false, loading: false });
      wx.stopPullDownRefresh();
    });
  },

  getDateLabel: function(dateStr) {
    const today = this.formatDate(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = this.formatDate(yesterday);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = this.formatDate(tomorrow);

    if (dateStr === today) return '今天';
    if (dateStr === yesterdayStr) return '昨天';
    if (dateStr === tomorrowStr) return '明天';
    
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = this.getWeekday(dateStr);
    return `${month}月${day}日 ${weekday}`;
  },

  calculateStats: function(tasks, completedTasks) {
    const total = tasks.length;
    const completed = completedTasks.length;
    const pending = total - completed;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    this.setData({
      stats: { total, completed, pending, completionRate }
    });
  },

  // 切换任务完成状态
  toggleTaskComplete: function(e) {
    const taskId = e.currentTarget.dataset.id;
    const task = this.data.tasks.find(t => t._id === taskId);
    if (!task) return;

    const that = this;
    wx.cloud.database().collection('tasks').doc(taskId).update({
      data: {
        completed: !task.completed,
        completedTime: !task.completed ? new Date() : null,
        updateTime: new Date()
      }
    }).then(() => {
      that.loadDailyTasks();
    }).catch(e => {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  // 显示添加任务弹窗
  showAddTask: function() {
    this.setData({ showAddSheet: true, quickAddTitle: '' });
  },

  hideAddTask: function() {
    this.setData({ showAddSheet: false });
  },

  // 快速添加任务
  onQuickAddInput: function(e) {
    this.setData({ quickAddTitle: e.detail.value });
  },

  // 从模板添加
  addFromTemplate: function(e) {
    const template = this.data.academicTemplates[e.currentTarget.dataset.index];
    this.setData({ quickAddTitle: template.title });
  },

  // 确认添加任务
  confirmAddTask: function() {
    const title = this.data.quickAddTitle.trim();
    if (!title) {
      wx.showToast({ title: '请输入任务名称', icon: 'none' });
      return;
    }

    const that = this;
    wx.cloud.database().collection('tasks').add({
      data: {
        title: title,
        description: '',
        date: this.data.selectedDate,
        time: '',
        priority: 'medium',
        category: 'custom',
        reminderEnabled: false,
        reminderMinutes: [1440],
        isAllDay: true,
        repeatType: 'none',
        completed: false,
        completedTime: null,
        createTime: new Date(),
        updateTime: new Date()
      }
    }).then(() => {
      that.hideAddTask();
      that.loadDailyTasks();
      wx.showToast({ title: '添加成功', icon: 'success' });
    }).catch(e => {
      wx.showToast({ title: '添加失败', icon: 'none' });
    });
  },

  // 跳转到任务编辑器
  goToTaskEditor: function(e) {
    const taskId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/calendar/task-editor/task-editor?taskId=${taskId}`
    });
  },

  // 创建新任务（完整编辑器）
  createFullTask: function() {
    wx.navigateTo({
      url: `/pages/calendar/task-editor/task-editor?date=${this.data.selectedDate}`
    });
    this.hideAddTask();
  },

  // 删除任务
  deleteTask: function(e) {
    const taskId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.database().collection('tasks').doc(taskId).remove()
            .then(() => {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadDailyTasks();
            })
            .catch(() => {
              wx.showToast({ title: '删除失败', icon: 'none' });
            });
        }
      }
    });
  },

  // 全部标记完成
  markAllComplete: function() {
    const pendingIds = this.data.pendingTasks.map(t => t._id);
    if (pendingIds.length === 0) return;

    const batch = wx.cloud.database().batch();
    pendingIds.forEach(id => {
      batch.update(wx.cloud.database().collection('tasks').doc(id), {
        data: {
          completed: true,
          completedTime: new Date(),
          updateTime: new Date()
        }
      });
    });

    batch.commit().then(() => {
      this.loadDailyTasks();
      wx.showToast({ title: '已全部完成', icon: 'success' });
    }).catch(() => {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  // 清除已完成
  clearCompleted: function() {
    const completedIds = this.data.completedTasks.map(t => t._id);
    if (completedIds.length === 0) return;

    wx.showModal({
      title: '确认清除',
      content: `确定要清除 ${completedIds.length} 个已完成任务吗？`,
      success: (res) => {
        if (res.confirm) {
          const batch = wx.cloud.database().batch();
          completedIds.forEach(id => {
            batch.remove(wx.cloud.database().collection('tasks').doc(id));
          });

          batch.commit().then(() => {
            this.loadDailyTasks();
            wx.showToast({ title: '已清除', icon: 'success' });
          }).catch(() => {
            wx.showToast({ title: '清除失败', icon: 'none' });
          });
        }
      }
    });
  },

  // 获取优先级颜色
  getPriorityColor: function(priority) {
    const colors = {
      low: '#10B981',
      medium: '#F59E0B',
      high: '#EF4444'
    };
    return colors[priority] || colors.medium;
  },

  // 获取分类图标
  getCategoryIcon: function(category) {
    const icons = {
      custom: '📝',
      study: '📚',
      research: '🔬',
      meeting: '👥',
      other: '📋'
    };
    return icons[category] || icons.custom;
  }
});
