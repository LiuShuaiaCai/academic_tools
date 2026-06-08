// pages/calendar/calendar.js

Page({
  data: {
    currentYear: 0, currentMonth: 0, currentView: 'month',
    calendarDays: [], weekDays: [], monthEvents: [],
    selectedDate: '', selectedDateLabel: '', selectedEvents: [],
    dayEvents: [], eventDates: {},
    listEvents: [], // 列表视图专用数据，避免覆盖 monthEvents
    weekRangeLabel: '', // 周视图日期范围标签
    // 加载状态
    isLoading: false,
    currentOpenid: '', // 当前用户的 openid
    // 任务相关
    tasks: [],
    taskTypes: ['submission', 'review', 'conference', 'task'],
    taskDotColors: {
      submission: '#2563eb',
      review: '#EF4444',
      conference: '#10B981',
      task: '#8B5CF6'
    },
    filteredEvents: [],
    pendingEvents: [],
    completedEvents: [],
    dayStats: { total: 0, completed: 0, pending: 0, completionRate: 0 },
    listMonthStats: { total: 0, completed: 0, pending: 0, completionRate: 0 },

    // 弹窗添加/编辑任务
    showTaskModal: false,
    modalMode: 'add',
    modalEditId: '',
    modalTitle: '',
    modalDesc: '',
    modalDate: '',
    modalTime: '09:00',
    modalReminder: null,
    academicTemplates: [
      { icon: '📚', title: '文献阅读', desc: '阅读论文/书籍' },
      { icon: '✍️', title: '论文写作', desc: '撰写或修改论文' },
      { icon: '📊', title: '数据分析', desc: '处理实验数据' },
      { icon: '🔬', title: '实验记录', desc: '记录实验过程' },
      { icon: '📧', title: '邮件回复', desc: '回复学术邮件' },
      { icon: '📝', title: '会议笔记', desc: '整理会议内容' },
      { icon: '🎓', title: '组会汇报', desc: '准备组会汇报' },
      { icon: '📄', title: '论文投稿', desc: '提交论文' }
    ]
  },

  onLoad: function() {
    var that = this;
    var now = new Date();
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
      selectedDate: this.formatDate(now)
    });
    // 获取当前用户的 openid
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserId' }
    }).then(function(res) {
      that.setData({ currentOpenid: res.result.openid });
      that.loadMonthEvents();
    }).catch(function() {
      that.loadMonthEvents();
    });
  },

  onShow: function() {
    // 每次显示时重新加载数据，确保从详情页返回后数据是最新的
    this.loadMonthEvents();
  },

  formatDate: function(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  formatDeadlineLabel: function(d) {
    if (!d) return '';
    var date = new Date(String(d).replace(' ', 'T'));
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  },

  parseDate: function(str) {
    if (!str) return new Date(NaN);
    return new Date(String(str).replace(' ', 'T'));
  },

  formatEvent: function(e) {
    var typeMeta = {
      submission: { iconEmoji: '📄', pagePath: '/pages/submissions/submissions' },
      review: { iconEmoji: '📝', pagePath: '/pages/reviews/reviews' },
      conference: { iconEmoji: '🎤', pagePath: '/pages/conferences/conferences' },
      task: { iconEmoji: '📋', pagePath: '/pages/calendar/task-editor/task-editor' }
    };
    var meta = typeMeta[e.type] || { iconEmoji: '📋', pagePath: '' };
    var deadline = e.deadline || e.date;
    var dIso = deadline ? String(deadline).replace(' ', 'T') : '';
    var daysLeft = dIso ? Math.ceil((new Date(dIso) - new Date()) / (1000 * 60 * 60 * 24)) : 0;

    var label = this.formatDeadlineLabel(deadline);
    if (e.type === 'task' && e.time) {
      label += ' ' + e.time;
    }
    return Object.assign({}, e, {
      iconEmoji: meta.iconEmoji,
      pagePath: meta.pagePath,
      deadlineLabel: label,
      countdownLabel: e.completed ? '已完成' : (daysLeft <= 0 ? '已超期' : daysLeft + '天'),
      urgent: e.completed ? false : (daysLeft <= 7)
    });
  },

  applyFilters: function() {
    var that = this;
    var monthEvents = this.data.monthEvents;
    var filteredEvents = monthEvents;

    var eventDates = {};
    var eventCounts = {};
    filteredEvents.forEach(function(i) {
      var d = that.formatDate(that.parseDate(i.date));
      eventCounts[d] = (eventCounts[d] || 0) + 1;
      if (!eventDates[d]) eventDates[d] = [];
      if (eventDates[d].indexOf(i.type) === -1) {
        eventDates[d].push(i.type);
      }
    });

    this.setData({ filteredEvents: filteredEvents, eventDates: eventDates, eventCounts: eventCounts });

    var view = this.data.currentView;
    if (view === 'list') this.buildListview();
    else if (view === 'week') this.buildWeekView();
    else this.buildCalendar();
    this.loadSelectedEvents();
  },

  switchView: function(e) {
    var view = e.currentTarget.dataset.view;
    this.setData({ currentView: view });
    if (view === 'week') this.buildWeekView();
    else if (view === 'list') this.buildListview();
    else this.buildCalendar();
  },

  // 同步选中日期对应的年月
  syncYearMonthFromDate: function(dateStr) {
    var d = new Date(dateStr);
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    if (y !== this.data.currentYear || m !== this.data.currentMonth) {
      this.setData({ currentYear: y, currentMonth: m });
      this.loadMonthEvents();
      return true;
    }
    return false;
  },

  loadMonthEvents: function() {
    var that = this;
    var currentYear = this.data.currentYear;
    var currentMonth = this.data.currentMonth;

    // 防止重复加载
    if (this.data.isLoading) {
      return;
    }
    this.setData({ isLoading: true });

    var db = wx.cloud.database();
    var _ = db.command;

    // 统一使用本地日期字符串比较，避免时区问题
    var startDateStr = currentYear + '-' + String(currentMonth).padStart(2, '0') + '-01';
    var nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    var nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    var endDateStr = nextYear + '-' + String(nextMonth).padStart(2, '0') + '-01';

    Promise.all([
      // 投稿
      db.collection('submissions').where({ _openid: that.data.currentOpenid, deadline: _.gte(startDateStr).and(_.lt(endDateStr)) }).get().catch(function() { return { data: [] }; }),
      // 审稿
      db.collection('reviews').where({ _openid: that.data.currentOpenid, deadline: _.gte(startDateStr).and(_.lt(endDateStr)) }).get().catch(function() { return { data: [] }; }),
      // 会议 - deadline
      db.collection('conferences').where({ _openid: that.data.currentOpenid, deadline: _.gte(startDateStr).and(_.lt(endDateStr)) }).get().catch(function() { return { data: [] }; }),
      // 会议 - 按开始日期显示（只要填写了 startDate 就显示在日历上）
      db.collection('conferences').where({
        _openid: that.data.currentOpenid,
        deleteTime: null,
        startDate: _.exists(true).and(_.neq('')).and(_.gte(startDateStr)).and(_.lt(endDateStr))
      }).get().catch(function() { return { data: [] }; }),
      // 任务 - 按月份字符串筛选（包含已完成，在日历上展示所有事件）
      db.collection('tasks').where({
        _openid: that.data.currentOpenid,
        date: _.gte(startDateStr).and(_.lt(endDateStr))
      }).get().catch(function() { return { data: [] }; })
    ]).then(function(results) {
      var subRes = results[0], revRes = results[1], confRes = results[2], urgentConfRes = results[3], taskRes = results[4];
      var eventDates = {};
      var eventCounts = {};
      var monthEvents = [];

      // 投稿（过滤已删除）
      subRes.data.filter(function(i) { return !i.deleteTime; }).forEach(function(i) { monthEvents.push({ _id: i._id, title: i.title, journal: i.journal, type: 'submission', typeLabel: '投稿', date: i.deadline, deadline: i.deadline, completed: i.completed || false }); });
      // 审稿（过滤已删除）
      revRes.data.filter(function(i) { return !i.deleteTime; }).forEach(function(i) { monthEvents.push({ _id: i._id, paperTitle: i.paperTitle, journal: i.journal, type: 'review', typeLabel: '审稿', date: i.deadline, deadline: i.deadline, completed: i.completed || false }); });
      // 会议（过滤已删除）
      confRes.data.filter(function(i) { return !i.deleteTime; }).forEach(function(i) { monthEvents.push({ _id: i._id, name: i.name, location: i.location, type: 'conference', typeLabel: '会议', date: i.deadline, deadline: i.deadline, completed: i.completed || false }); });
      // 会议 - 按开始日期显示（有状态的）
      urgentConfRes.data.forEach(function(i) { monthEvents.push({ _id: i._id, name: i.name, location: i.location, type: 'conference', typeLabel: '会议', date: i.startDate, deadline: i.startDate, completed: i.completed || false }); });
      // 任务（过滤已删除）
      taskRes.data.filter(function(i) { return !i.deleteTime; }).forEach(function(i) {
        monthEvents.push({
          _id: i._id,
          title: i.title,
          description: i.description,
          type: 'task',
          typeLabel: '任务',
          date: i.date,
          time: i.time,
          reminderEnabled: i.reminderEnabled,
          reminderMinutes: i.reminderMinutes,
          completed: i.completed
        });
      });

      monthEvents.sort(function(a, b) { return that.parseDate(a.date) - that.parseDate(b.date); });
      monthEvents = monthEvents.map(function(e) { return that.formatEvent(e); });
      monthEvents.forEach(function(i) {
        var d = that.formatDate(that.parseDate(i.date));
        eventCounts[d] = (eventCounts[d] || 0) + 1;
        if (!eventDates[d]) eventDates[d] = [];
        if (eventDates[d].indexOf(i.type) === -1) {
          eventDates[d].push(i.type);
        }
      });

      that.setData({ monthEvents: monthEvents, isLoading: false });
      that.applyFilters();
    }).catch(function(e) {
      console.error('[日历] 加载失败', e);
      that.setData({ isLoading: false });
      var view = that.data.currentView;
      if (view === 'week') that.buildWeekView();
      else if (view === 'month') that.buildCalendar();
      else if (view === 'list') that.buildListview();
    });
  },

  buildCalendar: function() {
    var currentYear = this.data.currentYear;
    var currentMonth = this.data.currentMonth;
    var eventDates = this.data.eventDates;
    var selectedDate = this.data.selectedDate;
    var firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
    var daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    var today = this.formatDate(new Date());
    var days = [];
    var i;

    for (i = 0; i < firstDay; i++) days.push({ empty: true });
    var eventCounts = this.data.eventCounts;
    for (i = 1; i <= daysInMonth; i++) {
      var dateStr = currentYear + '-' + String(currentMonth).padStart(2, '0') + '-' + String(i).padStart(2, '0');
      days.push({ day: i, dateStr: dateStr, isToday: dateStr === today, isSelected: dateStr === selectedDate, events: eventDates[dateStr] || [], eventCount: eventCounts[dateStr] || 0 });
    }
    this.setData({ calendarDays: days });
  },

  buildWeekView: function() {
    var that = this;
    var selectedDate = this.data.selectedDate;
    var eventDates = this.data.eventDates;
    var monthEvents = this.data.monthEvents;
    var baseDate = selectedDate ? new Date(selectedDate) : new Date();
    var dayOfWeek = baseDate.getDay();
    var weekStart = new Date(baseDate);
    weekStart.setDate(baseDate.getDate() - dayOfWeek);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    var weekDays = [];
    var dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    var today = that.formatDate(new Date());

    // 计算每天的事件总数
    var dateEventCount = {};
    var filteredEvents = this.data.filteredEvents;
    filteredEvents.forEach(function(e) {
      var d = that.formatDate(that.parseDate(e.date));
      dateEventCount[d] = (dateEventCount[d] || 0) + 1;
    });

    for (var i = 0; i < 7; i++) {
      var d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      var dateStr = that.formatDate(d);
      weekDays.push({
        day: d.getDate(),
        dayName: dayNames[i],
        dateStr: dateStr,
        isToday: dateStr === today,
        isSelected: dateStr === selectedDate,
        events: eventDates[dateStr] || [],
        eventCount: dateEventCount[dateStr] || 0
      });
    }

    var weekLabel = that.buildWeekRangeLabel(weekStart, weekEnd);
    this.setData({ weekDays: weekDays, weekRangeLabel: weekLabel });
  },

  buildWeekRangeLabel: function(start, end) {
    var sy = start.getFullYear();
    var sm = start.getMonth() + 1;
    var sd = start.getDate();
    var ey = end.getFullYear();
    var em = end.getMonth() + 1;
    var ed = end.getDate();
    if (sy === ey) {
      if (sm === em) {
        return sm + '月' + sd + '日 - ' + ed + '日';
      }
      return sm + '月' + sd + '日 - ' + em + '月' + ed + '日';
    }
    return sy + '年' + sm + '月' + sd + '日 - ' + ey + '年' + em + '月' + ed + '日';
  },

  buildListview: function() {
    var that = this;
    var filteredEvents = this.data.filteredEvents;

    // 按日期分组
    var groups = {};
    filteredEvents.forEach(function(item) {
      var d = that.formatDate(that.parseDate(item.date));
      if (!groups[d]) groups[d] = [];
      groups[d].push(item);
    });

    var sortedDates = Object.keys(groups).sort();
    var today = that.formatDate(new Date());
    var tomorrow = that.formatDate(new Date(Date.now() + 86400000));
    var dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    var listGroups = sortedDates.map(function(dateStr) {
      var date = new Date(dateStr);
      var weekLabel = '';
      if (dateStr === today) {
        weekLabel = '今天';
      } else if (dateStr === tomorrow) {
        weekLabel = '明天';
      } else {
        weekLabel = dayNames[date.getDay()];
      }
      // 同一日期内：未完成的排在上面
      var events = groups[dateStr].sort(function(a, b) {
        var aDone = a.completed ? 1 : 0;
        var bDone = b.completed ? 1 : 0;
        return aDone - bDone;
      });
      var dateLabel = (date.getMonth() + 1) + '月' + date.getDate() + '日';
      return {
        dateStr: dateStr,
        dateLabel: dateLabel,
        dateSub: weekLabel,
        events: events
      };
    });

    // 当月统计
    var total = filteredEvents.length;
    var completed = filteredEvents.filter(function(e) { return e.completed; }).length;
    var pending = total - completed;
    var completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    this.setData({
      listGroups: listGroups,
      listMonthStats: { total: total, completed: completed, pending: pending, completionRate: completionRate }
    });
  },

  toggleTaskComplete: function(e) {
    var id = e.currentTarget.dataset.id;
    var type = e.currentTarget.dataset.type;
    var that = this;

    var collectionMap = {
      task: 'tasks',
      submission: 'submissions',
      review: 'reviews',
      conference: 'conferences'
    };
    var collectionName = collectionMap[type];
    if (!collectionName) return;

    var item = null;
    this.data.monthEvents.forEach(function(evt) {
      if (evt._id === id && evt.type === type) {
        item = evt;
      }
    });
    if (!item) return;

    var newCompleted = !item.completed;

    wx.cloud.database().collection(collectionName).doc(id).update({
      data: {
        completed: newCompleted,
        completedTime: newCompleted ? new Date() : null,
        updateTime: new Date()
      }
    }).then(function() {
      var monthEvents = that.data.monthEvents;
      monthEvents.forEach(function(evt) {
        if (evt._id === id && evt.type === type) {
          evt.completed = newCompleted;
          var deadline = evt.deadline || evt.date;
          var dIso = deadline ? String(deadline).replace(' ', 'T') : '';
          var daysLeft = dIso ? Math.ceil((new Date(dIso) - new Date()) / (1000 * 60 * 60 * 24)) : 0;
          evt.countdownLabel = newCompleted ? '已完成' : (daysLeft <= 0 ? '已超期' : daysLeft + '天');
          evt.urgent = newCompleted ? false : (daysLeft <= 7);
        }
      });
      that.setData({ monthEvents: monthEvents });
      that.applyFilters();
    }).catch(function() {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  loadSelectedEvents: function() {
    var that = this;
    var selectedDate = this.data.selectedDate;
    if (!selectedDate) { 
      this.setData({ 
        selectedEvents: [], 
        selectedDateLabel: '',
        pendingEvents: [],
        completedEvents: [],
        dayStats: { total: 0, completed: 0, pending: 0, completionRate: 0 }
      }); 
      return; 
    }
    var selectedEvents = this.data.filteredEvents.filter(function(e) {
      return that.formatDate(that.parseDate(e.date)) === selectedDate;
    });
    
    var pendingEvents = selectedEvents.filter(function(e) { return !e.completed; });
    var completedEvents = selectedEvents.filter(function(e) { return e.completed; });
    var total = selectedEvents.length;
    var completed = completedEvents.length;
    var pending = total - completed;
    var completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    this.setData({ 
      selectedEvents: selectedEvents, 
      selectedDateLabel: selectedDate,
      pendingEvents: pendingEvents,
      completedEvents: completedEvents,
      dayStats: { total: total, completed: completed, pending: pending, completionRate: completionRate }
    });
  },

  // 删除任务（软删除）
  deleteTask: function(e) {
    var taskId = e.currentTarget.dataset.id;
    var that = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？',
      success: function(res) {
        if (res.confirm) {
          wx.cloud.database().collection('tasks').doc(taskId).update({
            data: {
              deleteTime: new Date(),
              updateTime: new Date()
            }
          }).then(function() {
            wx.showToast({ title: '已删除', icon: 'success' });
            that.loadMonthEvents();
          }).catch(function() {
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  goToItem: function(e) {
    var pagePath = e.currentTarget.dataset.page;
    var id = e.currentTarget.dataset.id;
    var title = e.currentTarget.dataset.title || '';
    var type = e.currentTarget.dataset.type;

    if (type === 'task') {
      this.showEditTaskModal(id);
    } else if (pagePath) {
      var url = pagePath + '?targetId=' + id;
      if (title) url += '&targetTitle=' + encodeURIComponent(title) + '&autoEdit=true';
      wx.navigateTo({ url: url });
    }
  },

  showEditTaskModal: function(taskId) {
    var task = null;
    var monthEvents = this.data.monthEvents;
    for (var i = 0; i < monthEvents.length; i++) {
      if (monthEvents[i]._id === taskId && monthEvents[i].type === 'task') {
        task = monthEvents[i];
        break;
      }
    }
    if (!task) {
      wx.showToast({ title: '未找到任务', icon: 'none' });
      return;
    }
    var reminder = null;
    if (task.reminderEnabled && task.reminderMinutes && task.reminderMinutes.length > 0) {
      reminder = task.reminderMinutes[0];
    }
    this.setData({
      showTaskModal: true,
      modalMode: 'edit',
      modalEditId: taskId,
      modalTitle: task.title || '',
      modalDesc: task.description || '',
      modalDate: task.date || this.formatDate(new Date()),
      modalTime: task.time || '09:00',
      modalReminder: reminder
    });
  },

  prevMonth: function() {
    if (this.data.currentView === 'week') {
      // 周视图：切换到上一周
      var d = new Date(this.data.selectedDate);
      d.setDate(d.getDate() - 7);
      var dateStr = this.formatDate(d);
      var y = d.getFullYear();
      var m = d.getMonth() + 1;
      if (y !== this.data.currentYear || m !== this.data.currentMonth) {
        this.setData({ currentYear: y, currentMonth: m, selectedDate: dateStr });
        this.loadMonthEvents();
      } else {
        this.setData({ selectedDate: dateStr });
        this.buildWeekView();
      }
      this.loadSelectedEvents();
    } else {
      // 月视图：切换到上一月
      var currentYear = this.data.currentYear;
      var currentMonth = this.data.currentMonth;
      if (currentMonth === 1) { currentYear--; currentMonth = 12; } else currentMonth--;
      this.setData({ currentYear: currentYear, currentMonth: currentMonth });
      this.loadMonthEvents();
    }
  },

  nextMonth: function() {
    if (this.data.currentView === 'week') {
      // 周视图：切换到下一周
      var d = new Date(this.data.selectedDate);
      d.setDate(d.getDate() + 7);
      var dateStr = this.formatDate(d);
      var y = d.getFullYear();
      var m = d.getMonth() + 1;
      if (y !== this.data.currentYear || m !== this.data.currentMonth) {
        this.setData({ currentYear: y, currentMonth: m, selectedDate: dateStr });
        this.loadMonthEvents();
      } else {
        this.setData({ selectedDate: dateStr });
        this.buildWeekView();
      }
      this.loadSelectedEvents();
    } else {
      // 月视图：切换到下一月
      var currentYear = this.data.currentYear;
      var currentMonth = this.data.currentMonth;
      if (currentMonth === 12) { currentYear++; currentMonth = 1; } else currentMonth++;
      this.setData({ currentYear: currentYear, currentMonth: currentMonth });
      this.loadMonthEvents();
    }
  },

  selectDate: function(e) {
    var dateStr = e.currentTarget.dataset.date;
    if (!dateStr) return;
    var view = this.data.currentView;
    var changed = this.syncYearMonthFromDate(dateStr);
    this.setData({ selectedDate: dateStr });
    if (!changed) {
      if (view === 'month') this.buildCalendar();
      else if (view === 'week') this.buildWeekView();
    }
    this.loadSelectedEvents();
  },

  goToToday: function() {
    var now = new Date();
    var dateStr = this.formatDate(now);
    var y = now.getFullYear();
    var m = now.getMonth() + 1;
    var view = this.data.currentView;
    if (y !== this.data.currentYear || m !== this.data.currentMonth) {
      this.setData({ currentYear: y, currentMonth: m, selectedDate: dateStr });
      this.loadMonthEvents();
    } else {
      this.setData({ selectedDate: dateStr });
      if (view === 'week') this.buildWeekView();
      else this.buildCalendar();
    }
    this.loadSelectedEvents();
  },

  // 获取日期标签
  getDateLabel: function(dateStr) {
    var today = this.formatDate(new Date());
    if (dateStr === today) return '今天';
    return dateStr;
  },

  // 获取事件类型标签
  getEventTypeName: function(type) {
    var names = {
      submission: '投稿',
      review: '审稿',
      conference: '会议',
      task: '任务'
    };
    return names[type] || type;
  },

  // 显示添加任务弹窗
  showAddTaskModal: function() {
    var now = new Date();
    var hours = String(now.getHours());
    var minutes = String(now.getMinutes());
    if (hours.length < 2) hours = '0' + hours;
    if (minutes.length < 2) minutes = '0' + minutes;
    this.setData({
      showTaskModal: true,
      modalMode: 'add',
      modalEditId: '',
      modalTitle: '',
      modalDesc: '',
      modalDate: this.data.selectedDate || this.formatDate(now),
      modalTime: hours + ':' + minutes,
      modalReminder: null
    });
  },

  hideAddTaskModal: function() {
    this.setData({ showTaskModal: false });
  },

  addFromTemplate: function(e) {
    var template = this.data.academicTemplates[e.currentTarget.dataset.index];
    this.setData({ modalTitle: template.title });
  },

  onModalTitleInput: function(e) {
    this.setData({ modalTitle: e.detail.value });
  },

  onModalDescInput: function(e) {
    this.setData({ modalDesc: e.detail.value });
  },

  onModalDateChange: function(e) {
    this.setData({ modalDate: e.detail.value });
  },

  onModalTimeChange: function(e) {
    this.setData({ modalTime: e.detail.value });
  },

  onModalReminderChange: function(e) {
    var val = e.currentTarget.dataset.value;
    this.setData({ modalReminder: val === 'null' ? null : parseInt(val, 10) });
  },

  confirmAddTask: function() {
    var title = this.data.modalTitle.trim();
    if (!title) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' });
      return;
    }

    var reminderMinutes = [];
    var reminderEnabled = false;
    if (this.data.modalReminder !== null) {
      reminderMinutes = [this.data.modalReminder];
      reminderEnabled = true;
    }

    var that = this;

    if (this.data.modalMode === 'edit' && this.data.modalEditId) {
      wx.cloud.database().collection('tasks').doc(this.data.modalEditId).update({
        data: {
          title: title,
          description: this.data.modalDesc.trim(),
          date: this.data.modalDate,
          time: this.data.modalTime,
          reminderEnabled: reminderEnabled,
          reminderMinutes: reminderMinutes,
          updateTime: new Date()
        }
      }).then(function() {
        that.hideAddTaskModal();
        that.loadMonthEvents();
        wx.showToast({ title: '保存成功', icon: 'success' });
      }).catch(function() {
        wx.showToast({ title: '保存失败', icon: 'none' });
      });
    } else {
      wx.cloud.database().collection('tasks').add({
        data: {
          title: title,
          description: this.data.modalDesc.trim(),
          date: this.data.modalDate,
          time: this.data.modalTime,
          reminderEnabled: reminderEnabled,
          reminderMinutes: reminderMinutes,
          completed: false,
          completedTime: null,
          createTime: new Date(),
          updateTime: new Date()
        }
      }).then(function() {
        that.hideAddTaskModal();
        that.loadMonthEvents();
        wx.showToast({ title: '添加成功', icon: 'success' });
      }).catch(function() {
        wx.showToast({ title: '添加失败', icon: 'none' });
      });
    }
  },

});
