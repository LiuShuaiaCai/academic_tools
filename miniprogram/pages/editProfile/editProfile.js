// pages/editProfile/editProfile.js
var app = getApp();

Page({
  data: {
    profile: {
      avatar: '',
      nickname: '',
      email: '',
      orcid: '',
      hIndex: '',
      hIndexUrl: '',
      homepage: '',
      title: '',
      researchField: '',
      institution: '',
      country: '',
      province: '',
      city: '',
      profileCompleted: false
    },
    avatarUrl: '',
    isWechatAvatar: false,
    saving: false,
    region: ['', '', ''],
    regionText: '',
    titleOptions: [
      '教授', '副教授', '讲师', '助理教授',
      '研究员', '副研究员', '助理研究员',
      '博士后', '博士研究生', '硕士研究生',
      '其他'
    ]
  },

  onLoad: function() {
    this.loadProfile();
  },

  // 地区选择
  onRegionChange: function(e) {
    var values = e.detail.value; // [省, 市, 区]
    this.setData({
      region: values,
      regionText: values.join(' '),
      'profile.province': values[0],
      'profile.city': values[1] || '',
      'profile.country': '中国' // 默认中国
    });
  },

  // 加载用户资料
  loadProfile: function() {
    var self = this;
    wx.cloud.callFunction({
      name: 'creditsAPI',
      data: { action: 'getUserProfile' },
      success: function(res) {
        if (res.result && res.result.success) {
          var profile = res.result.profile || {};
          var avatarUrl = profile.avatar || '🎓';
          var isWechatAvatar = avatarUrl.indexOf('http') === 0 || avatarUrl.indexOf('cloud://') === 0;
          
          // 构建地区显示文本
          var regionText = '';
          if (profile.province) {
            regionText = profile.province;
            if (profile.city) regionText += ' ' + profile.city;
          }
          
          self.setData({
            profile: profile,
            avatarUrl: avatarUrl,
            isWechatAvatar: isWechatAvatar,
            regionText: regionText,
            region: [profile.province || '', profile.city || '', '']
          });
        }
      },
      fail: function(err) {
        console.error('[editProfile] 加载资料失败', err);
      }
    });
  },

  // 选择头像 → 自动上传云存储 → 直接写数据库，不用点保存
  onChooseAvatar: function(e) {
    var avatarUrl = e.detail.avatarUrl;
    if (!avatarUrl) return;
    var self = this;
    wx.showLoading({ title: '上传中' });
    var cloudPath = 'avatars/' + Date.now() + '.png';
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: avatarUrl
    }).then(function(uploadRes) {
      var fileID = uploadRes.fileID;
      self.setData({
        avatarUrl: fileID,
        isWechatAvatar: true,
        'profile.avatar': fileID
      });
      return new Promise(function(resolve, reject) {
        wx.cloud.callFunction({
          name: 'creditsAPI',
          data: { action: 'updateProfile', profile: { avatar: fileID } },
          success: function(r) { resolve(r); },
          fail: function(err) { reject(err); }
        });
      });
    }).then(function() {
      wx.hideLoading();
    }).catch(function(err) {
      wx.hideLoading();
      console.error('[editProfile] 头像上传失败', err);
      wx.showToast({ title: '头像上传失败', icon: 'none' });
    });
  },

  // 显示emoji选择器
  showEmojiPicker: function() {
    var emojis = ['🎓', '📚', '🔬', '🧪', '📖', '💡', '🧬', '📊', '🎯', '🏆', '📝', '🧠'];
    var self = this;
    
    wx.showActionSheet({
      itemList: emojis,
      success: function(res) {
        if (res.tapIndex >= 0) {
          self.setData({
            avatarUrl: emojis[res.tapIndex],
            isWechatAvatar: false,
            'profile.avatar': emojis[res.tapIndex]
          });
        }
      }
    });
  },

  // 输入处理
  onInput: function(e) {
    var field = e.currentTarget.dataset.field;
    var value = e.detail.value;
    this.setData({
      ['profile.' + field]: value
    });
  },

  // picker选择
  onPickerChange: function(e) {
    var field = e.currentTarget.dataset.field;
    var index = e.detail.value;
    this.setData({
      ['profile.' + field]: this.data.titleOptions[index]
    });
  },

  // 校验所有必填字段
  validateForm: function() {
    var p = this.data.profile;
    var requiredFields = [
      { field: 'nickname', label: '昵称' },
      { field: 'email', label: '邮箱' },
      { field: 'title', label: '职称' },
      { field: 'researchField', label: '研究领域' },
      { field: 'institution', label: '机构名称' },
      { field: 'province', label: '所在地' }
    ];
    
    for (var i = 0; i < requiredFields.length; i++) {
      var item = requiredFields[i];
      var value = p[item.field];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        wx.showToast({ title: '请填写' + item.label, icon: 'none', duration: 2000 });
        return false;
      }
    }
    return true;
  },

  // 保存资料
  saveProfile: function() {
    var self = this;
    if (this.data.saving) return;

    // 必填校验
    if (!this.validateForm()) return;

    this.setData({ saving: true });

    var profile = this.data.profile;
    var wasCompleted = profile.profileCompleted;

    wx.cloud.callFunction({
      name: 'creditsAPI',
      data: {
        action: 'completeProfile',
        profile: profile
      },
      success: function(res) {
        if (res.result && res.result.success) {
          var result = res.result;
          
          if (result.firstTime) {
            // 首次完善，弹窗显示奖励
            wx.showModal({
              title: '🎉 资料完善成功',
              content: '恭喜获得 ' + result.earnedPoints + ' 积分奖励！\n当前余额：' + result.credits + ' 积分',
              showCancel: false,
              success: function() {
                wx.navigateBack();
              }
            });
          } else {
            wx.showToast({ title: '保存成功', icon: 'success' });
            setTimeout(function() {
              wx.navigateBack();
            }, 1000);
          }
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
          self.setData({ saving: false });
        }
      },
      fail: function(err) {
        console.error('[editProfile] 保存失败', err);
        wx.showToast({ title: '保存失败', icon: 'none' });
        self.setData({ saving: false });
      }
    });
  }
});
