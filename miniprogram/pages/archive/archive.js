// pages/archive/archive.js
var dbInit = require('../../utils/dbInit');
var formatTime = dbInit.formatTime;
var softDelete = dbInit.softDelete;

Page({
  data: { list: [], allList: [], filterCategory: 'all', searchKw: '' },

  onLoad: function() { this.loadList(); },
  onShow: function() { this.loadList(); },

  formatSize: function(size) {
    if (size > 1048576) return (size / 1048576).toFixed(1) + 'MB';
    return (size / 1024).toFixed(0) + 'KB';
  },

  loadList: function() {
    var that = this;
    var db = wx.cloud.database();
    db.collection('archives').where({ deleteTime: null }).orderBy('createTime', 'desc').get().then(function(res) {
      var allList = (res.data || []).map(function(item) {
        return { _id: item._id, name: item.name, size: item.size, ext: item.ext, category: item.category, fileID: item.fileID, createTime: item.createTime, extLabel: (item.ext || '').toUpperCase(), sizeLabel: that.formatSize(item.size || 0) };
      });
      that.setData({ allList: allList }); that.applyFilter();
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

  setFilter: function(e) { this.setData({ filterCategory: e.currentTarget.dataset.cat }); this.applyFilter(); },
  onSearch: function(e) { this.setData({ searchKw: e.detail.value }); this.applyFilter(); },

  chooseFile: function() {
    var that = this;
    wx.chooseMessageFile({
      count: 9, type: 'all',
      success: function(res) {
        wx.showLoading({ title: '上传中...' });
        var tasks = [];
        for (var i = 0; i < res.tempFiles.length; i++) {
          (function(file) {
            var ext = file.name.split('.').pop().toLowerCase();
            var cloudPath = 'archives/' + Date.now() + '_' + file.name;
            tasks.push(
              wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: file.path }).then(function(upload) {
                var db = wx.cloud.database();
                var cat = that.getCategoryByExt(ext);
                return db.collection('archives').add({ data: { name: file.name, size: file.size, ext: ext, category: cat, fileID: upload.fileID, createTime: formatTime(), updateTime: formatTime(), deleteTime: null } });
              })
            );
          })(res.tempFiles[i]);
        }
        Promise.all(tasks).then(function() {
          wx.hideLoading(); wx.showToast({ title: '上传成功', icon: 'success' }); that.loadList();
        }).catch(function(e) {
          wx.hideLoading(); console.error(e);
        });
      }
    });
  },

  getCategoryByExt: function(ext) {
    if (ext === 'pdf' || ext === 'doc' || ext === 'docx') return 'submission';
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'image';
    return 'other';
  },

  deleteItem: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    var fileID = e.currentTarget.dataset.fileid;
    wx.showModal({ title: '删除文件', content: '删除后无法恢复', success: function(res) {
      if (res.confirm) {
        wx.cloud.deleteFile({ fileList: [fileID] }).then(function() {
          return softDelete('archives', id);
        }).then(function() {
          that.loadList(); wx.showToast({ title: '已删除', icon: 'success' });
        });
      }
    }});
  }
});
