// pages/reviews/form/form.js
var dbInit = require('../../../utils/dbInit');
var formatTime = dbInit.formatTime;
var parseDate = dbInit.parseDate;
var config = require('../../../utils/reviews-config');
var formatUtil = require('../../../utils/reviews-format');

Component({
  properties: {
    show: { type: Boolean, value: false },
    isEdit: { type: Boolean, value: false },
    editId: { type: String, value: '' }
  },

  data: {
    form: {
      paperTitle: '', journal: '', deadline: '', invitedDate: '',
      status: 'pending', decision: '', round: 0,
      systemUrl: '', systemAccount: '', systemPassword: '',
      note: '',
      relatedReviewId: '', relatedReviewTitle: '', relatedReviewIdx: 0,
      tlNewDate: '', tlNewEventIdx: -1, tlNewRemark: '',
      timelineList: [],
      decisionIdx: -1,
      roundIdx: 0
    },
    statusOptions: config.STATUS_OPTIONS_FOR_FORM,
    decisionOptions: config.DECISION_OPTIONS,
    roundOptions: config.ROUND_OPTIONS,
    tlEventOptions: config.TL_EVENT_OPTIONS,
    relatedReviewOptions: [],
    // 审稿决定弹窗
    showDecisionModal: false,
    decisionId: '',
    decisionPaper: '',
    decisionJournal: '',
    decision: '',
    decisionNote: ''
  },

  lifetimes: {
    attached: function() {
      if (this.data.isEdit && this.data.editId) {
        this.loadEditData(this.data.editId);
      }
      this.loadRelatedReviews(this.data.editId || null);
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
          paperTitle: '', journal: '', deadline: '', invitedDate: '',
          status: 'pending', decision: '', round: 0,
          systemUrl: '', systemAccount: '', systemPassword: '',
          note: '',
          relatedReviewId: '', relatedReviewTitle: '', relatedReviewIdx: 0,
          tlNewDate: '', tlNewEventIdx: -1, tlNewRemark: '',
          timelineList: [],
          decisionIdx: -1,
          roundIdx: 0
        }
      });
      this.loadRelatedReviews(null);
    },

    loadEditData: function(id) {
      var that = this;
      this.loadRelatedReviews(id);
      wx.cloud.database().collection('reviews').doc(id).get().then(function(res) {
        var item = res.data;
        if (!item) return;

        // 时间线
        var tlList = (item.timeline || []).map(function(t) {
          return { date: t.date || '', event: t.event || '', remark: t.remark || '', dotColor: t.dotColor || '' };
        });
        var colorMap = {};
        config.TL_EVENT_OPTIONS.forEach(function(opt) { colorMap[opt.label] = opt.color; });
        tlList.forEach(function(tl) {
          if (!tl.dotColor && colorMap[tl.event]) {
            tl.dotColor = colorMap[tl.event];
          }
        });
        tlList.sort(function(a, b) { return b.date.localeCompare(a.date); });

        // 查找 decision 和 round 的索引
        var dIdx = -1;
        var decisionVal = item.decision || '';
        for (var di = 0; di < config.DECISION_OPTIONS.length; di++) {
          if (config.DECISION_OPTIONS[di].value === decisionVal) { dIdx = di; break; }
        }
        var rIdx = 0;
        var roundVal = item.round || 0;
        for (var ri = 0; ri < config.ROUND_OPTIONS.length; ri++) {
          if (config.ROUND_OPTIONS[ri].value === roundVal) { rIdx = ri; break; }
        }

        that.setData({
          form: {
            paperTitle: item.paperTitle || '',
            journal: item.journal || '',
            deadline: formatUtil.formatDeadlineToDate(item.deadline),
            invitedDate: formatUtil.formatDeadlineToDate(item.invitedDate),
            status: item.status || 'pending',
            decision: item.decision || '',
            decisionIdx: dIdx,
            round: item.round || 0,
            roundIdx: rIdx,
            systemUrl: item.systemUrl || '',
            systemAccount: item.systemAccount || '',
            systemPassword: item.systemPassword || '',
            note: item.note || '',
            relatedReviewId: item.relatedReviewId || '',
            relatedReviewTitle: '',
            relatedReviewIdx: 0,
            tlNewDate: '', tlNewEventIdx: -1, tlNewRemark: '',
            timelineList: tlList
          }
        });

        // 延迟匹配关联审稿标题和索引
        var rid = item.relatedReviewId;
        if (rid) {
          setTimeout(function() {
            var opts = that.data.relatedReviewOptions;
            for (var i = 0; i < opts.length; i++) {
              if (opts[i]._id === rid) {
                that.setData({ 'form.relatedReviewTitle': opts[i].title, 'form.relatedReviewIdx': i });
                break;
              }
            }
          }, 800);
        }
      }).catch(function() {
        wx.showToast({ title: '加载失败', icon: 'error' });
      });
    },

    // 加载关联审稿列表（同一稿件多轮审稿）
    loadRelatedReviews: function(excludeId) {
      var that = this;
      wx.cloud.database().collection('reviews').where({ deleteTime: null })
        .orderBy('updateTime', 'desc').limit(50).get()
        .then(function(res) {
          var opts = [{ _id: '', title: '不关联' }];
          (res.data || []).forEach(function(item) {
            if (item._id !== excludeId) {
              opts.push({ _id: item._id, title: item.paperTitle || '(无标题)' });
            }
          });
          that.setData({ relatedReviewOptions: opts });
        });
    },

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

    onInvitedDateChange: function(e) {
      this.setData({ 'form.invitedDate': e.detail.value });
    },

    onSelectStatus: function(e) {
      this.setData({ 'form.status': e.currentTarget.dataset.status });
    },

    onDecisionChange: function(e) {
      var idx = parseInt(e.detail.value);
      var val = this.data.decisionOptions[idx].value;
      this.setData({ 'form.decision': val, 'form.decisionIdx': idx });
    },

    onRoundChange: function(e) {
      var idx = parseInt(e.detail.value);
      var val = this.data.roundOptions[idx].value;
      this.setData({ 'form.round': val, 'form.roundIdx': idx });
    },

    onRelatedReviewChange: function(e) {
      var idx = parseInt(e.detail.value);
      var opts = this.data.relatedReviewOptions;
      var sel = opts[idx];
      this.setData({
        'form.relatedReviewId': sel ? sel._id : '',
        'form.relatedReviewTitle': sel ? sel.title : '不关联',
        'form.relatedReviewIdx': idx
      });
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
      if (!f.paperTitle) { wx.showToast({ title: '请填写论文标题', icon: 'none' }); return; }

      // 时间线数据清理
      var tlSave = (f.timelineList || []).filter(function(item) {
        return (item.date || '') && (item.event || '');
      }).map(function(item) {
        return { date: item.date, event: item.event, remark: item.remark || '', dotColor: item.dotColor || '' };
      });

      var data = {
        paperTitle: f.paperTitle,
        journal: f.journal,
        deadline: f.deadline ? formatTime(f.deadline + ' 00:00:00') : null,
        invitedDate: f.invitedDate ? formatTime(f.invitedDate + ' 00:00:00') : null,
        status: f.status,
        decision: f.decision,
        round: f.round || 0,
        systemUrl: f.systemUrl,
        systemAccount: f.systemAccount,
        systemPassword: f.systemPassword,
        note: f.note,
        relatedReviewId: f.relatedReviewId || '',
        timeline: tlSave,
        updateTime: formatTime()
      };

      var db = wx.cloud.database();
      wx.showLoading({ title: '保存中...' });
      var promise;
      if (this.data.isEdit) {
        promise = db.collection('reviews').doc(this.data.editId).update({ data: data });
      } else {
        data.createTime = formatTime();
        data.deleteTime = null;
        promise = db.collection('reviews').add({ data: data });
      }
      promise.then(function() {
        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
        that.triggerEvent('save');
      }).catch(function() {
        wx.hideLoading();
        wx.showToast({ title: '保存失败', icon: 'error' });
      });
    },

    closeForm: function() {
      this.triggerEvent('cancel');
    },

    /* ======== 审稿决定弹窗 ======== */
    openDecision: function(e) {
      var id = e.currentTarget.dataset.id;
      var paperTitle = e.currentTarget.dataset.papertitle || '';
      var journal = e.currentTarget.dataset.journal || '';
      this.setData({
        showDecisionModal: true,
        decisionId: id,
        decisionPaper: paperTitle,
        decisionJournal: journal,
        decision: '',
        decisionNote: ''
      });
    },

    closeDecision: function() {
      this.setData({ showDecisionModal: false, decisionId: '', decision: '', decisionNote: '' });
    },

    setDecision: function(e) {
      this.setData({ decision: e.currentTarget.dataset.decision });
    },

    onDecisionNote: function(e) {
      this.setData({ decisionNote: e.detail.value });
    },

    submitDecision: function() {
      var that = this;
      var decisionId = this.data.decisionId;
      var decision = this.data.decision;
      var decisionNote = this.data.decisionNote;
      if (!decision) { wx.showToast({ title: '请选择审稿决定', icon: 'none' }); return; }
      var newStatus = (decision === 'accept' || decision === 'reject') ? 'completed' : 'submitted';
      var updateData = {
        decision: decision,
        decisionNote: decisionNote,
        decisionTime: formatTime(),
        status: newStatus,
        updateTime: formatTime()
      };
      wx.showLoading({ title: '提交中...' });
      wx.cloud.database().collection('reviews').doc(decisionId).update({ data: updateData })
        .then(function() {
          wx.hideLoading();
          wx.showToast({ title: '决定已提交', icon: 'success' });
          that.setData({ showDecisionModal: false });
          that.triggerEvent('decisionsubmit');
        }).catch(function(e) {
          wx.hideLoading();
          wx.showToast({ title: '提交失败', icon: 'error' });
          console.error(e);
        });
    },

    doNothing: function() {}
  }
});
