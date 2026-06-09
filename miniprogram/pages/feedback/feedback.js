Page({
  data: {
    feedbackTypes: [
      { label: '问题反馈', value: 'bug', icon: '🐛' },
      { label: '功能建议', value: 'feature', icon: '💡' },
      { label: '使用咨询', value: 'question', icon: '❓' },
      { label: '其他', value: 'other', icon: '📝' }
    ],
    selectedType: 'bug',
    content: '',
    contact: '',
    images: [],
    maxImages: 4,
    submitting: false,
    showLoading: false
  },

  onLoad: function () {
    this._checkUserInfo();
  },

  // 选择反馈类型
  onTypeChange: function (e) {
    var value = e.currentTarget.dataset.value;
    this.setData({ selectedType: value });
  },

  // 内容输入
  onContentInput: function (e) {
    this.setData({ content: e.detail.value });
  },

  // 联系方式输入
  onContactInput: function (e) {
    this.setData({ contact: e.detail.value });
  },

  // 选择图片
  chooseImage: function () {
    var that = this;
    var remaining = this.data.maxImages - this.data.images.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传' + that.data.maxImages + '张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var newImages = res.tempFiles.map(function (file) { return file.tempFilePath; });
        that.setData({
          images: that.data.images.concat(newImages)
        });
      }
    });
  },

  // 删除图片
  deleteImage: function (e) {
    var index = e.currentTarget.dataset.index;
    var images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images: images });
  },

  // 预览图片
  previewImage: function (e) {
    var index = e.currentTarget.dataset.index;
    wx.previewImage({
      current: this.data.images[index],
      urls: this.data.images
    });
  },

  // 提交反馈
  submitFeedback: function () {
    var that = this;
    var content = this.data.content.trim();

    if (!content) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' });
      return;
    }
    if (content.length < 5) {
      wx.showToast({ title: '反馈内容至少5个字', icon: 'none' });
      return;
    }

    this.setData({ submitting: true, showLoading: true });

    // 先上传图片
    this._uploadImages(function (fileIDs) {
      // 提交到云数据库
      wx.cloud.callFunction({
        name: 'submitFeedback',
        data: {
          type: that.data.selectedType,
          content: content,
          contact: that.data.contact.trim(),
          images: fileIDs,
          createTime: new Date().toISOString()
        },
        success: function (res) {
          var result = res.result || {};
          if (result.success) {
            that.setData({ submitting: false, showLoading: false });
            wx.showToast({ title: '提交成功', icon: 'success' });
            setTimeout(function () {
              wx.navigateBack();
            }, 1500);
          } else {
            that.setData({ submitting: false, showLoading: false });
            wx.showToast({ title: result.message || '提交失败', icon: 'none' });
          }
        },
        fail: function (err) {
          that.setData({ submitting: false, showLoading: false });
          console.error('提交反馈失败', err);
          wx.showToast({ title: '提交失败，请重试', icon: 'none' });
        }
      });
    });
  },

  // 上传图片到云存储
  _uploadImages: function (callback) {
    var that = this;
    var images = this.data.images;
    if (images.length === 0) {
      callback([]);
      return;
    }

    var uploadTasks = images.map(function (filePath) {
      return new Promise(function (resolve, reject) {
        var ext = filePath.match(/\.([^.]+)$/);
        var cloudPath = 'feedback/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + (ext ? '.' + ext[1] : '.jpg');
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: filePath,
          success: function (res) { resolve(res.fileID); },
          fail: function (err) { reject(err); }
        });
      });
    });

    Promise.all(uploadTasks).then(function (fileIDs) {
      callback(fileIDs);
    }).catch(function (err) {
      that.setData({ submitting: false, showLoading: false });
      console.error('图片上传失败', err);
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    });
  },

  _checkUserInfo: function () {
    var userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.email) {
      this.setData({ contact: userInfo.email });
    }
  }
});
