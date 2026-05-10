// pages/citation/citation.js
var crossref = require('../../utils/citation/crossref.js');
var formatter = require('../../utils/citation/formatter.js');

var STORAGE_KEY = 'citation_library';

Page({
  data: {
    // 搜索相关
    searchType: 'doi', // doi / title
    searchValue: '',
    searching: false,
    searchResult: null,
    searchError: '',
    
    // 文献类型
    typeOptions: [
      { label: '期刊文章', value: 'journal' },
      { label: '图书', value: 'book' },
      { label: '会议论文', value: 'conference' },
      { label: '学位论文', value: 'thesis' },
      { label: '网页', value: 'web' }
    ],
    selectedTypeIndex: 0,
    selectedType: 'journal',
    
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
    
    // 编号（用于 GB/T 7714 和 IEEE）
    showNumberInput: true,
    number: 1,
    
    // 文献库
    library: [],
    showLibrary: false
  },

  onLoad: function() {
    this.loadLibrary();
    this.updateNumberInputVisibility();
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
      bibliographyResult: ''
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
    
    that.setData({ searching: true, searchResult: null, searchError: '', citationResult: '', bibliographyResult: '' });
    
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

  // 选择引用格式
  onStyleChange: function(e) {
    var index = parseInt(e.detail.value);
    var that = this;
    this.setData({
      selectedStyleIndex: index,
      selectedStyle: this.data.styleOptions[index].value
    }, function() {
      that.updateNumberInputVisibility();
      that.generateCitation();
    });
  },
  
  // 选择文献类型
  onTypeChange: function(e) {
    var index = parseInt(e.detail.value);
    var that = this;
    this.setData({
      selectedTypeIndex: index,
      selectedType: this.data.typeOptions[index].value
    }, function() {
      that.generateCitation();
    });
  },
  
  // 编号输入
  onNumberInput: function(e) {
    var num = parseInt(e.detail.value) || 1;
    var that = this;
    this.setData({ number: num }, function() {
      that.generateCitation();
    });
  },
  
  // 根据格式显示/隐藏编号输入
  updateNumberInputVisibility: function() {
    var style = this.data.selectedStyle;
    var show = (style === 'gbt7714' || style === 'ieee');
    this.setData({ showNumberInput: show });
  },

  // 生成引用
  generateCitation: function() {
    var ref = this.data.searchResult;
    if (!ref) return;
    
    var style = this.data.selectedStyle;
    var type = this.data.selectedType;
    var number = this.data.number;
    
    // 生成文中引用
    var inText = formatter.generateInTextCitation(ref, style);
    
    // 生成参考文献条目（传递类型和编号）
    var bib = formatter.generateBibliographyEntry(ref, style, type, number);
    
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
        bibliographyResult: ''
      });
      this.generateCitation();
    }
  },

  // 扫描 DOI 二维码/条形码（占位功能）
  scanDOI: function() {
    wx.showToast({ title: '扫描功能开发中', icon: 'none' });
    // 实际实现可以使用 wx.scanCode
  }
});
