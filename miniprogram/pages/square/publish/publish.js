// pages/square/publish/publish.js
// 学术动态 - 发布动态页面
var app = getApp();

Page({
  data: {
    // 发布类型
    postType: 'discussion',
    typeOptions: [
      { key: 'discussion', label: '学术讨论', icon: '💬', color: '#7c3aed' },
      { key: 'call_for_papers', label: '征稿通知', icon: '📢', color: '#ea580c' },
      { key: 'review', label: '学术审稿', icon: '🔍', color: '#dc2626' },
      { key: 'journal', label: '学术会议', icon: '📰', color: '#0891b2' },
      { key: 'literature_help', label: '文献互助', icon: '📚', color: '#f59e0b' }
    ],

    // 推荐标签
    suggestedTags: ['人工智能', '机器学习', '深度学习', 'NLP', '计算机视觉', '数据挖掘', '网络安全', '区块链', '大数据', '物联网'],

    // 文献类型选项
    docTypeOptions: [
      { key: 'journal', label: '期刊论文' },
      { key: 'book', label: '书籍' },
      { key: 'thesis', label: '学术论文' },
      { key: 'other', label: '其他' }
    ],

    // 快速选择积分
    quickPoints: [10, 20, 50, 100],

    // 日期选择范围
    today: '',
    maxDate: '',

    // 征集类型（仅征稿通知使用）
    callTypeOptions: [
      { key: 'special_issue', label: '特刊征稿' },
      { key: 'journal', label: '期刊征稿' },
      { key: 'conference', label: '会议征稿' },
      { key: 'workshop', label: 'Workshop' },
      { key: 'custom', label: '自定义' }
    ],
    callType: '',
    customCallType: '',

    // 表单数据
    title: '',
    content: '',
    images: [],
    tags: [],
    tagInput: '',

    // 图片上传
    maxImages: 9,
    uploading: false,

    // 文献互助相关字段
    docType: '',         // 文献类型
    docUrl: '',          // 文献链接
    rewardPoints: 0,     // 悬赏积分
    helpDeadline: '',    // 关闭时间
    currentPoints: 0,    // 当前用户积分

    // 用户信息
    currentOpenid: '',
    avatarUrl: '',
    nickName: ''
  },

  onLoad: function () {
    this.getUserInfo();
    this.getUserPoints();
    this.setDateRange();
  },

  // 设置日期选择范围
  setDateRange: function () {
    var today = new Date();
    var maxDate = new Date();
    maxDate.setFullYear(today.getFullYear() + 100);  // 支持选择未来100年内任意日期

    var formatDate = function (date) {
      var year = date.getFullYear();
      var month = (date.getMonth() + 1).toString().padStart(2, '0');
      var day = date.getDate().toString().padStart(2, '0');
      return year + '-' + month + '-' + day;
    };

    this.setData({
      today: formatDate(today),
      maxDate: formatDate(maxDate)
    });
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
        nickName: userInfo.nickName || '',
        // 未登录时默认匿名学者
        userInfo: userInfo
      });
    });
  },

  // 获取用户积分
  getUserPoints: function () {
    var that = this;
    wx.cloud.callFunction({
      name: 'creditsAPI',
      data: { action: 'getCreditsInfo' }
    }).then(function (res) {
      var result = res.result || {};
      that.setData({ currentPoints: result.credits || 0 });
    }).catch(function (err) {
      console.error('[publish] 获取积分失败', err);
    });
  },

  // 选择文献类型
  onDocTypeSelect: function (e) {
    var type = e.currentTarget.dataset.type;
    this.setData({ docType: type });
  },

  // 文献网址输入
  onDocUrlInput: function (e) {
    this.setData({ docUrl: e.detail.value });
  },



  // 悬赏积分输入
  onRewardPointsInput: function (e) {
    var points = parseInt(e.detail.value) || 0;
    this.setData({ rewardPoints: points });
  },

  // 快速选择积分
  onQuickPointsSelect: function (e) {
    var points = parseInt(e.currentTarget.dataset.points) || 0;
    this.setData({ rewardPoints: points });
  },

  // 求助时限选择
  onHelpDeadlineChange: function (e) {
    this.setData({ helpDeadline: e.detail.value });
  },

  // 选择类型
  onTypeSelect: function (e) {
    var type = e.currentTarget.dataset.type;
    var update = { postType: type, callType: '', customCallType: '' };
    if (type === 'literature_help') {
      // 切换到文献互助时，清空通用内容相关字段
      update.content = '';
      update.images = [];
      update.tags = [];
      update.tagInput = '';
    } else {
      // 切出文献互助时，清空文献互助字段
      update.docType = '';
      update.docUrl = '';
      update.rewardPoints = 0;
      update.helpDeadline = '';

    }
    this.setData(update);
  },

  // 选择征集类型
  onCallTypeSelect: function (e) {
    var type = e.currentTarget.dataset.type;
    this.setData({ callType: type, customCallType: type === 'custom' ? this.data.customCallType : '' });
  },

  // 自定义征集类型输入
  onCustomCallTypeInput: function (e) {
    this.setData({ customCallType: e.detail.value });
  },

  // 标题输入
  onTitleInput: function (e) {
    this.setData({ title: e.detail.value });
  },

  // 内容输入
  onContentInput: function (e) {
    this.setData({ content: e.detail.value });
  },

  // 选择图片
  chooseImage: function () {
    var that = this;
    var remain = this.data.maxImages - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传9张图片', icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var tempFiles = res.tempFiles.map(function (f) { return f.tempFilePath; });
        that.uploadImages(tempFiles);
      }
    });
  },

  // 上传图片到云存储
  uploadImages: function (filePaths) {
    var that = this;
    this.setData({ uploading: true });

    var promises = filePaths.map(function (filePath) {
      var cloudPath = 'square/' + Date.now() + '_' + Math.random().toString(36).substr(2, 8) + '.jpg';
      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      }).then(function (res) {
        return res.fileID;
      });
    });

    Promise.all(promises).then(function (fileIDs) {
      var images = that.data.images.concat(fileIDs);
      that.setData({ images: images, uploading: false });
    }).catch(function (err) {
      console.error('[publish] 图片上传失败', err);
      that.setData({ uploading: false });
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    });
  },

  // 删除图片
  deleteImage: function (e) {
    var index = e.currentTarget.dataset.index;
    var images = this.data.images;
    images.splice(index, 1);
    this.setData({ images: images });
  },

  // 标签输入
  onTagInput: function (e) {
    this.setData({ tagInput: e.detail.value });
  },

  // 添加标签
  addTag: function () {
    var tag = this.data.tagInput.trim();
    if (!tag) {
      wx.showToast({ title: '请先输入标签', icon: 'none', duration: 1500 });
      return;
    }
    if (this.data.tags.indexOf(tag) !== -1) {
      wx.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    if (this.data.tags.length >= 8) {
      wx.showToast({ title: '最多添加8个标签', icon: 'none' });
      return;
    }
    var tags = this.data.tags.concat([tag]);
    this.setData({ tags: tags, tagInput: '' });
  },

  // 点击推荐标签
  selectSuggestedTag: function (e) {
    var tag = e.currentTarget.dataset.tag;
    if (this.data.tags.indexOf(tag) !== -1) {
      wx.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    if (this.data.tags.length >= 8) {
      wx.showToast({ title: '最多添加8个标签', icon: 'none' });
      return;
    }
    var tags = this.data.tags.concat([tag]);
    this.setData({ tags: tags });
  },

  // 删除标签
  deleteTag: function (e) {
    var index = e.currentTarget.dataset.index;
    var tags = this.data.tags;
    tags.splice(index, 1);
    this.setData({ tags: tags });
  },

  // 提交发布
  submitPost: function () {
    var that = this;

    // 通用表单验证
    if (this.data.postType !== 'literature_help') {
      if (!this.data.content.trim()) {
        wx.showToast({ title: '请输入内容', icon: 'none' });
        return;
      }
      if (this.data.content.length > 2000) {
        wx.showToast({ title: '内容不能超过2000字', icon: 'none' });
        return;
      }
      if (this.data.title.length > 100) {
        wx.showToast({ title: '标题不能超过100字', icon: 'none' });
        return;
      }
    } else {
      // 文献互助标题验证
      if (this.data.title.length > 100) {
        wx.showToast({ title: '标题不能超过100字', icon: 'none' });
        return;
      }
    }

    // 文献互助类型验证
    if (this.data.postType === 'literature_help') {
      if (!this.data.title.trim()) {
        wx.showToast({ title: '请输入文献标题', icon: 'none' });
        return;
      }
      if (!this.data.docType) {
        wx.showToast({ title: '请选择文献类型', icon: 'none' });
        return;
      }
      if (!this.data.rewardPoints || this.data.rewardPoints <= 0) {
        wx.showToast({ title: '请设置悬赏积分', icon: 'none' });
        return;
      }
      if (this.data.rewardPoints > this.data.currentPoints) {
        wx.showToast({ title: '积分余额不足', icon: 'none' });
        return;
      }
      if (!this.data.helpDeadline) {
        wx.showToast({ title: '请选择关闭时间', icon: 'none' });
        return;
      }
    }

    wx.showLoading({ title: '发布中...', mask: true });

    // 内容安全检测
    var postData = {
      action: 'squareCreatePost',
      type: this.data.postType,
      title: this.data.title.trim(),
      content: this.data.content.trim(),
      images: this.data.images,
      tags: this.data.tags,
      avatarUrl: this.data.avatarUrl,
      nickName: this.data.nickName
    };

    // 征稿通知时传递征集类型
    if (this.data.postType === 'call_for_papers') {
      if (this.data.callType === 'custom') {
        postData.callType = this.data.customCallType.trim() || '其他';
      } else if (this.data.callType) {
        // 映射key到中文标签
        var callTypeMap = { 'special_issue': '特刊征稿', 'journal': '期刊征稿', 'conference': '会议征稿', 'workshop': 'Workshop' };
        postData.callType = callTypeMap[this.data.callType] || this.data.callType;
      }
    }

    // 文献互助时传递相关字段
    if (this.data.postType === 'literature_help') {
      postData.docType = this.data.docType;
      postData.docUrl = this.data.docUrl.trim();
      postData.rewardPoints = this.data.rewardPoints;
      postData.helpDeadline = this.data.helpDeadline;
      postData.helpStatus = '求助中';
    }

    wx.cloud.callFunction({
      name: 'academicAPI',
      data: postData
    }).then(function (res) {
      wx.hideLoading();
      var result = res.result || {};

      if (result.success) {
        wx.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(function () {
          wx.navigateBack();
        }, 1200);
      } else {
        wx.showToast({ title: result.error || '发布失败', icon: 'none' });
      }
    }).catch(function (err) {
      wx.hideLoading();
      console.error('[publish] 发布失败', err);
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
    });
  }
});
