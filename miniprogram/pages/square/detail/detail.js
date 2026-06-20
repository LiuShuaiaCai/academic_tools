// pages/square/detail/detail.js
// 学术动态 - 动态详情页
var app = getApp();

Page({
  data: {
    // 动态 ID
    postId: '',

    // 动态详情
    post: null,
    displayTime: '',
    typeLabel: '',
    typeColor: '',

    // 评论列表
    comments: [],
    commentPage: 1,
    commentHasMore: true,
    commentLoading: false,

    // 评论输入
    commentText: '',
    replyTo: null,          // 正在回复的评论
    showInput: false,

    // 用户信息
    currentOpenid: '',
    avatarUrl: '',
    nickName: ''
  },

  onLoad: function (options) {
    var postId = options.id || '';
    this.setData({ postId: postId });
    this.getUserInfo();
    this.loadPostDetail();
    this.loadComments(true);
  },

  // 获取用户信息
  getUserInfo: function () {
    var that = this;
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserId' }
    }).then(function (res) {
      that.setData({ currentOpenid: res.result.openid });
      var userInfo = app.globalData.userInfo || {};
      that.setData({
        avatarUrl: userInfo.avatarUrl || '',
        nickName: userInfo.nickName || ''
      });
    });
  },

  // 加载动态详情
  loadPostDetail: function () {
    var that = this;
    if (!this.data.postId) return;

    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareGetPostDetail',
        postId: this.data.postId
      }
    }).then(function (res) {
      wx.hideLoading();
      var post = res.result.post || res.result;
      console.log('[detail] 加载详情结果', res.result, 'postId:', that.data.postId);
      if (!post) {
        wx.showToast({ title: '动态不存在', icon: 'none' });
        setTimeout(function () { wx.navigateBack(); }, 1200);
        return;
      }

      post.displayTime = that.formatDisplayTime(post.createTime);
      post.typeLabel = that.getTypeLabel(post.type);
      post.typeColor = that.getTypeColor(post.type);

      // 文献互助类型：添加求助状态相关字段
      if (post.type === 'literature_help') {
        post.helpStatusLabel = that.getHelpStatusLabel(post.helpStatus);
        post.helpStatusColor = that.getHelpStatusColor(post.helpStatus);
        post.remainingTime = that.formatRemainingTime(post.helpDeadline);
        post.canRespond = post.helpStatus === '求助中' && post._openid !== that.data.currentOpenid;
        post.canExtend = post.helpStatus === '已过期' && post._openid === that.data.currentOpenid;
        post.canDownload = post.helpStatus === '已解决' && post.docFileId;
      }

      that.setData({
        post: post
      });

      // 加载点赞状态
      that.loadLikeStatus();
      // 加载收藏状态
      that.loadFavoriteStatus();
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[detail] 加载详情失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 加载点赞状态
  loadLikeStatus: function () {
    var that = this;
    if (!this.data.post) return;

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareGetLikeStatus',
        postIds: [this.data.post._id]
      }
    }).then(function (res) {
      var likeMap = res.result.likeMap || {};
      var post = that.data.post;
      post.isLiked = !!likeMap[post._id];
      that.setData({ post: post });
    });
  },

  // 加载收藏状态
  loadFavoriteStatus: function () {
    var that = this;
    if (!this.data.post) return;

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareGetFavoriteStatus',
        postIds: [this.data.post._id]
      }
    }).then(function (res) {
      var favMap = res.result.favMap || {};
      var post = that.data.post;
      post.isFavorite = !!favMap[post._id];
      that.setData({ post: post });
    });
  },

  // 加载评论列表
  loadComments: function (reset) {
    var that = this;
    if (this.data.commentLoading) return;
    if (!reset && !this.data.commentHasMore) return;

    var page = reset ? 1 : this.data.commentPage;

    this.setData({ commentLoading: true });

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareGetComments',
        postId: this.data.postId,
        page: page,
        pageSize: 20
      }
    }).then(function (res) {
      var result = res.result || {};
      var newComments = result.comments || [];

      newComments.forEach(function (c) {
        c.displayTime = that.formatDisplayTime(c.createTime);
      });

      var comments = reset ? newComments : that.data.comments.concat(newComments);
      that.setData({
        comments: comments,
        commentPage: page + 1,
        commentHasMore: newComments.length >= 20,
        commentLoading: false
      });
    }).catch(function (err) {
      console.error('[detail] 加载评论失败', err);
      that.setData({ commentLoading: false });
    });
  },

  // 点赞/取消点赞
  onLikeTap: function () {
    var that = this;
    var post = this.data.post;
    if (!post) return;

    var isLiked = !post.isLiked;
    post.isLiked = isLiked;
    post.likeCount = (post.likeCount || 0) + (isLiked ? 1 : -1);
    if (post.likeCount < 0) post.likeCount = 0;
    this.setData({ post: post });

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareToggleLike',
        postId: post._id,
        isLiked: isLiked
      }
    }).catch(function (err) {
      post.isLiked = !isLiked;
      post.likeCount = (post.likeCount || 0) + (isLiked ? -1 : 1);
      if (post.likeCount < 0) post.likeCount = 0;
      that.setData({ post: post });
    });
  },

  // 收藏/取消收藏
  onFavoriteTap: function () {
    var that = this;
    var post = this.data.post;
    if (!post) return;

    var isFavorite = !post.isFavorite;
    post.isFavorite = isFavorite;
    this.setData({ post: post });

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
      post.isFavorite = !isFavorite;
      that.setData({ post: post });
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

  // 复制文本
  copyText: function (e) {
    var text = e.currentTarget.dataset.text;
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success', duration: 1000 });
      }
    });
  },

  // 评论输入框显示
  showCommentInput: function (e) {
    var replyTo = null;
    if (e && e.currentTarget) {
      var commentId = e.currentTarget.dataset.commentId;
      var author = e.currentTarget.dataset.author;
      if (commentId) {
        replyTo = { id: commentId, author: author };
      }
    }
    this.setData({
      showInput: true,
      replyTo: replyTo,
      commentText: replyTo ? '回复 @' + replyTo.author + '：' : ''
    });
  },

  // 隐藏评论输入
  hideCommentInput: function () {
    this.setData({
      showInput: false,
      replyTo: null,
      commentText: ''
    });
  },

  // 评论输入
  onCommentInput: function (e) {
    this.setData({ commentText: e.detail.value });
  },

  // 提交评论
  submitComment: function () {
    var that = this;
    var text = this.data.commentText.trim();

    if (!text) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发送中...' });
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareCreateComment',
        postId: this.data.postId,
        content: text,
        parentId: this.data.replyTo ? this.data.replyTo.id : null,
        avatarUrl: this.data.avatarUrl,
        nickName: this.data.nickName
      }
    }).then(function (res) {
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({ title: '评论成功', icon: 'success' });
        that.hideCommentInput();

        // 更新评论计数
        var post = that.data.post;
        post.commentCount = (post.commentCount || 0) + 1;
        that.setData({ post: post });

        // 刷新评论列表
        that.loadComments(true);
      } else {
        wx.showToast({ title: res.result.error || '评论失败', icon: 'none' });
      }
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[detail] 评论失败', err);
      wx.showToast({ title: '评论失败', icon: 'none' });
    });
  },

  // 上拉加载更多评论
  onReachBottom: function () {
    this.loadComments(false);
  },

  // 格式化时间
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
      return (postTime.getMonth() + 1) + '月' + postTime.getDate() + '日';
    }
    return postTime.getFullYear() + '年';
  },

  getTypeLabel: function (type) {
    var map = { 'achievement': '成果分享', 'discussion': '学术讨论', 'resource': '资源分享', 'call_for_papers': '征稿通知', 'review': '学术审稿', 'journal': '学术会议', 'literature_help': '文献互助' };
    return map[type] || '动态';
  },

  getTypeColor: function (type) {
    var map = { 'achievement': '#2563eb', 'discussion': '#7c3aed', 'resource': '#059669', 'call_for_papers': '#ea580c', 'review': '#dc2626', 'journal': '#0891b2', 'literature_help': '#f59e0b' };
    return map[type] || '#6B7280';
  },

  // 获取求助状态显示文本
  getHelpStatusLabel: function (status) {
    var map = { '求助中': '求助中', '已解决': '已解决', '已过期': '已过期' };
    return map[status] || '求助中';
  },

  // 获取求助状态颜色
  getHelpStatusColor: function (status) {
    var map = { '求助中': '#10b981', '已解决': '#3b82f6', '已过期': '#9ca3af' };
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
  },

  // 应助 - 上传文献文件
  onHelpRespond: function () {
    var that = this;
    var post = this.data.post;

    if (!post || post.helpStatus !== '求助中') {
      wx.showToast({ title: '该求助无法应助', icon: 'none' });
      return;
    }

    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: function (res) {
        var tempFilePath = res.tempFiles[0].path;
        var fileName = res.tempFiles[0].name;

        that.uploadHelpFile(tempFilePath, fileName);
      },
      fail: function () {
        // 用户取消选择
      }
    });
  },

  // 上传应助文件到云存储
  uploadHelpFile: function (tempFilePath, fileName) {
    var that = this;
    wx.showLoading({ title: '上传中...', mask: true });

    var cloudPath = 'help_files/' + Date.now() + '_' + fileName;
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath
    }).then(function (res) {
      var fileID = res.fileID;
      // 调用云函数完成应助
      that.completeHelpRespond(fileID);
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[detail] 文件上传失败', err);
      wx.showToast({ title: '文件上传失败', icon: 'none' });
    });
  },

  // 完成应助
  completeHelpRespond: function (fileID) {
    var that = this;
    var post = this.data.post;

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareHelpRespond',
        postId: post._id,
        fileID: fileID
      }
    }).then(function (res) {
      wx.hideLoading();
      var result = res.result || {};

      if (result.success) {
        wx.showToast({ title: '应助成功', icon: 'success' });
        // 刷新详情
        that.loadPostDetail();
      } else {
        wx.showToast({ title: result.error || '应助失败', icon: 'none' });
      }
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[detail] 应助失败', err);
      wx.showToast({ title: '应助失败', icon: 'none' });
    });
  },

  // 下载文献文件
  onDownloadFile: function () {
    var post = this.data.post;
    if (!post || !post.docFileId) {
      wx.showToast({ title: '文件不存在', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '获取下载链接...', mask: true });
    wx.cloud.getTempFileURL({
      fileList: [post.docFileId]
    }).then(function (res) {
      wx.hideLoading();
      var fileURL = res.fileList[0].tempFileURL;
      if (fileURL) {
        wx.openDocument({
          filePath: fileURL,
          showMenu: true,
          fail: function () {
            // 如果无法直接打开，提示用户
            wx.showModal({
              title: '提示',
              content: '文件已准备好，请在浏览器中打开',
              showCancel: false
            });
          }
        });
      } else {
        wx.showToast({ title: '获取文件失败', icon: 'none' });
      }
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[detail] 获取文件链接失败', err);
      wx.showToast({ title: '获取文件失败', icon: 'none' });
    });
  },

  // 延期求助时限
  onExtendDeadline: function () {
    var that = this;
    var post = this.data.post;

    if (!post || post.helpStatus !== '已过期') {
      wx.showToast({ title: '该求助无法延期', icon: 'none' });
      return;
    }

    // 显示日期选择器
    var today = new Date();
    var maxDate = new Date();
    maxDate.setDate(today.getDate() + 30);

    var formatDate = function (date) {
      var year = date.getFullYear();
      var month = (date.getMonth() + 1).toString().padStart(2, '0');
      var day = date.getDate().toString().padStart(2, '0');
      return year + '-' + month + '-' + day;
    };

    wx.showActionSheet({
      itemList: ['延长1天', '延长3天', '延长7天', '延长15天', '延长30天'],
      success: function (res) {
        var daysMap = [1, 3, 7, 15, 30];
        var extendDays = daysMap[res.tapIndex];

        wx.showLoading({ title: '处理中...', mask: true });
        wx.cloud.callFunction({
          name: 'academicAPI',
          data: {
            action: 'squareExtendDeadline',
            postId: post._id,
            extendDays: extendDays
          }
        }).then(function (res) {
          wx.hideLoading();
          var result = res.result || {};

          if (result.success) {
            wx.showToast({ title: '延期成功', icon: 'success' });
            // 刷新详情
            that.loadPostDetail();
          } else {
            wx.showToast({ title: result.error || '延期失败', icon: 'none' });
          }
        }).catch(function (err) {
          wx.hideLoading();
          console.error('[detail] 延期失败', err);
          wx.showToast({ title: '延期失败', icon: 'none' });
        });
      }
    });
  }
});
