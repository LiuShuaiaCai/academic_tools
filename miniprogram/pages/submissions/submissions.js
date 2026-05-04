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
    page:0, pageSize:20, hasMore:true, loadingMore:false,
    showAdvanced:false,
    quickFilter:'',
    advStatus:'', advRole:'', advJournal:'', advPriority:'', advDeadlineFrom:'', advDeadlineTo:'',
    advCompleted:'',
    advStatusIndex:-1, advRoleIndex:-1, advJournalIndex:-1, advPriorityIndex:-1, advCompletedIndex:-1,
    advStatusLabel:'', advRoleLabel:'', advJournalLabel:'', advPriorityLabel:'', advCompletedLabel:'',
    advStatusOptions:[], advRoleOptions:[], advJournalOptions:[], advPriorityOptions:[], advCompletedOptions:[],
    statusOptions: config.getStatusOptions(),
    // 筛选Tab（用于状态分组）
    filterTabs: config.getStatusOptions()
  },

  onLoad:function(){
    this.loadList();
  },
  onShow:function(){ this.loadList(); },

  /* ======== 数据加载（服务端分页，按 deadline 升序）======= */
  loadList:function(isLoadMore){
    if(this.data.loadingMore) return;
    var that = this;
    var page = isLoadMore ? this.data.page + 1 : 0;
    var pageSize = this.data.pageSize;
    var skip = page * pageSize;

    this.setData({ loadingMore:true });

    var db = wx.cloud.database();

    db.collection('submissions')
      .where({ deleteTime:null })
      .orderBy('deadline', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get()
      .then(function(res){
        var rawData = Array.isArray(res.data) ? res.data : [];
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
          processItems(newItems);
          return;
        }

        // 批量查询关联作品
        var _ = db.command;
        db.collection('submissions')
          .where({ _id: _.in(relatedIds), deleteTime:null })
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
            processItems(newItems);
          })
          .catch(function(e){
            console.error('[投稿] 查询关联作品失败', e);
            processItems(newItems);
          });
      })
      .catch(function(e){
        console.error('[投稿] 加载失败',e);
        that.setData({ loadingMore:false });
        if(!isLoadMore) that.setData({ list:[], filteredList:[] });
      });

    function processItems(newItems){
      newItems.sort(function(a, b){
        if(!a.deadline && !b.deadline) return 0;
        if(!a.deadline) return 1;
        if(!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      });
      var list = isLoadMore ? that.data.list.concat(newItems) : newItems;
      var hasMore = newItems.length >= pageSize;
      var extra = {};
      if(!isLoadMore){
        extra = that.buildAdvOptions(list);
      }
      extra.list = list;
      extra.page = isLoadMore ? page : 0;
      extra.hasMore = hasMore;
      extra.loadingMore = false;
      var now = Date.now();
      var incomplete = 0, near = 0, urgent = 0;
      list.forEach(function(i){
        if(!i.completed){
          incomplete++;
          if(i.deadline){
            var days = Math.ceil((parseDate(i.deadline).getTime() - now) / 86400000);
            if(days <= 1) urgent++;
            else if(days <= 3) near++;
          }
        }
      });
      extra.incompleteCount = incomplete;
      extra.nearCount = near;
      extra.urgentCount = urgent;
      extra.totalCount = list.length;
      that.setData(extra);
      that.applyFilter();
    }
  },

  onReachBottom:function(){
    if(this.data.searchKeyword) return;
    if(this.data.hasMore && !this.data.loadingMore){
      this.loadList(true);
    }
  },

  /* ======== 搜索/筛选 ======== */
  onSearch:function(e){
    this.setData({ searchKeyword:e.detail.value, page:0, hasMore:true });
    this.loadList(false);
  },
  setFilterGroup:function(e){ this.setData({ filterGroup:e.currentTarget.dataset.group }); this.applyFilter(); },

  applyFilter:function(){
    var d = this.data;
    var kw = (d.searchKeyword||'').toLowerCase();
    var baseList = Array.isArray(d.list) ? d.list : [];
    var kwBase = baseList;
    if(kw){
      kwBase = baseList.filter(function(i){
        return (i.title||'').toLowerCase().indexOf(kw)!==-1
          || (i.journal||'').toLowerCase().indexOf(kw)!==-1
          || (i.coauthors||'').toLowerCase().indexOf(kw)!==-1
          || (i.allTags||[]).join(' ').toLowerCase().indexOf(kw)!==-1;
      });
    }

    // 快速筛选（独立于高级筛选）
    var qf = d.quickFilter;
    if(qf && qf !== 'all'){
      var now = Date.now();
      if(qf === 'incomplete'){
        kwBase = kwBase.filter(function(i){ return !i.completed; });
      } else if(qf === 'near'){
        kwBase = kwBase.filter(function(i){
          if(i.completed) return false;
          if(!i.deadline) return false;
          var days = Math.ceil((parseDate(i.deadline).getTime() - now) / 86400000);
          return days <= 3 && days >= 0;
        });
      } else if(qf === 'urgent'){
        kwBase = kwBase.filter(function(i){
          if(i.completed) return false;
          if(!i.deadline) return false;
          var days = Math.ceil((parseDate(i.deadline).getTime() - now) / 86400000);
          return days <= 1 && days >= 0;
        });
      }
    }

    var advStatus   = d.advStatus;
    var advRole     = d.advRole;
    var advJournal  = d.advJournal;
    var advPriority = d.advPriority;
    var advFrom     = d.advDeadlineFrom;
    var advTo       = d.advDeadlineTo;
    var advCompleted = d.advCompleted;

    function applyFilters(base, skipField){
      var r = base;
      if(skipField !== 'status'    && advStatus)    r = r.filter(function(i){ return i.status === advStatus; });
      if(skipField !== 'role'      && advRole)      r = r.filter(function(i){ return i.role === advRole; });
      if(skipField !== 'journal'   && advJournal)   r = r.filter(function(i){ return i.journal === advJournal; });
      if(skipField !== 'priority'  && advPriority)  r = r.filter(function(i){ return i.priority === advPriority; });
      if(skipField !== 'deadline'  && advFrom)      r = r.filter(function(i){ return i.deadline && i.deadline >= advFrom; });
      if(skipField !== 'deadline'  && advTo)        r = r.filter(function(i){ return i.deadline && i.deadline <= advTo; });
      if(skipField !== 'completed' && advCompleted) r = r.filter(function(i){
        return advCompleted === 'yes' ? !!i.completed : !i.completed;
      });
      return r;
    }

    var result = applyFilters(kwBase, null);

    var statusBase   = applyFilters(kwBase, 'status');
    var roleBase     = applyFilters(kwBase, 'role');
    var journalBase  = applyFilters(kwBase, 'journal');
    var priorityBase = applyFilters(kwBase, 'priority');

    var that = this;
    var advOpts = that._buildAdvOptionsFromBases(statusBase, roleBase, journalBase, priorityBase);

    advOpts.filteredList = Array.isArray(result) ? result : [];
    that.setData(advOpts);
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
    this.setData({ advStatusIndex:idx, advStatus:opt.value||'', advStatusLabel:opt.label||'' });
    this.applyFilter();
  },
  onAdvRoleChange:function(e){
    var idx = parseInt(e.detail.value);
    var opt = this.data.advRoleOptions[idx] || {};
    this.setData({ advRoleIndex:idx, advRole:opt.value||'', advRoleLabel:opt.label||'' });
    this.applyFilter();
  },
  onAdvJournalChange:function(e){
    var idx = parseInt(e.detail.value);
    var opt = this.data.advJournalOptions[idx] || {};
    this.setData({ advJournalIndex:idx, advJournal:opt.value||'', advJournalLabel:opt.label||'' });
    this.applyFilter();
  },
  onAdvPriorityChange:function(e){
    var idx = parseInt(e.detail.value);
    var opt = this.data.advPriorityOptions[idx] || {};
    this.setData({ advPriorityIndex:idx, advPriority:opt.value||'', advPriorityLabel:opt.label||'' });
    this.applyFilter();
  },
  onAdvCompletedChange:function(e){
    var idx = parseInt(e.detail.value);
    var opt = this.data.advCompletedOptions[idx] || {};
    this.setData({ advCompletedIndex:idx, advCompleted:opt.value||'', advCompletedLabel:opt.label||'' });
    this.applyFilter();
  },
  onAdvDeadlineFromChange:function(e){
    this.setData({ advDeadlineFrom:e.detail.value });
    this.applyFilter();
  },
  onAdvDeadlineToChange:function(e){
    this.setData({ advDeadlineTo:e.detail.value });
    this.applyFilter();
  },

  onTipFilter:function(e){
    var type = e.currentTarget.dataset.filter;
    this.setData({ quickFilter: type === this.data.quickFilter ? '' : type });
    this.resetAdvanced();
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
      advStatusLabel:'', advRoleLabel:'', advJournalLabel:'', advPriorityLabel:'', advCompletedLabel:''
    });
    this.applyFilter();
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
    this.setData({ showForm:false });
    this.loadList();
  },

  onFormCancel:function(){
    this.setData({ showForm:false });
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

  doNothing:function(){}
});
