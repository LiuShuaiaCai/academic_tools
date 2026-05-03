// pages/reviews/reviews.js
var dbInit = require('../../utils/dbInit');
var formatTime = dbInit.formatTime;
var formatDate = dbInit.formatDate;
var parseDate = dbInit.parseDate;
var softDelete = dbInit.softDelete;

Page({
  data: {
    list:[], showForm:false, isEdit:false, editId:'',
    form:{ paperTitle:'', journal:'', deadline:'', status:'pending', note:'' },
    showDecisionModal:false, decisionId:'', decisionPaper:'', decisionJournal:'', decision:'', decisionNote:''
  },

  onLoad:function(){ this.loadList(); },
  onShow:function(){ this.loadList(); },

  /* ========= 数据加载 ========= */
  loadList:function(){
    var that = this;
    wx.cloud.database().collection('reviews').where({ deleteTime:null }).orderBy('deadline','asc').get()
      .then(function(res){
        var now = new Date();
        var list = (res.data||[]).map(function(i){
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
        that.setData({ list:list });
      }).catch(function(e){ console.error(e); });
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
