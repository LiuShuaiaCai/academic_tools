// pages/calendar/calendar.js

Page({
  data: {
    currentYear: 0, currentMonth: 0, currentView: 'month',
    calendarDays: [], weekDays: [], monthEvents: [],
    selectedDate: '', selectedDateLabel: '', selectedEvents: [],
    dayEvents: [], eventDates: {},
    listEvents: [], // 列表视图专用数据，避免覆盖 monthEvents
    weekRangeLabel: '', // 周视图日期范围标签
    // 任务相关
    tasks: [],
    taskTypes: ['submission', 'review', 'conference', 'task'],
    taskDotColors: {
      submission: '#2563eb',
      review: '#EF4444',
      conference: '#10B981',
      task: '#8B5CF6'
    },
    // 筛选
    filterTypes: ['submission', 'review', 'conference', 'task'],
    filterTypeStates: { submission: true, review: true, conference: true, task: true },

    filteredEvents: [],
    pendingEvents: [],
    completedEvents: [],
    dayStats: { total: 0, completed: 0, pending: 0, completionRate: 0 }
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

  onShow: function() {
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

    return Object.assign({}, e, {
      iconEmoji: meta.iconEmoji,
      pagePath: meta.pagePath,
      deadlineLabel: this.formatDeadlineLabel(deadline),
      countdownLabel: daysLeft <= 0 ? '已超期' : daysLeft + '天',
      urgent: daysLeft <= 7
    });
  },

  toggleFilterType: function(e) {
    var type = e.currentTarget.dataset.type;
    var filterTypes = this.data.filterTypes.slice();
    var idx = filterTypes.indexOf(type);
    if (idx === -1) {
      filterTypes.push(type);
    } else {
      filterTypes.splice(idx, 1);
    }
    var states = {};
    ['submission', 'review', 'conference', 'task'].forEach(function(t) {
      states[t] = filterTypes.indexOf(t) !== -1;
    });
    this.setData({ filterTypes: filterTypes, filterTypeStates: states });
    this.applyFilters();
  },

  applyFilters: function() {
    var that = this;
    var monthEvents = this.data.monthEvents;
    var filterTypes = this.data.filterTypes;

    var filteredEvents = monthEvents.filter(function(e) {
      if (filterTypes.indexOf(e.type) === -1) return false;
      return true;
    });

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

  // 展开重复任务到指定月份
  expandRepeatingTasks: function(task, year, month) {
    var results = [];
    var repeatType = task.repeatType;
    if (!repeatType || repeatType === 'none') return [task];

    var startDate = this.parseDate(task.date);
    var repeatEnd = task.repeatEndDate ? this.parseDate(task.repeatEndDate) : null;
    var monthStart = new Date(year, month - 1, 1);
    var monthEnd = new Date(year, month, 0);

    // 如果重复已结束，不展开
    if (repeatEnd && repeatEnd < monthStart) return [];

    var effectiveStart = startDate > monthStart ? startDate : monthStart;
    var effectiveEnd = repeatEnd && repeatEnd < monthEnd ? repeatEnd : monthEnd;

    var cursor = new Date(effectiveStart);
    var origDay = startDate.getDate();

    while (cursor <= effectiveEnd) {
      var match = false;
      if (repeatType === 'daily') {
        match = true;
      } else if (repeatType === 'weekly') {
        match = cursor.getDay() === startDate.getDay();
      } else if (repeatType === 'monthly') {
        match = cursor.getDate() === origDay;
      }

      if (match) {
        var dateStr = this.formatDate(cursor);
        results.push(Object.assign({}, task, { date: dateStr, _isRepeatInstance: true }));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return results;
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
    var db = wx.cloud.database();
    var _ = db.command;

    // 统一使用本地日期字符串比较，避免时区问题
    var startDateStr = currentYear + '-' + String(currentMonth).padStart(2, '0') + '-01';
    var nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    var nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    var endDateStr = nextYear + '-' + String(nextMonth).padStart(2, '0') + '-01';

    Promise.all([
      // 投稿
      db.collection('submissions').where({ deadline: _.gte(startDateStr).and(_.lt(endDateStr)) }).get().catch(function() { return { data: [] }; }),
      // 审稿
      db.collection('reviews').where({ deadline: _.gte(startDateStr).and(_.lt(endDateStr)) }).get().catch(function() { return { data: [] }; }),
      // 会议
      db.collection('conferences').where({ deadline: _.gte(startDateStr).and(_.lt(endDateStr)) }).get().catch(function() { return { data: [] }; }),
      // 任务 - 按月份字符串筛选（包含已完成，在日历上展示所有事件）
      db.collection('tasks').where({
        date: _.gte(startDateStr).and(_.lt(endDateStr))
      }).get().catch(function() { return { data: [] }; })
    ]).then(function(results) {
      var subRes = results[0], revRes = results[1], confRes = results[2], taskRes = results[3];
      var eventDates = {};
      var eventCounts = {};
      var monthEvents = [];

      // 投稿（过滤已删除）
      subRes.data.filter(function(i) { return !i.deleteTime; }).forEach(function(i) { monthEvents.push({ _id: i._id, title: i.title, journal: i.journal, type: 'submission', typeLabel: '投稿', date: i.deadline, deadline: i.deadline, completed: i.completed || false }); });
      // 审稿（过滤已删除）
      revRes.data.filter(function(i) { return !i.deleteTime; }).forEach(function(i) { monthEvents.push({ _id: i._id, paperTitle: i.paperTitle, journal: i.journal, type: 'review', typeLabel: '审稿', date: i.deadline, deadline: i.deadline, completed: i.completed || false }); });
      // 会议（过滤已删除）
      confRes.data.filter(function(i) { return !i.deleteTime; }).forEach(function(i) { monthEvents.push({ _id: i._id, name: i.name, location: i.location, type: 'conference', typeLabel: '会议', date: i.deadline, deadline: i.deadline, completed: i.completed || false }); });
      // 任务（展开重复任务，过滤已删除）
      taskRes.data.filter(function(i) { return !i.deleteTime; }).forEach(function(i) {
        var expanded = that.expandRepeatingTasks(i, currentYear, currentMonth);
        expanded.forEach(function(inst) {
          monthEvents.push({
            _id: inst._id,
            title: inst.title,
            type: 'task',
            typeLabel: '任务',
            date: inst.date,
            time: inst.time,
            priority: inst.priority,
            category: inst.category,
            reminderEnabled: inst.reminderEnabled,
            completed: inst.completed,
            _isRepeatInstance: inst._isRepeatInstance || false
          });
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

      that.setData({ monthEvents: monthEvents });
      that.applyFilters();
    }).catch(function(e) {
      console.error('[日历] 加载失败', e);
      var view = that.data.currentView;
      if (view === 'week') that.buildWeekView();
      else if (view !== 'list') that.buildCalendar();
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
      var label = '';
      if (dateStr === today) {
        label = '今天';
      } else if (dateStr === tomorrow) {
        label = '明天';
      } else {
        label = dayNames[date.getDay()];
      }
      // 同一日期内：未完成的排在上面
      var events = groups[dateStr].sort(function(a, b) {
        var aDone = a.completed ? 1 : 0;
        var bDone = b.completed ? 1 : 0;
        return aDone - bDone;
      });
      return {
        dateStr: dateStr,
        dateLabel: label,
        dateSub: (date.getMonth() + 1) + '月' + date.getDate() + '日',
        events: events
      };
    });

    this.setData({ listGroups: listGroups });
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

  // 全部标记完成（仅 task 类型）
  markAllComplete: function() {
    var pendingTaskIds = this.data.pendingEvents
      .filter(function(e) { return e.type === 'task'; })
      .map(function(e) { return e._id; });
    if (pendingTaskIds.length === 0) return;

    var db = wx.cloud.database();
    var BATCH_SIZE = 20;

    var runBatch = function(ids) {
      var batch = db.batch();
      ids.forEach(function(id) {
        batch.update(db.collection('tasks').doc(id), {
          data: {
            completed: true,
            completedTime: new Date(),
            updateTime: new Date()
          }
        });
      });
      return batch.commit();
    };

    var batches = [];
    for (var i = 0; i < pendingTaskIds.length; i += BATCH_SIZE) {
      batches.push(runBatch(pendingTaskIds.slice(i, i + BATCH_SIZE)));
    }

    var that = this;
    Promise.all(batches).then(function() {
      that.loadMonthEvents();
      wx.showToast({ title: '已全部完成', icon: 'success' });
    }).catch(function() {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  // 清除已完成任务（仅 task 类型，软删除）
  clearCompleted: function() {
    var completedTaskIds = this.data.completedEvents
      .filter(function(e) { return e.type === 'task'; })
      .map(function(e) { return e._id; });
    if (completedTaskIds.length === 0) return;

    var that = this;
    wx.showModal({
      title: '确认清除',
      content: '确定要清除 ' + completedTaskIds.length + ' 个已完成任务吗？',
      success: function(res) {
        if (res.confirm) {
          var db = wx.cloud.database();
          var BATCH_SIZE = 20;

          var runBatch = function(ids) {
            var batch = db.batch();
            ids.forEach(function(id) {
              batch.update(db.collection('tasks').doc(id), {
                data: {
                  deleteTime: new Date(),
                  updateTime: new Date()
                }
              });
            });
            return batch.commit();
          };

          var batches = [];
          for (var i = 0; i < completedTaskIds.length; i += BATCH_SIZE) {
            batches.push(runBatch(completedTaskIds.slice(i, i + BATCH_SIZE)));
          }

          Promise.all(batches).then(function() {
            that.loadMonthEvents();
            wx.showToast({ title: '已清除', icon: 'success' });
          }).catch(function() {
            wx.showToast({ title: '清除失败', icon: 'none' });
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
      wx.navigateTo({
        url: '/pages/calendar/task-editor/task-editor?taskId=' + id
      });
    } else if (pagePath) {
      var url = pagePath + '?targetId=' + id;
      if (title) url += '&targetTitle=' + encodeURIComponent(title) + '&autoEdit=true';
      wx.navigateTo({ url: url });
    }
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
