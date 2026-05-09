// pages/conferences/form/form.js
var dbInit = require('../../../utils/dbInit');
var formatTime = dbInit.formatTime;
var parseDate = dbInit.parseDate;
var formatUtil = require('../../../utils/conferences-format');
var creditsUtil = require('../../../utils/credits');

Component({
  properties: {
    show: { type: Boolean, value: false },
    isEdit: { type: Boolean, value: false },
    editId: { type: String, value: '' }
  },

  data: {
    form: {
      name: '',
      shortName: '',
      location: '',
      deadline: '',
      notificationDate: '',
      startDate: '',
      url: '',
      note: '',
      status: 'pending',
      // 时间线
      tlNewDate: '',
      tlNewEventIdx: -1,
      tlNewRemark: '',
      timelineList: []
    },
    statusOptions: [
      { value: 'pending',    label: '待截稿' },
      { value: 'registered', label: '已报名' }
    ],
    tlEventOptions: [
      { value: 'deadline',      label: '截稿', color: '#EF4444' },
      { value: 'notification',  label: '录用通知', color: '#F59E0B' },
      { value: 'registration',  label: '报名', color: '#10B981' },
      { value: 'start',         label: '会议开始', color: '#3B82F6' },
      { value: 'end',           label: '会议结束', color: '#8B5CF6' }
    ]
  },

  lifetimes: {
    attached: function() {
      if (this.data.isEdit && this.data.editId) {
        this.loadEditData(this.data.editId);
      }
    }
  },

  observers: {
    'show': function(show) {
      if (show && !this.data.isEdit) {
        this.resetForm();
      }
    },
    'isEdit, editId': function(isEdit, editId) {
      if (isEdit && editId) {
        this.loadEditData(editId);
      } else if (!isEdit) {
        this.resetForm();
      }
    }
  },

  methods: {
    resetForm: function() {
      this.setData({
        form: {
          name: '',
          shortName: '',
          location: '',
          deadline: '',
          notificationDate: '',
          startDate: '',
          url: '',
          note: '',
          status: 'pending',
          tlNewDate: '',
          tlNewEventIdx: -1,
          tlNewRemark: '',
          timelineList: []
        }
      });
    },

    loadEditData: function(id) {
      var that = this;
      wx.cloud.database().collection('conferences').doc(id).get().then(function(res) {
        var item = res.data;
        if (!item) return;

        // 时间线
        var tlList = (item.timeline || []).map(function(t) {
          return { date: t.date || '', event: t.event || '', remark: t.remark || '', dotColor: t.dotColor || '' };
        });
        var colorMap = {};
        that.data.tlEventOptions.forEach(function(opt) { colorMap[opt.label] = opt.color; });
        tlList.forEach(function(tl) {
          if (!tl.dotColor && colorMap[tl.event]) {
            tl.dotColor = colorMap[tl.event];
          }
        });
        tlList.sort(function(a, b) { return b.date.localeCompare(a.date); });

        that.setData({
          form: {
            name: item.name || '',
            shortName: item.shortName || '',
            location: item.location || '',
            deadline: formatUtil.formatDeadlineToDate(item.deadline),
            notificationDate: formatUtil.formatDeadlineToDate(item.notificationDate),
            startDate: formatUtil.formatDeadlineToDate(item.startDate),
            url: item.url || '',
            note: item.note || '',
            status: item.status || 'pending',
            tlNewDate: '',
            tlNewEventIdx: -1,
            tlNewRemark: '',
            timelineList: tlList
          }
        });
      }).catch(function() {
        wx.showToast({ title: '加载失败', icon: 'error' });
      });
    },

    // ======== 表单输入 ========
    onFormInput: function(e) {
      var field = e.currentTarget.dataset.field;
      var val = e.detail.value;
      var data = {};
      data['form.' + field] = val;
      this.setData(data);
    },

    onDeadlineChange: function(e) {
      this.setData({ 'form.deadline': e.detail.value });
    },

    onNotifyChange: function(e) {
      this.setData({ 'form.notificationDate': e.detail.value });
    },

    onStartChange: function(e) {
      this.setData({ 'form.startDate': e.detail.value });
    },

    onSelectStatus: function(e) {
      this.setData({ 'form.status': e.currentTarget.dataset.status });
    },

    // ======== 时间线 ========
    addTimelineItem: function() {
      var f = this.data.form;
      if (!f.tlNewDate || f.tlNewEventIdx < 0) {
        wx.showToast({ title: '请选择日期和事件', icon: 'none' });
        return;
      }
      var ev = this.data.tlEventOptions[f.tlNewEventIdx];
      var tl = (this.data.form.timelineList || []).slice();
      var remark = (f.tlNewRemark || '').trim();
      var newItem = { date: f.tlNewDate, event: ev.label, dotColor: ev.color, remark: remark };
      tl.push(newItem);
      tl.sort(function(a, b) { return b.date.localeCompare(a.date); });
      this.setData({
        'form.timelineList': tl,
        'form.tlNewDate': '',
        'form.tlNewEventIdx': -1,
        'form.tlNewRemark': ''
      });
      wx.showToast({ title: '已添加：' + ev.label, icon: 'success' });
    },

    removeTimelineItem: function(e) {
      var idx = e.currentTarget.dataset.i;
      var tl = this.data.form.timelineList.slice();
      tl.splice(idx, 1);
      this.setData({ 'form.timelineList': tl });
    },

    // ======== 保存 ========
    saveForm: function() {
      var that = this;
      var f = this.data.form;
      if (!f.name) { wx.showToast({ title: '请填写会议名称', icon: 'none' }); return; }

      // 时间线数据清理
      var tlSave = (f.timelineList || []).filter(function(item) {
        return (item.date || '') && (item.event || '');
      }).map(function(item) {
        return { date: item.date, event: item.event, remark: item.remark || '', dotColor: item.dotColor || '' };
      });

      var data = {
        name: f.name,
        shortName: f.shortName,
        location: f.location,
        deadline: f.deadline ? formatTime(f.deadline + ' 00:00:00') : null,
        notificationDate: f.notificationDate ? formatTime(f.notificationDate + ' 00:00:00') : null,
        startDate: f.startDate ? formatTime(f.startDate + ' 00:00:00') : null,
        url: f.url,
        note: f.note,
        status: f.status,
        timeline: tlSave,
        updateTime: formatTime()
      };

      var db = wx.cloud.database();
      wx.showLoading({ title: '保存中...' });
      var promise;
      if (this.data.isEdit) {
        promise = db.collection('conferences').doc(this.data.editId).update({ data: data });
      } else {
        // 新增会议：先保存，成功后再扣积分
        data.createTime = formatTime();
        data.deleteTime = null;
        promise = db.collection('conferences').add({ data: data }).then(function(addRes) {
          return creditsUtil.spendCredits('new_conference', 5).then(function(spendResult) {
            if (!spendResult.success) {
              return Promise.reject('insufficient');
            }
            return addRes;
          });
        });
      }
      promise.then(function() {
        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
        that.triggerEvent('save');
      }).catch(function(e) {
        wx.hideLoading();
        if (e === 'insufficient') {
          wx.showToast({ title: '积分不足', icon: 'error' });
        } else {
          wx.showToast({ title: '保存失败', icon: 'error' });
          console.error(e);
        }
      });
    },

    closeForm: function() {
      this.triggerEvent('cancel');
    },

    doNothing: function() {}
  }
});
