// pages/submissions/submissions.js
var dbInit = require('../../utils/dbInit');
var formatTime = dbInit.formatTime;
var formatDate = dbInit.formatDate;
var parseDate = dbInit.parseDate;
var softDelete = dbInit.softDelete;

var ST_DEF = {
  preparing:   { label:'准备中', color:'#f59e0b', bg:'#fef3c7', icon:'✏️' },
  submitted:   { label:'已投稿', color:'#3b82f6', bg:'#dbeafe', icon:'📤' },
  under_review:{ label:'审稿中', color:'#8b5cf6', bg:'#ede9fe', icon:'🔍' },
  revision:    { label:'修回中', color:'#f97316', bg:'#ffedd5', icon:'✏️' },
  resubmitted: { label:'再投中', color:'#06b6d4', bg:'#cffafe', icon:'🔄' },
  accepted:    { label:'已接收', color:'#10b981', bg:'#d1fae5', icon:'✅' },
  rejected:    { label:'被拒',   color:'#ef4444', bg:'#fee2e2', icon:'❌' },
  withdrawn:   { label:'已撤稿', color:'#6b7280', bg:'#f3f4f6', icon:'↩️' }
};

var PRIORITY_LABEL = { low:'低', normal:'普通', high:'高', urgent:'紧急' };

function splitAndTrim(str) {
  if (!str) return [];
  return str.split(',').map(function(t){ return t.trim(); }).filter(Boolean);
}

