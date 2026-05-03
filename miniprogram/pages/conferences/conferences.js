// pages/conferences/conferences.js
var dbInit = require('../../utils/dbInit');
var formatTime = dbInit.formatTime;
var formatDate = dbInit.formatDate;
var parseDate = dbInit.parseDate;
var softDelete = dbInit.softDelete;

Page({
  data: {
    list:[], filteredList:[], searchKeyword:'', filterStatus:'all',
    showForm:false, isEdit:false, editId:'',
    form:{ name:'', shortName:'', location:'', deadline:'', notificationDate:'', startDate:'', url:'', note:'' },
    filterTabs:[
      { value:'all',      label:'全部' },
      { value:'pending',   label:'待截稿' },
      { value:'registered',label:'已报名' },
      { value:'expired',  label:'已过期' }
    ]
  },

  onLoad:function(){ this.loadList(); },
  onShow:function(){ this.loadList(); },

  /* ========= 数据加载 ========= */
  loadList:function(){
    var that = this;
    wx.cloud.database().collection('conferences').where({ deleteTime:null }).orderBy('deadline','asc').get()
      .then(function(res){
        var now = new Date();
        var list = (res.data||[]).map(function(i){
          var d = i.deadline ? parseDate(i.deadline) : null;
          var daysLeft = d ? Math.ceil((d-now)/86400000) : null;
          return {
            _id:i._id, name:i.name, shortName:i.shortName||'', location:i.location||'',
            deadline:i.deadline||'', notificationDate:i.notificationDate||'', startDate:i.startDate||'',
            url:i.url||'', note:i.note||'', status:i.status||'', createTime:i.createTime, updateTime:i.updateTime,
            daysLeft:daysLeft, urgent:daysLeft!==null&&daysLeft>=0&&daysLeft<=14,
            deadlineLabel: d ? that.formatDate(d) : '',
            startDateLabel: i.startDate ? that.formatDate(parseDate(i.startDate)) : ''
          };
        });
        that.setData({ list:list });
        that.applyFilter();
      }).catch(function(e){
        console.error('[会议] 加载失败',e);
        that.setData({ list:[], filteredList:[] });
      });
  },

  /* ========= 搜索/筛选 ========= */
  applyFilter:function(){
    var kw = (this.data.searchKeyword||'').toLowerCase();
    var status = this.data.filterStatus;
    var result = this.data.list;
    if(status==='pending')   result = result.filter(function(i){ return i.daysLeft!==null&&i.daysLeft>=0; });
    if(status==='registered') result = result.filter(function(i){ return i.daysLeft!==null&&i.daysLeft<0; });
    if(status==='expired')  result = result.filter(function(i){ return i.daysLeft!==null&&i.daysLeft<-30; });
    if(kw){
      result = result.filter(function(i){
        return (i.name||'').toLowerCase().indexOf(kw)!==-1
          || (i.shortName||'').toLowerCase().indexOf(kw)!==-1
          || (i.location||'').toLowerCase().indexOf(kw)!==-1;
      });
    }
    this.setData({ filteredList:result });
  },

  onSearch:function(e){ this.setData({ searchKeyword:e.detail.value }); this.applyFilter(); },
  setFilter:function(e){ this.setData({ filterStatus:e.currentTarget.dataset.status }); this.applyFilter(); },

  /* ========= 表单 ========= */
  showAddForm:function(){
    this.setData({ showForm:true, isEdit:false, editId:'', form:{ name:'', shortName:'', location:'', deadline:'', notificationDate:'', startDate:'', url:'', note:'' } });
  },

  showEditForm:function(e){
    var id = e.currentTarget.dataset.id;
    var item = this.data.list.find(function(i){ return i._id===id; });
    if(!item) return;
    this.setData({
      showForm:true, isEdit:true, editId:item._id,
      form:{
        name:item.name||'', shortName:item.shortName||'', location:item.location||'',
        deadline:item.deadlineLabel||'',
        notificationDate:item.notificationDate ? this.formatDate(parseDate(item.notificationDate)) : '',
        startDate:item.startDateLabel||'',
        url:item.url||'', note:item.note||''
      }
    });
  },

  onFormInput:function(e){
    var field = e.currentTarget.dataset.field;
    var val = e.detail.value;
    var data = {};
    data['form.'+field] = val;
    this.setData(data);
  },

  onDeadlineChange:function(e){ this.setData({ 'form.deadline': e.detail.value }); },
  onNotifyChange:function(e){   this.setData({ 'form.notificationDate': e.detail.value }); },
  onStartChange:function(e){    this.setData({ 'form.startDate': e.detail.value }); },

  closeForm:function(){ this.setData({ showForm:false }); },

  saveForm:function(){
    var that = this;
    var f = this.data.form;
    if(!f.name){ wx.showToast({ title:'请填写会议名称', icon:'none' }); return; }

    var data = {
      name:f.name, shortName:f.shortName, location:f.location,
      deadline:f.deadline ? formatTime(f.deadline+' 00:00:00') : null,
      notificationDate:f.notificationDate ? formatTime(f.notificationDate+' 00:00:00') : null,
      startDate:f.startDate ? formatTime(f.startDate+' 00:00:00') : null,
      url:f.url, note:f.note, updateTime:formatTime()
    };
    var db = wx.cloud.database();
    wx.showLoading({ title:'保存中...' });
    var promise;
    if(this.data.isEdit){
      promise = db.collection('conferences').doc(this.data.editId).update({ data:data });
    } else {
      data.createTime = formatTime();
      data.deleteTime = null;
      promise = db.collection('conferences').add({ data:data });
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

  deleteItem:function(e){
    var that = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title:'删除确认', content:'确定删除？',
      success:function(res){
        if(res.confirm){
          softDelete('conferences',id).then(function(){
            wx.showToast({ title:'已删除', icon:'success' });
            that.loadList();
          });
        }
      }
    });
  },

  /* ========= 工具 ========= */
  formatDate:function(d){
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
});
