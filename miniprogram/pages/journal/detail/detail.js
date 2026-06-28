// pages/journal/detail/detail.js
// 期刊详情页

Page({
  data: {
    journalId: '',
    journal: null,
    loading: true,

    // 年度趋势数据
    yearlyData: [],
    chartData: [],
    maxWorks: 1,
    maxCited: 1,
    
    // 学科主题
    topics: [],
    showTopics: false,  // 研究话题是否展开
    
    // 分析数据
    analytics: null,
    analyticsLoading: false,
    
    // 文章列表
    articles: [],
    articlesLoading: false,
    articlesPage: 1,
    articlesHasMore: true,
    
    // 当前tab
    activeTab: 'overview',  // overview / analysis / trends / articles
    tabs: [
      { id: 'overview', name: '概览' },
      { id: 'analysis', name: '投稿分析' },
      { id: 'trends', name: '趋势' },
      { id: 'articles', name: '文章' }
    ]
  },

  onLoad: function(options) {
    if (options.journalId) {
      this.setData({ journalId: options.journalId });
      this.loadDetail(options.journalId);
    }
  },

  onPullDownRefresh: function() {
    this.loadDetail(this.data.journalId);
    wx.stopPullDownRefresh();
  },

  /**
   * 加载期刊详情
   */
  loadDetail: function(journalId) {
    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'journalAPI',
      data: {
        action: 'getJournalDetail',
        journalId: journalId
      }
    }).then(res => {
      const result = res.result;
      if (result.code === 0 && result.data) {
        const journal = result.data.journal || {};
        const yearlyData = result.data.yearlyData || [];
        
        // 过滤无效年份（只保留1900-2099之间的合理年份）
        const validYearlyData = yearlyData.filter(d => d.year >= 1900 && d.year <= 2099);
        
        // 只显示最近8年 & 计算柱状图最大值
        const recent8Years = validYearlyData.slice(0, 8);
        const maxWorks = Math.max(...recent8Years.map(d => d.works_count), 1);
        const maxCited = Math.max(...recent8Years.map(d => d.cited_by_count), 1);
        
        // 柱状图按年份升序（左旧→右新）
        const chartData = [...recent8Years].reverse();
        
        let topics = result.data.topics || [];

        // 预处理：学科分类兜底（从 top_topics 提取）
        if ((!journal.subject_category || journal.subject_category.length === 0) && journal.top_topics) {
          journal.subject_category = journal.top_topics.map(t => {
            return t.subfield ? t.subfield.display_name : t.display_name;
          }).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
        }
        if (!journal.subject_category) {
          journal.subject_category = [];
        }
        
        // 如果 topics 为空，从 subject_category 生成
        if (topics.length === 0 && journal.subject_category.length > 0) {
          topics = journal.subject_category.map(s => ({
            display_name: s,
            count: 0
          }));
        }

        // 格式化 IF
        if (journal.impact_factor) {
          journal.if_display = parseFloat(journal.impact_factor).toFixed(1);
        }

        this.setData({
          journal: journal,
          yearlyData: recent8Years,
          chartData: chartData,
          maxWorks: maxWorks,
          maxCited: maxCited,
          topics: topics,
          loading: false
        });

        wx.setNavigationBarTitle({
          title: journal.title || '期刊详情'
        });
      } else {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    }).catch(err => {
      console.error('[loadDetail] Error:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
      this.setData({ loading: false });
    });
  },

  /**
   * 切换tab
   */
  switchTab: function(e) {
    const tabId = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tabId });

    // 切换到文章tab时自动加载
    if (tabId === 'articles' && this.data.articles.length === 0) {
      this.loadArticles();
    }
    
    // 切换到分析tab时自动加载
    if (tabId === 'analysis' && !this.data.analytics) {
      this.loadAnalytics();
    }
  },

  /**
   * 展开/折叠研究话题
   */
  toggleTopics: function() {
    this.setData({
      showTopics: !this.data.showTopics
    });
  },

  /**
   * 加载期刊分析数据
   */
  loadAnalytics: function() {
    if (this.data.analyticsLoading) return;
    
    this.setData({ analyticsLoading: true });
    
    wx.cloud.callFunction({
      name: 'journalAPI',
      data: {
        action: 'getJournalAnalytics',
        journalId: this.data.journalId
      }
    }).then(res => {
      const result = res.result;
      if (result.code === 0 && result.data) {
        this.setData({
          analytics: result.data,
          analyticsLoading: false
        });
      } else {
        wx.showToast({ title: result.message || '分析加载失败', icon: 'none' });
        this.setData({ analyticsLoading: false });
      }
    }).catch(err => {
      console.error('[loadAnalytics] Error:', err);
      this.setData({ analyticsLoading: false });
    });
  },

  /**
   * 加载文章列表（走OpenAlex API）
   */
  loadArticles: function(isLoadMore = false) {
    if (this.data.articlesLoading) return;
    if (!isLoadMore) {
      this.setData({ articles: [], articlesPage: 1, articlesHasMore: true });
    }

    this.setData({ articlesLoading: true });

    wx.cloud.callFunction({
      name: 'journalAPI',
      data: {
        action: 'getJournalArticles',
        openalexId: this.data.journal.openalex_id,
        page: this.data.articlesPage,
        perPage: 20
      }
    }).then(res => {
      const result = res.result;
      if (result.code === 0) {
        const newArticles = result.data.articles || [];
        this.setData({
          articles: isLoadMore ? [...this.data.articles, ...newArticles] : newArticles,
          articlesHasMore: newArticles.length >= 20,
          articlesPage: this.data.articlesPage + 1,
          articlesLoading: false
        });
      } else {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        this.setData({ articlesLoading: false });
      }
    }).catch(err => {
      console.error('[loadArticles] Error:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
      this.setData({ articlesLoading: false });
    });
  },

  /**
   * 加载更多文章
   */
  loadMoreArticles: function() {
    if (this.data.articlesHasMore && !this.data.articlesLoading) {
      this.loadArticles(true);
    }
  },

  /**
   * 打开文章DOI链接
   */
  openArticle: function(e) {
    const { doi } = e.currentTarget.dataset;
    if (doi) {
      wx.setClipboardData({
        data: doi,
        success: () => {
          wx.showToast({ title: 'DOI已复制', icon: 'success' });
        }
      });
    }
  },

  /**
   * 打开URL（复制链接）
   */
  openUrl: function(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.setClipboardData({
        data: url,
        success: () => {
          wx.showToast({ title: '链接已复制', icon: 'success' });
        }
      });
    }
  },

  /**
   * 格式化数字
   */
  formatNumber: function(num) {
    if (!num) return '0';
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toLocaleString ? num.toLocaleString() : String(num);
  }
});
