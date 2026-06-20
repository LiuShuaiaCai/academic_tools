// pages/onboarding/onboarding.js

// 工具定义数据（本地备用，实际以云函数初始化的数据库为准）
var DEFAULT_TOOLS = [
  { id: 'submission', name: '投稿管理', desc: '跟踪稿件投稿进度', icon: 'paper-plane', color: 'blue', category: 'core', order: 1, comingSoon: false },
  { id: 'review',     name: '审稿任务', desc: '管理审稿deadline',   icon: 'glasses',       color: 'red',    category: 'core', order: 2, comingSoon: false },
  { id: 'conference', name: '学术会议', desc: '跟踪会议截稿日期',    icon: 'calendar-alt',  color: 'green',  category: 'core', order: 3, comingSoon: false },
  { id: 'archive',    name: '资料归档', desc: '统一管理附件文件',    icon: 'folder-open',   color: 'orange', category: 'core', order: 4, comingSoon: false },
  { id: 'specialIssue', name: '特刊策划', desc: 'AI辅助策划特刊选题方案', icon: 'lightbulb', color: 'purple', category: 'core', order: 5, comingSoon: false },
  { id: 'citation',   name: '文献引用', desc: 'GB/T 7714、APA格式化', icon: 'quote-right',  color: 'purple', category: 'ext',  order: 6, comingSoon: true  },
  { id: 'journal',    name: '期刊预警', desc: '预警期刊、假会议检测', icon: 'exclamation-triangle', color: 'red', category: 'ext', order: 6, comingSoon: true },
  { id: 'achievement',name: '成果汇总', desc: '自动汇总论文、导出CV', icon: 'trophy',        color: 'orange', category: 'ext',  order: 7, comingSoon: true  },
  { id: 'note',       name: '学术笔记', desc: '文献阅读笔记管理',    icon: 'sticky-note',   color: 'green',  category: 'ext',  order: 8, comingSoon: true  }
];

// 按原型定义的角色工具配置
var ROLE_CONFIG = {
  researcher: ['submission', 'review', 'conference', 'archive'],
  editor: ['specialIssue', 'conference', 'archive']
};

// 图标名称到 emoji 的映射
var ICON_EMOJI_MAP = {
  'paper-plane': '📄', 'glasses': '👓', 'calendar-alt': '📅',
  'folder-open': '📁', 'lightbulb': '💡', 'quote-right': '📝',
  'exclamation-triangle': '⚠️', 'trophy': '🏆', 'sticky-note': '📌'
};

Page({
  data: {
    step: 1,
    selectedRole: '',
    roleOptions: [
      { id: 'researcher', name: '科研人员', desc: '统筹管理论文投稿、审稿、学术会议等', icon: '🎓', color: 'blue' },
      { id: 'editor', name: '学术编辑', desc: '统筹稿件编审，策划期刊特刊等', icon: '💼', color: 'orange' }
    ],
    enabledTools: [],
    disabledTools: []
  },

  onLoad: function() {
    this.loadToolDefs();
  },

  // 从缓存加载工具定义（首次查云函数，后续走本地缓存）
  loadToolDefs: function() {
    var that = this;
    var toolCache = require('../../utils/toolCache.js');
    toolCache.getAllTools().then(function(toolDefs) {
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
        iconEmoji: ICON_EMOJI_MAP[tool.icon] || '🔧',
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
      var toolItem = {
        id: t.id,
        name: t.name,
        desc: t.desc,
        iconEmoji: ICON_EMOJI_MAP[t.icon] || '🔧',
        color: t.color,
        category: t.category,
        comingSoon: t.comingSoon
      };
      if (roleEnabled.indexOf(t.id) !== -1) {
        enabledTools.push(toolItem);
      } else {
        disabledTools.push(toolItem);
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
      var t = DEFAULT_TOOLS[i];
      if (t.category === 'core' && !t.comingSoon) {
        coreTools.push({
          id: t.id, name: t.name, desc: t.desc,
          iconEmoji: ICON_EMOJI_MAP[t.icon] || '🔧',
          color: t.color, category: t.category, comingSoon: t.comingSoon
        });
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
