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
    comments: [],           // 扁平原始列表
    displayComments: [],    // 树形结构（回复嵌套在父评论下）
    commentPage: 1,
    commentHasMore: true,
    commentLoading: false,

    // 评论输入
    commentText: '',
    replyTo: null,          // 正在回复的评论
    showInput: false,
    inputActive: false,     // 输入框是否激活（聚焦状态）
    commentImageUrl: '',    // 评论图片
    showEmojiPanel: false,  // 表情包面板
    emojiList: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😝','😜','🤪','🤔','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','👍','👎','👏','🙌','👐','🤝','🤗','🤭','🤫','🌹','❤️','💔','💖','💙','💚','💛','💜','🖤','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','🗨️','🗯️','💭','💤'],


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
    }).catch(function (err) {
      console.error('[detail] 获取用户 ID 失败', err);
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

      // 转换帖子中 cloud:// 协议的头像/图片 URL 为临时 URL 后再渲染
      return that.convertPostCloudUrls(post);
    }).then(function (convertedPost) {
      that.setData({ post: convertedPost });
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

  // 转换帖子中 cloud:// 协议的头像/图片 URL 为临时 URL（返回 Promise）
  convertPostCloudUrls: function (post) {
    var cloudFileIDs = [];
    // 作者头像
    if (post.avatarUrl && post.avatarUrl.indexOf('cloud://') === 0) {
      cloudFileIDs.push(post.avatarUrl);
    }
    // 应助者头像
    if (post.helperAvatarUrl && post.helperAvatarUrl.indexOf('cloud://') === 0) {
      if (cloudFileIDs.indexOf(post.helperAvatarUrl) === -1) {
        cloudFileIDs.push(post.helperAvatarUrl);
      }
    }

    if (cloudFileIDs.length === 0) return Promise.resolve(post);

    return wx.cloud.getTempFileURL({
      fileList: cloudFileIDs
    }).then(function (res) {
      var urlMap = {};
      res.fileList.forEach(function (item) {
        if (item.tempFileURL) urlMap[item.fileID] = item.tempFileURL;
      });

      var copy = Object.assign({}, post);
      if (copy.avatarUrl && urlMap[copy.avatarUrl]) {
        copy.avatarUrl = urlMap[copy.avatarUrl];
      }
      if (copy.helperAvatarUrl && urlMap[copy.helperAvatarUrl]) {
        copy.helperAvatarUrl = urlMap[copy.helperAvatarUrl];
      }
      return copy;
    }).catch(function (err) {
      console.error('[detail] 转换帖子URL失败，使用原始数据', err);
      return post;
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
      var post = Object.assign({}, that.data.post);
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
      var post = Object.assign({}, that.data.post);
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
        c.isLiked = false; // 初始化点赞状态
      });

      // 先转换为临时链接，再渲染
      return that.convertCommentCloudUrls(newComments);
    }).then(function (convertedComments) {
      var flatList = reset ? convertedComments : that.data.comments.concat(convertedComments);
      var displayList = that.buildCommentTree(flatList);

      // 如果是追加加载，保持已有展开状态
      if (!reset) {
        var oldDisplay = that.data.displayComments;
        displayList.forEach(function (item) {
          var oldItem = oldDisplay.find(function (o) { return o._id === item._id; });
          if (oldItem) {
            item._showReplies = oldItem._showReplies;
          }
        });
      }

      that.setData({
        comments: flatList,
        displayComments: displayList,
        commentPage: page + 1,
        commentHasMore: convertedComments.length >= 20,
        commentLoading: false
      });

      // 加载评论点赞状态
      that.loadCommentLikeStatus();
    }).catch(function (err) {
      console.error('[detail] 加载评论失败', err);
      if (!reset) {
        that.setData({ commentPage: page, commentLoading: false });
      } else {
        that.setData({ commentLoading: false });
      }
    });
  },

  // 将扁平评论列表构建为树形结构（回复嵌套在父评论下）
  buildCommentTree: function (flatComments) {
    var replyMap = {};
    flatComments.forEach(function (c) {
      if (c.parentId) {
        if (!replyMap[c.parentId]) replyMap[c.parentId] = [];
        // 去重
        var exists = replyMap[c.parentId].some(function (r) { return r._id === c._id; });
        if (!exists) replyMap[c.parentId].push(c);
      }
    });

    var tops = [];
    flatComments.forEach(function (c) {
      if (!c.parentId) {
        var copy = Object.assign({}, c);
        copy._replies = replyMap[c._id] || [];
        copy._showReplies = false;
        tops.push(copy);
      }
    });
    return tops;
  },

  // 展开/收起某条评论的回复
  toggleReplies: function (e) {
    var index = e.currentTarget.dataset.index;
    var list = this.data.displayComments.slice();
    if (list[index]) {
      list[index]._showReplies = !list[index]._showReplies;
      this.setData({ displayComments: list });
    }
  },

  // 转换评论中 cloud:// 协议的头像/图片 URL 为临时 URL（返回 Promise）
  convertCommentCloudUrls: function (comments) {
    var cloudFileIDs = [];

    comments.forEach(function (c) {
      if (c.avatarUrl && c.avatarUrl.indexOf('cloud://') === 0) {
        if (cloudFileIDs.indexOf(c.avatarUrl) === -1) {
          cloudFileIDs.push(c.avatarUrl);
        }
      }
      if (c.imageUrl && c.imageUrl.indexOf('cloud://') === 0) {
        if (cloudFileIDs.indexOf(c.imageUrl) === -1) {
          cloudFileIDs.push(c.imageUrl);
        }
      }
    });

    // 没有 cloud:// 路径，直接返回原数据
    if (cloudFileIDs.length === 0) {
      return Promise.resolve(comments);
    }

    return wx.cloud.getTempFileURL({
      fileList: cloudFileIDs
    }).then(function (res) {
      var urlMap = {};
      res.fileList.forEach(function (item) {
        if (item.tempFileURL) {
          urlMap[item.fileID] = item.tempFileURL;
        }
      });

      return comments.map(function (c) {
        var copy = Object.assign({}, c);
        if (c.avatarUrl && urlMap[c.avatarUrl]) {
          copy.avatarUrl = urlMap[c.avatarUrl];
        }
        if (c.imageUrl && urlMap[c.imageUrl]) {
          copy.imageUrl = urlMap[c.imageUrl];
        }
        return copy;
      });
    }).catch(function (err) {
      console.error('[detail] 转换评论 URL 失败，使用原始数据', err);
      return comments; // 失败时回退到原始数据
    });
  },

  // 加载评论点赞状态
  loadCommentLikeStatus: function () {
    var that = this;
    var commentIds = this.data.comments.map(function(c) { return c._id; });
    if (commentIds.length === 0) return;

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareGetLikeStatus',
        commentIds: commentIds
      }
    }).then(function (res) {
      var likeMap = res.result.likeMap || {};
      var comments = that.data.comments.map(function(c) {
        var copy = Object.assign({}, c);
        copy.isLiked = !!likeMap[c._id];
        return copy;
      });
      var displayList = that.buildCommentTree(comments);
      var oldDisplay = that.data.displayComments;
      displayList.forEach(function (item) {
        var oldItem = oldDisplay.find(function (o) { return o._id === item._id; });
        if (oldItem) item._showReplies = oldItem._showReplies;
      });
      that.setData({ comments: comments, displayComments: displayList });
    });
  },

  // 评论点赞/取消点赞
  onCommentLikeTap: function (e) {
    var that = this;
    var commentId = e.currentTarget.dataset.commentId;
    var flatList = this.data.comments.slice();
    var flatIndex = flatList.findIndex(function(c) { return c._id === commentId; });
    if (flatIndex < 0) return;

    var comment = flatList[flatIndex];
    var isLiked = !comment.isLiked;
    flatList[flatIndex].isLiked = isLiked;
    flatList[flatIndex].likeCount = (flatList[flatIndex].likeCount || 0) + (isLiked ? 1 : -1);
    if (flatList[flatIndex].likeCount < 0) flatList[flatIndex].likeCount = 0;

    var displayList = that.buildCommentTree(flatList);
    var oldDisplay = that.data.displayComments;
    displayList.forEach(function (item) {
      var oldItem = oldDisplay.find(function (o) { return o._id === item._id; });
      if (oldItem) item._showReplies = oldItem._showReplies;
    });

    this.setData({ comments: flatList, displayComments: displayList });

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareToggleLike',
        commentId: commentId,
        isLiked: isLiked
      }
    }).catch(function (err) {
      console.error('[detail] 点赞失败', err);
      var rollbackList = that.data.comments.slice();
      var rbIdx = rollbackList.findIndex(function(c) { return c._id === commentId; });
      if (rbIdx >= 0) {
        rollbackList[rbIdx].isLiked = !isLiked;
        rollbackList[rbIdx].likeCount = (rollbackList[rbIdx].likeCount || 0) + (isLiked ? -1 : 1);
        if (rollbackList[rbIdx].likeCount < 0) rollbackList[rbIdx].likeCount = 0;
      }
      that.setData({ comments: rollbackList });
    });
  },

  // 删除评论
  onCommentDeleteTap: function (e) {
    var that = this;
    var commentId = e.currentTarget.dataset.commentId;

    wx.showModal({
      title: '提示',
      content: '确定要删除这条评论吗？',
      success: function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.callFunction({
            name: 'academicAPI',
            data: {
              action: 'squareDeleteComment',
              commentId: commentId
            }
          }).then(function (res) {
            wx.hideLoading();
            if (res.result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });

              // 从扁平列表中移除
              var flatList = that.data.comments.slice();
              var flatIdx = flatList.findIndex(function(c) { return c._id === commentId; });
              if (flatIdx >= 0) flatList.splice(flatIdx, 1);

              // 重建显示列表
              var displayList = that.buildCommentTree(flatList);
              var oldDisplay = that.data.displayComments;
              displayList.forEach(function (item) {
                var oldItem = oldDisplay.find(function (o) { return o._id === item._id; });
                if (oldItem) item._showReplies = oldItem._showReplies;
              });

              var post = Object.assign({}, that.data.post);
              post.commentCount = (post.commentCount || 0) - 1;
              if (post.commentCount < 0) post.commentCount = 0;
              that.setData({ comments: flatList, displayComments: displayList, post: post });
            } else {
              wx.showToast({ title: res.result.error || '删除失败', icon: 'none' });
            }
          }).catch(function (err) {
            wx.hideLoading();
            console.error('[detail] 删除评论失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  // 点赞/取消点赞
  onLikeTap: function () {
    var that = this;
    var post = Object.assign({}, this.data.post);
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
      console.error('[detail] 点赞失败', err);
      var rollbackPost = Object.assign({}, that.data.post);
      rollbackPost.isLiked = !isLiked;
      rollbackPost.likeCount = (rollbackPost.likeCount || 0) + (isLiked ? -1 : 1);
      if (rollbackPost.likeCount < 0) rollbackPost.likeCount = 0;
      that.setData({ post: rollbackPost });
    });
  },

  // 收藏/取消收藏
  onFavoriteTap: function () {
    var that = this;
    var post = Object.assign({}, this.data.post);
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
      console.error('[detail] 收藏失败', err);
      var rollbackPost = Object.assign({}, that.data.post);
      rollbackPost.isFavorite = !isFavorite;
      that.setData({ post: rollbackPost });
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

  // 预览评论图片
  previewCommentImage: function (e) {
    var url = e.currentTarget.dataset.url;
    if (!url) return;

    // cloud:// 协议需要先获取临时 URL
    if (url.indexOf('cloud://') === 0) {
      wx.showLoading({ title: '加载中...', mask: true });
      wx.cloud.getTempFileURL({
        fileList: [url]
      }).then(function (res) {
        wx.hideLoading();
        var tempUrl = res.fileList[0] && res.fileList[0].tempFileURL;
        if (tempUrl) {
          wx.previewImage({
            current: tempUrl,
            urls: [tempUrl]
          });
        } else {
          wx.showToast({ title: '图片加载失败', icon: 'none' });
        }
      }).catch(function (err) {
        wx.hideLoading();
        console.error('[detail] 预览图片失败', err);
        wx.showToast({ title: '图片加载失败', icon: 'none' });
      });
      return;
    }

    wx.previewImage({
      current: url,
      urls: [url]
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
    inputActive: false,
    replyTo: replyTo,
    commentText: replyTo ? '回复 @' + replyTo.author + '：' : '',
    commentImageUrl: '',
    showEmojiPanel: false
  });
  },

  // 隐藏评论输入
  hideCommentInput: function () {
    this.setData({
      showInput: false,
      inputActive: false,
      replyTo: null,
      commentText: '',
      commentImageUrl: '',
      showEmojiPanel: false
    });
  },

  // 输入框获得焦点
  onInputFocus: function () {
    this.setData({ inputActive: true });
  },

  // 插入@提及
  insertAtMention: function () {
    var text = this.data.commentText + '@';
    this.setData({ commentText: text });
  },

  // 切换表情包面板
  toggleEmojiPanel: function () {
    this.setData({ showEmojiPanel: !this.data.showEmojiPanel });
  },

  // 插入表情包
  insertEmoji: function (e) {
    var emoji = e.currentTarget.dataset.emoji;
    var text = this.data.commentText + emoji;
    this.setData({ commentText: text });
  },

  // 选择评论图片
  chooseCommentImage: function () {
    var that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var tempFile = res.tempFiles[0];
        if (!tempFile) return;
        that.uploadCommentImage(tempFile.tempFilePath);
      }
    });
  },

  // 上传评论图片到云存储
  uploadCommentImage: function (filePath) {
    var that = this;
    wx.showLoading({ title: '上传中...' });
    var cloudPath = 'square/comments/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.jpg';
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath
    }).then(function (res) {
      wx.hideLoading();
      that.setData({ commentImageUrl: res.fileID });
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[detail] 评论图片上传失败', err);
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    });
  },

  // 删除已选评论图片
  removeCommentImage: function () {
    this.setData({ commentImageUrl: '' });
  },

  // 评论输入
  onCommentInput: function (e) {
    this.setData({ commentText: e.detail.value });
  },

  // 提交评论
  submitComment: function () {
    var that = this;
    var text = this.data.commentText.trim();
    var imageUrl = this.data.commentImageUrl;

    if (!text && !imageUrl) {
      wx.showToast({ title: '请输入评论内容或上传图片', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发送中...' });
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareCreateComment',
        postId: this.data.postId,
        content: text,
        imageUrl: imageUrl,
        parentId: this.data.replyTo ? this.data.replyTo.id : null
      }
    }).then(function (res) {
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({ title: '评论成功', icon: 'success' });
        that.hideCommentInput();

        // 更新评论计数
        var post = Object.assign({}, that.data.post);
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
    var map = { 'achievement': '#2563eb', 'discussion': '#7C3AED', 'resource': '#059669', 'call_for_papers': '#F97316', 'review': '#10B981', 'journal': '#06B6D4', 'literature_help': '#F43F5E' };
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
      that.completeHelpRespond(fileID, fileName);
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[detail] 文件上传失败', err);
      wx.showToast({ title: '文件上传失败', icon: 'none' });
    });
  },

  // 完成应助
  completeHelpRespond: function (fileID, fileName) {
    var that = this;
    var post = this.data.post;

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareHelpRespond',
        postId: post._id,
        fileID: fileID,
        fileName: fileName
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

    wx.showLoading({ title: '下载中...', mask: true });
    wx.cloud.downloadFile({
      fileID: post.docFileId
    }).then(function (res) {
      wx.hideLoading();
      if (res.tempFilePath) {
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fileType: 'auto',
          fail: function (err) {
            console.error('[detail] 打开文件失败', err);
            // 降级：复制链接让用户手动打开
            wx.cloud.getTempFileURL({
              fileList: [post.docFileId]
            }).then(function (urlRes) {
              var url = urlRes.fileList[0] && urlRes.fileList[0].tempFileURL;
              if (url) {
                wx.setClipboardData({
                  data: url,
                  success: function () {
                    wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' });
                  }
                });
              }
            });
          }
        });
      } else {
        wx.showToast({ title: '下载文件失败', icon: 'none' });
      }
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[detail] 下载文件失败', err);
      wx.showToast({ title: '下载文件失败', icon: 'none' });
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
