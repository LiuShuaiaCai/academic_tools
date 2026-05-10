// pages/calendar/calendar.js

Page({
  data: {
    currentYear: 0, currentMonth: 0, currentView: 'month',
    calendarDays: [], weekDays: [], monthEvents: [],
    selectedDate: '', selectedDateLabel: '', selectedEvents: [],
    dayEvents: [], eventDates: {},
    // 任务相关
    tasks: [],
    taskTypes: ['submission', 'review', 'conference', 'task'],
    taskDotColors: {
      submission: '#2563eb',
      review: '#EF4444',
      conference: '#10B981',
      task: '#8B5CF6'
    }
  },

  onLoad: function() {
    var now = new Date();
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
      selectedDate: this.formatDate(now)
    });
    this.loadMonthEvents();
  },

  formatDate: function(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  switchView: function(e) {
    var view = e.currentTarget.dataset.view;
    this.setData({ currentView: view });
    if (view === 'week') this.buildWeekView();
    else if (view === 'list') this.buildListview();
    else this.buildCalendar();
  },

  loadMonthEvents: function() {
    var that = this;
    var currentYear = this.data.currentYear;
    var currentMonth = this.data.currentMonth;
    var db = wx.cloud.database();
    var _ = db.command;
    var startDate = new Date(currentYear, currentMonth - 1, 1);
    var endDate = new Date(currentYear, currentMonth, 1);

    Promise.all([
      // 投稿
      db.collection('submissions').where({ deleteTime: null, nextDeadline: _.gte(startDate).and(_.lt(endDate)) }).get().catch(function() { return { data: [] }; }),
      // 审稿
      db.collection('reviews').where({ deleteTime: null, deadline: _.gte(startDate).and(_.lt(endDate)) }).get().catch(function() { return { data: [] }; }),
      // 会议
      db.collection('conferences').where({ deleteTime: null, deadline: _.gte(startDate).and(_.lt(endDate)) }).get().catch(function() { return { data: [] }; }),
      // 任务 - 按月份筛选
      db.collection('tasks').where({
        deleteTime: null,
        completed: false,
        date: _.gte(startDate.toISOString().split('T')[0]).and(_.lt(endDate.toISOString().split('T')[0]))
      }).get().catch(function() { return { data: [] }; })
    ]).then(function(results) {
      var subRes = results[0], revRes = results[1], confRes = results[2], taskRes = results[3];
      var eventDates = {};
      var monthEvents = [];

      // 投稿
      subRes.data.forEach(function(i) { monthEvents.push({ _id: i._id, title: i.title, journal: i.journal, type: 'submission', typeLabel: '投稿', date: i.nextDeadline, deadline: i.nextDeadline }); });
      // 审稿
      revRes.data.forEach(function(i) { monthEvents.push({ _id: i._id, paperTitle: i.paperTitle, journal: i.journal, type: 'review', typeLabel: '审稿', date: i.deadline, deadline: i.deadline }); });
      // 会议
      confRes.data.forEach(function(i) { monthEvents.push({ _id: i._id, name: i.name, location: i.location, type: 'conference', typeLabel: '会议', date: i.deadline, deadline: i.deadline }); });
      // 任务
      taskRes.data.forEach(function(i) { monthEvents.push({ _id: i._id, title: i.title, type: 'task', typeLabel: '任务', date: i.date, time: i.time, priority: i.priority, category: i.category, reminderEnabled: i.reminderEnabled }); });

      monthEvents.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
      monthEvents.forEach(function(i) {
        var d = that.formatDate(new Date(i.date));
        if (!eventDates[d]) eventDates[d] = [];
        eventDates[d].push(i.type);
      });

      that.setData({ eventDates: eventDates, monthEvents: monthEvents });
      that.buildCalendar();
      that.loadSelectedEvents();
    }).catch(function(e) {
      console.error('[日历] 加载失败', e);
      that.buildCalendar();
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
    for (i = 1; i <= daysInMonth; i++) {
      var dateStr = currentYear + '-' + String(currentMonth).padStart(2, '0') + '-' + String(i).padStart(2, '0');
      days.push({ day: i, dateStr: dateStr, isToday: dateStr === today, isSelected: dateStr === selectedDate, events: eventDates[dateStr] || [] });
    }
    this.setData({ calendarDays: days });
  },

  buildWeekView: function() {
    var that = this;
    var selectedDate = this.data.selectedDate;
    var eventDates = this.data.eventDates;
    var baseDate = selectedDate ? new Date(selectedDate) : new Date();
    var dayOfWeek = baseDate.getDay();
    var weekStart = new Date(baseDate);
    weekStart.setDate(baseDate.getDate() - dayOfWeek);
    var weekDays = [];
    var dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    var today = that.formatDate(new Date());

    for (var i = 0; i < 7; i++) {
      var d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      var dateStr = that.formatDate(d);
      weekDays.push({ day: d.getDate(), dayName: dayNames[i], dateStr: dateStr, isToday: dateStr === today, isSelected: dateStr === selectedDate, events: eventDates[dateStr] || [] });
    }
    this.setData({ weekDays: weekDays });
  },

  buildListview: function() {
    var that = this;
    var monthEvents = this.data.monthEvents;
    var formatted = monthEvents.map(function(item) {
      return Object.assign({}, item, { dateLabel: that.formatDate(new Date(item.date)) });
    });
    this.setData({ monthEvents: formatted });
  },

  loadSelectedEvents: function() {
    var that = this;
    var selectedDate = this.data.selectedDate;
    var eventDates = this.data.eventDates;
    if (!selectedDate) { this.setData({ selectedEvents: [], selectedDateLabel: '' }); return; }
    var monthEvents = this.data.monthEvents;
    var selectedEvents = monthEvents.filter(function(e) {
      return that.formatDate(new Date(e.date)) === selectedDate;
    }).map(function(e) {
      return Object.assign({}, e, { dateLabel: that.formatDate(new Date(e.date)) });
    });
    this.setData({ selectedEvents: selectedEvents, selectedDateLabel: selectedDate });
  },

  prevMonth: function() {
    var currentYear = this.data.currentYear;
    var currentMonth = this.data.currentMonth;
    if (currentMonth === 1) { currentYear--; currentMonth = 12; } else currentMonth--;
    this.setData({ currentYear: currentYear, currentMonth: currentMonth });
    this.loadMonthEvents();
  },

  nextMonth: function() {
    var currentYear = this.data.currentYear;
    var currentMonth = this.data.currentMonth;
    if (currentMonth === 12) { currentYear++; currentMonth = 1; } else currentMonth++;
    this.setData({ currentYear: currentYear, currentMonth: currentMonth });
    this.loadMonthEvents();
  },

  selectDate: function(e) {
    var dateStr = e.currentTarget.dataset.date;
    if (!dateStr) return;
    this.setData({ selectedDate: dateStr });
    this.buildCalendar();
    this.buildWeekView();
    this.loadSelectedEvents();
  },

  goToToday: function() {
    var now = new Date();
    this.setData({ currentYear: now.getFullYear(), currentMonth: now.getMonth() + 1, selectedDate: this.formatDate(now) });
    this.loadMonthEvents();
  },

  // 跳转到每日任务页面
  goToDailyTasks: function() {
    var selectedDate = this.data.selectedDate;
    wx.navigateTo({
      url: '/pages/calendar/daily-tasks/daily-tasks?date=' + selectedDate
    });
  },

  // 跳转到任务编辑器
  goToTaskEditor: function() {
    var selectedDate = this.data.selectedDate;
    wx.navigateTo({
      url: '/pages/calendar/task-editor/task-editor?date=' + selectedDate
    });
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
  }
});
