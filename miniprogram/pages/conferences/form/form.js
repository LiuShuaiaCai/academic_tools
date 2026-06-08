// pages/conferences/form/form.js
var dbInit = require('../../../utils/dbInit');
var formatTime = dbInit.formatTime;
var formatUtil = require('../../../utils/conferences-format');
var creditsUtil = require('../../../utils/credits');
var reminderCheck = require('../../../utils/reminder-check');

Component({
  properties: {
    show: { type: Boolean, value: false },
    isEdit: { type: Boolean, value: false },
    editId: { type: String, value: '' }
  },

  data: {
    form: {
      name: '',
      location: '',
      conferenceType: '',
      conferenceTypeLabel: '',
      rank: '',
      organizer: '',
      deadline: '',
      startDate: '',
      endDate: '',
      url: '',
      note: '',
      status: '',
      statusLabel: ''
    },
    conferenceTypeLabels: ['请选择', '线下', '线上'],
    conferenceTypeValues: ['', 'offline', 'online'],
    statusLabels: ['请选择', '已投稿', '已录用', '已报名'],
    statusValues: ['', 'submitted', 'accepted', 'registered'],
    showQuotaTip: false,
    currentOpenid: ''
  },

  lifetimes: {
    attached: function() {
      var that = this;
      // 先获取 openid
      wx.cloud.callFunction({
        name: 'academicAPI',
        data: { action: 'getUserId' }
      }).then(function(res) {
        var openid = res.result && res.result.openid ? res.result.openid : '';
        that.setData({ currentOpenid: openid }, function() {
          that._initAfterOpenid();
        });
      }).catch(function(err) {
        console.error('[conferences-form] 获取用户标识失败', err);
        that._initAfterOpenid();
      });
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
    _initAfterOpenid: function() {
      if (this.data.isEdit && this.data.editId) {
        this.loadEditData(this.data.editId);
      }
    },

    resetForm: function() {
      this.setData({
        form: {
          name: '',
          location: '',
          conferenceType: '',
          conferenceTypeLabel: '',
          rank: '',
          organizer: '',
          deadline: '',
          startDate: '',
          endDate: '',
          url: '',
          note: '',
          status: '',
          statusLabel: ''
        }
      });
    },

    loadEditData: function(id) {
      var that = this;
      var openid = that.data.currentOpenid;
      if (!openid) return;
      wx.cloud.database().collection('conferences').where({ _id: id, _openid: openid }).get().then(function(res) {
        var item = (res.data && res.data.length > 0) ? res.data[0] : null;
        if (!item) return;

        that.setData({
          form: {
            name: item.name || '',
            location: item.location || '',
            conferenceType: item.conferenceType || '',
            conferenceTypeLabel: item.conferenceType === 'online' ? '线上' : item.conferenceType === 'offline' ? '线下' : '',
            rank: item.rank || '',
            organizer: item.organizer || '',
            deadline: formatUtil.formatDeadlineToDate(item.deadline),
            startDate: formatUtil.formatDeadlineToDate(item.startDate),
            endDate: formatUtil.formatDeadlineToDate(item.endDate),
            url: item.url || '',
            note: item.note || '',
            status: item.status || '',
            statusLabel: item.status === 'submitted' ? '已投稿' : item.status === 'accepted' ? '已录用' : item.status === 'registered' ? '已报名' : '',
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

    onStartChange: function(e) {
      this.setData({ 'form.startDate': e.detail.value });
    },

    onEndChange: function(e) {
      this.setData({ 'form.endDate': e.detail.value });
    },

    onStatusChange: function(e) {
      var idx = parseInt(e.detail.value);
      this.setData({
        'form.status': this.data.statusValues[idx],
        'form.statusLabel': this.data.statusLabels[idx]
      });
    },

    onConferenceTypeChange: function(e) {
      var idx = parseInt(e.detail.value);
      this.setData({
        'form.conferenceType': this.data.conferenceTypeValues[idx],
        'form.conferenceTypeLabel': this.data.conferenceTypeLabels[idx]
      });
    },

    onSelectRank: function(e) {
      var newRank = e.currentTarget.dataset.rank;
      if (this.data.form.rank === newRank) {
        newRank = '';
      }
      this.setData({ 'form.rank': newRank });
    },

    // ======== 保存 ========
    saveForm: function() {
      var that = this;
      var f = this.data.form;
      if (!f.name) { wx.showToast({ title: '请填写会议名称', icon: 'none' }); return; }
      if (!f.url) { wx.showToast({ title: '请填写会议官网', icon: 'none' }); return; }
      if (!f.location) { wx.showToast({ title: '请填写会议地点', icon: 'none' }); return; }
      if (!f.conferenceType) { wx.showToast({ title: '请选择会议类型', icon: 'none' }); return; }
      if (!f.startDate) { wx.showToast({ title: '请选择会议开始日期', icon: 'none' }); return; }
      if (f.endDate && f.startDate > f.endDate) { wx.showToast({ title: '开始日期不能大于结束日期', icon: 'none' }); return; }

      var data = {
        name: f.name,
        location: f.location,
        conferenceType: f.conferenceType,
        rank: f.rank,
        organizer: f.organizer,
        deadline: f.deadline ? formatTime(f.deadline + ' 00:00:00') : null,
        startDate: f.startDate ? formatTime(f.startDate + ' 00:00:00') : null,
        endDate: f.endDate ? formatTime(f.endDate + ' 00:00:00') : null,
        url: f.url,
        note: f.note,
        status: f.status,
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
        reminderCheck.checkAndShowTip(that).catch(function(err){
          console.error('[conference] 额度检查失败', err);
        });
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

    onQuotaTipCancel: function() {
      this.setData({ showQuotaTip: false });
    },
    onQuotaTipConfirm: function() {
      this.setData({ showQuotaTip: false });
      wx.navigateTo({ url: '/pages/settings/settings' });
    },

    doNothing: function() {}
  }
});
