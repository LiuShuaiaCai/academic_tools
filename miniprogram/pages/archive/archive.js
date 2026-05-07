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
    showUpload: false,  // 上传弹窗显示状态
    fileCache: {},      // fileID → savedFilePath 本地缓存，避免重复下载
    pendingShare: null, // { fileId, fileName } 供 onShareAppMessage 使用
    autoOpening: false, // 是否正在自动打开分享的文件
    autoOpenFileName: '', // 自动打开时显示的文件名
    autoOpenTip: ''        // 自动打开时的提示文字
  },

  onLoad: function(options) {
    this.loadAll();
    wx.showShareMenu({ withShareTicket: true });
    // 通过分享卡片打开，携带了 fileId 参数 → 自动触发下载
    if (options && options.fileId) {
      this.setData({ autoOpening: true, autoOpenFileName: '正在打开...', autoOpenTip: '正在准备文件...' });
      this._autoDownloadSharedFile(options.fileId);
    }
  },
  onShow: function() { this.loadAll(); },
  onUnload: function() {
    // 页面卸载时清空分享状态
    this.setData({ pendingShare: null });
  },

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

  /** 获取文件本地路径（优先走缓存，避免重复下载） */
  _getFilePath: function(file, callback) {
    var fileID = file.fileID;
    var cache = this.data.fileCache;
    if (cache[fileID]) {
      // 缓存命中，直接用（同步）
      callback(cache[fileID]);
      return;
    }
    var that = this;
    wx.cloud.downloadFile({
      fileID: fileID,
      success: function(res) {
        // 下载后写入本地永久存储
        wx.getFileSystemManager().saveFile({
          tempFilePath: res.tempFilePath,
          success: function(saveRes) {
            // 缓存起来，下次直接用
            var newCache = {};
            newCache[fileID] = saveRes.savedFilePath;
            that.setData({ fileCache: Object.assign({}, that.data.fileCache, newCache) });
            callback(saveRes.savedFilePath);
          },
          fail: function() {
            // 写本地失败，降级用临时路径
            callback(res.tempFilePath);
          }
        });
      },
      fail: function(err) {
        wx.hideLoading(); // 下载失败时也要隐藏 loading
        wx.showToast({ title: '下载失败', icon: 'none' });
      }
    });
  },

  /** 分享卡片打开时自动下载并打开文件（无需查数据库，直接用 fileId 当 fileID 下载） */
  _autoDownloadSharedFile: function(fileId) {
    var that = this;
    // fileId 在分享链接里是云数据库的 _id，但下载需要 cloud fileID
    // 所以还是要查一下数据库拿到真实的 fileID
    var db = wx.cloud.database();
    db.collection('archives').doc(fileId).get().then(function(res) {
      var item = res.data;
      if (!item || !item.fileID) {
        that.setData({ autoOpening: false });
        wx.showToast({ title: '文件不存在或已被删除', icon: 'none' });
        return;
      }
      var file = {
        fileID: item.fileID,
        name: item.name,
        ext: item.ext || (item.name || '').split('.').pop().toLowerCase()
      };
      // 显示文件名
      that.setData({ autoOpenFileName: item.name, autoOpenTip: '正在加载...' });
      var ext = file.ext;
      var imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
      if (imageExts.indexOf(ext) !== -1) {
        that.setData({ autoOpening: false });
        wx.previewImage({ urls: [file.fileID] });
        return;
      }
      var previewExts = ['html', 'htm', 'md', 'xml'];
      if (previewExts.indexOf(ext) !== -1) {
        that.setData({ autoOpening: false });
        wx.navigateTo({ url: '/pages/filePreview/filePreview?fileId=' + file.fileID + '&fileType=' + ext });
        return;
      }
      var fileTypeMap = {
        pdf: 'pdf', doc: 'doc', docx: 'doc',
        xls: 'xls', xlsx: 'xls', csv: 'xls',
        ppt: 'ppt', pptx: 'ppt', txt: 'txt'
      };
      var ft = fileTypeMap[ext] || '';
      if (!ft) {
        that.setData({ autoOpening: false });
        wx.showToast({ title: '该格式暂不支持预览', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '正在加载...' });
      that._getFilePath(file, function(localPath) {
        wx.hideLoading();
        that.setData({ autoOpening: false });
        wx.openDocument({ filePath: localPath, fileType: ft });
      });
    }).catch(function() {
      that.setData({ autoOpening: false });
      wx.showToast({ title: '文件不存在', icon: 'none' });
    });
  },

  /** 页面分享配置（分享卡片时使用） */
  onShareAppMessage: function() {
    var share = this.data.pendingShare;
    if (!share) return {};
    // 卡片标题 = 文件名
    // 页面路径携带 fileId 参数，onLoad 时自动下载
    return {
      title: share.fileName || '学术工具箱文件',
      path: '/pages/archive/archive?fileId=' + share.fileId
    };
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
    
    // 文档格式：下载后用 openDocument 打开（微信原生预览界面支持分享）
    var fileTypeMap = {
      pdf: 'pdf',
      doc: 'doc', docx: 'doc',
      xls: 'xls', xlsx: 'xls', csv: 'xls',
      ppt: 'ppt', pptx: 'ppt',
      docm: 'doc', dotx: 'doc', rtf: 'doc', wps: 'doc',
      txt: 'txt'
    };
    var fileType = fileTypeMap[ext] || '';
    if (!fileType) {
      wx.showToast({ title: '该格式暂不支持预览', icon: 'none' });
      return;
    }
    var that = this;
    wx.showLoading({ title: '正在加载...' });
    that._getFilePath(file, function(localPath) {
      wx.hideLoading();
      wx.openDocument({
        filePath: localPath,
        fileType: fileType,
        fail: function(err) {
          var msg = '预览失败，请确认手机已安装对应应用';
          if ((err.errMsg || '').indexOf('permission') !== -1) msg = '文件权限异常，请重试';
          if ((err.errMsg || '').indexOf('format') !== -1) msg = '不支持此文件格式';
          wx.showModal({ title: '预览失败', content: msg, showCancel: false });
        }
      });
    });
  },

  /** 分享文件：优先直接分享文件，失败则分享小程序卡片 */
  shareFile: function(e) {
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
    var fileTypeMap = {
      pdf: 'pdf', doc: 'doc', docx: 'doc',
      xls: 'xls', xlsx: 'xls', csv: 'xls',
      ppt: 'ppt', pptx: 'ppt', txt: 'txt',
      docm: 'doc', dotx: 'doc', rtf: 'doc', wps: 'doc'
    };
    var ft = fileTypeMap[ext] || '';

    // 优先：有本地缓存时尝试直接分享文件
    var cache = this.data.fileCache;
    if (cache[file.fileID] && ft) {
      wx.shareFileMessage({
        filePath: cache[file.fileID],
        fileName: file.name,
        success: function() {},
        fail: function() {
          // 直接分享失败，降级为分享小程序卡片
          this._shareAsCard(file);
        }.bind(this)
      });
      return;
    }

    // 无缓存：先下载，下载完后尝试分享，失败则卡片兜底
    var that = this;
    wx.showLoading({ title: '正在准备...' });
    that._getFilePath(file, function(localPath) {
      wx.hideLoading();
      wx.shareFileMessage({
        filePath: localPath,
        fileName: file.name,
        success: function() {},
        fail: function() {
          that._shareAsCard(file);
        }
      });
    });
  },

  /** 分享小程序卡片（兜底方案） */
  _shareAsCard: function(file) {
    var that = this;
    // 写入 pendingShare，onShareAppMessage 会读取它生成卡片
    // 不要在这里清空！等用户真正分享后再清
    this.setData({ pendingShare: { fileId: file._id, fileName: file.name } });
    wx.showModal({
      title: '文件已就绪',
      content: '请点击右上角「···」→「发送给朋友」分享文件链接',
      confirmText: '我知道了',
      showCancel: false,
      complete: function() {
        // 用户关闭弹窗后，保持 pendingShare 不变
        // 直到用户实际触发了分享（onShareAppMessage）才清空
      }
    });
  }
});
