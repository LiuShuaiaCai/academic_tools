/**
 * 审稿模板预置数据
 * 各大出版商通用审稿模板（每个出版商一个模板，推荐决定作为最终选项）
 */

var PUBLISHERS = [
  { id: 'elsevier', name: 'Elsevier', color: '#FF8200' },
  { id: 'springer', name: 'Springer Nature', color: '#1A6FB1' },
  { id: 'ieee', name: 'IEEE', color: '#0066B3' },
  { id: 'wiley', name: 'Wiley', color: '#E48B14' },
  { id: 'acm', name: 'ACM', color: '#F15A29' },
  { id: 'oae', name: 'OAE', color: '#0EA5E9' },
  { id: 'conference', name: '顶会/顶刊', color: '#6B21A8' },
  { id: 'general', name: '通用模板', color: '#6B7280' }
];

var TEMPLATES = [
  // ==================== Elsevier ====================
  {
    name: 'Elsevier 审稿模板',
    publisher: 'elsevier',
    icon: '📖',
    items: [
      { type: 'radio', label: '创新性', options: ['⭐ 不足', '⭐⭐ 有限', '⭐⭐⭐ 较好', '⭐⭐⭐⭐ 突出'] },
      { type: 'radio', label: '方法论', options: ['不足', '可接受', '扎实', '优秀'] },
      { type: 'radio', label: '实验质量', options: ['不足', '基本可信', '充分', '完备'] },
      { type: 'radio', label: '写作表达', options: ['需大改', '可接受', '流畅', '优秀'] },
      { type: 'checkbox', label: '主要问题', options: ['理论推导有误', '实验设计缺陷', '对比基准不足', '图表质量差', '文献综述不全'] },
      { type: 'radio', label: '推荐决定', options: ['接收', '小修', '大修', '拒稿'] },
      { type: 'text', label: '详细意见', placeholder: '请详细列出审稿意见和修改建议...' }
    ]
  },

  // ==================== Springer Nature ====================
  {
    name: 'Springer Nature 审稿模板',
    publisher: 'springer',
    icon: '📗',
    items: [
      { type: 'radio', label: '科学贡献', options: ['有限', '中等', '显著', '突出'] },
      { type: 'radio', label: '技术质量', options: ['需改进', '可接受', '良好', '优秀'] },
      { type: 'radio', label: '实验严谨性', options: ['严重不足', '有缺陷', '基本可靠', '严谨'] },
      { type: 'radio', label: '表达清晰度', options: ['待改进', '基本清晰', '清晰', '非常清晰'] },
      { type: 'checkbox', label: '需改进项', options: ['理论分析', '实验验证', '写作表达', '图表质量', '参考文献'] },
      { type: 'radio', label: '推荐决定', options: ['接收', '小修', '大修', '拒稿'] },
      { type: 'text', label: '审稿意见', placeholder: '请详细说明审稿意见和修改要求...' }
    ]
  },

  // ==================== IEEE ====================
  {
    name: 'IEEE 审稿模板',
    publisher: 'ieee',
    icon: '📘',
    items: [
      { type: 'radio', label: '创新性', options: ['⭐ 一般', '⭐⭐ 较好', '⭐⭐⭐ 优秀', '⭐⭐⭐⭐ 突出'] },
      { type: 'radio', label: '技术深度', options: ['⭐ 浅显', '⭐⭐ 适中', '⭐⭐⭐ 深入', '⭐⭐⭐⭐ 突出'] },
      { type: 'radio', label: '实验评估', options: ['⭐ 不足', '⭐⭐ 基本', '⭐⭐⭐ 充分', '⭐⭐⭐⭐ 完备'] },
      { type: 'radio', label: '写作质量', options: ['⭐ 待改进', '⭐⭐ 可接受', '⭐⭐⭐ 良好', '⭐⭐⭐⭐ 优秀'] },
      { type: 'checkbox', label: '主要问题', options: ['理论推导', '算法设计', '实验设置', '对比分析', '写作表达'] },
      { type: 'radio', label: '推荐决定', options: ['接收', '小修', '大修', '拒稿'] },
      { type: 'text', label: '详细意见', placeholder: '请详细列出需要修改的内容...' }
    ]
  },

  // ==================== Wiley ====================
  {
    name: 'Wiley 审稿模板',
    publisher: 'wiley',
    icon: '📙',
    items: [
      { type: 'radio', label: '研究价值', options: ['一般', '较好', '显著', '突出'] },
      { type: 'radio', label: '方法学', options: ['需改进', '可接受', '良好', '优秀'] },
      { type: 'radio', label: '数据质量', options: ['不足', '基本可信', '充分', '优秀'] },
      { type: 'radio', label: '写作表达', options: ['需改进', '可接受', '良好', '优秀'] },
      { type: 'checkbox', label: '主要问题', options: ['方法缺陷', '数据不足', '对比不充分', '文献不全', '写作混乱'] },
      { type: 'radio', label: '推荐决定', options: ['接收', '小修', '大修', '拒稿'] },
      { type: 'text', label: '审稿意见', placeholder: '请详细列出审稿意见...' }
    ]
  },

  // ==================== ACM ====================
  {
    name: 'ACM 审稿模板',
    publisher: 'acm',
    icon: '📕',
    items: [
      { type: 'radio', label: '原创性', options: ['⭐ 一般', '⭐⭐ 较好', '⭐⭐⭐ 优秀', '⭐⭐⭐⭐ 突出'] },
      { type: 'radio', label: '技术质量', options: ['⭐ 需改进', '⭐⭐ 可接受', '⭐⭐⭐ 优秀', '⭐⭐⭐⭐ 突出'] },
      { type: 'radio', label: '实验结果', options: ['⭐ 不足', '⭐⭐ 充分', '⭐⭐⭐ 完备', '⭐⭐⭐⭐ 突出'] },
      { type: 'radio', label: '写作质量', options: ['⭐ 待改进', '⭐⭐ 可接受', '⭐⭐⭐ 良好', '⭐⭐⭐⭐ 优秀'] },
      { type: 'checkbox', label: '评价维度', options: ['原创性', '技术质量', '实验', '写作', '可复现性'] },
      { type: 'radio', label: '推荐决定', options: ['接收', '小修', '大修', '拒稿'] },
      { type: 'text', label: '审稿意见', placeholder: '请补充具体审稿意见...' }
    ]
  },

  // ==================== OAE ====================
  {
    name: 'OAE 审稿模板',
    publisher: 'oae',
    icon: '🔬',
    items: [
      { type: 'radio', label: '原创性与新颖性', options: ['A-很好', 'B-好', 'C-一般', 'D-较弱', '不予评论'] },
      { type: 'radio', label: '重要性/意义', options: ['A-很好', 'B-好', 'C-一般', 'D-较弱', '不予评论'] },
      { type: 'radio', label: '展示质量', options: ['A-很好', 'B-好', 'C-一般', 'D-较弱', '不予评论'] },
      { type: 'radio', label: '科学严谨性与数据质量', options: ['A-很好', 'B-好', 'C-一般', 'D-较弱', '不予评论'] },
      { type: 'radio', label: '英语水平', options: ['A-很好', 'B-好', 'C-一般', 'D-较弱', '不予评论'] },
      { type: 'radio', label: '总体价值', options: ['Top 10% 杰出', 'Top 10-20% 优秀', 'Top 20-50% 良好', 'Top 50% 以下 较弱'] },
      { type: 'checkbox', label: '是/否判断', options: ['主题适合本刊', '结论合理', '实验步骤描述充分', '涉及伦理问题', '使用了AI辅助审稿'] },
      { type: 'text', label: '给编辑的评论', placeholder: '仅编辑可见，不告知作者...' },
      { type: 'text', label: '给作者的评论', placeholder: '作者可见，请提供建设性意见...' },
      { type: 'radio', label: '推荐决定', options: ['接受', '小修后接受', '大修后再审', '拒稿'] }
    ]
  },

  // ==================== 顶会/顶刊 ====================
  {
    name: '顶会/顶刊审稿模板',
    publisher: 'conference',
    icon: '🏆',
    items: [
      { type: 'radio', label: '评分', options: ['1-强拒', '2-拒稿', '3-弱拒', '4-中性', '5-弱接收', '6-接收', '7-强接收'] },
      { type: 'radio', label: '置信度', options: ['1-低', '2-中低', '3-中', '4-中高', '5-高'] },
      { type: 'checkbox', label: '优点', options: ['新颖性', '技术深度', '实验充分', '写作清晰', '可复现'] },
      { type: 'checkbox', label: '缺点', options: ['创新不足', '方法缺陷', '实验不足', '写作差', '不可复现'] },
      { type: 'radio', label: '推荐决定', options: ['接收', '小修', '大修', '拒稿'] },
      { type: 'text', label: '审稿意见', placeholder: '请填写详细审稿意见...' }
    ]
  },

  // ==================== 通用 ====================
  {
    name: '通用审稿模板',
    publisher: 'general',
    icon: '📝',
    items: [
      { type: 'radio', label: '创新性', options: ['不足', '有限', '较好', '突出'] },
      { type: 'radio', label: '方法论', options: ['需改进', '可接受', '扎实', '优秀'] },
      { type: 'radio', label: '实验数据', options: ['不足', '基本可信', '充分', '完备'] },
      { type: 'radio', label: '写作表达', options: ['待改进', '可接受', '流畅', '优秀'] },
      { type: 'checkbox', label: '需改进', options: ['理论分析', '实验设计', '数据质量', '文献综述', '写作表达', '图表质量'] },
      { type: 'radio', label: '推荐决定', options: ['接收', '小修', '大修', '拒稿'] },
      { type: 'text', label: '详细意见', placeholder: '请详细列出审稿意见和修改建议...' }
    ]
  }
];

module.exports = {
  PUBLISHERS: PUBLISHERS,
  TEMPLATES: TEMPLATES
};
