// pages/specialIssue/detail/detail.js
// V5: 详情页 - 展示方案详情、来源文章、客编图表、重新生成、查看历史
var creditsUtil = require('../../../utils/credits.js');
var theme = require('../../../utils/theme.js');

Page({
  data: {
    taskId: '',
    keyword: '',
    displayLang: 'zh',

    // 任务数据
    result: null,
    sourcePapers: [],
    sourceAuthors: [],
    regenerateCount: 0,
    regenerateHistory: [],
    creditsDeducted: false,
    completedAt: null,
    createdAt: null,

    // 预处理后的展示数据（避免WXML中调用方法）
    planTitle: '',
    planAbstract: '',
    planKeywords: [],
    planGuestEditors: [],
    planTopicHeat: 0,
    planSourceArticleIds: [],
    planSourceEditorIds: [],

    // 方向选择面板
    plans: [],
    selectedPlanKey: '',
    showDirectionPanel: false,
    expandedDirection: '',
    selectingDirection: false,
    compareHeights: [],

    // 方向详情弹窗
    showDetailModal: false,
    detailModalPlan: null,

    // 状态
    loading: true,
    hasResult: false,
    error: '',
    progressText: '',

    // 图表
    editorChartData: {},
    canvas2d: true,

    // 引用统计弹窗
    showCiteModal: false,
    citeModalTitle: '',
    citeModalData: { years: [], counts: [], heights: [] },

    // 主题色（由 loadToolTheme 从 DB 加载）
    theme: {}
  },

  onLoad: function(options) {
    this.loadToolTheme();
    var taskId = options.taskId || '';
    var schemeId = options.schemeId || '';
    var directionKey = options.directionKey || '';
    this.setData({ taskId: taskId, schemeId: schemeId, directionKey: directionKey });

    // 检测 canvas2d 支持
    var sysInfo = wx.getSystemInfoSync();
    var SDKVersion = sysInfo.SDKVersion;
    if (SDKVersion) {
      var vers = SDKVersion.split('.').map(function(v) { return parseInt(v); });
      if (vers[0] < 2 || (vers[0] === 2 && vers[1] < 9)) {
        this.setData({ canvas2d: false });
      }
    }

    if (schemeId) {
      this.loadSchemeDetail();
    } else {
      this.loadTrendDetail();
    }
  },

  loadToolTheme: function() {
    var that = this;
    theme.loadToolTheme('specialIssue').then(function(t) {
      that.setData({ theme: t });
    });
  },

  onShow: function() {
    // 如果正在轮询中，页面回来时刷新
    if (this._pollTimer) {
      if (this.data.schemeId) {
        this.loadSchemeDetail();
      } else {
        this.loadTrendDetail();
      }
    }
  },

  onUnload: function() {
    this.stopPolling();
  },

  // ---- 加载趋势分析详情（新的 getTrendDetail 接口） ----
  loadTrendDetail: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'getTrendDetail', taskId: that.data.taskId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      console.log('[detail] getTrendDetail返回:', JSON.stringify(data));
      if (!data) {
        that.setData({ loading: false, error: '任务不存在' });
        return;
      }

      var plans = data.directions || [];
      var schemesByDir = data.schemesByDir || {};

      // 方向卡片预处理
      for (var p = 0; p < plans.length; p++) {
        plans[p]._topicLabel = 'Topic' + (p + 1);
        plans[p]._avgCitationsStr = (plans[p].avgCitations || 0).toFixed(1);
        plans[p]._avgFWCIStr = (plans[p].avgFWCI || 0).toFixed(2);
        plans[p]._hotRecentAvgStr = (plans[p].hotRecentAvg || 0).toFixed(1);
        plans[p]._topJournalRatioStr = ((plans[p].topJournalRatio || 0) * 100).toFixed(0) + '%';
        var h = plans[p].topicHeat || 0;
        if (h >= 800) plans[p]._heatColor = 'linear-gradient(135deg, #DC2626, #EF4444)';
        else if (h >= 600) plans[p]._heatColor = 'linear-gradient(135deg, #EA580C, #F97316)';
        else if (h >= 400) plans[p]._heatColor = 'linear-gradient(135deg, #CA8A04, #EAB308)';
        else plans[p]._heatColor = 'linear-gradient(135deg, #2563EB, #3B82F6)';
        // 该方向下的方案列表
        plans[p]._schemes = schemesByDir[plans[p].key] || [];
        // 按钮状态
        var dirSchemes = schemesByDir[plans[p].key] || [];
        var hasGenerating = false;
        var hasCompleted = false;
        var hasFailed = false;
        var latestSchemeId = '';
        for (var s = 0; s < dirSchemes.length; s++) {
          if (dirSchemes[s].status === 'generating') { hasGenerating = true; latestSchemeId = dirSchemes[s].schemeId; }
          if (dirSchemes[s].status === 'completed') { hasCompleted = true; }
          if (dirSchemes[s].status === 'failed') { hasFailed = true; latestSchemeId = dirSchemes[s].schemeId; }
        }
        if (hasGenerating) {
          plans[p]._schemeStatus = 'generating';
          plans[p]._schemeId = latestSchemeId;
        } else if (hasCompleted) {
          plans[p]._schemeStatus = 'completed';
        } else if (hasFailed) {
          plans[p]._schemeStatus = 'failed';
          plans[p]._schemeId = latestSchemeId;
        } else {
          plans[p]._schemeStatus = 'idle';
        }
      }
      plans.sort(function(a, b) { return (b.topicHeat || 0) - (a.topicHeat || 0); });

      var maxHeat = 1;
      for (var p = 0; p < plans.length; p++) maxHeat = Math.max(maxHeat, plans[p].topicHeat || 0);
      var compareHeights = plans.map(function(p) { return Math.max(Math.round((p.topicHeat || 0) / maxHeat * 100), 4); });

      that.setData({
        loading: false,
        showDirectionPanel: true,
        keyword: data.keyword || '',
        plans: plans,
        compareHeights: compareHeights,
        schemeCount: data.schemeCount || 0,
        generatingSchemeId: data.generatingSchemeId || '',
        error: ''
      });
      wx.setNavigationBarTitle({ title: '趋势领域分析' });

      // 如果有正在生成的方案，启动轮询
      if (data.generatingSchemeId) {
        that._pollingSchemeId = data.generatingSchemeId;
        that.startSchemePolling();
      }
    }).catch(function(err) {
      console.error('[detail] 加载趋势失败:', err);
      that.setData({ loading: false, error: that.getDisplayError(err.message || '网络错误') });
    });
  },

  // ---- 加载方案详情（getSchemeDetail 接口） ----
  loadSchemeDetail: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'getSchemeDetail', schemeId: that.data.schemeId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      console.log('[detail] getSchemeDetail返回:', JSON.stringify(data));
      if (!data) {
        that.setData({ loading: false, error: '方案不存在' });
        return;
      }

      if (data.status === 'generating') {
        that._pollingSchemeId = data.schemeId;
        that.startSchemePolling();
        that.setData({ loading: true, progressText: '方案生成中...' });
        return;
      }

      if (data.status === 'failed') {
        that.setData({ loading: false, error: data.error || '生成失败' });
        return;
      }

      var plan = data.plan || {};
      var zh = plan.zh || {};
      var en = plan.en || {};
      var langData = zh.title ? zh : (en.title ? en : {});

      // 筛选关联文章
      var allPapers = data.sourcePapers || [];
      var articleIds = plan.sourceArticleIds || [];
      var idSet = {};
      for (var i = 0; i < articleIds.length; i++) idSet[articleIds[i]] = true;
      var displayPapers = articleIds.length > 0
        ? allPapers.filter(function(p) { return idSet[p.id]; })
        : allPapers;

      that.setData({
        loading: false,
        hasResult: true,
        showDirectionPanel: false,
        planTitle: langData.title || '',
        planAbstract: langData.abstract || '',
        planKeywords: langData.keywords || [],
        planGuestEditors: plan.guestEditors || [],
        planTopicHeat: plan.topicHeat || 0,
        planSourceArticleIds: plan.sourceArticleIds || [],
        planSourceEditorIds: plan.sourceEditorIds || [],
        sourcePapers: allPapers,
        displayPapers: displayPapers,
        sourceAuthors: data.sourceAuthors || [],
        keyword: data.keyword || '',
        error: ''
      });
      wx.setNavigationBarTitle({ title: '方案详情' });
      that.buildEditorCharts();
    }).catch(function(err) {
      console.error('[detail] 加载方案失败:', err);
      that.setData({ loading: false, error: that.getDisplayError(err.message || '网络错误') });
    });
  },

  // ---- 轮询方案进度 ----
  startSchemePolling: function() {
    var that = this;
    that.stopPolling();
    that._pollTimer = setInterval(function() {
      that.pollSchemeStatus();
    }, 3000);
  },

  pollSchemeStatus: function() {
    var that = this;
    var schemeId = that._pollingSchemeId;
    if (!schemeId) return;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'getSchemeStatus', schemeId: schemeId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      if (!data) return;
      if (data.status === 'completed') {
        that.stopPolling();
        that._pollingSchemeId = null;
        // 重新加载趋势详情或方案详情
        if (that.data.schemeId) {
          that.loadSchemeDetail();
        } else {
          that.loadTrendDetail();
        }
      } else if (data.status === 'failed') {
        that.stopPolling();
        that._pollingSchemeId = null;
        that.loadTrendDetail();
      }
    }).catch(function() {});
  },

  // ---- 生成方案（startScheme） ----
  onGenerateScheme: function(e) {
    var that = this;
    var directionKey = e.currentTarget.dataset.key;
    if (!directionKey) return;

    // 防抖：正在生成中不允许重复点击
    if (that.data.selectingDirection) return;
    that.setData({ selectingDirection: true });
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'startScheme', taskId: that.data.taskId, directionKey: directionKey }
    }).then(function(res) {
      var result = res.result || {};
      if (result.success && result.schemeId) {
        wx.showToast({ title: '方案生成已启动', icon: 'none' });
        that._pollingSchemeId = result.schemeId;
        that.startSchemePolling();
        // 立即刷新方向状态
        that.loadTrendDetail();
      } else {
        wx.showToast({ title: result.error || '启动失败', icon: 'none' });
        that.setData({ selectingDirection: false });
      }
    }).catch(function() {
      that.setData({ selectingDirection: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  },

  // ---- 查看方案 ----
  onViewScheme: function(e) {
    var schemeId = e.currentTarget.dataset.schemeId;
    if (!schemeId) return;
    wx.navigateTo({ url: '../detail/detail?schemeId=' + schemeId });
  },

  // ---- 加载任务详情 (旧版，保留兼容) ----

  loadTaskDetail: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'poll', taskId: that.data.taskId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      console.log('[detail] poll返回:', JSON.stringify(data));
      if (!data) {
        that.setData({ loading: false, error: '任务不存在' });
        return;
      }

      // 预处理数据
      var plan = (data.result && data.result.plan) || {};
      var zh = plan.zh || {};
      var en = plan.en || {};
      var langData = zh.title ? zh : (en.title ? en : {});

      that.setData({
        keyword: data.keyword || '',
        createdAt: data.createdAt,
        completedAt: data.completedAt,
        creditsDeducted: data.creditsDeducted,
        regenerateCount: data.regenerateCount || 0,
        regenerateHistory: data.regenerateHistory || [],
        selectedPlanKey: data.selectedPlanKey || '',
        planTitle: langData.title || '',
        planAbstract: langData.abstract || '',
        planKeywords: langData.keywords || [],
        planGuestEditors: plan.guestEditors || [],
        planTopicHeat: plan.topicHeat || 0,
        planSourceArticleIds: plan.sourceArticleIds || [],
        planSourceEditorIds: plan.sourceEditorIds || []
      });

      if (data.status === 'awaiting_selection' && data.result && data.result.plans) {
        // 趋势分析完成，显示方向选择面板
        var plans = data.result.plans || [];
        // 为每个方向预计算论文数 + 趋势指标
        var allPapers = data.sourcePapers || [];
        for (var p = 0; p < plans.length; p++) {
          var ids = plans[p].sourceArticleIds || [];
          var idSet2 = {};
          for (var j = 0; j < ids.length; j++) { idSet2[ids[j]] = true; }
          plans[p]._topicLabel = 'Topic' + (p + 1);
          plans[p]._matchedPapers = ids.length > 0
            ? allPapers.filter(function(ap) { return idSet2[ap.id]; })
            : [];
          plans[p]._paperCount = plans[p]._matchedPapers.length;
          // 提取趋势指标（预计算格式化的显示字符串，WXML不支持.toFixed()和算术表达式）
          plans[p]._avgCitations = typeof plans[p].avgCitations === 'number' ? plans[p].avgCitations : 0;
          plans[p]._avgFWCI = typeof plans[p].avgFWCI === 'number' ? plans[p].avgFWCI : 0;
          plans[p]._topJournalRatio = typeof plans[p].topJournalRatio === 'number' ? plans[p].topJournalRatio : 0;
          plans[p]._hotRecentAvg = typeof plans[p].hotRecentAvg === 'number' ? plans[p].hotRecentAvg : 0;
          plans[p]._avgCitationsStr = plans[p]._avgCitations.toFixed(1);
          plans[p]._avgFWCIStr = plans[p]._avgFWCI.toFixed(2);
          plans[p]._hotRecentAvgStr = plans[p]._hotRecentAvg.toFixed(1);
          plans[p]._topJournalRatioStr = (plans[p]._topJournalRatio * 100).toFixed(0) + '%';
          // 根据热度计算颜色（高→红橙黄渐变）
          var h = plans[p].topicHeat || 0;
          if (h >= 800) plans[p]._heatColor = 'linear-gradient(135deg, #DC2626, #EF4444)';
          else if (h >= 600) plans[p]._heatColor = 'linear-gradient(135deg, #EA580C, #F97316)';
          else if (h >= 400) plans[p]._heatColor = 'linear-gradient(135deg, #CA8A04, #EAB308)';
          else plans[p]._heatColor = 'linear-gradient(135deg, #2563EB, #3B82F6)';
          // 汇总方向论文的逐年引用趋势（用于趋势对比图）
          var yearAgg = {};
          for (var j = 0; j < ids.length; j++) {
            var paper = idSet2[ids[j]] ? allPapers.find(function(ap) { return ap.id === ids[j]; }) : null;
            if (!paper || !paper.citationsByYear) continue;
            var years = paper.citationsByYear.years || [];
            var counts = paper.citationsByYear.counts || [];
            for (var k = 0; k < years.length; k++) {
              yearAgg[years[k]] = (yearAgg[years[k]] || 0) + counts[k];
            }
          }
          var sortedYears = Object.keys(yearAgg).sort();
          plans[p]._trendYears = sortedYears;
          plans[p]._trendCounts = sortedYears.map(function(y) { return yearAgg[y]; });
          var trendMax = Math.max.apply(null, plans[p]._trendCounts) || 1;
          plans[p]._trendHeights = plans[p]._trendCounts.map(function(c) {
            return Math.max(Math.round(c / trendMax * 100), 4);
          });
        }

        // 按热度倒序排列
        plans.sort(function(a, b) { return (b.topicHeat || 0) - (a.topicHeat || 0); });

        // 预计算对比柱状图高度（以最高热值为100%）
        var maxHeat = 1;
        for (var p = 0; p < plans.length; p++) {
          maxHeat = Math.max(maxHeat, plans[p].topicHeat || 0);
        }
        var compareHeights = plans.map(function(plan) {
          return Math.max(Math.round((plan.topicHeat || 0) / maxHeat * 100), 4);
        });

        that.setData({
          loading: false,
          hasResult: false,
          showDirectionPanel: true,
          plans: plans,
          compareHeights: compareHeights,
          sourcePapers: allPapers,
          sourceAuthors: data.sourceAuthors || [],
          error: ''
        });
        wx.setNavigationBarTitle({ title: '趋势领域分析' });
        that.stopPolling();
      } else if (data.status === 'completed' && data.result) {
        // 按 sourceArticleIds 筛选出与话题真正关联的文章
        var allPapers = data.sourcePapers || [];
        var articleIds = plan.sourceArticleIds || [];
        var idSet = {};
        for (var i = 0; i < articleIds.length; i++) { idSet[articleIds[i]] = true; }
        var displayPapers = articleIds.length > 0
          ? allPapers.filter(function(p) { return idSet[p.id]; })
          : allPapers;

        that.setData({
          loading: false,
          hasResult: true,
          showDirectionPanel: false,
          result: data.result,
          sourcePapers: allPapers,
          displayPapers: displayPapers,
          sourceAuthors: data.sourceAuthors || [],
          error: ''
        });
        wx.setNavigationBarTitle({ title: '方案详情' });
        that.buildEditorCharts();
        that.stopPolling();
      } else if (data.status === 'processing') {
        that.setData({
          loading: true,
          hasResult: false,
          showDirectionPanel: false,
          progressText: '任务进行中，请稍候...'
        });
        that.startPolling();
      } else {
        that.setData({
          loading: false,
          hasResult: false,
          showDirectionPanel: false,
          error: that.getDisplayError(data.error)
        });
        that.stopPolling();
      }
    }).catch(function(err) {
      console.error('[detail] 加载失败:', err);
      that.setData({
        loading: false,
        error: that.getDisplayError(err.message || '网络错误')
      });
    });
  },

  getDisplayError: function(error) {
    var msg = error || '';
    if (!msg) return '执行失败，请稍后重试';
    if (msg.indexOf('429') >= 0 || msg.indexOf('rate_limit') >= 0 || msg.indexOf('TPD') >= 0) {
      return 'AI 服务今日额度已用完，请稍后重试';
    }
    if (msg.indexOf('超时') >= 0 || msg.indexOf('timeout') >= 0 || msg.indexOf('ETIMEDOUT') >= 0) {
      return 'AI 服务响应超时，请稍后重试';
    }
    if (msg.indexOf('Kimi API') >= 0 || msg.indexOf('openai API') >= 0 || msg.indexOf('deepseek API') >= 0 || msg.indexOf('tencent API') >= 0 || msg.indexOf('alibaba API') >= 0 || msg.indexOf('organization') >= 0 || msg.indexOf('project') >= 0) {
      return 'AI 服务暂时不可用，请稍后重试';
    }
    return '执行失败，请稍后重试';
  },

  // ---- 轮询 ----

  startPolling: function() {
    var that = this;
    that.stopPolling();
    that._pollTimer = setInterval(function() {
      that.loadTaskDetail();
    }, 3000);
  },

  stopPolling: function() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  // ---- 语言切换 ----

  toggleContentLang: function() {
    var newLang = this.data.displayLang === 'zh' ? 'en' : 'zh';
    var plan = this.getPlan();
    var langData = (plan && plan[newLang]) || {};
    this.setData({
      displayLang: newLang,
      planTitle: langData.title || '',
      planAbstract: langData.abstract || '',
      planKeywords: langData.keywords || []
    });
  },

  // ---- 数据读取 ----

  getPlan: function() {
    var result = this.data.result;
    if (!result || !result.plan) return null;
    return result.plan;
  },

  getPlanContent: function(path) {
    var plan = this.getPlan();
    if (!plan) return '';
    var lang = this.data.displayLang;
    var langData = plan[lang] || plan.en || plan.zh;
    if (!langData) return '';
    var keys = path.split('.');
    var value = langData;
    for (var i = 0; i < keys.length; i++) {
      if (value && typeof value === 'object') {
        value = value[keys[i]];
      } else {
        return '';
      }
    }
    return value || '';
  },

  getPlanTitle: function() { return this.getPlanContent('title'); },
  getPlanAbstract: function() { return this.getPlanContent('abstract'); },
  getPlanKeywords: function() { return this.getPlanContent('keywords') || []; },

  getGuestEditors: function() {
    var plan = this.getPlan();
    return (plan && plan.guestEditors) ? plan.guestEditors : [];
  },

  // ---- 点击被引数：显示年度引用柱状图 ----

  onTapCitations: function(e) {
    var idx = e.currentTarget.dataset.index;
    var paper = this.data.sourcePapers[idx];
    if (!paper || !paper.citationsByYear) return;
    var years = paper.citationsByYear.years || [];
    var counts = paper.citationsByYear.counts || [];
    if (years.length === 0) {
      wx.showToast({ title: '暂无年度引用数据', icon: 'none' });
      return;
    }
    var maxCount = Math.max.apply(null, counts) || 1;
    var heights = counts.map(function(c) { return Math.max((c / maxCount) * 80, 4); });
    this.setData({
      showCiteModal: true,
      citeModalTitle: (paper.title || '文章') + ' 的引用趋势',
      citeModalData: { years: years, counts: counts, heights: heights }
    });
  },

  hideCiteModal: function() {
    this.setData({ showCiteModal: false });
  },

  onTapDoi: function(e) {
    var doi = e.currentTarget.dataset.doi;
    if (!doi) return;
    var url = 'https://doi.org/' + doi.replace(/^https?:\/\/doi\.org\//, '');
    wx.setClipboardData({
      data: url,
      success: function() {
        wx.showToast({ title: 'DOI链接已复制', icon: 'none' });
      }
    });
  },

  getTopicHeat: function() {
    var plan = this.getPlan();
    return (plan && plan.topicHeat) || 0;
  },

  // 获取 LLM 引用的来源文章（根据 sourceArticleIds 筛选）
  getSourceArticles: function() {
    var plan = this.getPlan();
    var sourcePapers = this.data.sourcePapers;
    if (!plan || !plan.sourceArticleIds || sourcePapers.length === 0) {
      return sourcePapers;
    }
    var idSet = {};
    for (var i = 0; i < plan.sourceArticleIds.length; i++) {
      idSet[plan.sourceArticleIds[i]] = true;
    }
    return sourcePapers.filter(function(p) { return idSet[p.id]; });
  },

  // 获取 LLM 推荐的客编者详细信息（匹配 sourceEditorIds）
  getEnrichedEditors: function() {
    var plan = this.getPlan();
    var sourceAuthors = this.data.sourceAuthors;
    var guestEditors = this.getGuestEditors();
    if (guestEditors.length === 0) return [];

    var authorMap = {};
    for (var i = 0; i < sourceAuthors.length; i++) {
      authorMap[sourceAuthors[i].n] = sourceAuthors[i];
      authorMap[sourceAuthors[i].id] = sourceAuthors[i];
    }

    // 也按 sourceEditorIds 匹配
    if (plan && plan.sourceEditorIds) {
      return plan.sourceEditorIds.map(function(id, idx) {
        var author = authorMap[id];
        var editor = guestEditors[idx] || guestEditors[0];
        if (author) {
          return {
            name: author.n || editor.name,
            institution: author.inst || editor.institution,
            hIndex: author.h || editor.hIndex || 0,
            worksCount: author.wc || editor.worksCount || 0,
            citedByCount: author.cc || editor.citedByCount || 0,
            countsByYear: author.countsByYear || editor.countsByYear || [],
            affiliations: author.affiliations || editor.affiliations || [],
            top: author.top || editor.topics || []
          };
        }
        return {
          name: editor.name,
          institution: editor.institution,
          hIndex: editor.hIndex || 0,
          worksCount: editor.worksCount || 0,
          citedByCount: editor.citedByCount || 0,
          countsByYear: editor.countsByYear || [],
          affiliations: editor.affiliations || [],
          top: editor.topics || []
        };
      }).filter(function(e) { return e.name; });
    }

    // fallback: 按 name 匹配
    return guestEditors.map(function(editor) {
      var author = authorMap[editor.name];
      if (author) {
        return {
          name: author.n || editor.name,
          institution: author.inst || editor.institution,
          hIndex: author.h || editor.hIndex || 0,
          worksCount: author.wc || editor.worksCount || 0,
          citedByCount: author.cc || editor.citedByCount || 0,
          countsByYear: author.countsByYear || editor.countsByYear || [],
          affiliations: author.affiliations || editor.affiliations || [],
          top: author.top || editor.topics || []
        };
      }
      return {
        name: editor.name,
        institution: editor.institution,
        hIndex: editor.hIndex || 0,
        worksCount: editor.worksCount || 0,
        citedByCount: editor.citedByCount || 0,
        countsByYear: editor.countsByYear || [],
        affiliations: editor.affiliations || [],
        top: editor.topics || []
      };
    });
  },

  // ---- 客编图表 ----

  buildEditorCharts: function() {
    var editors = this.getEnrichedEditors();
    var charts = {};
    for (var i = 0; i < editors.length; i++) {
      var ed = editors[i];
      var cby = ed.countsByYear || [];
      if (cby.length > 0) {
        var years = cby.map(function(y) { return y.year; });
        var works = cby.map(function(y) { return y.works_count || 0; });
        var cites = cby.map(function(y) { return y.cited_by_count || 0; });
        charts['ed_works_' + i] = this.buildColumnChart(years, works, '逐年发文', '#10B981');
        charts['ed_cites_' + i] = this.buildColumnChart(years, cites, '逐年被引', '#F59E0B');
      }
    }
    this.setData({ editorChartData: charts });
  },

  buildColumnChart: function(years, counts, title, color) {
    if (!years || years.length === 0 || !counts || counts.length === 0) return null;
    return {
      categories: years.map(function(y) { return String(y); }),
      series: [{ name: title, data: counts }],
      opts: {
        color: [color],
        xAxis: { disableGrid: true },
        yAxis: { disabled: false, data: [{ title: '' }] },
        extra: {
          column: {
            type: 'group',
            width: Math.max(15, Math.floor(300 / years.length)),
            activeBgColor: '#000000',
            activeBgOpacity: 0.08
          }
        }
      }
    };
  },

  // ---- 重新生成 ----

  onRegenerate: function() {
    var that = this;
    wx.showModal({
      title: '重新生成',
      content: '将消耗 30 积分重新生成策划方案，确认？',
      confirmText: '确认',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '重新生成中...' });
          wx.cloud.callFunction({
            name: 'specialIssueAgent',
            data: { action: 'regenerate', taskId: that.data.taskId }
          }).then(function(res) {
            wx.hideLoading();
            if (res.result.success) {
              that.setData({ loading: true, progressText: '正在重新生成方案...' });
              that.startPolling();
            } else {
              wx.showToast({ title: res.result.error || '重新生成失败', icon: 'none' });
            }
          }).catch(function(err) {
            wx.hideLoading();
            wx.showToast({ title: '请求失败: ' + (err.message || ''), icon: 'none' });
          });
        }
      }
    });
  },

  // ---- 查看历史方案 ----

  onViewHistory: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'poll', taskId: that.data.taskId }
    }).then(function(res) {
      var data = res.result && res.result.data;
      var history = data && data.regenerateHistory || [];
      if (history.length === 0) {
        wx.showToast({ title: '暂无历史记录', icon: 'none' });
        return;
      }
      var items = history.map(function(h, i) {
        var title = (h.result && h.result.plan ? (h.result.plan.zh && h.result.plan.zh.title) || (h.result.plan.en && h.result.plan.en.title) : '') || ('方案 ' + (i + 1));
        return '第' + (i + 1) + '次: ' + title;
      });
      wx.showActionSheet({
        itemList: items,
        success: function(actionRes) {
          var selected = history[actionRes.tapIndex];
          that.setData({
            result: selected.result,
            hasResult: true
          });
          wx.setNavigationBarTitle({ title: '方案详情' });
          that.buildEditorCharts();
        }
      });
    });
  },

  // ---- 文章标题点击 ----

  onTapArticle: function(e) {
    var url = e.currentTarget.dataset.url;
    if (url) {
      wx.setClipboardData({
        data: url,
        success: function() {
          wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none' });
        }
      });
    }
  },

  // ---- 补扣积分 ----

  onRetryDeduct: function() {
    var that = this;
    creditsUtil.spendCredits('special_issue', 30, '特刊策划补扣', that.data.taskId).then(function(res) {
      if (res.success) {
        that.setData({ creditsDeducted: true });
        wx.showToast({ title: '扣费成功', icon: 'success' });
      } else if (res.insufficient) {
        // 已在 showInsufficientDialog 中处理
      } else {
        wx.showToast({ title: '扣费失败，请稍后重试', icon: 'none' });
      }
    });
  },

  // ---- 复制方案 ----

  copyFullPlan: function() {
    var plan = this.getPlan();
    if (!plan) return;
    var lang = this.data.displayLang;
    var d = plan[lang] || plan.en || plan.zh || {};
    var editors = plan.guestEditors || [];

    var lines = ['=== ' + (d.title || '') + ' ===', '', d.abstract || '', '',
      '话题热度: ' + (plan.topicHeat || 0), '',
      '关键词: ' + (d.keywords || []).join(', '), '',
      '--- 推荐客编 ---'
    ];

    for (var i = 0; i < editors.length; i++) {
      lines.push((i + 1) + '. ' + editors[i].name + ' - ' + editors[i].institution);
    }

    wx.setClipboardData({
      data: lines.join('\n'),
      success: function() { wx.showToast({ title: '方案已复制', icon: 'success' }); }
    });
  },

  // ---- 格式化 ----

  formatNumber: function(num) {
    if (!num && num !== 0) return '0';
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  // ---- 方向选择面板 ----

  onExpandDirection: function(e) {
    var key = e.currentTarget.dataset.key;
    this.setData({ expandedDirection: key });
  },

  onCollapseDirection: function() {
    this.setData({ expandedDirection: '' });
  },

  // 弹窗显示方向详情
  onOpenDetail: function(e) {
    var key = e.currentTarget.dataset.key;
    var plan = this.data.plans.find(function(p) { return p.key === key; });
    if (plan) {
      this.setData({ showDetailModal: true, detailModalPlan: plan });
    }
  },

  hideDetailModal: function() {
    this.setData({ showDetailModal: false, detailModalPlan: null });
  },

  // 弹窗内直接选择方向 → 使用新 onGenerateScheme
  onSelectFromModal: function(e) {
    var key = e.currentTarget.dataset.key;
    if (!key) return;
    this.hideDetailModal();
    this.onGenerateScheme({ currentTarget: { dataset: { key: key } } });
  },

  stopBubble: function() {},

  onSelectDirection: function(e) {
    var that = this;
    var key = e.currentTarget.dataset.key;
    var plan = that.data.plans.find(function(p) { return p.key === key; });
    if (!plan) return;

    var zhTitle = (plan.zh && plan.zh.title) || '';
    wx.showModal({
      title: '确认选择',
      content: '选择方向「' + zhTitle + '」生成详细方案？',
      confirmText: '确认',
      success: function(res) {
        if (res.confirm) {
          that.doSelectDirection(key);
        }
      }
    });
  },

  doSelectDirection: function(key) {
    var that = this;
    that.setData({ selectingDirection: true });
    wx.showLoading({ title: '启动方案生成...' });

    wx.cloud.callFunction({
      name: 'specialIssueAgent',
      data: { action: 'selectDirection', taskId: that.data.taskId, directionKey: key }
    }).then(function(res) {
      wx.hideLoading();
      that.setData({ selectingDirection: false });
      if (res.result && res.result.success) {
        // Phase 2 已启动，显示处理中状态并开始轮询
        wx.showToast({ title: '方案生成中...', icon: 'loading', duration: 2000 });
        that.setData({
          loading: true,
          showDirectionPanel: false,
          progressText: '正在生成完整方案，请稍候...'
        });
        that.startPolling();
      } else {
        wx.showToast({ title: res.result && res.result.error || '启动失败', icon: 'none' });
      }
    }).catch(function(err) {
      wx.hideLoading();
      that.setData({ selectingDirection: false });
      wx.showToast({ title: '请求失败: ' + (err.message || ''), icon: 'none' });
    });
  },

  // 获取方向热度条宽度
  getHeatBarWidth: function(heat) {
    return Math.min(heat / 10, 100);
  },

  formatTime: function(ts) {
    if (!ts) return '--';
    var d = new Date(ts);
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
});
