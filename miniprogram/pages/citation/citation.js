// pages/citation/citation.js
var crossref = require('../../utils/citation/crossref.js');
var formatter = require('../../utils/citation/formatter.js');

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
  // 计算总数用于百分比
  var total = 0;
  for (var j = 0; j < top.length; j++) {
    total += top[j].count;
  }
  // ucharts饼图格式: series: [{ data: [{ name, value, labelText }] }]
  // 数据标签显示：名称(百分比%)
  return {
    series: [{
      data: top.map(function(item) {
        var name = item.name;
        var percent = total > 0 ? (item.count / total * 100).toFixed(1) : '0.0';
        // 数据标签格式：名称(百分比%)
        var labelText = name + '(' + percent + '%)';
        return { name: name, value: item.count, labelText: labelText };
      })
    }]
  };
}

// 计算总数
function calcTotal(items) {
  if (!items || items.length === 0) return 0;
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    total += items[i].count || 0;
  }
  return total;
}

// 添加百分比到数据项
function addPercent(items, total) {
  if (!items || !total) return [];
  return items.map(function(item) {
    var percent = total > 0 ? (item.count / total * 100).toFixed(2) : '0.00';
    // 名称截断为15个字符（用于饼图下方显示）
    var shortName = item.name.length > 15 ? item.name.substring(0, 12) + '…' : item.name;
    return {
      name: item.name,      // 完整名称（用于弹窗）
      shortName: shortName, // 短名称（用于饼图下方）
      count: item.count,
      percent: percent
    };
  });
}

