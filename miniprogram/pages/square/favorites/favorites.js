// pages/square/favorites/favorites.js
// 我的收藏列表页面
Page({
  data: {
    posts: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false
  },

  onLoad: function () {
    this.loadFavorites(true);
  },

  onShow: function () {
    // 返回时刷新
    if (this.data.posts.length > 0) {
      this.loadFavorites(true);
    }
  },

  // 加载收藏列表
  loadFavorites: function (reset) {
    var that = this;
    if (this.data.loading) return;
    if (!reset && !this.data.hasMore) return;

    var page = reset ? 1 : this.data.page;

    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareGetFavorites',
        page: page,
        pageSize: this.data.pageSize
      }
    }).then(function (res) {
      var result = res.result || {};
      var newPosts = result.posts || [];

      // 格式化时间显示
      newPosts.forEach(function (post) {
        post.displayTime = that.formatDisplayTime(post.createTime);
        post.typeLabel = that.getTypeLabel(post.type);
        post.typeColor = that.getTypeColor(post.type);
        post.isFavorite = true;
      });

      var posts = reset ? newPosts : that.data.posts.concat(newPosts);
      that.setData({
        posts: posts,
        page: page + 1,
        hasMore: newPosts.length >= that.data.pageSize,
        loading: false
      });
    }).catch(function (err) {
      console.error('[favorites] 加载收藏失败', err);
      that.setData({ loading: false });
      var errMsg = (err.errMsg || err.message || '加载失败');
      wx.showToast({ title: errMsg, icon: 'none', duration: 3000 });
    });
  },

  // 取消收藏
  onUnfavorite: function (e) {
    var that = this;
    var index = e.currentTarget.dataset.index;
    var post = this.data.posts[index];
    if (!post) return;

    wx.showModal({
      title: '取消收藏',
      content: '确定要取消收藏这条动态吗？',
      success: function (res) {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'academicAPI',
            data: {
              action: 'squareToggleFavorite',
              postId: post._id,
              isFavorite: false
            }
          }).then(function () {
            var posts = that.data.posts;
            posts.splice(index, 1);
            that.setData({ posts: posts });
            wx.showToast({ title: '已取消收藏', icon: 'none' });
          }).catch(function (err) {
            console.error('[favorites] 取消收藏失败', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
  },

  // 跳转详情页
  navigateToDetail: function (e) {
    var postId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/square/detail/detail?id=' + postId
    });
  },

  // 跳转到学术动态
  goToSquare: function () {
    wx.switchTab({
      url: '/pages/square/square'
    });
  },

  // 预览图片
  previewImage: function (e) {
    var url = e.currentTarget.dataset.url;
    var urls = e.currentTarget.dataset.urls;
    wx.previewImage({
      current: url,
      urls: urls || [url]
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.setData({ page: 1, hasMore: true });
    this.loadFavorites(true);
    wx.stopPullDownRefresh();
  },

  // 上拉加载更多
  onReachBottom: function () {
    this.loadFavorites(false);
  },

  // 格式化显示时间
  formatDisplayTime: function (timeStr) {
    if (!timeStr) return '';
    var now = new Date();
    var postTime = new Date(timeStr.replace(/-/g, '/'));
    var diff = now.getTime() - postTime.getTime();
    var minutes = Math.floor(diff / 60000);
    var hours = Math.floor(diff / 3600000);
    var days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + '分钟前';
    if (hours < 24) return hours + '小时前';
    if (days < 7) return days + '天前';
    if (days < 365) {
      var month = postTime.getMonth() + 1;
      var day = postTime.getDate();
      return month + '月' + day + '日';
    }
    return postTime.getFullYear() + '年';
  },

  // 获取类型显示文本
  getTypeLabel: function (type) {
    var map = {
      'achievement': '成果分享',
      'discussion': '学术讨论',
      'resource': '资源分享',
      'call_for_papers': '征稿通知',
      'review': '学术审稿',
      'journal': '学术会议'
    };
    return map[type] || '动态';
  },

  // 获取类型颜色
  getTypeColor: function (type) {
    var map = {
      'achievement': '#2563eb',
      'discussion': '#7C3AED',
      'resource': '#059669',
      'call_for_papers': '#F97316',
      'review': '#10B981',
      'journal': '#06B6D4'
    };
    return map[type] || '#6B7280';
  }
});
