// pages/submissions/form/form.js
var dbInit = require('../../../utils/dbInit');
var formatTime = dbInit.formatTime;
var parseDate = dbInit.parseDate;
var config = require('../../../utils/submissions-config');
var formatUtil = require('../../../utils/submissions-format');
var creditsUtil = require('../../../utils/credits');

Component({
  properties: {
    show: { type: Boolean, value: false },
    isEdit: { type: Boolean, value: false },
    editId: { type: String, value: '' }
  },

  data: {
    form: {
      title:'', journal:'', status:'preparing', role:'first', paperType:'研究论文',
      priority:'normal', deadline:'', manuscriptId:'', doi:'', url:'',
      corresponding:'', payee:'', coauthors:'', note:'',
      tags:'', fields:'', funds:'',
      fieldsInput:'', tagsInput:'', fundsInput:'',
      fieldsList:[], tagsList:[], fundsList:[],
      relatedWorkId:'', relatedWorkTitle:'',
      tlNewDate:'', tlNewEventIdx:-1, tlNewRemark:'',
      timelineList:[]
    },
    statusOptions:[],
    roleOptions: config.ROLE_OPTIONS,
    priorityOptions: config.PRIORITY_OPTIONS,
    typeOptions: config.TYPE_OPTIONS,
    tlEventOptions: config.TL_EVENT_OPTIONS,
    relatedWorkOptions:[]
  },

  lifetimes: {
    attached: function() {
      var opts = config.getStatusOptions();
      this.setData({ statusOptions: opts });
      if (this.data.isEdit && this.data.editId) {
        this.loadEditData(this.data.editId);
      }
      this.loadRelatedWorks(this.data.editId || null);
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
          title:'', journal:'', status:'preparing', role:'first', paperType:'研究论文',
          priority:'normal', deadline:'', manuscriptId:'', doi:'', url:'',
          corresponding:'', payee:'', coauthors:'', note:'',
          tags:'', fields:'', funds:'',
          fieldsInput:'', tagsInput:'', fundsInput:'',
          fieldsList:[], tagsList:[], fundsList:[],
          relatedWorkId:'', relatedWorkTitle:'',
          tlNewDate:'', tlNewEventIdx:-1, tlNewRemark:'',
          timelineList:[]
        }
      });
      this.loadRelatedWorks(null);
    },

    loadEditData: function(id) {
      var that = this;
      // 先清空表单，避免编辑不同稿件时闪旧数据
      // this.resetForm();
      this.loadRelatedWorks(id);
      wx.cloud.database().collection('submissions').doc(id).get().then(function(res){
        var item = res.data;
        if(!item) return;
        var tlList = (item.timeline||[]).map(function(t){
          return { date:t.date||'', event:t.event||'', remark:t.remark||'', dotColor:t.dotColor||'' };
        });
        var colorMap = {};
        config.TL_EVENT_OPTIONS.forEach(function(opt){ colorMap[opt.label] = opt.color; });
        tlList.forEach(function(item){
          if(!item.dotColor && colorMap[item.event]){
            item.dotColor = colorMap[item.event];
          }
        });
        tlList.sort(function(a, b){ return b.date.localeCompare(a.date); });
        that.setData({
          form: {
            title:item.title||'', journal:item.journal||'', status:item.status||'preparing',
            role:item.role||'first', paperType:item.paperType||'研究论文',
            priority:item.priority||'normal',
            priorityLabel: config.getPriorityLabel(item.priority),
            deadline:item.deadline ? formatUtil.formatDate(new Date(String(item.deadline).replace(' ','T'))) : '',
            manuscriptId:item.manuscriptId||'', doi:item.doi||'', url:item.url||'',
            corresponding:item.corresponding||'', payee:item.payee||'',
            coauthors:(item.coauthors||[]).join(','), note:item.note||'',
            tags:(item.tags||[]).join(','), fields:(item.fields||[]).join(','), funds:(item.funds||[]).join(','),
            fieldsInput:'', tagsInput:'', fundsInput:'',
            fieldsList:formatUtil.splitStrToArray(item.fields),
            tagsList:formatUtil.splitStrToArray(item.tags),
            fundsList:formatUtil.splitStrToArray(item.funds),
            relatedWorkId:item.relatedWorkId||'',
            relatedWorkTitle:'',
            tlNewDate:'', tlNewEventIdx:-1, tlNewRemark:'',
            timelineList:tlList
          }
        });
        var rid = item.relatedWorkId;
        if(rid){
          setTimeout(function(){
            var opts = that.data.relatedWorkOptions;
            for(var i=0;i<opts.length;i++){
              if(opts[i]._id === rid){ that.setData({ 'form.relatedWorkTitle':opts[i].title }); break; }
            }
          }, 800);
        }
      }).catch(function(){ wx.showToast({ title:'加载失败', icon:'error' }); });
    },

    loadRelatedWorks: function(excludeId) {
      var that = this;
      wx.cloud.database().collection('submissions').where({ deleteTime:null }).orderBy('updateTime','desc').limit(50).get()
        .then(function(res){
          var opts = [{ _id:'', title:'不关联' }];
          (res.data||[]).forEach(function(item){
            if(item._id !== excludeId) opts.push({ _id:item._id, title:item.title||'(无标题)' });
          });
          that.setData({ relatedWorkOptions: opts });
        });
    },

    onFormInput: function(e) {
      var field = e.currentTarget.dataset.field;
      var val = e.detail.value;
      var data = {};
      data['form.'+field] = val;
      this.setData(data);
    },

    onDeadlineChange: function(e) {
      this.setData({ 'form.deadline': e.detail.value });
    },

    onSelectStatus: function(e) {
      this.setData({ 'form.status': e.currentTarget.dataset.status });
    },

    onRoleChange: function(e) {
      var idx = e.detail.value;
      var val = this.data.roleOptions[idx].value;
      var label = this.data.roleOptions[idx].label;
      this.setData({ 'form.role': val, 'form.roleLabel': label });
    },

    onTypeChange: function(e) {
      var idx = e.detail.value;
      var val = this.data.typeOptions[idx].value;
      this.setData({ 'form.paperType': val });
    },

    onPriorityChange: function(e) {
      var idx = e.detail.value;
      var val = this.data.priorityOptions[idx].value;
      var label = this.data.priorityOptions[idx].label;
      this.setData({ 'form.priority': val, 'form.priorityLabel': label });
    },

    onTagInput: function(e) {
      var field = e.currentTarget.dataset.target + 'Input';
      var data = {};
      data['form.'+field] = e.detail.value;
      this.setData(data);
    },

    onTagConfirm: function(e) {
      var target = e.currentTarget.dataset.target;
      var inputField = target+'Input';
      var val = (this.data.form[inputField]||'').trim();
      if(!val) return;
      var listField = target+'List';
      var current = this.data.form[listField]||[];
      if(current.indexOf(val)!==-1){ wx.showToast({ title:'已存在', icon:'none' }); return; }
      var newList = current.concat([val]);
      var data = {};
      data['form.'+listField] = newList;
      data['form.'+target] = newList.join(',');
      data['form.'+inputField] = '';
      this.setData(data);
    },

    removeChip: function(e) {
      var field = e.currentTarget.dataset.field;
      var idx = e.currentTarget.dataset.i;
      var listField = field+'List';
      var current = this.data.form[listField]||[];
      var newList = current.filter(function(_,i){ return i!==idx; });
      var data = {};
      data['form.'+listField] = newList;
      data['form.'+field] = newList.join(',');
      this.setData(data);
    },

    onRelatedWorkChange: function(e) {
      var idx = e.detail.value;
      var opts = this.data.relatedWorkOptions;
      var sel = opts[idx];
      var data = {};
      data['form.relatedWorkId'] = sel ? sel._id : '';
      data['form.relatedWorkTitle'] = sel ? sel.title : '不关联';
      this.setData(data);
    },

    _setTimelineField: function(idx, field, val) {
      var tl = this.data.form.timelineList.slice();
      tl[idx] = tl[idx] || {};
      tl[idx][field] = val;
      this.setData({ 'form.timelineList': tl });
    },

    onTLNewDateChange: function(e) {
      this.setData({ 'form.tlNewDate': e.detail.value });
    },

    onTLNewEventChange: function(e) {
      var idx = parseInt(e.detail.value);
      this.setData({ 'form.tlNewEventIdx': idx });
    },

    onTLNewRemarkInput: function(e) {
      this.setData({ 'form.tlNewRemark': e.detail.value });
    },

    addTimelineItem: function() {
      var f = this.data.form;
      if(!f.tlNewDate || f.tlNewEventIdx < 0){
        wx.showToast({ title:'请选择日期和事件', icon:'none' });
        return;
      }
      var ev = this.data.tlEventOptions[f.tlNewEventIdx];
      var tl = (this.data.form.timelineList||[]).slice();
      var remark = (f.tlNewRemark || '').trim();
      var newItem = { date:f.tlNewDate, event:ev.label, dotColor:ev.color, remark:remark };
      tl.push(newItem);
      tl.sort(function(a, b){ return b.date.localeCompare(a.date); });
      var data = {};
      data['form.timelineList'] = tl;
      data['form.tlNewDate'] = '';
      data['form.tlNewEventIdx'] = -1;
      data['form.tlNewRemark'] = '';
      this.setData(data);
      wx.showToast({ title:'已添加：'+ev.label, icon:'success' });
    },

    onTimelineDateInput: function(e) {
      var idx = e.currentTarget.dataset.i;
      this._setTimelineField(idx, 'date', e.detail.value);
    },

    onTimelineEventInput: function(e) {
      var idx = e.currentTarget.dataset.i;
      this._setTimelineField(idx, 'event', e.detail.value);
    },

    removeTimelineItem: function(e) {
      var idx = e.currentTarget.dataset.i;
      var tl = this.data.form.timelineList.slice();
      tl.splice(idx, 1);
      this.setData({ 'form.timelineList': tl });
    },

    saveForm: function() {
      var that = this;
      var f = this.data.form;
      if(!f.title){ wx.showToast({ title:'请填写论文标题', icon:'none' }); return; }

      var tlSave = (f.timelineList||[]).filter(function(item){
        return (item.date||'') && (item.event||'');
      }).map(function(item){ return { date:item.date, event:item.event, remark:item.remark||'', dotColor:item.dotColor||'' }; });

      var data = {
        title:f.title, journal:f.journal, status:f.status, role:f.role,
        paperType:f.paperType, priority:f.priority,
        deadline:f.deadline ? formatTime(f.deadline+' 00:00:00') : null,
        manuscriptId:f.manuscriptId, doi:f.doi, url:f.url,
        corresponding:f.corresponding, payee:f.payee,
        coauthors:formatUtil.splitAndTrim(f.coauthors), tags:formatUtil.splitAndTrim(f.tags),
        fields:formatUtil.splitAndTrim(f.fields), funds:formatUtil.splitAndTrim(f.funds),
        relatedWorkId:f.relatedWorkId||'',
        note:f.note||'',
        timeline:tlSave,
        updateTime:formatTime()
      };

      // 判断是否完成：时间线最大时间 >= deadline 则 completed = true
      var deadlineDate = f.deadline ? new Date(String(f.deadline).replace(' ','T')) : null;
      var maxTlDate = null;
      tlSave.forEach(function(t){
        if(t.date){
          var d = new Date(String(t.date).replace(' ','T'));
          if(!maxTlDate || d.getTime() > maxTlDate.getTime()) maxTlDate = d;
        }
      });
      data.completed = !!(deadlineDate && maxTlDate && maxTlDate.getTime() >= deadlineDate.getTime());

      wx.showLoading({ title:'保存中...' });
      var db = wx.cloud.database();
      var promise;
      if(this.data.isEdit){
        promise = db.collection('submissions').doc(this.data.editId).update({ data:data });
      } else {
        // 新增投稿消耗积分
        promise = creditsUtil.spendCredits('new_submission', 5).then(function(spendResult) {
          if (!spendResult.success) {
            wx.hideLoading();
            return Promise.reject('insufficient');
          }
          data.createTime = formatTime();
          data.attachments = [];
          data.deleteTime = null;
          return db.collection('submissions').add({ data:data });
        });
      }
      promise.then(function(){
        wx.hideLoading();
        wx.showToast({ title:'保存成功', icon:'success' });
        that.triggerEvent('save');
      }).catch(function(e){
        wx.hideLoading();
        wx.showToast({ title:'保存失败', icon:'error' });
        console.error(e);
      });
    },

    closeForm: function() {
      this.triggerEvent('cancel');
    },

    doNothing: function() {}
  }
});
