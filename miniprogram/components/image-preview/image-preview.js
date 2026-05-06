Component({
  properties: {
    imageUrl: {
      type: String,
      value: ''
    },
    visible: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    preventTouchMove: function() {},
    
    onClose: function() {
      this.triggerEvent('close');
    },
    
    onImageTap: function() {
      this.onClose();
    },
    
    onSave: function() {
      wx.saveImageToPhotosAlbum({
        filePath: this.data.imageUrl,
        success: function() {
          wx.showToast({ title: '保存成功', icon: 'success' });
        },
        fail: function(err) {
          if (err.errMsg.indexOf('auth deny') !== -1) {
            wx.showModal({
              title: '提示',
              content: '需要您授权保存图片到相册',
              success: function(res) {
                if (res.confirm) {
                  wx.openSetting();
                }
              }
            });
          } else {
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        }
      });
    }
  }
});
