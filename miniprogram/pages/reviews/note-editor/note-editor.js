// pages/reviews/note-editor/note-editor.js
Page({
  data: {
    note: ''
  },

  onLoad: function(options) {
    if (options.note) {
      // 解码传递过来的内容
      this.setData({ note: decodeURIComponent(options.note) });
    }
    // 自动聚焦
    setTimeout(() => {
      this.setData({ focus: true });
    }, 100);
  },

  onInput: function(e) {
    this.setData({ note: e.detail.value });
  },

  onCancel: function() {
    wx.navigateBack();
  },

  onSave: function() {
    var note = this.data.note;
    // 返回上一页并传递数据到 form 组件
    var pages = getCurrentPages();
    var prevPage = pages[pages.length - 2];
    if (prevPage) {
      var formComponent = prevPage.selectComponent('#reviewForm');
      if (formComponent) {
        formComponent.setData({ 'form.note': note });
      }
    }
    wx.navigateBack();
  }
});
