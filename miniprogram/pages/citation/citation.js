// pages/citation/citation.js
var crossref = require('../../utils/citation/crossref.js');
var formatter = require('../../utils/citation/formatter.js');

var STORAGE_KEY = 'citation_library';

var TYPE_LABEL_MAP = {
  journal: '期刊文章',
  book: '图书',
  conference: '会议论文',
  thesis: '学位论文',
  web: '网页'
};

function buildPieData(items, topN) {
  topN = topN || 10;
  if (!items || items.length === 0) return {};
  var sorted = items.slice().sort(function(a, b) { return b.count - a.count; });
  var top = sorted.slice(0, topN);
  var otherCount = 0;
  for (var i = topN; i < sorted.length; i++) {
    otherCount += sorted[i].count;
  }
  if (otherCount > 0) {
    top.push({ name: '其他', count: otherCount });
  }
  return {
    series: [{
      data: top.map(function(item) {
        return { name: item.name, value: item.count };
      })
    }]
  };
}

Page({
  data: {
    // 搜索相关
    searchType: 'doi', // doi / title
    searchValue: '',
    searching: false,
    searchResult: null,
    searchError: '',

    // 引用格式
    styleOptions: [
      { label: 'APA 7th', value: 'apa' },
      { label: 'MLA 9th', value: 'mla' },
      { label: 'Chicago 17th', value: 'chicago' },
      { label: 'GB/T 7714-2015', value: 'gbt7714' },
      { label: 'IEEE', value: 'ieee' },
      { label: 'Harvard', value: 'harvard' },
      { label: 'AMA 11th', value: 'ama' }
    ],
    selectedStyleIndex: 3, // 默认 GB/T 7714
    selectedStyle: 'gbt7714',
    citationResult: '',
    bibliographyResult: '',

    // 标签页
    activeTab: 'basic', // basic / references / cited

    // 引用统计
    citationStats: [],

    // 引用文献
    referencesList: [],
    loadingReferences: false,

    // 被引文献
    citingWorksList: [],
    loadingCitingWorks: false,

    // ucharts 图表数据
    yearChartData: {},
    topicChartData: {},
    typeChartData: {},
    instChartData: {},

    // ucharts 配置
    pieOpts: {
      dataLabel: false,
      legend: {
        show: true,
        position: 'bottom',
        lineHeight: 22,
        margin: 4
      },
      extra: {
        pie: {
          activeOpacity: 0.5,
          activeRadius: 6,
          offsetAngle: 0,
          border: true,
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }
      }
    },

    // 文献库
    library: [],
    showLibrary: false
  },

  onLoad: function() {
    this.loadLibrary();
  },

  onShow: function() {
    this.loadLibrary();
  },

  // 切换搜索类型
  onSearchTypeChange: function(e) {
    this.setData({
      searchType: e.currentTarget.dataset.type,
      searchValue: '',
      searchResult: null,
      searchError: '',
      citationResult: '',
      bibliographyResult: '',
      citationStats: [],
      yearChartData: {},
      topicChartData: {},
      typeChartData: {},
      instChartData: {},
      referencesList: [],
      citingWorksList: []
    });
  },

  // 输入搜索值
  onSearchInput: function(e) {
    this.setData({ searchValue: e.detail.value });
  },

  // 执行搜索
  doSearch: function() {
    var that = this;
    var value = this.data.searchValue.trim();

    if (!value) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' });
      return;
    }

    that.setData({
      searching: true,
      searchResult: null,
      searchError: '',
      citationResult: '',
      bibliographyResult: '',
      activeTab: 'basic',
      citationStats: [],
      yearChartData: {},
      topicChartData: {},
      typeChartData: {},
      instChartData: {},
      referencesList: [],
      citingWorksList: []
    });

    var promise;
    if (that.data.searchType === 'doi') {
      // 清理 DOI 输入（可能包含 https://doi.org/ 前缀）
      var doi = value.replace(/https?:\/\/(dx\.)?doi\.org\//i, '');
      promise = crossref.fetchByDOI(doi);
    } else {
      promise = crossref.searchByTitle(value, 1).then(function(results) {
        if (results && results.length > 0) {
          return results[0]; // 取第一个结果
        } else {
          throw new Error('未找到相关文献');
        }
      });
    }

    promise.then(function(ref) {
      // 添加格式化的作者字符串
      var authorsStr = '';
      if (ref.authors && ref.authors.length > 0) {
        authorsStr = ref.authors.map(function(a) {
          return a.family + ' ' + a.given;
        }).join(', ');
      }
      ref.authorsStr = authorsStr;
      // 添加中文类型标签
      ref.typeLabel = TYPE_LABEL_MAP[ref.type] || ref.type;

      that.setData({
        searching: false,
        searchResult: ref
      });
      that.generateCitation();
    }).catch(function(err) {
      that.setData({
        searching: false,
        searchError: err.message || '查询失败'
      });
    });
  },

  // 切换标签
  onTabChange: function(e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });

    var ref = this.data.searchResult;
    if (!ref || !ref.doi) return;

    if (tab === 'references' && this.data.referencesList.length === 0) {
      this.loadReferences(ref.doi);
    } else if (tab === 'cited' && this.data.citingWorksList.length === 0) {
      this.loadCitingWorks(ref.doi);
    }
  },

  // 加载引用文献列表
  loadReferences: function(doi) {
    var that = this;
    that.setData({ loadingReferences: true });
    crossref.fetchReferences(doi).then(function(list) {
      that.setData({
        referencesList: list,
        loadingReferences: false
      });
    }).catch(function() {
      that.setData({ loadingReferences: false });
    });
  },

  // 加载被引文献列表和统计
  loadCitingWorks: function(doi) {
    var that = this;
    that.setData({ loadingCitingWorks: true });

    var statsPromise = crossref.fetchCitationsByYear(doi);
    var worksPromise = crossref.fetchCitingWorks(doi, 20);
    var topicsPromise = crossref.fetchCitingTopics(doi);
    var instPromise = crossref.fetchCitingInstitutions(doi);
    var typesPromise = crossref.fetchCitingTypes(doi);

    Promise.all([statsPromise, worksPromise, topicsPromise, instPromise, typesPromise]).then(function(results) {
      var stats = results[0];
      var works = results[1];
      var topics = results[2];
      var institutions = results[3];
      var types = results[4];

      // 用 OpenAlex 统计总和统一被引次数，保持数据一致
      var totalCitedBy = 0;
      for (var i = 0; i < stats.length; i++) {
        totalCitedBy += stats[i].count;
      }
      var searchResult = that.data.searchResult;
      if (searchResult) {
        searchResult.citedByCount = totalCitedBy;
      }

      // 柱状图数据
      var yearChartData = {};
      if (stats.length > 0) {
        yearChartData = {
          categories: stats.map(function(s) { return s.year; }),
          series: [{ name: '被引次数', data: stats.map(function(s) { return s.count; }) }]
        };
      }

      that.setData({
        citationStats: stats,
        citingWorksList: works,
        yearChartData: yearChartData,
        topicChartData: buildPieData(topics, 10),
        typeChartData: buildPieData(types, 10),
        instChartData: buildPieData(institutions, 10),
        loadingCitingWorks: false,
        searchResult: searchResult
      });
    }).catch(function() {
      that.setData({ loadingCitingWorks: false });
    });
  },

  // 选择引用格式
  onStyleChange: function(e) {
    var index = parseInt(e.detail.value);
    var that = this;
    this.setData({
      selectedStyleIndex: index,
      selectedStyle: this.data.styleOptions[index].value
    }, function() {
      that.generateCitation();
    });
  },

  // 生成引用
  generateCitation: function() {
    var ref = this.data.searchResult;
    if (!ref) return;

    var style = this.data.selectedStyle;
    // 文献类型从Crossref返回数据中自动获取
    var type = ref.type || 'journal';

    // 生成文中引用
    var inText = formatter.generateInTextCitation(ref, style);

    // 生成参考文献条目（不传编号）
    var bib = formatter.generateBibliographyEntry(ref, style, type);

    this.setData({
      citationResult: inText,
      bibliographyResult: bib
    });
  },

  // 复制文中引用
  copyInText: function() {
    if (!this.data.citationResult) return;
    wx.setClipboardData({
      data: this.data.citationResult,
      success: function() {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  // 复制参考文献条目
  copyBibliography: function() {
    if (!this.data.bibliographyResult) return;
    wx.setClipboardData({
      data: this.data.bibliographyResult,
      success: function() {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  // 保存到文献库
  saveToLibrary: function() {
    var ref = this.data.searchResult;
    if (!ref) return;

    var library = this.data.library;

    // 检查是否已存在
    var exists = library.some(function(item) {
      return item.doi === ref.doi;
    });

    if (exists) {
      wx.showToast({ title: '文献已存在于库中', icon: 'none' });
      return;
    }

    // 添加 ID 和时间戳
    ref._id = 'ref_' + Date.now();
    ref.addTime = new Date().toISOString();

    library.unshift(ref);

    this.setData({ library: library });
    this.saveLibrary();

    wx.showToast({ title: '已保存到文献库', icon: 'success' });
  },

  // 加载文献库
  loadLibrary: function() {
    var that = this;
    wx.getStorage({
      key: STORAGE_KEY,
      success: function(res) {
        that.setData({ library: res.data || [] });
      },
      fail: function() {
        that.setData({ library: [] });
      }
    });
  },

  // 保存文献库
  saveLibrary: function() {
    wx.setStorage({
      key: STORAGE_KEY,
      data: this.data.library
    });
  },

  // 删除文献
  deleteFromLibrary: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;

    wx.showModal({
      title: '确认删除',
      content: '确定要从文献库中删除这篇文献吗？',
      success: function(res) {
        if (res.confirm) {
          var library = that.data.library.filter(function(item) {
            return item._id !== id;
          });
          that.setData({ library: library });
          that.saveLibrary();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  // 切换文献库显示
  toggleLibrary: function() {
    this.setData({ showLibrary: !this.data.showLibrary });
  },

  // 使用文献库中的文献
  useFromLibrary: function(e) {
    var id = e.currentTarget.dataset.id;
    var ref = this.data.library.find(function(item) {
      return item._id === id;
    });

    if (ref) {
      this.setData({
        searchResult: ref,
        searchType: 'doi',
        searchValue: ref.doi || '',
        showLibrary: false,
        citationResult: '',
        bibliographyResult: '',
        activeTab: 'basic',
        citationStats: [],
        yearChartData: {},
        topicChartData: {},
        typeChartData: {},
        instChartData: {},
        referencesList: [],
        citingWorksList: []
      });
      this.generateCitation();
    }
  },

  // 扫描 DOI 二维码/条形码（占位功能）
  scanDOI: function() {
    wx.showToast({ title: '扫描功能开发中', icon: 'none' });
    // 实际实现可以使用 wx.scanCode
  },

  // 点击饼图/图例查看详情
  showPieDetail: function(e) {
    var name = e.currentTarget.dataset.name;
    var count = e.currentTarget.dataset.count;
    var percent = e.currentTarget.dataset.percent;
    wx.showModal({
      title: name,
      content: '数量: ' + count + '\n占比: ' + percent + '%',
      showCancel: false
    });
  }
});
