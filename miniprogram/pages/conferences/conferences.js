// pages/conferences/conferences.js
var dbInit = require('../../utils/dbInit');
var formatTime = dbInit.formatTime;
var parseDate = dbInit.parseDate;
var softDelete = dbInit.softDelete;
var config = require('../../utils/conferences-config');
var formatUtil = require('../../utils/conferences-format');
var theme = require('../../utils/theme.js');

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
    quickFilter: 'all',
    totalCount: 0,
    activeCount: 0,
    urgentCount: 0,
    // 高级筛选（原高级筛选）
    showAdvanced: false,
    // 会议类型
    advConferenceType: '',
    advConferenceTypeLabel: '',
    advConferenceTypeIndex: -1,
    advConferenceTypeOptions: [
      { value: 'offline', label: '线下' },
      { value: 'online', label: '线上' }
    ],
    // 会议地点
    advLocation: '',
    // 会议开始日期
    advStartDateFrom: '',
    advStartDateTo: '',
    // 会议截止日期
    advEndDateFrom: '',
    advEndDateTo: '',
    // 会议截稿日期
    advDeadlineFrom: '',
    advDeadlineTo: '',
    // 参会状态
    advStatus: '',
    advStatusLabel: '',
    advStatusIndex: -1,
    advStatusOptions: [
      { value: 'submitted', label: '已投稿' },
      { value: 'accepted', label: '已录用' },
      { value: 'registered', label: '已报名' }
    ],
    // 会议等级
    advRank: '',
    advRankIndex: -1,
    advRankOptions: ['CCF-A', 'CCF-B', 'CCF-C', 'SCI', 'EI'],
    // 举办单位
    advOrganizer: '',
    // 首页跳转
    targetId: '',
    targetTitle: '',
    pendingAutoEdit: false,
    isTargetMode: false,
    currentOpenid: '', // 当前用户的 openid

    // 主题色（由 loadToolTheme 从 DB 加载）
    theme: {}
  },

  onLoad: function(options) {
    this.loadToolTheme();
    var that = this;
    // 获取当前用户的 openid
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserId' }
    }).then(function(res) {
      that.setData({ currentOpenid: res.result.openid });
      if (options && options.targetId) {
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
      if (options && options.targetId) {
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

  loadToolTheme: function() {
    var that = this;
    theme.loadToolTheme('conference').then(function(t) {
      that.setData({ theme: t });
    });
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
          activeCount: res.result.active,
          urgentCount: res.result.urgent
        });
      } else {
        console.warn('[会议] loadStats 返回不成功:', res.result);
      }
    }).catch(function(e) {
      console.error('[会议] 统计失败', e);
    });
  },

  /* ======== 数据加载（服务端分页 + 模糊搜索，按 deadline 升序）======= */
  loadList: async function(isLoadMore) {
    if (this.data.loadingMore) return;
    var that = this;
    var page = isLoadMore ? this.data.page + 1 : 0;
    var pageSize = this.data.pageSize;
    var skip = page * pageSize;

    this.setData({ loadingMore: true });
    if (!isLoadMore) this.setData({ searchLoading: true });

    try {
      var db = wx.cloud.database();
      var _ = db.command;

      // 构建"基础条件"（搜索 + 稿件筛选，不含 quickFilter）
      var openid = that.data.currentOpenid;
      var baseConditions = [{ deleteTime: null, _openid: openid }];
      var kw = (this.data.searchKeyword || '').trim();
      if (kw) {
        var reg = db.RegExp({ regexp: kw, options: 'i' });
        baseConditions.push(_.or([
          { name: reg },
          { location: reg }
        ]));
      }
      // 高级筛选条件
      var advStatus = this.data.advStatus;
      var advLocation = this.data.advLocation;
      var advOrganizer = this.data.advOrganizer;
      var advConferenceType = this.data.advConferenceType;
      var advRank = this.data.advRank;
      var advDeadlineFrom = this.data.advDeadlineFrom;
      var advDeadlineTo = this.data.advDeadlineTo;
      var advStartDateFrom = this.data.advStartDateFrom;
      var advStartDateTo = this.data.advStartDateTo;
      var advEndDateFrom = this.data.advEndDateFrom;
      var advEndDateTo = this.data.advEndDateTo;
      if (advStatus) baseConditions.push({ status: advStatus });
      if (advLocation) {
        var locReg = db.RegExp({ regexp: advLocation, options: 'i' });
        baseConditions.push({ location: locReg });
      }
      if (advOrganizer) {
        var orgReg = db.RegExp({ regexp: advOrganizer, options: 'i' });
        baseConditions.push({ organizer: orgReg });
      }
      if (advConferenceType) baseConditions.push({ conferenceType: advConferenceType });
      if (advRank) baseConditions.push({ rank: advRank });
      if (advDeadlineFrom) baseConditions.push({ deadline: _.gte(advDeadlineFrom + ' 00:00:00') });
      if (advDeadlineTo) baseConditions.push({ deadline: _.lte(advDeadlineTo + ' 23:59:59') });
      if (advStartDateFrom) baseConditions.push({ startDate: _.gte(advStartDateFrom + ' 00:00:00') });
      if (advStartDateTo) baseConditions.push({ startDate: _.lte(advStartDateTo + ' 23:59:59') });
      if (advEndDateFrom) baseConditions.push({ endDate: _.gte(advEndDateFrom + ' 00:00:00') });
      if (advEndDateTo) baseConditions.push({ endDate: _.lte(advEndDateTo + ' 23:59:59') });

      // 构建"列表条件"（基础条件 + quickFilter）
      var listConditions = baseConditions.slice();
      var qf = this.data.quickFilter;
      if (qf && qf !== 'all') {
        var now = new Date();
        var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        if (qf === 'active') {
          // 进行中：startDate <= today <= endDate（不过滤 completed）
          listConditions.push({ startDate: _.lte(todayStr + ' 23:59:59') });
          listConditions.push({ endDate: _.gte(todayStr + ' 00:00:00') });
        } else if (qf === 'urgent') {
          // 急需处理：有状态 且 startDate 在 0-3 天内（排除已完成）
          var toDate = new Date(now);
          toDate.setDate(now.getDate() + 3);
          var toStr = toDate.getFullYear() + '-' + String(toDate.getMonth() + 1).padStart(2, '0') + '-' + String(toDate.getDate()).padStart(2, '0');
          listConditions.push({ completed: _.neq(true) });
          listConditions.push({ status: _.neq(null).and(_.neq('')) });
          listConditions.push({ startDate: _.gte(todayStr + ' 00:00:00') });
          listConditions.push({ startDate: _.lte(toStr + ' 23:59:59') });
        }
      }

      var whereForList = listConditions.length === 1 ? listConditions[0] : _.and(listConditions);

      // 查询列表数据
      var listRes = await db.collection('conferences')
        .where(whereForList)
        .orderBy('deadline', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get();

      var rawData = Array.isArray(listRes.data) ? listRes.data : [];
      var newItems = rawData.map(function(item) { return formatUtil.formatItem(item); });

      var list = isLoadMore ? that.data.list.concat(newItems) : newItems;
      var hasMore = newItems.length >= pageSize;

      that.setData({
        list: list,
        page: isLoadMore ? page : 0,
        hasMore: hasMore,
        loadingMore: false,
        searchLoading: false
      }, function() {
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
    } catch (e) {
      console.error('[会议] 加载失败', e);
      that.setData({ loadingMore: false, searchLoading: false });
      if (!isLoadMore) that.setData({ list: [], filteredList: [] });
    }
  },

  /* ======== 通过 ID 精确定位（首页跳转时只显示这一个）======= */
  locateById: function(id, title) {
    var that = this;
    var openid = that.data.currentOpenid;
    if (!openid) return;
    wx.cloud.database().collection('conferences').where({ _id: id, _openid: openid }).get().then(function(res) {
      var item = (res.data && res.data.length > 0) ? res.data[0] : null;
      if (item) {
        var formatted = formatUtil.formatItem(item);
        var list = [formatted];
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
      quickFilter: type === this.data.quickFilter ? 'all' : type,
      page: 0,
      hasMore: true,
      // 关闭高级筛选面板，清空高级筛选条件（互斥）
      showAdvanced: false,
      advConferenceType: '', advConferenceTypeLabel: '',
      advLocation: '',
      advStartDateFrom: '', advStartDateTo: '',
      advEndDateFrom: '', advEndDateTo: '',
      advDeadlineFrom: '', advDeadlineTo: '',
      advStatus: '', advStatusLabel: '',
      advRank: '',
      advOrganizer: ''
    });
    this.loadList(false);
  },

  // 高级筛选
  toggleAdvanced: function() {
    var opening = !this.data.showAdvanced;
    this.setData({
      showAdvanced: opening,
      // 展开高级筛选时，取消快速筛选选中
      quickFilter: opening ? 'all' : this.data.quickFilter
    });
  },

  // 会议类型
  onAdvConferenceTypeChange: function(e) {
    var idx = parseInt(e.detail.value);
    var opt = this.data.advConferenceTypeOptions[idx] || {};
    this.setData({
      advConferenceType: opt.value || '',
      advConferenceTypeLabel: opt.label || '',
      advConferenceTypeIndex: idx,
      quickFilter: 'all', page: 0, hasMore: true
    });
    this.loadList(false);
  },

  // 会议地点（input）
  onAdvLocationInput: function(e) {
    this.setData({ advLocation: e.detail.value, quickFilter: 'all', page: 0, hasMore: true });
  },
  onAdvLocationConfirm: function() {
    this.loadList(false);
  },

  // 会议开始日期
  onAdvStartDateFromChange: function(e) {
    this.setData({ advStartDateFrom: e.detail.value, quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  onAdvStartDateToChange: function(e) {
    this.setData({ advStartDateTo: e.detail.value, quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },

  // 会议截止日期
  onAdvEndDateFromChange: function(e) {
    this.setData({ advEndDateFrom: e.detail.value, quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  onAdvEndDateToChange: function(e) {
    this.setData({ advEndDateTo: e.detail.value, quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },

  // 会议截稿日期
  onAdvDeadlineFromChange: function(e) {
    this.setData({ advDeadlineFrom: e.detail.value, quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  onAdvDeadlineToChange: function(e) {
    this.setData({ advDeadlineTo: e.detail.value, quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },

  // 参会状态
  onAdvStatusChange: function(e) {
    var idx = parseInt(e.detail.value);
    var opt = this.data.advStatusOptions[idx] || {};
    this.setData({
      advStatus: opt.value || '',
      advStatusLabel: opt.label || '',
      advStatusIndex: idx,
      quickFilter: 'all', page: 0, hasMore: true
    });
    this.loadList(false);
  },

  // 会议等级
  onAdvRankChange: function(e) {
    var idx = parseInt(e.detail.value);
    var rank = this.data.advRankOptions[idx] || '';
    this.setData({ advRank: rank, advRankIndex: idx, quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },

  // 举办单位（input）
  onAdvOrganizerInput: function(e) {
    this.setData({ advOrganizer: e.detail.value, quickFilter: 'all', page: 0, hasMore: true });
  },
  onAdvOrganizerConfirm: function() {
    this.loadList(false);
  },

  // 清空单个字段
  clearAdvConferenceType: function() {
    this.setData({ advConferenceType: '', advConferenceTypeLabel: '', advConferenceTypeIndex: -1, quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  clearAdvLocation: function() {
    this.setData({ advLocation: '', quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  clearAdvStartDateFrom: function() {
    this.setData({ advStartDateFrom: '', quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  clearAdvStartDateTo: function() {
    this.setData({ advStartDateTo: '', quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  clearAdvEndDateFrom: function() {
    this.setData({ advEndDateFrom: '', quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  clearAdvEndDateTo: function() {
    this.setData({ advEndDateTo: '', quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  clearAdvDeadlineFrom: function() {
    this.setData({ advDeadlineFrom: '', quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  clearAdvDeadlineTo: function() {
    this.setData({ advDeadlineTo: '', quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  clearAdvStatus: function() {
    this.setData({ advStatus: '', advStatusLabel: '', advStatusIndex: -1, quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  clearAdvRank: function() {
    this.setData({ advRank: '', advRankIndex: -1, quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },
  clearAdvOrganizer: function() {
    this.setData({ advOrganizer: '', quickFilter: 'all', page: 0, hasMore: true });
    this.loadList(false);
  },

  // 重置全部
  resetAdvanced: function() {
    this.setData({
      advConferenceType: '', advConferenceTypeLabel: '', advConferenceTypeIndex: -1,
      advLocation: '',
      advStartDateFrom: '', advStartDateTo: '',
      advEndDateFrom: '', advEndDateTo: '',
      advDeadlineFrom: '', advDeadlineTo: '',
      advStatus: '', advStatusLabel: '', advStatusIndex: -1,
      advRank: '', advRankIndex: -1,
      advOrganizer: '',
      page: 0, hasMore: true
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
    this.setData({ showForm: false, isEdit: false, editId: '', quickFilter: 'all', page: 0, hasMore: true });
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