Page({
  data: {
    list:[], filteredList:[], filterGroup:'status', searchKeyword:'',
    showForm:false, isEdit:false, editId:null,
    page:0, pageSize:20, hasMore:true, loadingMore:false,
    showAdvanced:false,          // 高级筛选面板是否展开
    advStatus:'', advRole:'', advJournal:'', advPriority:'', advDeadlineFrom:'', advDeadlineTo:'',
    advStatusIndex:-1, advRoleIndex:-1, advJournalIndex:-1, advPriorityIndex:-1,
    advStatusLabel:'', advRoleLabel:'', advJournalLabel:'', advPriorityLabel:'',
    advStatusOptions:[], advRoleOptions:[], advJournalOptions:[], advPriorityOptions:[],
    form: {
      title:'', journal:'', status:'preparing', role:'first', paperType:'研究论文',
      priority:'normal', deadline:'', manuscriptId:'', doi:'', url:'',
      corresponding:'', payee:'', coauthors:'', note:'',
      tags:'', fields:'', funds:'',
      fieldsInput:'', tagsInput:'', fundsInput:'',
      relatedWorkId:'', relatedWorkTitle:'',
      tlNewDate:'', tlNewEventIdx:-1, tlNewRemark:'',
      timelineList:[]
    },
    statusOptions:[],
    roleOptions:[
      { value:'first',         label:'一作' },
      { value:'corresponding',  label:'通讯' },
      { value:'co_first',      label:'共一' },
      { value:'co_corresponding',label:'共通' },
      { value:'collaborator',   label:'合作者' }
    ],
    priorityOptions:[
      { value:'low',    label:'低' },
      { value:'normal', label:'普通' },
      { value:'high',   label:'高' },
      { value:'urgent', label:'紧急' }
    ],
    typeOptions:[
      { value:'研究论文', label:'研究论文' },
      { value:'综述',   label:'综述' },
      { value:'短通信', label:'短通信' },
      { value:'会议论文', label:'会议论文' },
      { value:'学位论文', label:'学位论文' },
      { value:'预印本', label:'预印本' },
      { value:'其他',   label:'其他' }
    ],
    relatedWorkOptions:[],
    tlEventOptions:[
      { value:'submitted',   label:'投稿', color:'#3b82f6' },
      { value:'under_review',label:'送审', color:'#8b5cf6' },
      { value:'revision',    label:'修回通知', color:'#f97316' },
      { value:'resubmitted', label:'再投稿', color:'#06b6d4' },
      { value:'accepted',    label:'接收', color:'#10b981' },
      { value:'rejected',    label:'拒稿', color:'#ef4444' },
      { value:'withdrawn',   label:'撤稿', color:'#6b7280' },
      { value:'published',   label:'发表', color:'#10b981' },
      { value:'other',       label:'其他', color:'#6b7280' }
    ]
  },

  onLoad:function(){
    var opts = Object.keys(ST_DEF).map(function(k){
      return { value:k, label:ST_DEF[k].label, color:ST_DEF[k].color, bg:ST_DEF[k].bg, icon:ST_DEF[k].icon };
    });
    this.setData({ statusOptions: opts });
    this.loadList();
  },
  onShow:function(){ this.parseFormLists(); this.loadList(); },

  /* ======== 数据加载（服务端分页，按 deadline 升序）======= */
  loadList:function(isLoadMore){
    if(this.data.loadingMore) return;
    var that = this;
    var page = isLoadMore ? this.data.page + 1 : 0;
    var pageSize = this.data.pageSize;
    var skip = page * pageSize;

    this.setData({ loadingMore:true });

    wx.cloud.database().collection('submissions')
      .where({ deleteTime:null })
      .orderBy('deadline', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get()
      .then(function(res){
        var newItems = (res.data||[]).map(function(item){ return that.formatItem(item); });
        // 云数据库 orderBy 会把 null 排在最前，这里把 null 沉底
        newItems.sort(function(a, b){
          if(!a.deadline && !b.deadline) return 0;
          if(!a.deadline) return 1;
          if(!b.deadline) return -1;
          return a.deadline.localeCompare(b.deadline);
        });
        var list = isLoadMore ? that.data.list.concat(newItems) : newItems;
        var hasMore = newItems.length >= pageSize;
        // 首次加载时统计高级筛选选项数量
        var extra = {};
        if(!isLoadMore){
          extra = that.buildAdvOptions(list);
        }
        extra.list = list;
        extra.page = isLoadMore ? page : 0;
        extra.hasMore = hasMore;
        extra.loadingMore = false;
        that.setData(extra);
        that.applyFilter();
      }).catch(function(e){
        console.error('[投稿] 加载失败',e);
        that.setData({ loadingMore:false });
        if(!isLoadMore) that.setData({ list:[], filteredList:[] });
      });
  },

  onReachBottom:function(){
    if(this.data.searchKeyword) return;
    if(this.data.hasMore && !this.data.loadingMore){
      this.loadList(true);
    }
  },

  formatItem:function(item){
    var st = ST_DEF[item.status] || ST_DEF.preparing;
    var roleLabel = { first:'一作', corresponding:'通讯', co_first:'共一', co_corresponding:'共通', collaborator:'合作者' }[item.role] || '';
    var priorityLabel = PRIORITY_LABEL[item.priority] || '普通';
    var priorityStars = { low:0, normal:1, high:2, urgent:3 }[item.priority] || 0;
    var days = item.createTime ? Math.floor((Date.now()-parseDate(item.createTime).getTime())/86400000) : null;
    var overdue = item.deadline ? Math.ceil((parseDate(item.deadline).getTime()-Date.now())/86400000) : null;
    var tl = item.timeline||[];
    var allTags = (item.fields||[]).concat(item.tags||[]);
    return {
      _id:item._id, title:item.title, journal:item.journal, status:item.status,
      role:item.role, paperType:item.paperType, priority:item.priority,
      deadline:item.deadline, manuscriptId:item.manuscriptId, doi:item.doi, url:item.url,
      corresponding:item.corresponding, payee:item.payee, coauthors:(item.coauthors||[]).join(','),
      note:item.note||'', tags:(item.tags||[]).join(','), fields:(item.fields||[]).join(','), funds:(item.funds||[]).join(','),
      relatedWorkId:item.relatedWorkId||'',
      statusLabel:st.label, statusColor:st.color, statusBg:st.bg,
      roleLabel:roleLabel, priorityLabel:priorityLabel, priorityStars:priorityStars,
      overdueLabel: overdue!==null ? (overdue<=0?'已超期'+Math.abs(overdue)+'天':'剩余'+overdue+'天') : '',
      overdueClass: overdue!==null ? (overdue<=0?'overdue':(overdue<=7?'urgent':'normal')) : '',
      recentTimeline: this.formatTimelineForDisplay(tl),
      allTags:allTags.slice(0,6),
      attachCount:(item.attachments||[]).length, tlCount:tl.length,
      createTimeFormatted: item.createTime ? this.formatDate(parseDate(item.createTime)) : ''
    };
  },

  formatTimelineForDisplay:function(timeline){
    if(!timeline||!timeline.length) return [];
    var that = this;
    var evColorMap = {};
    (this.data.tlEventOptions||[]).forEach(function(e){ evColorMap[e.label] = e.color; });
    return timeline.slice(0,3).map(function(t){
      return { date:t.date||'', event:t.event||'', dotColor:t.dotColor || evColorMap[t.event] || '#6b7280' };
    });
  },

  getDotColor:function(en){
    if(!en) return '#d1d5db';
    var e = en.toLowerCase();
    if(e.indexOf('accept')!==-1||e.indexOf('publish')!==-1) return '#22c55e';
    if(e.indexOf('reject')!==-1||e.indexOf('withdraw')!==-1) return '#ef4444';
    if(e.indexOf('submit')!==-1||e.indexOf('revision')!==-1) return '#3b82f6';
    if(e.indexOf('review')!==-1) return '#f59e0b';
    return '#8b5cf6';
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

    // 先做关键词过滤，后续所有统计都在 kwBase 上进行
    var kwBase = d.list;
    if(kw){
      kwBase = kwBase.filter(function(i){
        return (i.title||'').toLowerCase().indexOf(kw)!==-1
          || (i.journal||'').toLowerCase().indexOf(kw)!==-1
          || (i.coauthors||'').toLowerCase().indexOf(kw)!==-1
          || (i.allTags||[]).join(' ').toLowerCase().indexOf(kw)!==-1;
      });
    }

    var advStatus   = d.advStatus;
    var advRole     = d.advRole;
    var advJournal  = d.advJournal;
    var advPriority = d.advPriority;
    var advFrom     = d.advDeadlineFrom;
    var advTo       = d.advDeadlineTo;

    // 通用过滤器（可按需组合排除某个维度）
    function applyFilters(base, skipField){
      var r = base;
      if(skipField !== 'status'   && advStatus)   r = r.filter(function(i){ return i.status === advStatus; });
      if(skipField !== 'role'     && advRole)     r = r.filter(function(i){ return i.role === advRole; });
      if(skipField !== 'journal'  && advJournal)  r = r.filter(function(i){ return i.journal === advJournal; });
      if(skipField !== 'priority' && advPriority) r = r.filter(function(i){ return i.priority === advPriority; });
      if(skipField !== 'deadline' && advFrom)     r = r.filter(function(i){ return i.deadline && i.deadline >= advFrom; });
      if(skipField !== 'deadline' && advTo)       r = r.filter(function(i){ return i.deadline && i.deadline <= advTo; });
      return r;
    }

    // 最终结果：全部条件都加上
    var result = applyFilters(kwBase, null);

    // 各维度的联动选项：排除自身维度后的数据来统计数量
    var statusBase   = applyFilters(kwBase, 'status');
    var roleBase     = applyFilters(kwBase, 'role');
    var journalBase  = applyFilters(kwBase, 'journal');
    var priorityBase = applyFilters(kwBase, 'priority');

    var that = this;
    var advOpts = that._buildAdvOptionsFromBases(statusBase, roleBase, journalBase, priorityBase);

    advOpts.filteredList = result;
    that.setData(advOpts);
  },

  /* ======== 高级筛选：统计选项数量（联动版）======== */
  /* 基于各维度排除自身后的数据来统计，实现联动效果 */
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
      advPriorityOptions: priorityOpt
    };
    extra.advStatusIndex   = that._findIndexByValue(statusOpt,   that.data.advStatus);
    extra.advRoleIndex     = that._findIndexByValue(roleOpt,     that.data.advRole);
    extra.advJournalIndex  = that._findIndexByValue(journalOpt,  that.data.advJournal);
    extra.advPriorityIndex = that._findIndexByValue(priorityOpt, that.data.advPriority);
    extra.advStatusLabel   = (statusOpt[extra.advStatusIndex]   ||{}).label || '';
    extra.advRoleLabel     = (roleOpt[extra.advRoleIndex]       ||{}).label || '';
    extra.advJournalLabel  = (journalOpt[extra.advJournalIndex] ||{}).label || '';
    extra.advPriorityLabel = (priorityOpt[extra.advPriorityIndex]||{}).label || '';
    return extra;
  },

  /* ======== 高级筛选：初始统计（首次加载）======== */
  buildAdvOptions:function(list){
    return this._buildAdvOptionsFromBases(list, list, list, list);
  },

  /* 在 options 数组中按 value 找 index */
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

  /* picker change 事件：e.detail.value 是 index */
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
  onAdvDeadlineFromChange:function(e){
    this.setData({ advDeadlineFrom:e.detail.value });
    this.applyFilter();
  },
  onAdvDeadlineToChange:function(e){
    this.setData({ advDeadlineTo:e.detail.value });
    this.applyFilter();
  },

  resetAdvanced:function(){
    this.setData({
      advStatus:'', advRole:'', advJournal:'', advPriority:'',
      advDeadlineFrom:'', advDeadlineTo:'',
      advStatusIndex:-1, advRoleIndex:-1, advJournalIndex:-1, advPriorityIndex:-1,
      advStatusLabel:'', advRoleLabel:'', advJournalLabel:'', advPriorityLabel:''
    });
    this.applyFilter();
  },

  /* ======== 表单：打开 ======== */
  showAddForm:function(){
    this.setData({
      showForm:true, isEdit:false, editId:null,
      form:{
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

  showEditForm:function(e){
    var that = this;
    var id = e.currentTarget.dataset.id;
    wx.cloud.database().collection('submissions').doc(id).get().then(function(res){
      var item = res.data;
      if(!item) return;
      var tlList = (item.timeline||[]).map(function(t){ return { date:t.date||'', event:t.event||'', remark:t.remark||'', dotColor:t.dotColor||'' }; });
      // 补充缺失的 dotColor（兼容旧数据）
      var colorMap = {};
      that.data.tlEventOptions.forEach(function(opt){ colorMap[opt.label] = opt.color; });
      tlList.forEach(function(item){
        if(!item.dotColor && colorMap[item.event]){
          item.dotColor = colorMap[item.event];
        }
      });
      // 按日期倒序排列（最新的在前面）
      tlList.sort(function(a, b){ return b.date.localeCompare(a.date); });
      that.setData({
        showForm:true, isEdit:true, editId:id,
        form:{
          title:item.title||'', journal:item.journal||'', status:item.status||'preparing',
          role:item.role||'first', paperType:item.paperType||'研究论文',
          priority:item.priority||'normal',
          deadline:item.deadline ? that.formatDate(parseDate(item.deadline)) : '',
          manuscriptId:item.manuscriptId||'', doi:item.doi||'', url:item.url||'',
          corresponding:item.corresponding||'', payee:item.payee||'',
          coauthors:(item.coauthors||[]).join(','), note:item.note||'',
          tags:(item.tags||[]).join(','), fields:(item.fields||[]).join(','), funds:(item.funds||[]).join(','),
          fieldsInput:'', tagsInput:'', fundsInput:'',
          fieldsList:that._splitStr(item.fields),
          tagsList:that._splitStr(item.tags),
          fundsList:that._splitStr(item.funds),
          relatedWorkId:item.relatedWorkId||'',
          relatedWorkTitle:'',
          tlNewDate:'', tlNewEventIdx:-1, tlNewRemark:'',
          timelineList:tlList
        }
      });
      that.loadRelatedWorks(id);
      var rid = item.relatedWorkId;
      if(rid){
        setTimeout(function(){
          var opts = that.data.relatedWorkOptions;
          for(var i=0;i<opts.length;i++){
            if(opts[i]._id === rid){ that.setData({ 'form.relatedWorkTitle':opts[i].title }); break; }
          }
        },800);
      }
    }).catch(function(){ wx.showToast({ title:'加载失败', icon:'error' }); });
  },

  /* ======== 表单：普通输入 ======== */
  onFormInput:function(e){
    var field = e.currentTarget.dataset.field;
    var val = e.detail.value;
    var data = {};
    data['form.'+field] = val;
    this.setData(data);
  },

  onDeadlineChange:function(e){ this.setData({ 'form.deadline': e.detail.value }); },

  onSelectStatus:function(e){ this.setData({ 'form.status': e.currentTarget.dataset.status }); },

  onRoleChange:function(e){
    var idx = e.detail.value;
    var val = this.data.roleOptions[idx].value;
    var label = this.data.roleOptions[idx].label;
    this.setData({ 'form.role': val, 'form.roleLabel': label });
  },

  onTypeChange:function(e){
    var idx = e.detail.value;
    var val = this.data.typeOptions[idx].value;
    this.setData({ 'form.paperType': val });
  },

  onPriorityChange:function(e){
    var idx = e.detail.value;
    var val = this.data.priorityOptions[idx].value;
    var label = this.data.priorityOptions[idx].label;
    this.setData({ 'form.priority': val, 'form.priorityLabel': label });
  },

  /* ======== 表单：标签输入 ======== */
  onTagInput:function(e){
    var field = e.currentTarget.dataset.target + 'Input';
    var data = {};
    data['form.'+field] = e.detail.value;
    this.setData(data);
  },
  onTagConfirm:function(e){
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

  removeChip:function(e){
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

  /* ======== 表单：关联作品 ======== */
  loadRelatedWorks:function(excludeId){
    var that = this;
    wx.cloud.database().collection('submissions').where({ deleteTime:null }).orderBy('updateTime','desc').limit(50).get()
      .then(function(res){
        var opts = [{ _id:'', title:'不关联' }];
        (res.data||[]).forEach(function(item){
          if(item._id !== excludeId) opts.push({ _id:item._id, title:item.title||'(无标题)' });
        });
        that.setData({ relatedWorkOptions:opts });
      });
  },

  onRelatedWorkChange:function(e){
    var idx = e.detail.value;
    var opts = this.data.relatedWorkOptions;
    var sel = opts[idx];
    var data = {};
    data['form.relatedWorkId'] = sel ? sel._id : '';
    data['form.relatedWorkTitle'] = sel ? sel.title : '不关联';
    this.setData(data);
  },

  /* ======== 表单：时间线 ======== */
  _setTimelineField:function(idx, field, val){
    var tl = this.data.form.timelineList.slice();
    tl[idx] = tl[idx] || {};
    tl[idx][field] = val;
    this.setData({ 'form.timelineList': tl });
  },

  /* 新时间线：日期选择 */
  onTLNewDateChange:function(e){
    this.setData({ 'form.tlNewDate': e.detail.value });
  },
  /* 新时间线：事件选择 */
  onTLNewEventChange:function(e){
    var idx = parseInt(e.detail.value);
    this.setData({ 'form.tlNewEventIdx': idx });
  },
  /* 新时间线：备注输入 */
  onTLNewRemarkInput:function(e){
    this.setData({ 'form.tlNewRemark': e.detail.value });
  },

  addTimelineItem:function(){
    var f = this.data.form;
    if(!f.tlNewDate || f.tlNewEventIdx < 0){
      wx.showToast({ title:'请选择日期和事件', icon:'none' });
      return;
    }
    var ev = this.data.tlEventOptions[f.tlNewEventIdx];
    var tl = (this.data.form.timelineList||[]).slice();
    // 确保备注和颜色都正确保存
    var remark = (f.tlNewRemark || '').trim();
    var newItem = { date:f.tlNewDate, event:ev.label, dotColor:ev.color, remark:remark };
    tl.push(newItem);
    // 按日期倒序排列（最新的在前面）
    tl.sort(function(a, b){ return b.date.localeCompare(a.date); });
    var data = {};
    data['form.timelineList'] = tl;
    data['form.tlNewDate'] = '';
    data['form.tlNewEventIdx'] = -1;
    data['form.tlNewRemark'] = '';
    this.setData(data);
    wx.showToast({ title:'已添加：'+ev.label, icon:'success' });
  },

  onTimelineDateInput:function(e){
    var idx = e.currentTarget.dataset.i;
    this._setTimelineField(idx, 'date', e.detail.value);
  },

  onTimelineEventInput:function(e){
    var idx = e.currentTarget.dataset.i;
    this._setTimelineField(idx, 'event', e.detail.value);
  },

  removeTimelineItem:function(e){
    var idx = e.currentTarget.dataset.i;
    var tl = this.data.form.timelineList.slice();
    tl.splice(idx, 1);
    this.setData({ 'form.timelineList': tl });
  },

  /* ======== 表单：保存 ======== */
  closeForm:function(){ this.setData({ showForm:false }); },

  saveForm:function(){
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
      coauthors:splitAndTrim(f.coauthors), tags:splitAndTrim(f.tags),
      fields:splitAndTrim(f.fields), funds:splitAndTrim(f.funds),
      relatedWorkId:f.relatedWorkId||'',
      note:f.note||'',
      timeline:tlSave,
      updateTime:formatTime()
    };

    wx.showLoading({ title:'保存中...' });
    var db = wx.cloud.database();
    var promise;
    if(this.data.isEdit){
      promise = db.collection('submissions').doc(this.data.editId).update({ data:data });
    } else {
      data.createTime = formatTime();
      data.attachments = [];
      data.deleteTime = null;
      promise = db.collection('submissions').add({ data:data });
    }
    promise.then(function(){
      wx.hideLoading();
      wx.showToast({ title:'保存成功', icon:'success' });
      that.setData({ showForm:false });
      that.loadList();
    }).catch(function(e){
      wx.hideLoading();
      wx.showToast({ title:'保存失败', icon:'error' });
      console.error(e);
    });
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

  _splitStr:function(arr){ return Array.isArray(arr) ? arr : (arr||'').split(',').map(function(t){return t.trim()}).filter(Boolean); },

  /* ======== 工具 ======== */
  formatDate:function(d){
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  },

  parseFormLists:function(){
    var f = this.data.form;
    this.setData({
      'form.fieldsList': splitAndTrim(f.fields),
      'form.tagsList':   splitAndTrim(f.tags),
      'form.fundsList':   splitAndTrim(f.funds)
    });
  },

  doNothing:function(){}
});
