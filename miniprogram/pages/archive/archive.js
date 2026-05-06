// pages/archive/archive.js
var dbInit = require('../../utils/dbInit');
var formatTime = dbInit.formatTime;
var softDelete = dbInit.softDelete;

Page({
  data: {
    list: [],
    allList: [],
    categoryList: [],   // 从数据库加载的用户分类
    filterCategory: 'all',
    searchKw: '',
    counts: {},         // { all: N, [catId]: N }
    showUpload: false   // 上传弹窗显示状态
  },

  onLoad: function() { this.loadAll(); },
  onShow: function() { this.loadAll(); },

  formatSize: function(size) {
    if (size > 1048576) return (size / 1048576).toFixed(1) + 'MB';
    return (size / 1024).toFixed(0) + 'KB';
  },

  /** 加载分类 + 文件列表 */
  loadAll: function() {
    var that = this;
    that.setData({ filterCategory: 'all', searchKw: '' });
    var db = wx.cloud.database();

    // 并行加载分类和文件
    Promise.all([
      db.collection('archive_categories').where({ deleteTime: null }).orderBy('order', 'asc').get().catch(function() { return { data: [] }; }),
      db.collection('archives').where({ deleteTime: null }).orderBy('createTime', 'desc').get().catch(function() { return { data: [] }; })
    ]).then(function(results) {
      var cats = results[0].data || [];
      // 构建 id→name 映射
      var catMap = {};
      for (var c = 0; c < cats.length; c++) catMap[cats[c]._id] = cats[c].name;

      var files = (results[1].data || []).map(function(item) {
        var catId = item.category || 'other';
        return {
          _id: item._id,
          name: item.name,
          size: item.size,
          ext: item.ext,
          category: catId,
          categoryName: catMap[catId] || '其他',
          fileID: item.fileID,
          createTime: item.createTime,
          extLabel: (item.ext || '').toUpperCase(),
          sizeLabel: that.formatSize(item.size || 0)
        };
      });

      // 构建 counts
      var counts = { all: files.length };
      for (var i = 0; i < cats.length; i++) {
        counts[cats[i]._id] = 0;
      }
      counts.other = 0;
      for (var j = 0; j < files.length; j++) {
        var catId = files[j].category;
        if (counts[catId] !== undefined) counts[catId]++;
        else counts.other++;
      }

      that.setData({
        categoryList: cats,
        allList: files,
        counts: counts
      });
      that.applyFilter();
    }).catch(function(e) { console.error(e); });
  },

  applyFilter: function() {
    var allList = this.data.allList;
    var filterCategory = this.data.filterCategory;
    var searchKw = this.data.searchKw;
    var r = allList;
    if (filterCategory !== 'all') r = r.filter(function(i) { return i.category === filterCategory; });
    if (searchKw) r = r.filter(function(i) { return (i.name || '').toLowerCase().indexOf(searchKw.toLowerCase()) !== -1; });
    this.setData({ list: r });
  },

  setFilter: function(e) {
    var cat = e.currentTarget.dataset.cat;
    if (cat === this.data.filterCategory || cat === undefined) return;
    this.setData({ filterCategory: cat });
    this.applyFilter();
  },

  onSearch: function(e) { this.setData({ searchKw: e.detail.value || '' }); this.applyFilter(); },

  /** 打开上传弹窗 */
  openUploadModal: function() {
    this.setData({ showUpload: true });
  },

  /** 弹窗关闭 */
  onUploadClose: function() {
    this.setData({ showUpload: false });
  },

  /** 上传成功，刷新列表 */
  onUploadSuccess: function() {
    this.setData({ showUpload: false });
    this.loadAll();
  },

  onImagePreviewClose: function() {
    this.setData({ showImagePreview: false, previewImageUrl: '' });
  },

  deleteItem: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    var fileID = e.currentTarget.dataset.fileid;
    wx.showModal({
      title: '删除文件',
      content: '删除后无法恢复',
      success: function(res) {
        if (res.confirm) {
          wx.cloud.deleteFile({ fileList: [fileID] }).then(function() {
            return softDelete('archives', id);
          }).then(function() {
            that.loadAll();
            wx.showToast({ title: '已删除', icon: 'success' });
          });
        }
      }
    });
  },

  /** 预览文件 */
  previewFile: function(e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    var file = null;
    var list = this.data.allList;
    for (var i = 0; i < list.length; i++) {
      if (list[i]._id === id) { file = list[i]; break; }
    }
    if (!file || !file.fileID) {
      wx.showToast({ title: '文件信息异常', icon: 'none' });
      return;
    }
    var ext = (file.ext || '').toLowerCase();
    
    // 图片格式：使用 wx.previewImage（支持缩放）
    var imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
    if (imageExts.indexOf(ext) !== -1) {
      wx.previewImage({
        current: file.fileID,
        urls: [file.fileID]
      });
      return;
    }
    
    // HTML/MD/XML：跳转到专用预览页面
    var previewExts = ['html', 'htm', 'md', 'xml'];
    if (previewExts.indexOf(ext) !== -1) {
      wx.navigateTo({
        url: '/pages/filePreview/filePreview?fileId=' + file.fileID + '&fileType=' + ext
      });
      return;
    }
    
    // 文档格式：先下载再打开
    var fileTypeMap = { pdf:'pdf', doc:'doc', docx:'doc', xls:'xls', xlsx:'xls', ppt:'ppt', pptx:'ppt' };
    var fileType = fileTypeMap[ext] || '';
    if (!fileType) {
      wx.showToast({ title: '该格式暂不支持预览', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '正在下载...' });
    var that = this;
    wx.cloud.downloadFile({
      fileID: file.fileID,
      success: function(res) {
        wx.hideLoading();
        wx.openDocument({
          filePath: res.tempFilePath,
          fileType: fileType,
          fail: function(err) {
            wx.showToast({ title: '预览失败', icon: 'none' });
            console.error(err);
          }
        });
      },
      fail: function(err) {
        wx.hideLoading();
        wx.showToast({ title: '下载失败', icon: 'none' });
        console.error(err);
      }
    });
  }
});