Page({
  data: {
    // 搜索相关
    searchType: 'doi', // doi / title
    searchValue: '',
    searching: false,
    searchResult: null,
    searchResultReady: false, // 搜索结果是否准备就绪（包含OpenAlex数据）
    openAlexAvailable: true, // OpenAlex API 是否可用
    searchError: '',
    useCanvas2d: false, // 是否使用 canvas2d 模式（真机用 canvas2d，模拟器用 inScrollView）

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
    citingWorksHasMore: false, // 是否有更多数据可加载
    citingWorksLoadingMore: false, // 是否正在加载更多
    citingWorksNextPage: null, // 下一页页码
    citingWorksTotal: 0, // 总数
    showCitingModal: false, // 是否显示被引文献弹窗

    // ucharts 图表数据
    yearChartData: {},
    topicChartData: {},
    typeChartData: {},
    instChartData: {},

    // 饼图完整数据（用于展开显示）
    topicFullData: [],
    typeFullData: [],
    instFullData: [],
    topicTotal: 0,
    typeTotal: 0,
    instTotal: 0,

    // 饼图展开状态
    topicExpanded: false,
    typeExpanded: false,
    instExpanded: false,

    // ucharts 配置（带右侧图例）
    pieOpts: {
      dataLabel: true,
      legend: {
        show: true,
        position: 'right',
        lineHeight: 18,
        margin: 8
      },
      extra: {
        pie: {
          activeOpacity: 0.5,
          activeRadius: 6,
          offsetAngle: 0,
          border: true,
          borderWidth: 2,
          borderColor: '#FFFFFF',
          labelWidth: 15,
          labelShow: true
        }
      }
    },
    // ucharts 配置（无图例）
    pieOptsNoLegend: {
      dataLabel: true,
      legend: {
        show: false
      },
      enableTooltip: true,
      extra: {
        pie: {
          activeOpacity: 0.5,
          activeRadius: 6,
          offsetAngle: 0,
          border: true,
          borderWidth: 2,
          borderColor: '#FFFFFF',
          labelWidth: 20,
          labelShow: true
        }
      }
    },

    // 饼图标题配置
    pieChartTitle: '',

    // 文献库
    library: [],
    showLibrary: false,

    // 自定义 Toast
    customToast: {
      show: false,
      title: ''
    },

    // 表格弹窗
    showTableModal: false,
    tableModalTitle: '',
    tableModalData: [],

    // 当前用户
    currentOpenid: ''
  },

  onLoad: function() {
    var that = this;
    // 检测平台：真机(ios/android)使用 canvas2d，模拟器(windows/mac)使用 inScrollView
    var systemInfo = wx.getSystemInfoSync();
    var platform = systemInfo.platform;
    var useCanvas2d = (platform === 'ios' || platform === 'android');
    this.setData({ useCanvas2d: useCanvas2d });

    // 获取当前用户 openid，成功后再加载文献库
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserId' }
    }).then(function(res) {
      var openid = res.result && res.result.openid ? res.result.openid : '';
      that.setData({ currentOpenid: openid });
      that.loadLibrary();
    }).catch(function(err) {
      console.error('[citation] 获取用户标识失败', err);
      that.setData({ library: [] });
    });
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
      searchResultReady: false,
      openAlexAvailable: true,
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
      searchResultReady: false,
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
      citingWorksList: [],
      topicFullData: [],
      typeFullData: [],
      instFullData: []
    });

    var doi;
    if (that.data.searchType === 'doi') {
      // 清理 DOI 输入（可能包含 https://doi.org/ 前缀）
      doi = value.replace(/https?:\/\/(dx\.)?doi\.org\//i, '');
    }

    // 同时获取 Crossref 和 OpenAlex 数据，并行请求
    var crossrefPromise = that.data.searchType === 'doi' 
      ? crossref.fetchByDOI(doi)
      : crossref.searchByTitle(value, 1).then(function(results) {
          if (results && results.length > 0) {
            return results[0]; // 取第一个结果
          } else {
            throw new Error('未找到相关文献');
          }
        });

    var openAlexPromise = crossrefPromise.then(function(ref) {
      // 拿到 DOI 后获取 OpenAlex 数据（国内可能访问失败）
      var workDoi = ref.doi;
      return crossref.fetchWorkMetaFromOpenAlex(workDoi).then(function(meta) {
        return { ref: ref, meta: meta, available: true };
      }).catch(function() {
        // OpenAlex 获取失败，返回 null（会使用 Crossref 的 citedByCount）
        return { ref: ref, meta: null, available: false };
      });
    });

    openAlexPromise.then(function(result) {
      var ref = result.ref;
      var meta = result.meta;

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

      // 优先使用 OpenAlex 的数据（更准确），失败则用 Crossref 的
      if (meta && meta.openAlexId) {
        ref.openAlexId = meta.openAlexId;
        ref.citedByCount = meta.citedByCount;
        ref.countsByYear = meta.countsByYear;
      }
      // else: 保持使用 Crossref 的 citedByCount（ref.citedByCount）

      // 一次性设置所有数据，避免闪烁
      that.setData({
        searching: false,
        searchResult: ref,
        searchResultReady: true,
        openAlexAvailable: result.available
      });
      that.generateCitation();
    }).catch(function(err) {
      that.setData({
        searching: false,
        searchError: err.message || '查询失败',
        openAlexAvailable: false
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
      this.loadCitingWorks(ref.doi, 1); // 首次加载传 page=1
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
  loadCitingWorks: function(doi, page) {
    var that = this;
    var isFirstLoad = (page === 1);

    if (isFirstLoad) {
      that.setData({ loadingCitingWorks: true });
    }

    // 使用缓存的 openAlexId，doSearch 时已获取
    var cachedOpenAlexId = that.data.searchResult && that.data.searchResult.openAlexId;
    var cachedCountsByYear = that.data.searchResult && that.data.searchResult.countsByYear;

    // 并行获取被引文献列表和分布统计
    var worksPromise = crossref.fetchCitingWorks(doi, 20, cachedOpenAlexId, page);
    var topicsPromise = crossref.fetchCitingTopics(doi, cachedOpenAlexId);
    var instPromise = crossref.fetchCitingInstitutions(doi, cachedOpenAlexId);
    var typesPromise = crossref.fetchCitingTypes(doi, cachedOpenAlexId);

    Promise.all([worksPromise, topicsPromise, instPromise, typesPromise]).then(function(results) {
      that._updateCitingData(results, cachedCountsByYear || [], isFirstLoad);
    }).catch(function() {
      that.setData({ loadingCitingWorks: false, citingWorksLoadingMore: false });
    });
  },

  // 加载更多被引文献（点击加载）
  loadMoreCitingWorks: function() {
    var that = this;
    var loadingMore = that.data.citingWorksLoadingMore;

    if (loadingMore) {
      return; // 正在加载中
    }

    var remaining = that.data.citingWorksTotal - that.data.citingWorksList.length;
    if (remaining <= 0) {
      return; // 已全部加载
    }

    that.setData({ citingWorksLoadingMore: true });

    var doi = that.data.searchResult && that.data.searchResult.doi;
    if (!doi) {
      that.setData({ citingWorksLoadingMore: false });
      return;
    }

    var cachedOpenAlexId = that.data.searchResult && that.data.searchResult.openAlexId;
    var nextPage = that.data.citingWorksNextPage;
    
    // 使用 page 分页
    crossref.fetchCitingWorks(doi, 20, cachedOpenAlexId, nextPage).then(function(result) {
      var currentList = that.data.citingWorksList;
      var newList = currentList.concat(result.list);
      
      that.setData({
        citingWorksList: newList,
        citingWorksNextPage: result.nextPage,
        citingWorksHasMore: result.nextPage !== null,
        citingWorksLoadingMore: false
      });
    }).catch(function(err) {
      console.error('[loadMore] error:', err);
      that.setData({ citingWorksLoadingMore: false });
    });
  },

  // 更新被引数据（抽取为独立方法避免重复代码）
  _updateCitingData: function(results, countsByYear, isFirstLoad) {
    var worksData = results[0]; // { list, nextPage, total }
    var topics = results[1];
    var institutions = results[2];
    var types = results[3];

    var yearChartData = {};
    if (countsByYear && countsByYear.length > 0) {
      yearChartData = {
        categories: countsByYear.map(function(s) { return s.year; }),
        series: [{ name: '被引次数', data: countsByYear.map(function(s) { return s.count; }) }]
      };
    }

    // 处理首次加载和后续加载
    var citingWorksList;
    if (isFirstLoad) {
      citingWorksList = worksData.list || [];
    } else {
      citingWorksList = this.data.citingWorksList.concat(worksData.list || []);
    }

    var total = worksData.total || 0;

    this.setData({
      citationStats: countsByYear || [],
      citingWorksList: citingWorksList,
      citingWorksNextPage: worksData.nextPage,
      citingWorksHasMore: worksData.nextPage !== null,
      citingWorksTotal: total,
      yearChartData: yearChartData,
      topicChartData: buildPieData(topics, 3),
      typeChartData: buildPieData(types, 5),
      instChartData: buildPieData(institutions, 3),
      topicFullData: addPercent(topics, calcTotal(topics)),
      typeFullData: addPercent(types, calcTotal(types)),
      instFullData: addPercent(institutions, calcTotal(institutions)),
      loadingCitingWorks: false
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
      this.showCustomToast('文献已存在于库中');
      return;
    }

    // 检查数量限制（每人最多保存20个）
    if (library.length >= 20) {
      this.showCustomToast('每人最多保存20个文献');
      return;
    }

    // 添加时间戳，过滤掉 _openid 字段（云数据库自动管理）
    var record = Object.assign({}, ref, {
      addTime: new Date().toISOString()
    });
    delete record._openid;

    var that = this;
    wx.showLoading({ title: '保存中...' });

    const db = wx.cloud.database();
    db.collection('citation_library').add({
      data: record,
      success: function(res) {
        wx.hideLoading();
        record._id = res._id;
        library.unshift(record);
        that.setData({ library: library });
        wx.showToast({ title: '已保存到文献库', icon: 'success' });
      },
      fail: function(err) {
        wx.hideLoading();
        console.error('保存失败', err);
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      }
    });
  },

  // 加载文献库
  loadLibrary: function() {
    var that = this;
    var openid = that.data.currentOpenid;
    if (!openid) {
      that.setData({ library: [] });
      return;
    }
    const db = wx.cloud.database();
    db.collection('citation_library')
      .where({ _openid: openid })
      .orderBy('addTime', 'desc')
      .get({
        success: function(res) {
          that.setData({ library: res.data || [] });
        },
        fail: function(err) {
          console.error('加载文献库失败', err);
          that.setData({ library: [] });
        }
      });
  },

  // 删除文献
  deleteFromLibrary: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    var openid = that.data.currentOpenid;

    wx.showModal({
      title: '确认删除',
      content: '确定要从文献库中删除这篇文献吗？',
      success: function(res) {
        if (res.confirm) {
          const db = wx.cloud.database();
          db.collection('citation_library').where({ _id: id, _openid: openid }).remove({
            success: function() {
              var library = that.data.library.filter(function(item) {
                return item._id !== id;
              });
              that.setData({ library: library });
              wx.showToast({ title: '已删除', icon: 'success' });
            },
            fail: function(err) {
              console.error('删除失败', err);
              wx.showToast({ title: '删除失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  // 显示自定义 Toast
  showCustomToast: function(title, duration) {
    var that = this;
    duration = duration || 2000;
    this.setData({
      customToast: { show: true, title: title }
    });
    setTimeout(function() {
      that.setData({
        customToast: { show: false, title: '' }
      });
    }, duration);
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
      // 添加中文类型标签（如果还没有）
      if (!ref.typeLabel) {
        ref.typeLabel = TYPE_LABEL_MAP[ref.type] || ref.type;
      }
      // 添加格式化的作者字符串（如果还没有）
      if (!ref.authorsStr && ref.authors && ref.authors.length > 0) {
        ref.authorsStr = ref.authors.map(function(a) {
          return a.family + ' ' + a.given;
        }).join(', ');
      }

      this.setData({
        searchResult: ref,
        searchResultReady: true,
        openAlexAvailable: !!ref.openAlexId, // 根据是否有 openAlexId 判断
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

  // 扫描/拍照识别 DOI
  scanDOI: function() {
    var that = this;
    wx.showActionSheet({
      itemList: ['扫描二维码/条码', '拍照识别', '从相册选择'],
      success: function(res) {
        switch (res.tapIndex) {
          case 0:
            that._scanCode();
            break;
          case 1:
            that._chooseImage('camera');
            break;
          case 2:
            that._chooseImage('album');
            break;
        }
      }
    });
  },

  // 扫描二维码/条码
  _scanCode: function() {
    var that = this;
    wx.scanCode({
      scanType: ['qrCode', 'barCode'],
      success: function(res) {
        var result = res.result || '';
        var doiMatch = result.match(/10\.\d{4,}\/[^\s]+/);
        if (doiMatch) {
          that.setData({ searchType: 'doi', searchValue: doiMatch[0] });
          that.doSearch();
        } else {
          wx.showModal({
            title: '未识别到 DOI',
            content: '扫描内容：' + result.substring(0, 100) + '\n\n请手动输入 DOI',
            showCancel: false
          });
        }
      }
    });
  },

  // 拍照或从相册选择
  _chooseImage: function(sourceType) {
    var that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: [sourceType],
      success: function(res) {
        var tempFilePath = res.tempFiles[0].tempFilePath;
        that._ocrImage(tempFilePath);
      }
    });
  },

  // AI 识别图片中的 DOI/标题
  _ocrImage: function(filePath) {
    var that = this;
    wx.showLoading({ title: '识别中...', mask: true });

    // 上传图片到云存储
    var cloudPath = 'ocr/' + Date.now() + '.jpg';
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: function(uploadRes) {
        // 调用文件服务识别
        wx.cloud.callFunction({
          name: 'fileService',
          data: {
            action: 'ocrImage',
            fileID: uploadRes.fileID
          },
          success: function(res) {
            wx.hideLoading();
            var result = res.result || {};
            if (!result.success) {
              wx.showToast({ title: result.error || '识别失败', icon: 'none' });
              return;
            }

            var doi = result.doi;
            var title = result.title;

            if (doi) {
              // 识别到 DOI，用 DOI 搜索
              that.setData({ searchType: 'doi', searchValue: doi });
              that.doSearch();
            } else if (title) {
              // 没有 DOI 但有标题，用标题搜索
              wx.showModal({
                title: '识别到标题',
                content: title + '\n\n是否用标题搜索？',
                success: function(r) {
                  if (r.confirm) {
                    that.setData({ searchType: 'title', searchValue: title });
                    that.doSearch();
                  }
                }
              });
            } else {
              // 什么都没识别到
              wx.showModal({
                title: '未识别到',
                content: '未能从图片中识别到 DOI 或标题，请手动输入',
                showCancel: false
              });
            }
          },
          fail: function(err) {
            wx.hideLoading();
            console.error('AI识别调用失败', err);
            wx.showToast({ title: '识别失败，请重试', icon: 'none' });
          }
        });
      },
      fail: function(err) {
        wx.hideLoading();
        console.error('上传失败', err);
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    });
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
  },

  // 展开/收起饼图详情
  togglePieExpanded: function(e) {
    var type = e.currentTarget.dataset.type;
    var key = type + 'Expanded';
    this.setData({
      [key]: !this.data[key]
    });
  },

  // 显示完整名称
  showFullName: function(e) {
    var name = e.currentTarget.dataset.name;
    var count = e.currentTarget.dataset.count;
    wx.showModal({
      title: '完整名称',
      content: name + '\n\n数量: ' + count,
      showCancel: false
    });
  },

  // 显示全部主题分类
  showTopicAll: function() {
    var list = this.data.topicFullData;
    if (!list || list.length === 0) return;
    this.setData({
      showTableModal: true,
      tableModalTitle: '全部主题分类',
      tableModalData: list
    });
  },

  // 显示全部类型
  showTypeAll: function() {
    var list = this.data.typeFullData;
    if (!list || list.length === 0) return;
    this.setData({
      showTableModal: true,
      tableModalTitle: '全部文献类型',
      tableModalData: list
    });
  },

  // 显示全部机构
  showInstAll: function() {
    var list = this.data.instFullData;
    if (!list || list.length === 0) return;
    this.setData({
      showTableModal: true,
      tableModalTitle: '全部机构',
      tableModalData: list
    });
  },

  // 关闭表格弹窗
  closeTableModal: function() {
    this.setData({
      showTableModal: false
    });
  },

  // 打开被引文献弹窗
  openCitingModal: function() {
    var ref = this.data.searchResult;
    if (!ref || !ref.doi) return;

    this.setData({ showCitingModal: true });

    // 如果还没有加载数据，先加载并显示加载状态
    if (this.data.citingWorksList.length === 0) {
      this.setData({ loadingCitingWorks: true });
      this.loadCitingWorks(ref.doi, 1);
    }
  },

  // 关闭被引文献弹窗
  closeCitingModal: function() {
    this.setData({ showCitingModal: false });
  }
});
