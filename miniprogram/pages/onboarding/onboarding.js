// pages/onboarding/onboarding.js

// 工具定义数据（本地备用，实际以云函数初始化的数据库为准）
var DEFAULT_TOOLS = [
  { id: 'submission', name: '投稿管理', desc: '跟踪稿件投稿进度', icon: 'paper-plane', color: 'blue', category: 'core', order: 1, comingSoon: false },
  { id: 'review',     name: '审稿任务', desc: '管理审稿deadline',   icon: 'glasses',       color: 'red',    category: 'core', order: 2, comingSoon: false },
  { id: 'conference', name: '学术会议', desc: '跟踪会议截稿日期',    icon: 'calendar-alt',  color: 'green',  category: 'core', order: 3, comingSoon: false },
  { id: 'archive',    name: '资料归档', desc: '统一管理附件文件',    icon: 'folder-open',   color: 'orange', category: 'core', order: 4, comingSoon: false },
  { id: 'citation',   name: '文献引用', desc: 'GB/T 7714、APA格式化', icon: 'quote-right',  color: 'purple', category: 'ext',  order: 5, comingSoon: true  },
  { id: 'journal',    name: '期刊预警', desc: '预警期刊、假会议检测', icon: 'exclamation-triangle', color: 'red', category: 'ext', order: 6, comingSoon: true },
  { id: 'achievement',name: '成果汇总', desc: '自动汇总论文、导出CV', icon: 'trophy',        color: 'orange', category: 'ext',  order: 7, comingSoon: true  },
  { id: 'note',       name: '学术笔记', desc: '文献阅读笔记管理',    icon: 'sticky-note',   color: 'green',  category: 'ext',  order: 8, comingSoon: true  }
];

// 按原型定义的角色工具配置
var ROLE_CONFIG = {
  researcher: ['submission', 'review', 'conference', 'archive'],
  editor: ['conference', 'archive']
};

Page({
  data: {
    step: 1,
    selectedRole: '',
    roleOptions: [
      { id: 'researcher', name: '科研人员', desc: '以投稿论文、参加学术会议为主', icon: '🎓', color: 'blue' },
      { id: 'editor', name: '学术编辑', desc: '统筹稿件、管理会议', icon: '💼', color: 'orange' }
    ],
    enabledTools: [],
    disabledTools: []
  },

  onLoad: function() {
    this.loadToolDefs();
  },

  // 从云函数加载工具定义（不再客户端直查 tools 集合）
  loadToolDefs: function() {
    var that = this;
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: { action: 'getAllTools' }
    }).then(function(res) {
      var toolDefs = res.result;
      if (!toolDefs || toolDefs.length === 0) {
        console.log('[onboarding] 工具定义为空，使用本地备用数据');
        that.processTools(DEFAULT_TOOLS);
      } else {
        that.processTools(toolDefs);
      }
    }).catch(function(e) {
      console.error('[onboarding] 加载工具定义失败:', e);
      that.processTools(DEFAULT_TOOLS);
    });
  },

  processTools: function(tools) {
    var enabled = [];
    var disabled = [];
    for (var i = 0; i < tools.length; i++) {
      var tool = tools[i];
      if (tool.comingSoon) continue;  // 未上线工具不展示
      var item = {
        id: tool.id,
        name: tool.name,
        desc: tool.desc,
        icon: tool.icon,
        color: tool.color,
        category: tool.category,
        comingSoon: tool.comingSoon
      };
      if (tool.category === 'core') {
        enabled.push(item);
      } else {
        disabled.push(item);
      }
    }
    this.setData({ enabledTools: enabled, disabledTools: disabled });
  },

  selectRole: function(e) {
    this.setData({ selectedRole: e.currentTarget.dataset.role });
  },

  goToStep2: function() {
    if (!this.data.selectedRole) {
      wx.showToast({ title: '请选择您的角色', icon: 'none' });
      return;
    }
    var roleEnabled = ROLE_CONFIG[this.data.selectedRole] || [];
    var enabledTools = [];
    var disabledTools = [];
    for (var i = 0; i < DEFAULT_TOOLS.length; i++) {
      var t = DEFAULT_TOOLS[i];
      if (t.comingSoon) continue;  // 未上线工具不展示
      if (roleEnabled.indexOf(t.id) !== -1) {
        enabledTools.push(t);
      } else {
        disabledTools.push(t);
      }
    }
    this.setData({ step: 2, enabledTools: enabledTools, disabledTools: disabledTools });
  },

  goBackToStep1: function() {
    this.setData({ step: 1 });
  },

  skipOnboarding: function() {
    var coreTools = [];
    for (var i = 0; i < DEFAULT_TOOLS.length; i++) {
      if (DEFAULT_TOOLS[i].category === 'core') {
        coreTools.push(DEFAULT_TOOLS[i]);
      }
    }
    this.setData({
      selectedRole: 'researcher',
      enabledTools: coreTools,
      disabledTools: []
    });
    this.finishOnboarding();
  },

  finishOnboarding: function() {
    var that = this;
    var role = this.data.selectedRole;
    var roleEnabled = ROLE_CONFIG[role] || [];

    wx.showLoading({ title: '保存中...' });

    // 调用云函数保存用户配置和工具配置
    wx.cloud.callFunction({
      name: 'academicAPI',
      data: {
        action: 'saveUserConfig',
        role: role
      }
    }).then(function() {
      return wx.cloud.callFunction({
        name: 'academicAPI',
        data: {
          action: 'saveUserTools',
          toolIds: roleEnabled
        }
      });
    }).then(function() {
      wx.hideLoading();
      wx.setStorageSync('hasOnboarded', true);
      wx.setStorageSync('userRole', role);
      wx.switchTab({ url: '/pages/home/home' });
    }).catch(function(e) {
      wx.hideLoading();
      console.error('[onboarding] 保存失败:', e);
      // 即使云函数失败，也允许进入首页
      wx.setStorageSync('hasOnboarded', true);
      wx.setStorageSync('userRole', role);
      wx.switchTab({ url: '/pages/home/home' });
    });
  }
});
