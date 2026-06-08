// pages/submissions/submissions.js
var dbInit = require('../../utils/dbInit');
var formatTime = dbInit.formatTime;
var parseDate = dbInit.parseDate;
var softDelete = dbInit.softDelete;
var config = require('../../utils/submissions-config');
var formatUtil = require('../../utils/submissions-format');

Page({
  data: {
    list:[], filteredList:[], filterGroup:'status', searchKeyword:'',
    showForm:false, isEdit:false, editId:'',
    page:0, pageSize:20, hasMore:true, loadingMore:false, searchLoading:false,
    showAdvanced:false,
    quickFilter:'',
    advStatus:'', advRole:'', advJournal:'', advPriority:'', advDeadlineFrom:'', advDeadlineTo:'',
    advCompleted:'',
    advStatusIndex:-1, advRoleIndex:-1, advJournalIndex:-1, advPriorityIndex:-1, advCompletedIndex:-1,
    advStatusLabel:'', advRoleLabel:'', advJournalLabel:'', advPriorityLabel:'', advCompletedLabel:'',
    advStatusOptions:[], advRoleOptions:[], advJournalOptions:[], advPriorityOptions:[], advCompletedOptions:[],
    statusOptions: config.getStatusOptions(),
    // 筛选Tab（用于状态分组）
    filterTabs: config.getStatusOptions(),
    // 首页跳转带来的待处理参数
    targetId:'', targetTitle:'', pendingAutoEdit:false,
    isTargetMode:false,  // 是否只显示目标稿件
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
        // 首页跳转：只定位目标稿件，不加载完整列表
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
    // 只有没有待处理参数时才刷新列表，避免重复加载
    if(!this.data.targetId && !this.data.isTargetMode) this.loadList();
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
    var openid = this.data.currentOpenid;
    var baseConditions = [{ deleteTime: null, _openid: openid }];
    var kw = (this.data.searchKeyword || '').trim();
    if(kw){
      var reg = db.RegExp({ regexp: kw, options: 'i' });
      baseConditions.push(_.or([
        { title: reg },
        { journal: reg },
        { coauthors: reg },
        { tags: reg }
      ]));
    }
    // 高级筛选条件
    var advStatus    = this.data.advStatus;
    var advRole      = this.data.advRole;
    var advJournal   = this.data.advJournal;
    var advPriority  = this.data.advPriority;
    var advCompleted = this.data.advCompleted;
    var advFrom      = this.data.advDeadlineFrom;
    var advTo        = this.data.advDeadlineTo;
    if(advStatus)    baseConditions.push({ status: advStatus });
    if(advRole)      baseConditions.push({ role: advRole });
    if(advJournal)   baseConditions.push({ journal: advJournal });
    if(advPriority)  baseConditions.push({ priority: advPriority });
    if(advCompleted === 'yes') baseConditions.push({ completed: true });
    if(advCompleted === 'no')  baseConditions.push({ completed: _.neq(true) });
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
    // _openid 已在 baseConditions 中声明
    var listQuery = db.collection('submissions')
      .where(whereForList)
      .orderBy('deadline', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get();

    var queries = [listQuery];
    if(that.data.quickFilter){
      var optionsQuery = db.collection('submissions')
        .where(whereForOptions)
        .limit(1000)
        .get();
      queries.push(optionsQuery);
    }

    Promise.all(queries).then(function(results){
      var listRes = results[0];
      var optionsRes = results[1]; // undefined if no quickFilter

      var rawData = Array.isArray(listRes.data) ? listRes.data : [];
      var newItems = rawData.map(function(item){ return formatUtil.formatItem(item); });

      // 收集 relatedWorkId → 建立映射
      var relatedMap = {};
      rawData.forEach(function(raw, idx){
        if(raw.relatedWorkId){
          relatedMap[raw.relatedWorkId] = idx;
        }
      });

      var relatedIds = Object.keys(relatedMap);
      if(relatedIds.length === 0){
        processItems(newItems, optionsRes);
        return;
      }

      // 批量查询关联作品（仅当前用户）
      db.collection('submissions')
        .where({ _id: _.in(relatedIds), deleteTime:null, _openid: that.data.currentOpenid })
        .get()
        .then(function(relRes){
          (relRes.data || []).forEach(function(rel){
            var idx = relatedMap[rel._id];
            if(idx !== undefined){
              newItems[idx].relatedWork = {
                _id: rel._id,
                title: rel.title || '',
                journal: rel.journal || ''
              };
            }
          });
          processItems(newItems, optionsRes);
        })
        .catch(function(e){
          console.error('[投稿] 查询关联作品失败', e);
          processItems(newItems, optionsRes);
        });
    }).catch(function(e){
      console.error('[投稿] 加载失败',e);
      that.setData({ loadingMore:false, searchLoading:false });
      if(!isLoadMore) that.setData({ list:[], filteredList:[] });
    });

    function processItems(newItems, optionsRes){
      newItems.sort(function(a, b){
        if(!a.deadline && !b.deadline) return 0;
        if(!a.deadline) return 1;
        if(!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      });
      var list = isLoadMore ? that.data.list.concat(newItems) : newItems;
      var hasMore = newItems.length >= pageSize;
      var extra = {};

      // 构建高级筛选选项：优先用"不含 quickFilter"的选项数据，否则用当前 list
      if(!isLoadMore){
        if(optionsRes && optionsRes.data){
          var optionsData = Array.isArray(optionsRes.data) ? optionsRes.data : [];
          var optionsItems = optionsData.map(function(item){ return formatUtil.formatItem(item); });
          extra = that.buildAdvOptions(optionsItems);
        } else {
          extra = that.buildAdvOptions(list);
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
              that.setData({ showForm: true, isEdit: true, editId: that.data.targetId });
            }
            that.setData({ targetId: '', targetTitle: '', pendingAutoEdit: false });
          } else {
            that.locateById(that.data.targetId, targetTitle);
          }
        }
      });
      // 每次加载完成后更新统计（支持搜索联动）
      if(!isLoadMore) that.loadStats();
    }
  },

  /* ======== 通过 ID 精确定位（首页跳转时只显示这一个）======= */
  locateById:function(id, title){
    var that = this;
    var db = wx.cloud.database();
    var openid = that.data.currentOpenid;
    if (!openid) return;
    db.collection('submissions').where({ _id: id, _openid: openid }).get().then(function(res){
      var item = (res.data && res.data.length > 0) ? res.data[0] : null;
      if(item){
        // 只显示这一个稿件
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
        // 首页跳转也需要更新统计数字
        that.loadStats();
      }
    }).catch(function(e){
      console.error('[投稿] 定位失败', e);
      that.setData({ targetId: '', targetTitle: '', pendingAutoEdit: false, isTargetMode: false });
      that.loadList();
    });
  },

  /* ======== 查看全部（退出单条模式）======= */
  showAll:function(){
    this.setData({ isTargetMode: false, searchKeyword: '', targetId: '', targetTitle: '' });
    this.loadList();
  },

  /* ======== 统计（云函数，支持搜索关键词联动）======= */
  loadStats:function(){
    var that = this;
    var keyword = (this.data.searchKeyword || '').trim();
    wx.cloud.callFunction({
      name:'academicAPI',
      data:{
        action:'submissionStats',
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
        console.warn('[投稿] loadStats 返回不成功:', res.result);
      }
    }).catch(function(e){
      console.error('[投稿] 统计失败', e);
    });
  },

  onReachBottom:function(){
    if(this.data.hasMore && !this.data.loadingMore){
      this.loadList(true);
    }
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
  setFilterGroup:function(e){ this.setData({ filterGroup:e.currentTarget.dataset.group }); this.applyFilter(); },

  applyFilter:function(){
    // 所有筛选已在服务端完成，客户端只同步 filteredList
    // 高级筛选选项由 processItems 用不含 quickFilter 的数据构建，此处不再重建
    var baseList = Array.isArray(this.data.list) ? this.data.list : [];
    this.setData({ filteredList: baseList });
  },

  _buildAdvOptionsFromBases:function(statusBase, roleBase, journalBase, priorityBase){
    var that = this;
    var roleLabelMap    = { first:'一作', corresponding:'通讯', co_first:'共一', co_corresponding:'共通', collaborator:'合作者' };
    var priorityLabelMap = { low:'低', normal:'普通', high:'高', urgent:'紧急' };

    function countField(list, field){
      var cnt = {};
      list.forEach(function(i){ var v = i[field]||''; if(v) cnt[v] = (cnt[v]||0)+1; });
      return cnt;
    }

    var statusCount   = countField(statusBase,   'status');
    var roleCount     = countField(roleBase,      'role');
    var journalCount  = countField(journalBase,   'journal');
    var priorityCount = countField(priorityBase,  'priority');

    var statusOpt = Object.keys(statusCount).map(function(k){
      var d = (that.data.statusOptions||[]).find(function(o){ return o.value===k; });
      return { value:k, label:(d?d.label:k) + ' (' + statusCount[k] + ')', count:statusCount[k] };
    });
    statusOpt.sort(function(a,b){ return b.count - a.count; });

    var roleOpt = Object.keys(roleCount).map(function(k){
      return { value:k, label:(roleLabelMap[k]||k) + ' (' + roleCount[k] + ')', count:roleCount[k] };
    });

    var priorityOpt = Object.keys(priorityCount).map(function(k){
      return { value:k, label:(priorityLabelMap[k]||k) + ' (' + priorityCount[k] + ')', count:priorityCount[k] };
    });

    var journalOpt = Object.keys(journalCount).map(function(k){
      return { value:k, label:k + ' (' + journalCount[k] + ')', count:journalCount[k] };
    });
    journalOpt.sort(function(a,b){ return b.count - a.count; });

    var extra = {
      advStatusOptions:   statusOpt,
      advRoleOptions:     roleOpt,
      advJournalOptions:  journalOpt,
      advPriorityOptions: priorityOpt,
      advCompletedOptions: [
        { value:'yes', label:'已完成 (' + statusBase.filter(function(i){ return !!i.completed; }).length + ')' },
        { value:'no',  label:'未完成 (' + statusBase.filter(function(i){ return !i.completed; }).length + ')' }
      ]
    };
    extra.advStatusIndex   = that._findIndexByValue(statusOpt,   that.data.advStatus);
    extra.advRoleIndex     = that._findIndexByValue(roleOpt,     that.data.advRole);
    extra.advJournalIndex  = that._findIndexByValue(journalOpt,  that.data.advJournal);
    extra.advPriorityIndex = that._findIndexByValue(priorityOpt, that.data.advPriority);
    extra.advCompletedIndex = that._findIndexByValue(extra.advCompletedOptions, that.data.advCompleted);
    extra.advStatusLabel   = (statusOpt[extra.advStatusIndex]   ||{}).label || '';
    extra.advRoleLabel     = (roleOpt[extra.advRoleIndex]       ||{}).label || '';
    extra.advJournalLabel  = (journalOpt[extra.advJournalIndex] ||{}).label || '';
    extra.advPriorityLabel = (priorityOpt[extra.advPriorityIndex]||{}).label || '';
    extra.advCompletedLabel = (extra.advCompletedOptions[extra.advCompletedIndex]||{}).label || '';
    return extra;
  },

  buildAdvOptions:function(list){
    return this._buildAdvOptionsFromBases(list, list, list, list);
  },

  _findIndexByValue:function(options, value){
    if(!value) return -1;
    for(var i=0; i<options.length; i++){
      if(options[i].value === value) return i;
    }
    return -1;
  },

  toggleAdvanced:function(){
    this.setData({ showAdvanced:!this.data.showAdvanced });
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
  onAdvRoleChange:function(e){
    var idx = parseInt(e.detail.value);
    var opt = this.data.advRoleOptions[idx] || {};
    this.setData({
      advRoleIndex:idx, advRole:opt.value||'', advRoleLabel:opt.label||'',
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
  onAdvPriorityChange:function(e){
    var idx = parseInt(e.detail.value);
    var opt = this.data.advPriorityOptions[idx] || {};
    this.setData({
      advPriorityIndex:idx, advPriority:opt.value||'', advPriorityLabel:opt.label||'',
      quickFilter:'', page:0, hasMore:true
    });
    this.loadList(false);
  },
  onAdvCompletedChange:function(e){
    var idx = parseInt(e.detail.value);
    var opt = this.data.advCompletedOptions[idx] || {};
    this.setData({
      advCompletedIndex:idx, advCompleted:opt.value||'', advCompletedLabel:opt.label||'',
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

  // 高级筛选各条件清空
  clearAdvStatus:function(){
    this.setData({ advStatus:'', advStatusIndex:-1, advStatusLabel:'', quickFilter:'', page:0, hasMore:true });
    this.loadList(false);
  },
  clearAdvRole:function(){
    this.setData({ advRole:'', advRoleIndex:-1, advRoleLabel:'', quickFilter:'', page:0, hasMore:true });
    this.loadList(false);
  },
  clearAdvJournal:function(){
    this.setData({ advJournal:'', advJournalIndex:-1, advJournalLabel:'', quickFilter:'', page:0, hasMore:true });
    this.loadList(false);
  },
  clearAdvPriority:function(){
    this.setData({ advPriority:'', advPriorityIndex:-1, advPriorityLabel:'', quickFilter:'', page:0, hasMore:true });
    this.loadList(false);
  },
  clearAdvCompleted:function(){
    this.setData({ advCompleted:'', advCompletedIndex:-1, advCompletedLabel:'', quickFilter:'', page:0, hasMore:true });
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

  onTipFilter:function(e){
    var type = e.currentTarget.dataset.filter;
    this.setData({
      quickFilter: type === this.data.quickFilter ? '' : type,
      page:0, hasMore:true,
      // 清空高级筛选条件（quickFilter 和高级筛选互斥）
      advStatus:'', advRole:'', advJournal:'', advPriority:'', advDeadlineFrom:'', advDeadlineTo:'', advCompleted:'',
      advStatusIndex:-1, advRoleIndex:-1, advJournalIndex:-1, advPriorityIndex:-1, advCompletedIndex:-1,
      advStatusLabel:'', advRoleLabel:'', advJournalLabel:'', advPriorityLabel:'', advCompletedLabel:''
    });
    this.loadList(false);
  },

  _daysLater:function(n){
    var d = new Date();
    d.setDate(d.getDate() + n);
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  },

  resetAdvanced:function(){
    this.setData({
      advStatus:'', advRole:'', advJournal:'', advPriority:'',
      advDeadlineFrom:'', advDeadlineTo:'', advCompleted:'',
      advStatusIndex:-1, advRoleIndex:-1, advJournalIndex:-1, advPriorityIndex:-1, advCompletedIndex:-1,
      advStatusLabel:'', advRoleLabel:'', advJournalLabel:'', advPriorityLabel:'', advCompletedLabel:'',
      page:0, hasMore:true
    });
    this.loadList(false);
  },

  /* ======== 表单控制 ======== */
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
      title:'删除确认', content:'确定要删除这条投稿记录吗？',
      success:function(res){
        if(res.confirm){
          softDelete('submissions',id).then(function(){
            wx.showToast({ title:'已删除', icon:'success' });
            that.loadList();
          });
        }
      }
    });
  },

  onTapRelatedWork:function(e){
    var id = e.currentTarget.dataset.id;
    if(!id) return;
    this.setData({ showForm:true, isEdit:true, editId:id });
  },

  /* ======== 完成/取消完成 ======== */
  toggleComplete:function(e){
    var that = this;
    var id = e.currentTarget.dataset.id;
    var currentlyCompleted = e.currentTarget.dataset.completed;
    var newCompleted = !currentlyCompleted;
    var db = wx.cloud.database();
    var openid = that.data.currentOpenid;
    if (!openid) {
      wx.showToast({ title: '用户信息获取中，请稍后重试', icon: 'none' });
      return;
    }

    wx.showLoading({ title: newCompleted ? '标记完成...' : '取消完成...', mask:true });
    db.collection('submissions').where({ _id: id, _openid: openid }).update({
      data:{ completed: newCompleted }
    }).then(function(){
      wx.hideLoading();
      wx.showToast({ title: newCompleted ? '已完成' : '已取消', icon:'success' });
      // 重新加载列表，让 formatItem 正确计算过期状态
      that.loadList();
      // 刷新统计
      that.loadStats();
    }).catch(function(e){
      wx.hideLoading();
      console.error('[投稿] 标记完成失败', e);
      wx.showToast({ title:'操作失败', icon:'none' });
    });
  },

  doNothing:function(){}
});
