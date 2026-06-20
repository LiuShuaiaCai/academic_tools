// pages/square/square.js
// 学术动态 - 科研同行公共交流社区
var app = getApp();

Page({
  data: {
    // Tab 切换
    currentTab: 'recommend',
    tabs: [
      { key: 'recommend', label: '推荐' },
      { key: 'latest', label: '最新' },
      { key: 'hot', label: '热门' },
      { key: 'mine', label: '我的' }
    ],

    // 我的子选项卡
    mySubTab: 'liked',
    mySubTabs: [
      { key: 'liked', label: '我喜欢' },
      { key: 'favorited', label: '我收藏' },
      { key: 'commented', label: '我评论' },
      { key: 'published', label: '我的发布' }
    ],

    // 分类过滤
    currentType: 'all',
    types: [
      { key: 'all', label: '全部' },
      { key: 'discussion', label: '讨论' },
      { key: 'call_for_papers', label: '征稿' },
      { key: 'review', label: '审稿' },
      { key: 'journal', label: '会议' },
      { key: 'literature_help', label: '互助' }
    ],

    // 动态列表
    posts: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    refreshing: false,

    // 用户信息
    currentOpenid: '',
    avatarUrl: '',
    nickName: ''
  },

  onLoad: function () {
    this.getUserId();
    this.loadPosts(true);
  },

  onShow: function () {
    // 返回页面时刷新列表
    if (this.data.posts.length > 0) {
      this.loadPosts(true);
    }
  },

  // 获取当前用户 OpenID
  getUserId: function () {
    var that = this;
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserId' }
    }).then(function (res) {
      that.setData({ currentOpenid: res.result.openid });
      // 获取用户头像昵称
      var userInfo = app.globalData.userInfo || {};
      that.setData({
        avatarUrl: userInfo.avatarUrl || '',
        nickName: userInfo.nickName || ''
      });
    });
  },

  // 加载动态列表
  loadPosts: function (reset) {
    var that = this;
    if (this.data.loading) return;
    if (!reset && !this.data.hasMore) return;

    var page = reset ? 1 : this.data.page;
    var isMine = this.data.currentTab === 'mine';

    this.setData({
      loading: true,
      refreshing: reset
    });

    // 根据当前 tab 决定请求参数
    var requestData;
    if (isMine) {
      var subActionMap = {
        'liked': 'squareGetMyLiked',
        'favorited': 'squareGetFavorites',
        'commented': 'squareGetMyCommented',
        'published': 'squareGetMyPosts'
      };
      requestData = {
        action: subActionMap[this.data.mySubTab] || 'squareGetMyLiked',
        page: page,
        pageSize: this.data.pageSize
      };
    } else {
      requestData = {
        action: 'squareGetPosts',
        page: page,
        pageSize: this.data.pageSize,
        sortBy: this.data.currentTab,
        type: this.data.currentType === 'all' ? '' : this.data.currentType
      };
    }

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: requestData
    }).then(function (res) {
      var result = res.result || {};
      var newPosts = result.posts || [];

      // 格式化时间显示
      newPosts.forEach(function (post) {
        post.displayTime = that.formatDisplayTime(post.createTime);
        post.typeLabel = that.getTypeLabel(post.type);
        post.typeColor = that.getTypeColor(post.type);

        // 文献互助类型：添加求助状态相关字段
        if (post.type === 'literature_help') {
          post.helpStatusLabel = that.getHelpStatusLabel(post.helpStatus);
          post.helpStatusColor = that.getHelpStatusColor(post.helpStatus);
          post.remainingTime = that.formatRemainingTime(post.helpDeadline);
        }

        // 「我的」子选项卡自动标记状态（我喜欢/我收藏可直接确定；我的发布需单独查询）
        if (isMine && that.data.mySubTab === 'liked') {
          post.isLiked = true;
        }
        if (isMine && that.data.mySubTab === 'favorited') {
          post.isFavorite = true;
        }
      });

      var posts = reset ? newPosts : that.data.posts.concat(newPosts);
      that.setData({
        posts: posts,
        page: page + 1,
        hasMore: newPosts.length >= that.data.pageSize,
        loading: false,
        refreshing: false
      });

      // 获取点赞状态和收藏状态（非「我的」或「我的发布」才需要补充加载）
      if (posts.length > 0 && (!isMine || that.data.mySubTab === 'published')) {
        that.loadLikeStatus(posts);
        that.loadFavoriteStatus(posts);
      }
    }).catch(function (err) {
      console.error('[square] 加载动态失败', err);
      that.setData({ loading: false, refreshing: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 批量获取点赞状态
  loadLikeStatus: function (posts) {
    var that = this;
    var postIds = posts.map(function (p) { return p._id; });

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareGetLikeStatus',
        postIds: postIds
      }
    }).then(function (res) {
      var likeMap = res.result.likeMap || {};
      var updatedPosts = that.data.posts.map(function (post) {
        post.isLiked = !!likeMap[post._id];
        return post;
      });
      that.setData({ posts: updatedPosts });
    });
  },

  // Tab 切换
  onTabTap: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;
    if (tab === 'mine') {
      this.setData({ currentTab: tab, mySubTab: 'liked', page: 1, hasMore: true });
    } else {
      this.setData({ currentTab: tab, page: 1, hasMore: true });
    }
    this.loadPosts(true);
  },

  // 我的子选项卡切换
  onMySubTabTap: function (e) {
    var sub = e.currentTarget.dataset.sub;
    if (sub === this.data.mySubTab) return;
    this.setData({ mySubTab: sub, page: 1, hasMore: true });
    this.loadPosts(true);
  },

  // 类型过滤切换
  onTypeTap: function (e) {
    var type = e.currentTarget.dataset.type;
    if (type === this.data.currentType) return;
    this.setData({ currentType: type, page: 1, hasMore: true });
    this.loadPosts(true);
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.setData({ page: 1, hasMore: true });
    this.loadPosts(true);
    wx.stopPullDownRefresh();
  },

  // 上拉加载更多
  onReachBottom: function () {
    this.loadPosts(false);
  },

  // 跳转发布页
  navigateToPublish: function () {
    wx.navigateTo({
      url: '/pages/square/publish/publish'
    });
  },

  // 跳转详情页
  navigateToDetail: function (e) {
    var postId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: '/pages/square/detail/detail?id=' + postId
    });
  },

  // 批量获取收藏状态
  loadFavoriteStatus: function (posts) {
    var that = this;
    var postIds = posts.map(function (p) { return p._id; });

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareGetFavoriteStatus',
        postIds: postIds
      }
    }).then(function (res) {
      var favMap = res.result.favMap || {};
      var updatedPosts = that.data.posts.map(function (post) {
        post.isFavorite = !!favMap[post._id];
        return post;
      });
      that.setData({ posts: updatedPosts });
    });
  },

  // 点赞/取消点赞
  onLikeTap: function (e) {
    var that = this;
    var index = e.currentTarget.dataset.index;
    var post = this.data.posts[index];
    if (!post) return;

    var isLiked = !post.isLiked;

    // 乐观更新 UI
    var posts = this.data.posts;
    posts[index].isLiked = isLiked;
    posts[index].likeCount = (posts[index].likeCount || 0) + (isLiked ? 1 : -1);
    if (posts[index].likeCount < 0) posts[index].likeCount = 0;
    this.setData({ posts: posts });

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareToggleLike',
        postId: post._id,
        isLiked: isLiked
      }
    }).catch(function (err) {
      console.error('[square] 点赞失败', err);
      // 回滚
      posts[index].isLiked = !isLiked;
      posts[index].likeCount = (posts[index].likeCount || 0) + (isLiked ? -1 : 1);
      if (posts[index].likeCount < 0) posts[index].likeCount = 0;
      that.setData({ posts: posts });
    });
  },

  // 收藏/取消收藏
  onFavoriteTap: function (e) {
    var that = this;
    var index = e.currentTarget.dataset.index;
    var post = this.data.posts[index];
    if (!post) return;

    var isFavorite = !post.isFavorite;

    // 乐观更新 UI
    var posts = this.data.posts;
    posts[index].isFavorite = isFavorite;
    this.setData({ posts: posts });

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareToggleFavorite',
        postId: post._id,
        isFavorite: isFavorite
      }
    }).then(function () {
      wx.showToast({
        title: isFavorite ? '已收藏' : '已取消收藏',
        icon: 'none',
        duration: 1500
      });
    }).catch(function (err) {
      console.error('[square] 收藏失败', err);
      // 回滚
      posts[index].isFavorite = !isFavorite;
      that.setData({ posts: posts });
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

  // 获取类型显示文本
  getTypeLabel: function (type) {
    var map = {
      'achievement': '成果分享',
      'discussion': '学术讨论',
      'resource': '资源分享',
      'call_for_papers': '征稿通知',
      'review': '学术审稿',
      'journal': '学术会议',
      'literature_help': '文献互助'
    };
    return map[type] || '动态';
  },

  // 获取类型颜色
  getTypeColor: function (type) {
    var map = {
      'achievement': '#2563eb',
      'discussion': '#7c3aed',
      'resource': '#059669',
      'call_for_papers': '#ea580c',
      'review': '#dc2626',
      'journal': '#0891b2',
      'literature_help': '#f59e0b'
    };
    return map[type] || '#6B7280';
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

  // 获取求助状态显示文本
  getHelpStatusLabel: function (status) {
    var map = {
      '求助中': '求助中',
      '已解决': '已解决',
      '已过期': '已过期'
    };
    return map[status] || '求助中';
  },

  // 获取求助状态颜色
  getHelpStatusColor: function (status) {
    var map = {
      '求助中': '#10b981',
      '已解决': '#3b82f6',
      '已过期': '#9ca3af'
    };
    return map[status] || '#10b981';
  },

  // 格式化剩余时间
  formatRemainingTime: function (deadline) {
    if (!deadline) return '';
    var now = new Date();
    var deadlineTime = new Date(deadline.replace(/-/g, '/'));
    var diff = deadlineTime.getTime() - now.getTime();

    if (diff <= 0) return '已过期';

    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var minutes = Math.floor((diff % 3600000) / 60000);

    if (days > 0) return days + '天' + hours + '小时后截止';
    if (hours > 0) return hours + '小时' + minutes + '分钟后截止';
    return minutes + '分钟后截止';
  }
});
