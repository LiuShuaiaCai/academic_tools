// pages/square/square.js
// 学术动态 - 科研同行公共交流社区
var app = getApp();
var sqHelper = require('../../utils/square-helper.js');
var creditsUtil = require('../../utils/credits.js');

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
    nickName: '',

    // 当前展开评论的动态索引
    activeCommentIndex: -1,
    activeCommentPostId: '',
    // 评论输入
    commentText: '',
    showInput: false,
    inputActive: false,     // 输入框是否激活
    // 回复目标
    replyTo: null,          // { id, nickName }
    // 表情包
    showEmojiPanel: false,
    emojiList: sqHelper.EMOJI_LIST,
    // 评论图片
    commentImageUrl: '',
    
    // 应助弹窗
    showRespondModal: false,
    respondPostIndex: -1,
    respondPostId: '',
    respondPostTitle: '',
    respondPostReward: 0,
    respondContent: '',
    respondFileName: '',
    respondFileId: '',
    respondFilePath: ''
},

  onLoad: function () {
    this.getUserId();
    this.checkProfileComplete(function() {
      this.loadPosts(true);
    }.bind(this));
  },

  onShow: function () {
    // 每次进入页面都检查资料是否完善（弹窗提醒）
    var isReturnFromEdit = this._backFromEditProfile;
    this._backFromEditProfile = false;
    
    // 检查是否有全局刷新标记（发布成功、编辑资料等）
    var app = getApp();
    var needGlobalRefresh = app.globalData._squareNeedRefresh;
    app.globalData._squareNeedRefresh = false;
    
    // 需要刷新列表的场景：从编辑资料返回、发布成功后返回
    var needRefresh = isReturnFromEdit || this._needRefresh || needGlobalRefresh;
    this._needRefresh = false;
    
    if (needRefresh) {
      // 从编辑资料返回时，等待数据库写入生效后再检查
      var delay = isReturnFromEdit ? 800 : 0;
      setTimeout(function() {
        this.checkProfileComplete(function() {
          this.loadPosts(true);
        }.bind(this));
      }.bind(this), delay);
    } else {
      this.checkProfileComplete();
    }
  },

  // 检查用户资料是否完善
  checkProfileComplete: function (onComplete) {
    var that = this;
    creditsUtil.getUserProfile().then(function (result) {
      // activated 字段在 completeProfile 云函数中设置，只有真正保存了资料才会变为 true
      console.log('[square] getUserProfile activated:', result.activated, 'success:', result.success);
      var isActivated = result.success && result.activated;
      
      // 无论是否激活，列表都正常加载
      if (onComplete) onComplete();
      
      // 未激活时，弹窗引导（不阻塞列表）
      // 使用 setTimeout 避免页面切换时序导致弹窗不显示
      if (result.success && !isActivated) {
        setTimeout(function () {
          wx.showModal({
            title: '完善学术资料',
            content: '进入学术动态前，请先完善您的学术资料（职称、研究领域、机构等），完善即送50积分！',
            confirmText: '去完善',
            cancelText: '返回首页',
            success: function (res) {
              if (res.confirm) {
                that._backFromEditProfile = true;
                wx.navigateTo({ url: '/pages/editProfile/editProfile' });
              } else {
                wx.switchTab({ url: '/pages/home/home' });
              }
            }
          });
        }, 300);
      }
    }).catch(function () {
      // 获取失败时放行，避免网络问题阻塞入口
      if (onComplete) onComplete();
    });
  },

  // 获取当前用户 OpenID
  getUserId: function () {
    var that = this;
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getUserId' }
    }).then(function (res) {
      that.setData({ currentOpenid: res.result.openid });
    }).catch(function (err) {
      console.error('[square] 获取用户 ID 失败', err);
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
        sqHelper.formatPostDisplay(post, that.data.currentOpenid);

        // 「我的」子选项卡自动标记状态
        if (isMine && that.data.mySubTab === 'liked') {
          post.isLiked = true;
        }
        if (isMine && that.data.mySubTab === 'favorited') {
          post.isFavorite = true;
        }
      });

      var posts = reset ? newPosts : that.data.posts.concat(newPosts);

      return that.convertPostsCloudUrls(posts).then(function (convertedPosts) {
        // 保持滚动位置（刷新时不重置）
        that.setData({
          posts: convertedPosts,
          page: page + 1,
          hasMore: newPosts.length >= that.data.pageSize,
          loading: false,
          refreshing: false
        });

        // 刷新列表后，如果当前有展开的评论区，恢复评论预览
        if (reset && that.data.activeCommentPostId) {
          var newActiveIndex = -1;
          for (var i = 0; i < convertedPosts.length; i++) {
            if (convertedPosts[i]._id === that.data.activeCommentPostId) {
              newActiveIndex = i;
              break;
            }
          }
          if (newActiveIndex >= 0) {
            that.setData({ activeCommentIndex: newActiveIndex });
            that.loadCommentsPreview(newActiveIndex);
          } else {
            that.setData({ activeCommentIndex: -1, activeCommentPostId: '' });
          }
        }

        // 并行获取点赞状态和收藏状态
        if (convertedPosts.length > 0 && (!isMine || that.data.mySubTab === 'published')) {
          that.loadLikeAndFavoriteStatus(convertedPosts);
        }
      });
    }).catch(function (err) {
      console.error('[square] 加载动态失败', err);
      that.setData({ loading: false, refreshing: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 并行获取点赞状态 + 收藏状态（合并为一次 Promise.all）
  loadLikeAndFavoriteStatus: function (posts) {
    var that = this;
    var postIds = posts.map(function (p) { return p._id; });

    var likePromise = wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'squareGetLikeStatus', postIds: postIds }
    }).then(function (res) {
      return res.result.likeMap || {};
    }).catch(function () { return {}; });

    var favPromise = wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'squareGetFavoriteStatus', postIds: postIds }
    }).then(function (res) {
      return res.result.favMap || {};
    }).catch(function () { return {}; });

    Promise.all([likePromise, favPromise]).then(function (results) {
      var likeMap = results[0];
      var favMap = results[1];
      var updatedPosts = that.data.posts.map(function (post) {
        return Object.assign({}, post, {
          isLiked: !!likeMap[post._id],
          isFavorite: !!favMap[post._id]
        });
      });
      that.setData({ posts: updatedPosts });
    });
  },

  // Tab 切换
  onTabTap: function (e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;
    if (tab === 'mine') {
      this.setData({ currentTab: tab, mySubTab: 'liked', page: 1, hasMore: true, activeCommentIndex: -1, activeCommentPostId: '' });
    } else {
      this.setData({ currentTab: tab, page: 1, hasMore: true, activeCommentIndex: -1, activeCommentPostId: '' });
    }
    this.loadPosts(true);
  },

  // 我的子选项卡切换
  onMySubTabTap: function (e) {
    var sub = e.currentTarget.dataset.sub;
    if (sub === this.data.mySubTab) return;
    this.setData({ mySubTab: sub, page: 1, hasMore: true, activeCommentIndex: -1, activeCommentPostId: '' });
    this.loadPosts(true);
  },

  // 类型过滤切换
  onTypeTap: function (e) {
    var type = e.currentTarget.dataset.type;
    if (type === this.data.currentType) return;
    this.setData({ currentType: type, page: 1, hasMore: true, activeCommentIndex: -1, activeCommentPostId: '' });
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
    var that = this;
    wx.navigateTo({
      url: '/pages/square/publish/publish',
      events: {
        publishSuccess: function () {
          that._needRefresh = true;
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

  // 点赞/取消点赞
  onLikeTap: function (e) {
    var that = this;
    var index = e.currentTarget.dataset.index;
    var post = this.data.posts[index];
    if (!post) return;

    var isLiked = !post.isLiked;

    // 乐观更新 UI
    var posts = this.data.posts.slice();
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
      var rollbackPosts = that.data.posts.slice();
      rollbackPosts[index].isLiked = !isLiked;
      rollbackPosts[index].likeCount = (rollbackPosts[index].likeCount || 0) + (isLiked ? -1 : 1);
      if (rollbackPosts[index].likeCount < 0) rollbackPosts[index].likeCount = 0;
      that.setData({ posts: rollbackPosts });
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
    var posts = this.data.posts.slice();
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
      var rollbackPosts = that.data.posts.slice();
      rollbackPosts[index].isFavorite = !isFavorite;
      that.setData({ posts: rollbackPosts });
    });
  },

  // 点击评论按钮，展开/收起当前卡片评论
  onCommentTap: function (e) {
    var index = e.currentTarget.dataset.index;
    var post = this.data.posts[index];
    if (!post) return;

    // 如果点击的是当前已展开的评论，则收起
    if (this.data.activeCommentIndex === index) {
      this.hideCommentInput();
      return;
    }

    this.setData({
      activeCommentIndex: index,
      activeCommentPostId: post._id,
      showInput: true,
      inputActive: false,
      commentText: '',
      showEmojiPanel: false,
      commentImageUrl: '',
      replyTo: null
    });
    this.loadCommentsPreview(index);
  },

  // 隐藏评论输入
  hideCommentInput: function () {
    this.setData({
      showInput: false,
      inputActive: false,
      commentText: '',
      activeCommentIndex: -1,
      activeCommentPostId: '',
      showEmojiPanel: false,
      commentImageUrl: '',
      replyTo: null
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

  // 评论输入
  onCommentInput: function (e) {
    this.setData({ commentText: e.detail.value });
  },

  // 提交评论
  submitComment: function () {
    var that = this;
    var text = this.data.commentText.trim();
    var imageUrl = this.data.commentImageUrl;
    var replyTo = this.data.replyTo;
    if (!text && !imageUrl) {
      wx.showToast({ title: '请输入评论内容或上传图片', icon: 'none' });
      return;
    }
    var index = this.data.activeCommentIndex;
    var post = this.data.posts[index];
    if (!post) return;

    wx.showLoading({ title: '发送中...' });
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareCreateComment',
        postId: post._id,
        content: text,
        imageUrl: imageUrl,
        parentId: replyTo ? replyTo.id : null,
        replyToNickName: replyTo ? replyTo.nickName : null
      }
    }).then(function (res) {
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({ title: '评论成功', icon: 'success' });
        that.setData({ commentText: '', commentImageUrl: '', showEmojiPanel: false, replyTo: null });
        var posts = that.data.posts.slice();
        posts[index].commentCount = (posts[index].commentCount || 0) + 1;
        that.setData({ posts: posts });
        that.loadCommentsPreview(index);
      } else {
        wx.showToast({ title: res.result.error || '评论失败', icon: 'none' });
      }
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[square] 评论失败', err);
      wx.showToast({ title: '评论失败', icon: 'none' });
    });
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
      console.error('[square] 评论图片上传失败', err);
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    });
  },

  // 删除已选评论图片
  removeCommentImage: function () {
    this.setData({ commentImageUrl: '' });
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
        console.error('[square] 预览图片失败', err);
        wx.showToast({ title: '图片加载失败', icon: 'none' });
      });
      return;
    }

    wx.previewImage({
      current: url,
      urls: [url]
    });
  },

  // 转换帖子列表中 cloud:// 协议的头像 URL 为临时 URL（返回 Promise）
  convertPostsCloudUrls: function (posts) {
    var cloudFileIDs = [];
    posts.forEach(function (post) {
      if (post.avatarUrl && post.avatarUrl.indexOf('cloud://') === 0) {
        if (cloudFileIDs.indexOf(post.avatarUrl) === -1) {
          cloudFileIDs.push(post.avatarUrl);
        }
      }
      // 应助者头像
      var responses = post.responses || [];
      responses.forEach(function (resp) {
        if (resp.responderAvatarUrl && resp.responderAvatarUrl.indexOf('cloud://') === 0) {
          if (cloudFileIDs.indexOf(resp.responderAvatarUrl) === -1) {
            cloudFileIDs.push(resp.responderAvatarUrl);
          }
        }
      });
    });

    if (cloudFileIDs.length === 0) return Promise.resolve(posts);

    return wx.cloud.getTempFileURL({
      fileList: cloudFileIDs
    }).then(function (res) {
      var urlMap = {};
      res.fileList.forEach(function (item) {
        if (item.tempFileURL) urlMap[item.fileID] = item.tempFileURL;
      });
      return posts.map(function (post) {
        var copy = Object.assign({}, post);
        if (copy.avatarUrl && urlMap[copy.avatarUrl]) {
          copy.avatarUrl = urlMap[copy.avatarUrl];
        }
        // 转换应助者头像
        if (copy.responses && copy.responses.length > 0) {
          copy.responses = copy.responses.map(function (resp) {
            var respCopy = Object.assign({}, resp);
            if (respCopy.responderAvatarUrl && urlMap[respCopy.responderAvatarUrl]) {
              respCopy.responderAvatarUrl = urlMap[respCopy.responderAvatarUrl];
            }
            return respCopy;
          });
        }
        return copy;
      });
    }).catch(function (err) {
      console.error('[square] 转换帖子URL失败，使用原始数据', err);
      return posts;
    });
  },

  // 加载评论预览
  loadCommentsPreview: function (index) {
    var that = this;
    var post = this.data.posts[index];
    if (!post) return;

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareGetComments',
        postId: post._id,
        page: 1,
        pageSize: 3
      }
    }).then(function (res) {
      var result = res.result || {};
      var comments = result.comments || [];
      comments.forEach(function (c) {
        c.displayTime = sqHelper.formatDisplayTime(c.createTime);
      });

      // 转换 cloud:// URL，再渲染
      return sqHelper.convertCloudUrls(comments, ['avatarUrl', 'imageUrl']);
    }).then(function (convertedComments) {
      var tree = sqHelper.buildCommentTree(convertedComments);
      var posts = that.data.posts.slice();
      if (posts[index]) {
        posts[index].commentsPreview = tree;
        that.setData({ posts: posts });
      }
    }).catch(function (err) {
      console.error('[square] 加载评论预览失败', err);
    });
  },

  // 展开/收起评论回复（广场页）
  toggleSquareReplies: function (e) {
    var postIndex = e.currentTarget.dataset.postIndex;
    var commentIndex = e.currentTarget.dataset.commentIndex;
    var posts = this.data.posts.slice();
    var comments = posts[postIndex] && posts[postIndex].commentsPreview;
    if (comments && comments[commentIndex]) {
      comments[commentIndex]._showReplies = !comments[commentIndex]._showReplies;
      this.setData({ posts: posts });
    }
  },

  // 评论点赞（广场预览区）
  onSquareCommentLikeTap: function (e) {
    var that = this;
    var commentId = e.currentTarget.dataset.commentId;
    var postIndex = this.data.activeCommentIndex;
    var posts = this.data.posts.slice();
    var post = posts[postIndex];
    if (!post || !post.commentsPreview) return;

    // 在树形结构中找到该评论
    var found = null;
    post.commentsPreview.forEach(function (parent) {
      if (parent._id === commentId) {
        found = parent;
      } else if (parent._replies) {
        parent._replies.forEach(function (reply) {
          if (reply._id === commentId) {
            found = reply;
          }
        });
      }
    });
    if (!found) return;

    var isLiked = !found.isLiked;
    found.isLiked = isLiked;
    found.likeCount = (found.likeCount || 0) + (isLiked ? 1 : -1);
    if (found.likeCount < 0) found.likeCount = 0;

    this.setData({ posts: posts });

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'squareToggleLike',
        commentId: commentId,
        isLiked: isLiked
      }
    }).catch(function (err) {
      console.error('[square] 评论点赞失败', err);
      var rollbackList = that.data.posts.slice();
      var rollbackPost = rollbackList[postIndex];
      if (rollbackPost && rollbackPost.commentsPreview) {
        rollbackPost.commentsPreview.forEach(function (p) {
          if (p._id === commentId) {
            p.isLiked = !isLiked;
            p.likeCount = (p.likeCount || 0) + (isLiked ? -1 : 1);
            if (p.likeCount < 0) p.likeCount = 0;
          } else if (p._replies) {
            p._replies.forEach(function (r) {
              if (r._id === commentId) {
                r.isLiked = !isLiked;
                r.likeCount = (r.likeCount || 0) + (isLiked ? -1 : 1);
                if (r.likeCount < 0) r.likeCount = 0;
              }
            });
          }
        });
      }
      that.setData({ posts: rollbackList });
    });
  },

  // 回复评论（广场预览区）
  onSquareCommentReplyTap: function (e) {
    var commentId = e.currentTarget.dataset.commentId;
    var nickName = e.currentTarget.dataset.nickName;

    this.setData({
      replyTo: { id: commentId, nickName: nickName },
      inputActive: true
    });
  },

  // 取消回复
  cancelReply: function () {
    this.setData({
      replyTo: null
    });
  },

  // 应助 - 打开应助弹窗
  onHelpRespond: function (e) {
    var index = e.currentTarget.dataset.index;
    var post = this.data.posts[index];

    if (!post || post.helpStatus !== '求助中') {
      wx.showToast({ title: '该求助无法应助', icon: 'none' });
      return;
    }
    if (post._openid === this.data.currentOpenid) {
      wx.showToast({ title: '不能应助自己的求助', icon: 'none' });
      return;
    }

    this.setData({
      showRespondModal: true,
      respondPostIndex: index,
      respondPostId: post._id,
      respondPostTitle: post.title || '',
      respondPostReward: post.rewardPoints || 0,
      respondContent: '',
      respondFileName: '',
      respondFileId: '',
      respondFilePath: ''
    });
  },

  // 关闭应助弹窗
  closeRespondModal: function () {
    this.setData({
      showRespondModal: false,
      respondPostIndex: -1,
      respondPostId: '',
      respondPostTitle: '',
      respondPostReward: 0,
      respondContent: '',
      respondFileName: '',
      respondFileId: '',
      respondFilePath: ''
    });
  },

  // 应助内容输入
  onRespondContentInput: function (e) {
    this.setData({ respondContent: e.detail.value });
  },

  // 应助选择文件
  onRespondChooseFile: function () {
    var that = this;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: function (res) {
        var tempFilePath = res.tempFiles[0].path;
        var fileName = res.tempFiles[0].name;
        that.setData({
          respondFileName: fileName,
          respondFilePath: tempFilePath,
          respondFileId: ''  // 稍后上传
        });
      }
    });
  },

  // 移除应助文件
  onRespondRemoveFile: function () {
    this.setData({
      respondFileName: '',
      respondFileId: '',
      respondFilePath: ''
    });
  },

  // 提交应助
  onRespondSubmit: function () {
    var that = this;
    var content = this.data.respondContent.trim();
    var fileName = this.data.respondFileName;

    if (!content && !fileName) {
      wx.showToast({ title: '请输入内容或上传文件', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...', mask: true });

    // 如果有文件需要上传
    var submitRequest = function (fileID) {
      wx.cloud.callFunction({
        name: 'academicAPI',
        data: {
          action: 'squareHelpRespond',
          postId: that.data.respondPostId,
          content: content,
          fileID: fileID || '',
          fileName: fileName || ''
        }
      }).then(function (res) {
        wx.hideLoading();
        var result = res.result || {};
        if (result.success) {
          wx.showToast({ title: '应助成功', icon: 'success' });
          that.closeRespondModal();
          // 刷新列表
          that.loadPosts(true);
        } else {
          wx.showToast({ title: result.error || '应助失败', icon: 'none' });
        }
      }).catch(function (err) {
        wx.hideLoading();
        console.error('[square] 应助失败', err);
        wx.showToast({ title: '应助失败', icon: 'none' });
      });
    };

    if (this.data.respondFilePath) {
      // 先上传文件
      var cloudPath = 'help_files/' + Date.now() + '_' + fileName;
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: this.data.respondFilePath
      }).then(function (uploadRes) {
        submitRequest(uploadRes.fileID);
      }).catch(function (err) {
        wx.hideLoading();
        console.error('[square] 文件上传失败', err);
        wx.showToast({ title: '文件上传失败，请重试', icon: 'none' });
      });
    } else {
      submitRequest('');
    }
  },


  // 预览图片
  previewImage: function (e) {
    var url = e.currentTarget.dataset.url;
    var urls = e.currentTarget.dataset.urls;
    wx.previewImage({
      current: url,
      urls: urls || [url]
    });
  }
});