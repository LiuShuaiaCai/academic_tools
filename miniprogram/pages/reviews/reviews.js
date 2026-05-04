// pages/reviews/reviews.js
var dbInit = require('../../utils/dbInit');
var formatTime = dbInit.formatTime;
var formatDate = dbInit.formatDate;
var parseDate = dbInit.parseDate;
var softDelete = dbInit.softDelete;

Page({
  data: {
    list:[], searchKeyword:'', showForm:false, isEdit:false, editId:'',
    form:{ paperTitle:'', journal:'', deadline:'', status:'pending', note:'' },
    showDecisionModal:false, decisionId:'', decisionPaper:'', decisionJournal:'', decision:'', decisionNote:'',
    targetId:'', targetTitle:'', pendingAutoEdit:false
  },

  onLoad:function(options){
    if(options && options.targetId){
      this.setData({
        targetId: options.targetId,
        targetTitle: options.targetTitle ? decodeURIComponent(options.targetTitle) : '',
        pendingAutoEdit: options.autoEdit === 'true'
      });
    }
    this.loadList();
  },
  onShow:function(){
    if(!this.data.targetId) this.loadList();
  },

  /* ========= 数据加载（服务端模糊搜索）========= */
  loadList:function(){
    var that = this;
    var db = wx.cloud.database();
    var _ = db.command;

    // 构建 where 条件
    var kw = (this.data.searchKeyword || '').trim();
    var where;
    if(kw){
      var reg = db.RegExp({ regexp: kw, options: 'i' });
      where = _.or([
        { deleteTime: null, paperTitle: reg },
        { deleteTime: null, journal: reg }
      ]);
    } else {
      where = { deleteTime: null };
    }

    db.collection('reviews').where(where).orderBy('deadline','asc').get()
      .then(function(res){
        var now = new Date();
        var list = (res.data||[]).map(function(i){
          var dIso = i.deadline ? String(i.deadline).replace(' ', 'T') : i.deadline;
          var d = parseDate(i.deadline);
          var daysLeft = Math.ceil((d-now)/86400000);
          return {
            _id:i._id,
            paperTitle:i.paperTitle||'',
            journal:i.journal||'',
            deadline:i.deadline||'',
            status:i.status||'pending',
            note:i.note||'',
            decision:i.decision||'',
            decisionNote:i.decisionNote||'',
            decisionTime:i.decisionTime||'',
            daysLeft:daysLeft,
            urgent:daysLeft>=0&&daysLeft<=7
          };
        });
        that.setData({ list:list }, function() {
          // 处理首页跳转：用 targetId 精确定位
          if (that.data.targetId) {
            var targetTitle = that.data.targetTitle;
            var found = list.find(function(i){ return i._id === that.data.targetId; });
            if(found){
              if(targetTitle) that.setData({ searchKeyword: targetTitle });
              if(that.data.pendingAutoEdit){
                var fmt = found.deadline ? (function(){
                  var pd = parseDate(found.deadline);
                  return pd.getFullYear()+'-'+String(pd.getMonth()+1).padStart(2,'0')+'-'+String(pd.getDate()).padStart(2,'0');
                })() : '';
                that.setData({
                  showForm:true, isEdit:true, editId:found._id,
                  form:{
                    paperTitle:found.paperTitle||'',
                    journal:found.journal||'',
                    deadline:fmt,
                    status:found.status||'pending',
                    note:found.note||''
                  }
                });
              }
              that.setData({ targetId: '', targetTitle: '', pendingAutoEdit: false });
            } else {
              that.locateById(that.data.targetId, targetTitle);
            }
          }
        });
      }).catch(function(e){ console.error(e); });
  },

  /* ========= 通过 ID 精确定位 ========= */
  locateById:function(id, title){
    var that = this;
    wx.cloud.database().collection('reviews').doc(id).get().then(function(res){
      if(res.data){
        var i = res.data;
        var now = new Date();
        var d = parseDate(i.deadline);
        var daysLeft = Math.ceil((d-now)/86400000);
        var item = {
          _id:i._id, paperTitle:i.paperTitle||'', journal:i.journal||'',
          deadline:i.deadline||'', status:i.status||'pending', note:i.note||'',
          decision:i.decision||'', decisionNote:i.decisionNote||'', decisionTime:i.decisionTime||'',
          daysLeft:daysLeft, urgent:daysLeft>=0&&daysLeft<=7
        };
        var list = that.data.list.concat([item]);
        if(title) that.setData({ searchKeyword: title });
        that.setData({ list: list }, function(){
          if(that.data.pendingAutoEdit){
            var fmt = item.deadline ? (function(){
              var pd = parseDate(item.deadline);
              return pd.getFullYear()+'-'+String(pd.getMonth()+1).padStart(2,'0')+'-'+String(pd.getDate()).padStart(2,'0');
            })() : '';
            that.setData({
              showForm:true, isEdit:true, editId:id,
              form:{
                paperTitle:item.paperTitle||'', journal:item.journal||'',
                deadline:fmt, status:item.status||'pending', note:item.note||''
              }
            });
          }
          that.setData({ targetId: '', targetTitle: '', pendingAutoEdit: false });
        });
      }
    }).catch(function(e){
      console.error('[审稿] 定位失败', e);
      that.setData({ targetId: '', targetTitle: '', pendingAutoEdit: false });
    });
  },

  /* ========= 搜索 ========= */
  onSearch:function(e){
    this.setData({ searchKeyword:e.detail.value });
    this.loadList();
  },

  /* ========= 表单：打开 ========= */
  showAddForm:function(){
    this.setData({
      showForm:true, isEdit:false, editId:'',
      form:{ paperTitle:'', journal:'', deadline:'', status:'pending', note:'' }
    });
  },

  showEditForm:function(e){
    var id = e.currentTarget.dataset.id;
    var item = this.data.list.find(function(i){ return i._id===id; });
    if(!item) return;
    var d = item.deadline ? parseDate(item.deadline) : null;
    var fmt = '';
    if(d){
      fmt = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    }
    this.setData({
      showForm:true, isEdit:true, editId:item._id,
      form:{
        paperTitle:item.paperTitle||'',
        journal:item.journal||'',
        deadline:fmt,
        status:item.status||'pending',
        note:item.note||''
      }
    });
  },

  /* ========= 表单：输入 ========= */
  onFormInput:function(e){
    var field = e.currentTarget.dataset.field;
    var val = e.detail.value;
    var data = {};
    data['form.'+field] = val;
    this.setData(data);
  },

  onDeadlineChange:function(e){
    this.setData({ 'form.deadline': e.detail.value });
  },

  closeForm:function(){ this.setData({ showForm:false }); },

  /* ========= 表单：保存 ========= */
  saveForm:function(){
    var that = this;
    var f = this.data.form;
    if(!f.paperTitle){ wx.showToast({ title:'请填写论文标题', icon:'none' }); return; }

    var data = {
      paperTitle:f.paperTitle,
      journal:f.journal,
      deadline:f.deadline ? formatTime(f.deadline+' 00:00:00') : null,
      status:f.status,
      note:f.note,
      updateTime:formatTime()
    };
    var db = wx.cloud.database();
    wx.showLoading({ title:'保存中...' });
    var promise;
    if(this.data.isEdit){
      promise = db.collection('reviews').doc(this.data.editId).update({ data:data });
    } else {
      data.createTime = formatTime();
      data.deleteTime = null;
      promise = db.collection('reviews').add({ data:data });
    }
    promise.then(function(){
      wx.hideLoading();
      wx.showToast({ title:'保存成功', icon:'success' });
      that.setData({ showForm:false });
      that.loadList();
    }).catch(function(){
      wx.hideLoading();
      wx.showToast({ title:'保存失败', icon:'error' });
    });
  },

  /* ========= 删除 ========= */
  deleteItem:function(e){
    var that = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title:'删除确认', content:'确定删除？',
      success:function(res){
        if(res.confirm){
          softDelete('reviews',id).then(function(){ that.loadList(); });
        }
      }
    });
  },

  /* ========= 审稿决定 ========= */
  showDecision:function(e){
    var id = e.currentTarget.dataset.id;
    var item = this.data.list.find(function(i){ return i._id===id; });
    if(!item) return;
    this.setData({
      showDecisionModal:true,
      decisionId:id,
      decisionPaper:item.paperTitle||'',
      decisionJournal:item.journal||'',
      decision:'',
      decisionNote:''
    });
  },

  closeDecision:function(){
    this.setData({ showDecisionModal:false, decisionId:'', decision:'', decisionNote:'' });
  },

  setDecision:function(e){
    this.setData({ decision:e.currentTarget.dataset.decision });
  },

  onDecisionNote:function(e){
    this.setData({ decisionNote:e.detail.value });
  },

  submitDecision:function(){
    var that = this;
    var decisionId = this.data.decisionId;
    var decision = this.data.decision;
    var decisionNote = this.data.decisionNote;
    if(!decision){ wx.showToast({ title:'请选择审稿决定', icon:'none' }); return; }
    var newStatus = (decision==='accept'||decision==='reject') ? 'completed' : 'submitted';
    var updateData = {
      decision:decision,
      decisionNote:decisionNote,
      decisionTime:formatTime(),
      status:newStatus,
      updateTime:formatTime()
    };
    wx.showLoading({ title:'提交中...' });
    wx.cloud.database().collection('reviews').doc(decisionId).update({ data:updateData })
      .then(function(){
        wx.hideLoading();
        wx.showToast({ title:'决定已提交', icon:'success' });
        that.setData({ showDecisionModal:false });
        that.loadList();
      }).catch(function(e){
        wx.hideLoading();
        wx.showToast({ title:'提交失败', icon:'error' });
        console.error(e);
      });
  }
});
