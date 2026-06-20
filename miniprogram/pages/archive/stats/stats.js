// pages/archive/stats/stats.js
Page({
  data: {
    loaded: false,
    total: 0,
    totalSize: 0,
    totalSizeLabel: '',
    categoryList: [],
    typeList: []
  },

  onLoad: function() {
    this.loadStats();
  },

  onShow: function() {
    this.loadStats();
  },

  loadStats: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'archiveStatsDetail' }
    }).then(function(res) {
      var r = res.result || {};
      if (!r.success && r.total === undefined) {
        that.setData({ loaded: true });
        return;
      }

      // 计算总大小
      var totalSize = r.totalSize || 0;
      var sizeLabel = that.formatSize(totalSize);

      // 分类分布
      var catMap = r.categoryBreakdown || {};
      var catColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
      var catIdx = 0;
      var categoryList = [];
      Object.keys(catMap).forEach(function(k) {
        categoryList.push({
          name: k, label: k,
          count: catMap[k],
          color: catColors[catIdx % catColors.length],
          pct: r.total > 0 ? Math.round(catMap[k] / r.total * 100) : 0
        });
        catIdx++;
      });

      // 文件类型分布
      var extMap = r.typeBreakdown || {};
      var extLabelMap = {
        pdf: 'PDF文档', doc: 'Word文档', docx: 'Word文档',
        xls: 'Excel表格', xlsx: 'Excel表格', csv: 'CSV数据',
        ppt: 'PPT演示', pptx: 'PPT演示',
        txt: '文本文件', md: 'Markdown',
        png: 'PNG图片', jpg: 'JPG图片', jpeg: 'JPG图片',
        gif: 'GIF图片', svg: 'SVG矢量', webp: 'WebP图片',
        zip: '压缩包', rar: '压缩包', '7z': '压缩包'
      };
      var extColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
      var extIdx = 0;
      var typeList = [];
      Object.keys(extMap).forEach(function(k) {
        typeList.push({
          name: k, label: extLabelMap[k] || k.toUpperCase(),
          count: extMap[k], color: extColors[extIdx % extColors.length],
          pct: r.total > 0 ? Math.round(extMap[k] / r.total * 100) : 0
        });
        extIdx++;
      });

      // 按数量降序排列
      categoryList.sort(function(a, b) { return b.count - a.count; });
      typeList.sort(function(a, b) { return b.count - a.count; });

      that.setData({
        loaded: true,
        total: r.total || 0,
        totalSize: totalSize,
        totalSizeLabel: sizeLabel,
        categoryList: categoryList,
        typeList: typeList
      });
    }).catch(function(e) {
      console.error('[归档统计] 加载失败', e);
      that.setData({ loaded: true });
    });
  },

  formatSize: function(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes > 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
  },

  goToList: function() {
    wx.navigateTo({ url: '/pages/archive/archive' });
  }
});
