// pages/journal/search/search.js
// 期刊搜索页 - 简化版

Page({
  data: {
    // 搜索相关
    keyword: '',
    
    // 筛选条件
    filters: {
      is_oa: null,           // OA筛选：true/false/null
      is_in_doaj: null,      // DOAJ收录筛选
      is_medline: null,      // MEDLINE收录筛选
      is_pmc_journal: null   // PMC期刊筛选
    },
    
    // 搜索结果
    journalList: [],
    loading: false,
    hasMore: true,
    page: 1,
    total: 0,
    
    // 排序方式
    sortBy: 'works_count', // works_count / cited_by_count
    
    // 对比模式
    compareMode: false,
    compareList: [],
    maxCompare: 5
  },

  onLoad: function() {
    // 页面加载时自动搜索热门期刊
    this.searchJournals();
  },

  onPullDownRefresh: function() {
    this.resetAndSearch();
    wx.stopPullDownRefresh();
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  /**
   * 执行数据库迁移（临时，完成后删除）
   */
  runMigration: function() {
    wx.showLoading({ title: '迁移中...' });
    wx.cloud.callFunction({
      name: 'journalAPI',
      data: { action: 'migrateJournals' }
    }).then(res => {
      wx.hideLoading();
      console.log('迁移结果:', res);
      wx.showModal({
        title: '迁移完成',
        content: JSON.stringify(res, null, 2),
        showCancel: false
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('迁移失败:', err);
      wx.showModal({
        title: '迁移失败',
        content: err.message || '未知错误',
        showCancel: false
      });
    });
  },

  /**
   * 输入关键词
   */
  onKeywordInput: function(e) {
    this.setData({
      keyword: e.detail.value
    });
  },

  /**
   * 执行搜索
   */
  onSearch: function() {
    this.resetAndSearch();
  },

  /**
   * 清空搜索
   */
  onClear: function() {
    this.setData({
      keyword: '',
      filters: {
        is_oa: null,
        is_in_doaj: null,
        is_medline: null,
        is_pmc_journal: null
      }
    });
    this.resetAndSearch();
  },

  /**
   * 重置并搜索
   */
  resetAndSearch: function() {
    this.setData({
      page: 1,
      journalList: [],
      hasMore: true
    });
    this.searchJournals();
  },

  /**
   * 加载更多
   */
  loadMore: function() {
    this.setData({
      page: this.data.page + 1
    });
    this.searchJournals(true);
  },

  /**
   * 调用云函数搜索期刊
   */
  searchJournals: function(isLoadMore = false) {
    if (this.data.loading) return;

    this.setData({ loading: true });

    const { keyword, page, filters, sortBy } = this.data;

    wx.cloud.callFunction({
      name: 'journalAPI',
      data: {
        action: 'searchJournals',
        keyword: keyword,
        page: page,
        pageSize: 20,
        filters: filters,
        sortBy: sortBy
      }
    }).then(res => {
      const result = res.result;
      
      if (result.code === 0) {
        let newList = result.data.journals || [];
        
        // 预处理：补充显示字段（避免 WXML 调用方法）
        newList = newList.map(journal => {
          // 1. 篇均被引
          if (journal.works_count_latest > 0 && journal.cited_by_count_latest > 0) {
            journal.avg_citation = (journal.cited_by_count_latest / journal.works_count_latest).toFixed(1);
          } else {
            journal.avg_citation = '0';
          }
          
          // 2. 学科分类兜底：从 top_topics 提取
          if ((!journal.subject_category || journal.subject_category.length === 0) && journal.top_topics) {
            journal.subject_category = journal.top_topics.map(t => {
              return t.subfield ? t.subfield.display_name : t.display_name;
            }).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
          }
          // 确保 subject_category 是数组
          if (!journal.subject_category) {
            journal.subject_category = [];
          }
          
          // 3. 格式化 IF（保留1位小数）
          if (journal.impact_factor) {
            journal.if_display = parseFloat(journal.impact_factor).toFixed(1);
          } else {
            journal.if_display = '';
          }
          
          // 4. 格式化 2年均引
          if (journal.two_year_mean_citedness_latest) {
            journal.citedness_2yr = parseFloat(journal.two_year_mean_citedness_latest).toFixed(2);
          } else {
            journal.citedness_2yr = '';
          }
          
          // 5. 格式化自引率
          if (journal.self_citation_rate) {
            journal.scr_display = parseFloat(journal.self_citation_rate).toFixed(1) + '%';
          } else {
            journal.scr_display = '';
          }
          
          return journal;
        });
        
        // 6. 打标：新数据是否已在对比列表中
        const compareIds = this.data.compareList;
        newList = newList.map(j => ({
          ...j,
          _selected: compareIds.indexOf(j._id) > -1
        }));

        this.setData({
          journalList: isLoadMore 
            ? [...this.data.journalList, ...newList] 
            : newList,
          total: result.data.total || 0,
          hasMore: newList.length >= 20,
          loading: false
        });
        
        // 提示数据来源
        if (!isLoadMore && newList.length > 0 && !this.data.keyword) {
          const from = result.data.from || '';
          wx.showToast({ title: from || '已加载热门期刊', icon: 'success', duration: 1500 });
        }
      } else {
        wx.showToast({
          title: result.message || '搜索失败，请重试',
          icon: 'none',
          duration: 2000
        });
        this.setData({ loading: false });
      }
    }).catch(err => {
      console.error('[searchJournals] Error:', err);
      wx.showToast({
        title: '网络异常，请检查云函数是否已部署',
        icon: 'none',
        duration: 2500
      });
      this.setData({ loading: false });
    });
  },

  /**
   * 切换OA筛选
   */
  toggleOAFIlter: function() {
    const current = this.data.filters.is_oa;
    let next;
    
    if (current === null) {
      next = true;       // 只显示OA
    } else if (current === true) {
      next = false;      // 只显示非OA
    } else {
      next = null;       // 全部
    }
    
    this.setData({
      'filters.is_oa': next
    });
    
    this.resetAndSearch();
  },

  /**
   * 切换DOAJ筛选
   */
  toggleDOAJFilter: function() {
    const current = this.data.filters.is_in_doaj;
    let next;
    
    if (current === null) {
      next = true;       // 只显示DOAJ收录
    } else {
      next = null;       // 全部
    }
    
    this.setData({
      'filters.is_in_doaj': next
    });
    
    this.resetAndSearch();
  },

  /**
   * 切换MEDLINE筛选
   */
  toggleMEDLINEFilter: function() {
    const current = this.data.filters.is_medline;
    let next;
    
    if (current === null) {
      next = true;
    } else {
      next = null;
    }
    
    this.setData({
      'filters.is_medline': next
    });
    
    this.resetAndSearch();
  },

  /**
   * 切换PMC期刊筛选
   */
  togglePMCJournalFilter: function() {
    const current = this.data.filters.is_pmc_journal;
    let next;
    
    if (current === null) {
      next = true;
    } else {
      next = null;
    }
    
    this.setData({
      'filters.is_pmc_journal': next
    });
    
    this.resetAndSearch();
  },

  /**
   * 设置排序方式
   */
  setSortBy: function(e) {
    const { sort } = e.currentTarget.dataset;
    if (sort === this.data.sortBy) return;
    
    this.setData({ sortBy: sort });
    this.resetAndSearch();
  },

  /**
   * 取消OA筛选（从活跃筛选条直接取消）
   */
  cancelOAFilter: function() {
    this.setData({
      'filters.is_oa': null
    });
    this.resetAndSearch();
  },

  /**
   * 清空所有筛选
   */
  clearAllFilters: function() {
    this.setData({
      filters: {
        is_oa: null,
        is_in_doaj: null,
        is_medline: null,
        is_pmc_journal: null
      }
    });
    this.resetAndSearch();
  },

  /**
   * 同步榜单的选中状态到每个期刊的 _selected 属性
   * （WXML 不支持 indexOf，所以 JS 层打标）
   */
  syncCompareState: function() {
    const ids = this.data.compareList;
    const updated = this.data.journalList.map(item => ({
      ...item,
      _selected: ids.indexOf(item._id) > -1
    }));
    this.setData({ journalList: updated });
  },

  /**
   * 进入对比模式
   */
  enterCompareMode: function() {
    this.setData({
      compareMode: true,
      compareList: []
    });
    this.syncCompareState();
  },

  /**
   * 退出对比模式
   */
  exitCompareMode: function() {
    this.setData({
      compareMode: false,
      compareList: []
    });
    this.syncCompareState();
  },

  /**
   * 添加/移除对比期刊
   */
  toggleCompare: function(e) {
    const id = e.currentTarget.dataset.id;
    const oldList = this.data.compareList;
    let newList;

    if (oldList.indexOf(id) > -1) {
      newList = oldList.filter(item => item !== id);
    } else {
      if (oldList.length >= this.data.maxCompare) {
        wx.showToast({
          title: `最多对比${this.data.maxCompare}本`,
          icon: 'none'
        });
        return;
      }
      newList = [...oldList, id];
    }
    
    this.setData({ compareList: newList });
    this.syncCompareState();
  },

  /**
   * 跳转到详情页
   */
  goToDetail: function(e) {
    if (this.data.compareMode) return;
    
    const { id } = e.currentTarget.dataset;
    
    wx.navigateTo({
      url: `/pages/journal/detail/detail?journalId=${id}`
    });
  },

  /**
   * 开始对比
   */
  startCompare: function() {
    if (this.data.compareList.length < 2) {
      wx.showToast({
        title: '请选择至少2本期刊',
        icon: 'none'
      });
      return;
    }
    
    const ids = this.data.compareList.join(',');
    
    wx.navigateTo({
      url: `/pages/journal/compare/compare?ids=${ids}`
    });
  },

  /**
   * 获取筛选标签文本
   */
  getFilterLabel: function() {
    const { is_oa, is_in_doaj, is_medline, is_pmc_journal } = this.data.filters;
    const labels = [];
    
    if (is_oa === true) {
      labels.push('OA');
    } else if (is_oa === false) {
      labels.push('非OA');
    }
    
    if (is_in_doaj === true) {
      labels.push('DOAJ');
    }
    
    if (is_medline === true) {
      labels.push('MEDLINE');
    }
    
    if (is_pmc_journal === true) {
      labels.push('PMC期刊');
    }
    
    return labels.join(' | ');
  },

  /**
   * 获取排序标签文本
   */
  getSortLabel: function() {
    return this.data.sortBy === 'works_count' ? '按发文量' : '按被引量';
  }
});
