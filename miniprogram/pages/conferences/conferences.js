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
    ],
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
        { deleteTime: null, name: reg },
        { deleteTime: null, shortName: reg },
        { deleteTime: null, location: reg }
      ]);
    } else {
      where = { deleteTime: null };
    }

    db.collection('conferences').where(where).orderBy('deadline','asc').get()
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
        that.setData({ list:list }, function() {
          that.applyFilter();
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
                var nfmt = found.notificationDate ? that.formatDate(parseDate(found.notificationDate)) : '';
                that.setData({
                  showForm:true, isEdit:true, editId:found._id,
                  form:{
                    name:found.name||'', shortName:found.shortName||'',
                    location:found.location||'', deadline:fmt,
                    notificationDate:nfmt,
                    startDate:found.startDateLabel||'', url:found.url||'',
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
      }).catch(function(e){
        console.error('[会议] 加载失败',e);
        that.setData({ list:[], filteredList:[] });
      });
  },

  /* ========= 通过 ID 精确定位 ========= */
  locateById:function(id, title){
    var that = this;
    wx.cloud.database().collection('conferences').doc(id).get().then(function(res){
      if(res.data){
        var i = res.data;
        var now = new Date();
        var d = i.deadline ? parseDate(i.deadline) : null;
        var daysLeft = d ? Math.ceil((d-now)/86400000) : null;
        var item = {
          _id:i._id, name:i.name, shortName:i.shortName||'', location:i.location||'',
          deadline:i.deadline||'', notificationDate:i.notificationDate||'', startDate:i.startDate||'',
          url:i.url||'', note:i.note||'', status:i.status||'', createTime:i.createTime, updateTime:i.updateTime,
          daysLeft:daysLeft, urgent:daysLeft!==null&&daysLeft>=0&&daysLeft<=14,
          deadlineLabel: d ? that.formatDate(d) : '',
          startDateLabel: i.startDate ? that.formatDate(parseDate(i.startDate)) : ''
        };
        var list = that.data.list.concat([item]);
        if(title) that.setData({ searchKeyword: title });
        that.setData({ list: list }, function(){
          that.applyFilter();
          if(that.data.pendingAutoEdit){
            var fmt = item.deadline ? (function(){
              var pd = parseDate(item.deadline);
              return pd.getFullYear()+'-'+String(pd.getMonth()+1).padStart(2,'0')+'-'+String(pd.getDate()).padStart(2,'0');
            })() : '';
            var nfmt = item.notificationDate ? that.formatDate(parseDate(item.notificationDate)) : '';
            that.setData({
              showForm:true, isEdit:true, editId:id,
              form:{
                name:item.name||'', shortName:item.shortName||'',
                location:item.location||'', deadline:fmt,
                notificationDate:nfmt,
                startDate:item.startDateLabel||'', url:item.url||'',
                note:item.note||''
              }
            });
          }
          that.setData({ targetId: '', targetTitle: '', pendingAutoEdit: false });
        });
      }
    }).catch(function(e){
      console.error('[会议] 定位失败', e);
      that.setData({ targetId: '', targetTitle: '', pendingAutoEdit: false });
    });
  },

  /* ========= 搜索/筛选 ========= */
  applyFilter:function(){
    // 关键词搜索已由服务端 db.RegExp 完成，客户端只做状态筛选
    var status = this.data.filterStatus;
    var result = this.data.list;
    if(status==='pending')   result = result.filter(function(i){ return i.daysLeft!==null&&i.daysLeft>=0; });
    if(status==='registered') result = result.filter(function(i){ return i.daysLeft!==null&&i.daysLeft<0; });
    if(status==='expired')  result = result.filter(function(i){ return i.daysLeft!==null&&i.daysLeft<-30; });
    this.setData({ filteredList:result });
  },

  onSearch:function(e){ this.setData({ searchKeyword:e.detail.value }); this.loadList(); },
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
