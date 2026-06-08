// pages/reviews/reviews.js
var dbInit = require('../../utils/dbInit');
var formatTime = dbInit.formatTime;
var parseDate = dbInit.parseDate;
var softDelete = dbInit.softDelete;
var config = require('../../utils/reviews-config');
var formatUtil = require('../../utils/reviews-format');

Page({
  data: {
    list:[], filteredList:[], searchKeyword:'',
    showForm:false, isEdit:false, editId:'',
    // 链接弹窗
    showLinkModal: false, currentUrl: '',
    // 分页
    page:0, pageSize:20, hasMore:true, loadingMore:false, searchLoading:false,
    // 快速筛选
    quickFilter:'',
    totalCount:0, incompleteCount:0, nearCount:0, urgentCount:0,
    // 高级筛选
    showAdvanced: false,
    advStatus:'', advJournal:'', advDeadlineFrom:'', advDeadlineTo:'',
    advStatusIndex:-1, advJournalIndex:-1,
    advStatusLabel:'', advJournalLabel:'',
    advStatusOptions:[], advJournalOptions:[],
    // 首页跳转
    targetId:'', targetTitle:'', pendingAutoEdit:false, isTargetMode:false,
    currentOpenid: '' // 当前用户的 openid
  },

  onLoad:function(options){
    var that = this;
    // 获取当前用户的 openid
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserId' }
    }).then(function(res) {
      that.setData({ currentOpenid: res.result.openid });
      if(options && options.targetId){
        that.setData({
          targetId: options.targetId,
          targetTitle: options.targetTitle ? decodeURIComponent(options.targetTitle) : '',
          pendingAutoEdit: options.autoEdit === 'true',
          isTargetMode: true
        });
        that.locateById(options.targetId, options.targetTitle ? decodeURIComponent(options.targetTitle) : '');
      } else {
        that.loadList();
      }
    }).catch(function() {
      // 获取 openid 失败，仍然加载列表
      if(options && options.targetId){
        that.setData({
          targetId: options.targetId,
          targetTitle: options.targetTitle ? decodeURIComponent(options.targetTitle) : '',
          pendingAutoEdit: options.autoEdit === 'true',
          isTargetMode: true
        });
        that.locateById(options.targetId, options.targetTitle ? decodeURIComponent(options.targetTitle) : '');
      } else {
        that.loadList();
      }
    });
  },
  onShow:function(){
    if(!this.data.targetId && !this.data.isTargetMode) this.loadList();
  },

  /* ======== 统计（云函数，支持搜索关键词联动）======= */
  loadStats:function(){
    var that = this;
    var keyword = (this.data.searchKeyword || '').trim();
    wx.cloud.callFunction({
      name:'academicAPI',
      data:{
        action:'reviewStats',
        keyword: keyword
      }
    }).then(function(res){
      if(res.result && res.result.success){
        that.setData({
          totalCount: res.result.total,
          incompleteCount: res.result.incomplete,
          nearCount: res.result.near,
          urgentCount: res.result.urgent
        });
      } else {
        console.warn('[审稿] loadStats 返回不成功:', res.result);
      }
    }).catch(function(e){
      console.error('[审稿] 统计失败', e);
    });
  },

  /* ======== 数据加载（服务端分页 + 模糊搜索，按 deadline 升序）======= */
  loadList:function(isLoadMore){
    if(this.data.loadingMore) return;
    var that = this;
    var page = isLoadMore ? this.data.page + 1 : 0;
    var pageSize = this.data.pageSize;
    var skip = page * pageSize;

    this.setData({ loadingMore:true });
    if(!isLoadMore) this.setData({ searchLoading:true });

    var db = wx.cloud.database();
    var _ = db.command;

    // 构建"基础条件"（搜索 + 高级筛选，不含 quickFilter）
    var openid = that.data.currentOpenid;
    var baseConditions = [{ deleteTime: null, _openid: openid }];
    var kw = (this.data.searchKeyword || '').trim();
    if(kw){
      var reg = db.RegExp({ regexp: kw, options: 'i' });
      baseConditions.push(_.or([
        { paperTitle: reg },
        { journal: reg }
      ]));
    }
    // 高级筛选条件
    var advStatus = this.data.advStatus;
    var advJournal = this.data.advJournal;
    var advFrom = this.data.advDeadlineFrom;
    var advTo = this.data.advDeadlineTo;
    if(advStatus)    baseConditions.push({ status: advStatus });
    if(advJournal)   baseConditions.push({ journal: advJournal });
    if(advFrom)      baseConditions.push({ deadline: _.gte(advFrom + ' 00:00:00') });
    if(advTo)        baseConditions.push({ deadline: _.lte(advTo + ' 23:59:59') });

    // 构建"列表条件"（基础条件 + quickFilter）
    var listConditions = baseConditions.slice();
    var qf = this.data.quickFilter;
    if(qf && qf !== 'all'){
      if(qf === 'incomplete'){
        listConditions.push({ completed: _.neq(true) });
      } else if(qf === 'near'){
        listConditions.push({ completed: _.neq(true) });
        var now = new Date();
        var from = new Date(now); from.setDate(now.getDate() + 2);
        var to = new Date(now); to.setDate(now.getDate() + 3);
        var fStr = from.getFullYear()+'-'+String(from.getMonth()+1).padStart(2,'0')+'-'+String(from.getDate()).padStart(2,'0');
        var tStr = to.getFullYear()+'-'+String(to.getMonth()+1).padStart(2,'0')+'-'+String(to.getDate()).padStart(2,'0');
        listConditions.push({ deadline: _.gte(fStr + ' 00:00:00') });
        listConditions.push({ deadline: _.lte(tStr + ' 23:59:59') });
      } else if(qf === 'urgent'){
        listConditions.push({ completed: _.neq(true) });
        var now2 = new Date();
        var fStr2 = now2.getFullYear()+'-'+String(now2.getMonth()+1).padStart(2,'0')+'-'+String(now2.getDate()).padStart(2,'0');
        var to2 = new Date(now2); to2.setDate(now2.getDate() + 1);
        var tStr2 = to2.getFullYear()+'-'+String(to2.getMonth()+1).padStart(2,'0')+'-'+String(to2.getDate()).padStart(2,'0');
        listConditions.push({ deadline: _.gte(fStr2 + ' 00:00:00') });
        listConditions.push({ deadline: _.lte(tStr2 + ' 23:59:59') });
      }
    }

    var whereForList = listConditions.length === 1 ? listConditions[0] : _.and(listConditions);
    var whereForOptions = baseConditions.length === 1 ? baseConditions[0] : _.and(baseConditions);

    // 两个查询并行：列表数据（含 quickFilter）+ 选项数据（不含 quickFilter）
    var listQuery = db.collection('reviews')
      .where(whereForList)
      .orderBy('deadline', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get();

    var queries = [listQuery];
    if(that.data.quickFilter){
      var optionsQuery = db.collection('reviews')
        .where(whereForOptions)
        .limit(1000)
        .get();
      queries.push(optionsQuery);
    }

    Promise.all(queries).then(function(results){
      if (!results || !results.length) {
        console.error('[审稿] Promise.all 返回异常:', results);
        that.setData({ loadingMore:false, searchLoading:false, list:[], filteredList:[] });
        return;
      }
      var listRes = results[0] || {};
      var optionsRes = results[1] || {};

      var rawData = Array.isArray(listRes.data) ? listRes.data : [];
      var newItems = rawData.map(function(item){ return formatUtil.formatItem(item); });

      var list = isLoadMore ? that.data.list.concat(newItems) : newItems;
      var hasMore = newItems.length >= pageSize;
      var extra = {};

      // 构建高级筛选选项：优先用"不含 quickFilter"的选项数据
      if(!isLoadMore){
        if(optionsRes && optionsRes.data){
          var optionsData = Array.isArray(optionsRes.data) ? optionsRes.data : [];
          var optionsItems = optionsData.map(function(item){ return formatUtil.formatItem(item); });
          extra = formatUtil.buildAdvOptions(optionsItems, that.data);
        } else {
          extra = formatUtil.buildAdvOptions(list, that.data);
        }
      }

      extra.list = list;
      extra.page = isLoadMore ? page : 0;
      extra.hasMore = hasMore;
      extra.loadingMore = false;
      extra.searchLoading = false;
      that.setData(extra, function() {
        that.applyFilter();
        // 处理首页跳转：用 targetId 精确定位
        if (that.data.targetId) {
          var targetTitle = that.data.targetTitle;
          var found = list.find(function(i){ return i._id === that.data.targetId; });
          if(found){
            if(targetTitle) that.setData({ searchKeyword: targetTitle });
            if(that.data.pendingAutoEdit){
              that.setData({
                showForm: true, isEdit: true, editId: that.data.targetId
              });
            }
            that.setData({ targetId: '', targetTitle: '', pendingAutoEdit: false });
          } else {
            that.locateById(that.data.targetId, targetTitle);
          }
        }
      });
      // 每次加载完成后更新统计
      if(!isLoadMore) that.loadStats();
    }).catch(function(e){
      console.error('[审稿] 加载失败',e);
      that.setData({ loadingMore:false, searchLoading:false });
      if(!isLoadMore) that.setData({ list:[], filteredList:[] });
    });
  },

  /* ======== 通过 ID 精确定位（首页跳转时只显示这一个）======= */
  locateById:function(id, title){
    var that = this;
    var openid = that.data.currentOpenid;
    if (!openid) return;
    wx.cloud.database().collection('reviews').where({ _id: id, _openid: openid }).get().then(function(res){
      var item = (res.data && res.data.length > 0) ? res.data[0] : null;
      if(item){
        var formatted = formatUtil.formatItem(item);
        var list = [formatted];
        if(title) that.setData({ searchKeyword: title });
        var shouldAutoEdit = that.data.pendingAutoEdit;
        that.setData({
          list: list,
          filteredList: list,
          isTargetMode: true,
          targetId: '', targetTitle: '', pendingAutoEdit: false
        }, function(){
          if(shouldAutoEdit){
            that.setData({ showForm: true, isEdit: true, editId: id });
          }
        });
        that.loadStats();
      }
    }).catch(function(e){
      console.error('[审稿] 定位失败', e);
      that.setData({ targetId: '', targetTitle: '', pendingAutoEdit: false, isTargetMode: false });
      that.loadList();
    });
  },

  /* ======== 查看全部（退出单条模式）======= */
  showAll:function(){
    this.setData({ isTargetMode: false, searchKeyword: '', targetId: '', targetTitle: '' });
    this.loadList();
  },

  /* ======== 搜索/筛选 ======== */
  onSearch:function(e){
    this.setData({ searchKeyword:e.detail.value, page:0, hasMore:true });
    this.loadList(false);
  },
  clearSearch:function(){
    this.setData({ searchKeyword:'', page:0, hasMore:true, isTargetMode:false, targetId:'', targetTitle:'', pendingAutoEdit:false });
    this.loadList(false);
  },

  // 快速筛选
  onTipFilter:function(e){
    var type = e.currentTarget.dataset.filter;
    this.setData({
      quickFilter: type === this.data.quickFilter ? '' : type,
      page:0, hasMore:true,
      // 关闭高级筛选面板，清空高级筛选条件（互斥）
      showAdvanced: false,
      advStatus:'', advJournal:'', advDeadlineFrom:'', advDeadlineTo:'',
      advStatusIndex:-1, advJournalIndex:-1,
      advStatusLabel:'', advJournalLabel:''
    });
    this.loadList(false);
  },

  // 高级筛选
  toggleAdvanced:function(){
    var opening = !this.data.showAdvanced;
    this.setData({
      showAdvanced: opening,
      // 展开高级筛选时，取消快速筛选选中
      quickFilter: opening ? '' : this.data.quickFilter
    });
  },

  onAdvStatusChange:function(e){
    var idx = parseInt(e.detail.value);
    var opt = this.data.advStatusOptions[idx] || {};
    this.setData({
      advStatusIndex:idx, advStatus:opt.value||'', advStatusLabel:opt.label||'',
      quickFilter:'', page:0, hasMore:true
    });
    this.loadList(false);
  },
  onAdvJournalChange:function(e){
    var idx = parseInt(e.detail.value);
    var opt = this.data.advJournalOptions[idx] || {};
    this.setData({
      advJournalIndex:idx, advJournal:opt.value||'', advJournalLabel:opt.label||'',
      quickFilter:'', page:0, hasMore:true
    });
    this.loadList(false);
  },
  onAdvDeadlineFromChange:function(e){
    this.setData({ advDeadlineFrom:e.detail.value, quickFilter:'', page:0, hasMore:true });
    this.loadList(false);
  },
  onAdvDeadlineToChange:function(e){
    this.setData({ advDeadlineTo:e.detail.value, quickFilter:'', page:0, hasMore:true });
    this.loadList(false);
  },

  clearAdvStatus:function(){
    this.setData({ advStatus:'', advStatusIndex:-1, advStatusLabel:'', quickFilter:'', page:0, hasMore:true });
    this.loadList(false);
  },
  clearAdvJournal:function(){
    this.setData({ advJournal:'', advJournalIndex:-1, advJournalLabel:'', quickFilter:'', page:0, hasMore:true });
    this.loadList(false);
  },
  clearAdvDeadlineFrom:function(){
    this.setData({ advDeadlineFrom:'', quickFilter:'', page:0, hasMore:true });
    this.loadList(false);
  },
  clearAdvDeadlineTo:function(){
    this.setData({ advDeadlineTo:'', quickFilter:'', page:0, hasMore:true });
    this.loadList(false);
  },

  resetAdvanced:function(){
    this.setData({
      advStatus:'', advJournal:'', advDeadlineFrom:'', advDeadlineTo:'',
      advStatusIndex:-1, advJournalIndex:-1,
      advStatusLabel:'', advJournalLabel:'',
      page:0, hasMore:true
    });
    this.loadList(false);
  },

  // 客户端过滤（服务端已完成，只同步 filteredList）
  applyFilter:function(){
    var baseList = Array.isArray(this.data.list) ? this.data.list : [];
    this.setData({ filteredList: baseList });
  },

  onReachBottom:function(){
    if(this.data.hasMore && !this.data.loadingMore){
      this.loadList(true);
    }
  },

  /* ======== 表单控制（通过 form 组件）======== */
  showAddForm:function(){
    this.setData({ showForm:true, isEdit:false, editId:'' });
  },

  showEditForm:function(e){
    var id = e.currentTarget.dataset.id;
    this.setData({ showForm:true, isEdit:true, editId:id });
  },

  onFormSave:function(){
    this.setData({ showForm:false, isEdit:false, editId:'', quickFilter:'', page:0, hasMore:true });
    this.loadList();
  },

  onFormCancel:function(){
    this.setData({ showForm:false, isEdit:false, editId:'' });
  },

  /* ======== 删除 ======== */
  deleteItem:function(e){
    var that = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title:'删除确认', content:'确定删除？',
      success:function(res){
        if(res.confirm){
          softDelete('reviews',id).then(function(){
            wx.showToast({ title:'已删除', icon:'success' });
            that.loadList();
          });
        }
      }
    });
  },

  /* ======== 审稿决定（通过 form 组件）======== */
  showDecision:function(e){
    var id = e.currentTarget.dataset.id;
    var item = this.data.list.find(function(i){ return i._id===id; });
    if(!item) return;
    // 通过 selectComponent 调用 form 组件的 openDecision
    var formComp = this.selectComponent('#reviewForm');
    if(formComp){
      formComp.openDecision({
        currentTarget: {
          dataset: {
            id: id,
            papertitle: item.paperTitle || '',
            journal: item.journal || '',
            decision: item.decision || '',
            decisionnote: item.decisionNote || ''
          }
        }
      });
    }
  },

  onDecisionSubmit:function(){
    this.loadList();
  },

  /* ======== 完成/取消完成 ======== */
  toggleComplete:function(e){
    try {
      var that = this;
      var target = (e && e.currentTarget) ? e.currentTarget : {};
      var dataset = target.dataset || {};
      var id = dataset.id;
      if (!id) return;
      var currentlyCompleted = !!dataset.completed;
      var newCompleted = !currentlyCompleted;
      var db = wx.cloud.database();
      var openid = that.data.currentOpenid;
      if (!openid) {
        wx.showToast({ title: '用户信息获取中，请稍后重试', icon: 'none' });
        return;
      }

      wx.showLoading({ title: newCompleted ? '标记完成...' : '取消完成...', mask:true });
      db.collection('reviews').where({ _id: id, _openid: openid }).update({
        data:{ completed: newCompleted }
      }).then(function(){
        wx.hideLoading();
        wx.showToast({ title: newCompleted ? '已完成' : '已取消', icon:'success' });
        that.loadList();
        that.loadStats();
      }).catch(function(err){
        wx.hideLoading();
        console.error('[审稿] 标记完成失败', err);
        wx.showToast({ title:'操作失败', icon:'none' });
      });
    } catch(err) {
      console.error('[审稿] toggleComplete 异常', err);
      wx.hideLoading();
    }
  },

  /* ======== 打开审稿系统链接 ======== */
  onOpenSystemUrl:function(e){
    var url = e.currentTarget.dataset.url;
    if(url){
      this.setData({ showLinkModal: true, currentUrl: url });
    }
  },
  onOpenEmail:function(e){
    var email = e.currentTarget.dataset.email;
    if(email){
      wx.setClipboardData({
        data: email,
        success: function(){
          wx.showToast({ title:'邮箱已复制，请到邮箱 APP 发送', icon:'none', duration:2000 });
        }
      });
    }
  },
  onCopyLinkModal:function(){
    wx.setClipboardData({
      data: this.data.currentUrl,
      success: function(){
        wx.showToast({ title:'已复制', icon:'success' });
      }
    });
  },
  onCloseLinkModal:function(){
    this.setData({ showLinkModal: false });
  },

  doNothing:function(){}
});
