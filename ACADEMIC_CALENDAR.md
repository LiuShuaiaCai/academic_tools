# 学术日历任务系统

## 功能概述

学术日历新增了完整的任务管理功能，包括：
1. **每日任务管理** - 每天的任务清单
2. **自定义任务** - 创建、编辑、删除任务
3. **订阅提醒** - 任务时间到达前的订阅消息提醒
4. **学术模板** - 预设的学术场景任务模板

## 数据结构

### tasks 集合

```javascript
{
  _id: '自动生成',
  title: '任务标题 (必填)',
  description: '任务描述 (可选)',
  date: 'YYYY-MM-DD',  // 任务日期
  time: 'HH:MM',        // 提醒时间 (可选)
  priority: 'low | medium | high',  // 优先级
  category: 'custom | study | research | meeting | other',  // 分类
  reminderEnabled: true,  // 是否启用提醒
  reminderMinutes: [30, 60, 1440],  // 提前提醒时间(分钟)
  isAllDay: false,       // 是否全天任务
  repeatType: 'none | daily | weekly | monthly',  // 重复类型
  repeatEndDate: 'YYYY-MM-DD',  // 重复结束日期
  completed: false,     // 是否完成
  completedTime: null,   // 完成时间
  createTime: Date,
  updateTime: Date,
  deleteTime: null       // 删除时间 (null表示未删除)
}
```

## 页面说明

### 1. 日历页面 (calendar)
- 月视图/周视图/列表视图切换
- 显示投稿、审稿、会议、任务四类事件
- 点击日期查看当天事件
- 可跳转至每日任务页面

### 2. 每日任务页面 (daily-tasks)
- 按日期查看和管理任务
- 统计完成进度
- 快速添加任务
- 学术任务模板

### 3. 任务编辑器 (task-editor)
- 创建/编辑自定义任务
- 设置优先级、分类
- 配置提醒时间和重复规则

## 云函数

### taskReminder
- 定时检查需要提醒的任务
- 通过订阅消息发送提醒
- 触发周期：每分钟

## 订阅消息配置

1. 在微信公众平台添加订阅消息模板
2. 获取模板ID后更新 `cloudfunctions/taskReminder/index.js` 中的 `TEMPLATE_ID`
3. 用户首次设置提醒时需授权订阅消息

## 使用说明

### 创建任务
1. 打开日历页面
2. 点击右上角 "+" 添加任务
3. 填写任务信息并保存

### 查看每日任务
1. 打开日历页面
2. 点击日期选中
3. 点击"每日任务"进入任务列表

### 设置提醒
1. 在任务编辑器中开启提醒
2. 选择提前提醒时间
3. 首次使用时需授权订阅消息

## 图标说明

| 分类 | 图标 | 颜色 |
|------|------|------|
| 投稿 | 📝 | 蓝色 #2563eb |
| 审稿 | 📝 | 红色 #EF4444 |
| 会议 | 📝 | 绿色 #10B981 |
| 任务 | 📝 | 紫色 #8B5CF6 |

## 学术任务模板

- 📚 文献阅读
- ✍️ 论文写作
- 📊 数据分析
- 🔬 实验记录
- 📧 邮件回复
- 📝 会议笔记
- 🎓 组会汇报
- 📄 论文投稿
