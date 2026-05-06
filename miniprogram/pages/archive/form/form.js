// pages/archive/form/form.js
var formatTime = require('../../../utils/dbInit').formatTime;

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: 'onVisibleChange'
    }
  },

  data: {
    categoryOptions: [],
    manageCategories: [],
    selectedCategory: null,
    files: [],
    uploading: false,
    showManage: false,
    newCatName: ''
  },

  lifetimes: {
    ready: function() {}
  },

  methods: {
    /** visible 属性变化时加载数据 */
    onVisibleChange: function(newVal) {
      if (newVal) {
        this.loadCategoriesWithDataCheck();
      }
    },

    /** 加载用户自定义分类 */
    loadCategories: function() {
      var that = this;
      var db = wx.cloud.database();
      db.collection('archive_categories')
        .where({ deleteTime: null })
        .orderBy('order', 'asc')
        .get()
        .then(function(res) {
          var cats = res.data || [];
          var options = cats.map(function(c) {
            return { id: c._id, name: c.name, label: c.name };
          });
          that.setData({ categoryOptions: options });
        });
    },

    /** 加载分类并检查每个分类是否有数据 */
    loadCategoriesWithDataCheck: function() {
      var that = this;
      var db = wx.cloud.database();

      db.collection('archive_categories')
        .where({ deleteTime: null })
        .orderBy('order', 'asc')
        .get()
        .then(function(res) {
          var cats = res.data || [];
          var options = cats.map(function(c) {
            return { id: c._id, name: c.name, label: c.name };
          });

          var promises = cats.map(function(c) {
            return db.collection('archives')
              .where({ category: c._id, deleteTime: null })
              .count()
              .then(function(cntRes) {
                return {
                  _id: c._id,
                  name: c.name,
                  hasData: cntRes.total > 0
                };
              });
          });

          Promise.all(promises).then(function(manageCats) {
            that.setData({ categoryOptions: options, manageCategories: manageCats });
          });
        });
    },

    /** 分类选择变化 */
    onCategoryChange: function(e) {
      var idx = e.detail.value;
      var cats = this.data.categoryOptions;
      this.setData({ selectedCategory: cats[idx] || null });
    },

    /** 遮罩点击关闭 */
    onMaskTap: function() {
      this._close();
    },

    /** 关闭弹窗 */
    onClose: function() {
      this._close();
    },

    _close: function() {
      this.setData({
        files: [],
        uploading: false,
        selectedCategory: null,
        showManage: false,
        newCatName: ''
      });
      this.triggerEvent('close');
    },

    /** 打开管理弹窗 */
    showManageModal: function() {
      this.loadCategoriesWithDataCheck();
      this.setData({ showManage: true });
    },

    onCloseManage: function() {
      this.setData({ showManage: false, newCatName: '' });
      this.loadCategoriesWithDataCheck();
    },

    stopBubbles: function() {},

    /** 新分类名输入 */
    onNewCatInput: function(e) {
      this.setData({ newCatName: e.detail.value });
    },

    /** 添加分类 */
    onAddCategory: function() {
      var that = this;
      var name = this.data.newCatName.trim();
      if (!name) {
        wx.showToast({ title: '请输入分类名称', icon: 'none' });
        return;
      }
      if (this.data.manageCategories.length >= 5) {
        wx.showToast({ title: '最多5个分类', icon: 'none' });
        return;
      }
      wx.cloud.database().collection('archive_categories').add({
        data: {
          name: name,
          order: Date.now(),
          createTime: formatTime(),
          updateTime: formatTime(),
          deleteTime: null
        }
      }).then(function() {
        that.setData({ newCatName: '' });
        that.loadCategoriesWithDataCheck();
        wx.showToast({ title: '添加成功', icon: 'success' });
      }).catch(function(e) {
        wx.showToast({ title: '添加失败', icon: 'error' });
        console.error(e);
      });
    },

    /** 编辑分类名 */
    onEditCategory: function(e) {
      var that = this;
      var id = e.currentTarget.dataset.id;
      var name = e.detail.value.trim();
      if (!name) return;
      wx.cloud.database().collection('archive_categories').doc(id).update({
        data: { name: name, updateTime: formatTime() }
      }).then(function() {
        that.loadCategoriesWithDataCheck();
      });
    },

    /** 删除分类 */
    onDeleteCategory: function(e) {
      var that = this;
      var id = e.currentTarget.dataset.id;
      var cat = that.data.manageCategories.find(function(c) { return c._id === id; });

      if (cat && cat.hasData) {
        wx.showToast({ title: '该分类有文件，无法删除', icon: 'none' });
        return;
      }

      wx.showModal({
        title: '删除分类',
        content: '删除后该分类的文件不受影响，是否继续？',
        success: function(res) {
          if (!res.confirm) return;
          wx.cloud.database().collection('archive_categories').doc(id).update({
            data: { deleteTime: formatTime(), updateTime: formatTime() }
          }).then(function() {
            if (that.data.selectedCategory && that.data.selectedCategory.id === id) {
              that.setData({ selectedCategory: null });
            }
            that.loadCategoriesWithDataCheck();
            wx.showToast({ title: '已删除', icon: 'success' });
          });
        }
      });
    },

    /** 选择文件 */
    chooseFiles: function() {
      var that = this;
      var MAX = 10 * 1024 * 1024;
      wx.chooseMessageFile({
        count: 9,
        type: 'all',
        success: function(res) {
          var over = res.tempFiles.filter(function(f) { return f.size > MAX; });
          if (over.length > 0) {
            wx.showToast({ title: '单个文件不能超过10MB', icon: 'none' });
            return;
          }
          that.setData({ files: res.tempFiles });
        }
      });
    },

    /** 移除单个文件 */
    removeFile: function(e) {
      var idx = e.currentTarget.dataset.index;
      var files = this.data.files;
      files.splice(idx, 1);
      this.setData({ files: files });
    },

    formatSize: function(size) {
      if (size > 1048576) return (size / 1048576).toFixed(1) + 'MB';
      return (size / 1024).toFixed(0) + 'KB';
    },

    /** 提交上传 */
    onSubmit: function() {
      var that = this;
      var category = this.data.selectedCategory;
      var files = this.data.files;

      if (!category) {
        wx.showToast({ title: '请先选择分类', icon: 'none' });
        return;
      }
      if (files.length === 0) {
        wx.showToast({ title: '请先选择文件', icon: 'none' });
        return;
      }

      var db = wx.cloud.database();
      db.collection('archives').where({ deleteTime: null }).count().then(function(cntRes) {
        if (cntRes.total + files.length > 20) {
          wx.showToast({ title: '上传后总数将超过20个', icon: 'none' });
          return;
        }
        that.setData({ uploading: true });
        var tasks = [];
        for (var i = 0; i < files.length; i++) {
          (function(file) {
            var ext = file.name.split('.').pop().toLowerCase();
            var cloudPath = 'archives/' + Date.now() + '_' + file.name;
            tasks.push(
              wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: file.path }).then(function(upload) {
                return db.collection('archives').add({
                  data: {
                    name: file.name,
                    size: file.size,
                    ext: ext,
                    category: category.id,
                    fileID: upload.fileID,
                    createTime: formatTime(),
                    updateTime: formatTime(),
                    deleteTime: null
                  }
                });
              })
            );
          })(files[i]);
        }
        Promise.all(tasks).then(function() {
          wx.showToast({ title: '上传成功', icon: 'success' });
          that.setData({ uploading: false });
          that._close();
          that.triggerEvent('uploadSuccess');
        }).catch(function(e) {
          that.setData({ uploading: false });
          wx.showToast({ title: '上传失败', icon: 'error' });
          console.error(e);
        });
      });
    }
  }
});
