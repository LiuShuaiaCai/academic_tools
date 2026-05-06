// pages/conferences/conferences.js
var dbInit = require('../../utils/dbInit');
var formatTime = dbInit.formatTime;
var parseDate = dbInit.parseDate;
var softDelete = dbInit.softDelete;
var config = require('../../utils/conferences-config');
var formatUtil = require('../../utils/conferences-format');

Page({
  data: {
    list: [],
    filteredList: [],
    searchKeyword: '',
    showForm: false,
    isEdit: false,
    editId: '',
    // 分页
    page: 0,
    pageSize: 20,
    hasMore: true,
    loadingMore: false,
    searchLoading: false,
    // 快速筛选
    quickFilter: '',
    totalCount: 0,
    pendingCount: 0,
    nearCount: 0,
    registeredCount: 0,
    // 高级筛选
    showAdvanced: false,
    advStatus: '',
    advLocation: '',
    advDeadlineFrom: '',
    advDeadlineTo: '',
    advStatusIndex: -1,
    advLocationIndex: -1,
    advStatusLabel: '',
    advLocationLabel: '',
    advStatusOptions: [],
    advLocationOptions: [],
    // 首页跳转
    targetId: '',
    targetTitle: '',
    pendingAutoEdit: false,
    isTargetMode: false
  },

  onLoad: function(options) {
    if (options && options.targetId) {
      this.setData({
        targetId: options.targetId,
        targetTitle: options.targetTitle ? decodeURIComponent(options.targetTitle) : '',
        pendingAutoEdit: options.autoEdit === 'true',
        isTargetMode: true
      });
      this.locateById(options.targetId, options.targetTitle ? decodeURIComponent(options.targetTitle) : '');
    } else {
      this.loadList();
    }
  },

  onShow: function() {
    if (!this.data.targetId && !this.data.isTargetMode) this.loadList();
  },

  /* ======== 统计（云函数，支持搜索关键词联动）======= */
  loadStats: function() {
    var that = this;
    var keyword = (this.data.searchKeyword || '').trim();
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'conferenceStats',
        keyword: keyword
      }
    }).then(function(res) {
      if (res.result && res.result.success) {
        that.setData({
          totalCount: res.result.total,
          pendingCount: res.result.pending,
          nearCount: res.result.near,
          registeredCount: res.result.registered
        });
      } else {
        console.warn('[会议] loadStats 返回不成功:', res.result);
      }
    }).catch(function(e) {
      console.error('[会议] 统计失败', e);
    });
  },

  /* ======== 数据加载（服务端分页 + 模糊搜索，按 deadline 升序）======= */
  loadList: function(isLoadMore) {
    if (this.data.loadingMore) return;
    var that = this;
    var page = isLoadMore ? this.data.page + 1 : 0;
    var pageSize = this.data.pageSize;
    var skip = page * pageSize;

    this.setData({ loadingMore: true });
    if (!isLoadMore) this.setData({ searchLoading: true });

    var db = wx.cloud.database();
    var _ = db.command;

    // 构建"基础条件"（搜索 + 高级筛选，不含 quickFilter）
    var baseConditions = [{ deleteTime: null }];
    var kw = (this.data.searchKeyword || '').trim();
    if (kw) {
      var reg = db.RegExp({ regexp: kw, options: 'i' });
      baseConditions.push(_.or([
        { name: reg },
        { shortName: reg },
        { location: reg }
      ]));
    }
    // 高级筛选条件
    var advStatus = this.data.advStatus;
    var advLocation = this.data.advLocation;
    var advFrom = this.data.advDeadlineFrom;
    var advTo = this.data.advDeadlineTo;
    if (advStatus) baseConditions.push({ status: advStatus });
    if (advLocation) baseConditions.push({ location: advLocation });
    if (advFrom) baseConditions.push({ deadline: _.gte(advFrom + ' 00:00:00') });
    if (advTo) baseConditions.push({ deadline: _.lte(advTo + ' 23:59:59') });

    // 构建"列表条件"（基础条件 + quickFilter）
    var listConditions = baseConditions.slice();
    var qf = this.data.quickFilter;
    if (qf && qf !== 'all') {
      var now = new Date();
      if (qf === 'pending') {
        // 待截稿：deadline >= 今天
        var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        listConditions.push({ deadline: _.gte(todayStr + ' 00:00:00') });
      } else if (qf === 'near') {
        // 急需处理：deadline 在 0-3 天内
        var fromStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        var toDate = new Date(now);
        toDate.setDate(now.getDate() + 3);
        var toStr = toDate.getFullYear() + '-' + String(toDate.getMonth() + 1).padStart(2, '0') + '-' + String(toDate.getDate()).padStart(2, '0');
        listConditions.push({ deadline: _.gte(fromStr + ' 00:00:00') });
        listConditions.push({ deadline: _.lte(toStr + ' 23:59:59') });
      } else if (qf === 'registered') {
        // 已报名：deadline < 今天
        var todayStr2 = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        listConditions.push({ deadline: _.lt(todayStr2 + ' 00:00:00') });
      }
    }

    var whereForList = listConditions.length === 1 ? listConditions[0] : _.and(listConditions);
    var whereForOptions = baseConditions.length === 1 ? baseConditions[0] : _.and(baseConditions);

    // 两个查询并行：列表数据（含 quickFilter）+ 选项数据（不含 quickFilter）
    var listQuery = db.collection('conferences')
      .where(whereForList)
      .orderBy('deadline', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get();

    var queries = [listQuery];
    if (that.data.quickFilter) {
      var optionsQuery = db.collection('conferences')
        .where(whereForOptions)
        .limit(1000)
        .get();
      queries.push(optionsQuery);
    }

    Promise.all(queries).then(function(results) {
      var listRes = results[0];
      var optionsRes = results[1];

      var rawData = Array.isArray(listRes.data) ? listRes.data : [];
      var newItems = rawData.map(function(item) { return formatUtil.formatItem(item); });

      var list = isLoadMore ? that.data.list.concat(newItems) : newItems;
      var hasMore = newItems.length >= pageSize;
      var extra = {};

      // 构建高级筛选选项：优先用"不含 quickFilter"的选项数据
      if (!isLoadMore) {
        if (optionsRes && optionsRes.data) {
          var optionsData = Array.isArray(optionsRes.data) ? optionsRes.data : [];
          var optionsItems = optionsData.map(function(item) { return formatUtil.formatItem(item); });
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
          var found = list.find(function(i) { return i._id === that.data.targetId; });
          if (found) {
            if (targetTitle) that.setData({ searchKeyword: targetTitle });
            if (that.data.pendingAutoEdit) {
              that.setData({
                showForm: true,
                isEdit: true,
                editId: that.data.targetId
              });
            }
            that.setData({ targetId: '', targetTitle: '', pendingAutoEdit: false });
          } else {
            that.locateById(that.data.targetId, targetTitle);
          }
        }
      });
      // 每次加载完成后更新统计
      if (!isLoadMore) that.loadStats();
    }).catch(function(e) {
      console.error('[会议] 加载失败', e);
      that.setData({ loadingMore: false, searchLoading: false });
      if (!isLoadMore) that.setData({ list: [], filteredList: [] });
    });
  },

  /* ======== 通过 ID 精确定位（首页跳转时只显示这一个）======= */
  locateById: function(id, title) {
    var that = this;
    wx.cloud.database().collection('conferences').doc(id).get().then(function(res) {
      if (res.data) {
        var item = formatUtil.formatItem(res.data);
        var list = [item];
        if (title) that.setData({ searchKeyword: title });
        var shouldAutoEdit = that.data.pendingAutoEdit;
        that.setData({
          list: list,
          filteredList: list,
          isTargetMode: true,
          targetId: '',
          targetTitle: '',
          pendingAutoEdit: false
        }, function() {
          if (shouldAutoEdit) {
            that.setData({ showForm: true, isEdit: true, editId: id });
          }
        });
        that.loadStats();
      }
    }).catch(function(e) {
      console.error('[会议] 定位失败', e);
      that.setData({ targetId: '', targetTitle: '', pendingAutoEdit: false, isTargetMode: false });
      that.loadList();
    });
  },

  /* ======== 查看全部（退出单条模式）======= */
  showAll: function() {
    this.setData({ isTargetMode: false, searchKeyword: '', targetId: '', targetTitle: '' });
    this.loadList();
  },

  /* ======== 搜索/筛选 ======== */
  onSearch: function(e) {
    this.setData({ searchKeyword: e.detail.value, page: 0, hasMore: true });
    this.loadList(false);
  },

  clearSearch: function() {
    this.setData({ searchKeyword: '', page: 0, hasMore: true, isTargetMode: false, targetId: '', targetTitle: '', pendingAutoEdit: false });
    this.loadList(false);
  },

  // 快速筛选
  onTipFilter: function(e) {
    var type = e.currentTarget.dataset.filter;
    this.setData({
      quickFilter: type === this.data.quickFilter ? '' : type,
      page: 0,
      hasMore: true,
      // 关闭高级筛选面板，清空高级筛选条件（互斥）
      showAdvanced: false,
      advStatus: '',
      advLocation: '',
      advDeadlineFrom: '',
      advDeadlineTo: '',
      advStatusIndex: -1,
      advLocationIndex: -1,
      advStatusLabel: '',
      advLocationLabel: ''
    });
    this.loadList(false);
  },

  // 高级筛选
  toggleAdvanced: function() {
    var opening = !this.data.showAdvanced;
    this.setData({
      showAdvanced: opening,
      // 展开高级筛选时，取消快速筛选选中
      quickFilter: opening ? '' : this.data.quickFilter
    });
  },

  onAdvStatusChange: function(e) {
    var idx = parseInt(e.detail.value);
    var opt = this.data.advStatusOptions[idx] || {};
    this.setData({
      advStatusIndex: idx,
      advStatus: opt.value || '',
      advStatusLabel: opt.label || '',
      quickFilter: '',
      page: 0,
      hasMore: true
    });
    this.loadList(false);
  },

  onAdvLocationChange: function(e) {
    var idx = parseInt(e.detail.value);
    var opt = this.data.advLocationOptions[idx] || {};
    this.setData({
      advLocationIndex: idx,
      advLocation: opt.value || '',
      advLocationLabel: opt.label || '',
      quickFilter: '',
      page: 0,
      hasMore: true
    });
    this.loadList(false);
  },

  onAdvDeadlineFromChange: function(e) {
    this.setData({ advDeadlineFrom: e.detail.value, quickFilter: '', page: 0, hasMore: true });
    this.loadList(false);
  },

  onAdvDeadlineToChange: function(e) {
    this.setData({ advDeadlineTo: e.detail.value, quickFilter: '', page: 0, hasMore: true });
    this.loadList(false);
  },

  clearAdvStatus: function() {
    this.setData({ advStatus: '', advStatusIndex: -1, advStatusLabel: '', quickFilter: '', page: 0, hasMore: true });
    this.loadList(false);
  },

  clearAdvLocation: function() {
    this.setData({ advLocation: '', advLocationIndex: -1, advLocationLabel: '', quickFilter: '', page: 0, hasMore: true });
    this.loadList(false);
  },

  clearAdvDeadlineFrom: function() {
    this.setData({ advDeadlineFrom: '', quickFilter: '', page: 0, hasMore: true });
    this.loadList(false);
  },

  clearAdvDeadlineTo: function() {
    this.setData({ advDeadlineTo: '', quickFilter: '', page: 0, hasMore: true });
    this.loadList(false);
  },

  resetAdvanced: function() {
    this.setData({
      advStatus: '',
      advLocation: '',
      advDeadlineFrom: '',
      advDeadlineTo: '',
      advStatusIndex: -1,
      advLocationIndex: -1,
      advStatusLabel: '',
      advLocationLabel: '',
      page: 0,
      hasMore: true
    });
    this.loadList(false);
  },

  // 客户端过滤（服务端已完成，只同步 filteredList）
  applyFilter: function() {
    var baseList = Array.isArray(this.data.list) ? this.data.list : [];
    this.setData({ filteredList: baseList });
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadList(true);
    }
  },

  /* ======== 表单控制（通过 form 组件）======== */
  showAddForm: function() {
    this.setData({ showForm: true, isEdit: false, editId: '' });
  },

  showEditForm: function(e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ showForm: true, isEdit: true, editId: id });
  },

  onFormSave: function() {
    this.setData({ showForm: false, isEdit: false, editId: '', quickFilter: '', page: 0, hasMore: true });
    this.loadList();
  },

  onFormCancel: function() {
    this.setData({ showForm: false, isEdit: false, editId: '' });
  },

  /* ======== 删除 ======== */
  deleteItem: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除确认',
      content: '确定删除该会议？',
      success: function(res) {
        if (res.confirm) {
          softDelete('conferences', id).then(function() {
            wx.showToast({ title: '已删除', icon: 'success' });
            that.loadList();
          });
        }
      }
    });
  },

  /* ======== 打开会议链接 ======== */
  onOpenConfUrl: function(e) {
    var url = e.currentTarget.dataset.url;
    if (url) {
      wx.setClipboardData({
        data: url,
        success: function() {
          wx.showToast({ title: '链接已复制', icon: 'success' });
        }
      });
    }
  },

  doNothing: function() {}
});
