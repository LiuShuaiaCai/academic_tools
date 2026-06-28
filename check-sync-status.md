# 期刊列表不显示 - 排查指南

## 问题现象
同步了一部分数据，但期刊列表页面没有显示任何内容。

## 可能原因及解决方案

### 1️ 云函数未部署（最常见）

**症状**：前端调用云函数返回旧版本逻辑或报错

**解决步骤**：
```bash
# 方法1：使用微信开发者工具部署
1. 打开微信开发者工具
2. 右键点击 cloudfunctions/journalAPI 文件夹
3. 选择"上传并部署：云端安装依赖"
4. 等待部署完成

# 方法2：使用命令行部署（如果配置了 CLI）
cd d:\WeChatProjects\academic_tools
tcb functions deploy journalAPI --force
```

**验证**：部署后在云开发控制台 → 云函数 → journalAPI → 日志，查看是否有新版本的执行记录

---

### 2️ 数据库权限未配置

**症状**：云函数查询数据库返回空数组 `[]`

**解决步骤**：
1. 打开微信云开发控制台
2. 进入"数据库" → "数据权限"
3. 找到 `journals`、`journal_subject`、`journal_metrics_yearly` 三个集合
4. 设置权限为：
   - **所有用户可读**：✅ 勾选
   - **仅创建者可写**：❌ 不勾选（改为"所有用户可写"或"仅管理员可写"）

**或者通过云函数初始化脚本设置**：
```javascript
// 在云开发控制台 → 云函数 → journalAPI → 测试中执行
{
  "action": "initDatabase"
}
```

---

### 3️⃣ 数据同步失败或格式错误

**症状**：数据库中有数据，但字段缺失或值为 null

**检查步骤**：
1. 打开云开发控制台 → 数据库 → journals 集合
2. 执行查询：`journals.limit(5).get()`
3. 检查返回的数据是否包含以下字段：
   ```json
   {
     "_id": "xxx",
     "openalex_id": "S123456789",
     "title": "Journal Name",
     "issn_print": "1234-5678",
     "publisher": "Publisher Name",
     "works_count_latest": 100,
     "cited_by_count_latest": 500,
     "h_index_latest": 20,
     "is_open_access": false,
     "is_in_doaj": false,
     "has_pmid": false,
     "has_pmc": false
   }
   ```

**如果数据为空或格式不对**：
重新执行同步：
```json
// 在云开发控制台 → 云函数 → journalAPI → 测试中执行
{
  "action": "syncFromOpenAlex",
  "maxPages": 1,
  "perPage": 200,
  "delay": 2000
}
```

查看云函数日志，确认是否有错误信息。

---

### 4️⃣ 前端缓存问题

**症状**：云函数已更新，但前端仍显示旧数据

**解决步骤**：
1. 在微信开发者工具中，点击"清缓存" → "清除全部缓存"
2. 重新编译小程序
3. 或在真机上删除小程序后重新扫码体验版

---

### 5️ 排序字段导致查询失败

**症状**：云函数报错 `orderBy field not found`

**原因**：`works_count_latest` 字段在某些记录中不存在或为 null

**已修复**：已在 `index.js` 的 `searchJournals` 函数中处理，现在会正确排序。

---

## 快速诊断流程

### Step 1: 检查云函数是否最新
```bash
# 在云开发控制台查看 journalAPI 的云函数代码
# 确认包含以下导入语句：
const { syncFromOpenAlex, supplementFromCrossref, supplementDOAJAndNCBI } = require('./journal-sync');
```

### Step 2: 检查数据库是否有数据
```javascript
// 在云开发控制台 → 数据库 → journals 集合中执行
db.collection('journals').count()
// 应该返回 > 0 的数字
```

### Step 3: 手动测试云函数
```json
// 在云开发控制台 → 云函数 → journalAPI → 测试中执行
{
  "action": "searchJournals",
  "page": 1,
  "pageSize": 10
}
```

**预期返回**：
```json
{
  "code": 0,
  "data": {
    "total": 100,
    "page": 1,
    "per_page": 10,
    "journals": [
      {
        "_id": "xxx",
        "title": "Journal Name",
        "works_count_latest": 100,
        ...
      }
    ]
  }
}
```

### Step 4: 检查前端网络请求
1. 打开微信开发者工具的"调试器" → "Network"
2. 刷新期刊列表页
3. 查看 `cloud.callFunction` 请求的返回值
4. 确认 `result.code === 0` 且 `result.data.journals.length > 0`

---

## 常见错误及修复

### 错误1: `ReferenceError: httpGet is not defined`
**原因**：`getJournalArticles` 函数中使用了 `httpGet` 但未定义  
**修复**：已在 `index.js` 中添加 `httpGet` 和 `httpGetOnce` 函数定义 ✅

### 错误2: `orderBy: fail Error: errCode: -501007`
**原因**：排序字段不存在  
**修复**：确保同步的数据包含 `works_count_latest` 字段，或使用默认值 0 ✅

### 错误3: 返回空数组 `journals: []`
**原因**：数据库查询条件过严或无数据  
**修复**：检查 filters 参数，或直接查询不带筛选条件的数据

---

## 推荐操作顺序

1. ✅ **先部署云函数**（最重要！）
2. ✅ **检查数据库权限**
3. ✅ **重新同步少量数据测试**（maxPages: 1）
4. ✅ **清除前端缓存并重新编译**
5. ✅ **查看云函数日志确认无报错**

---

## 联系支持

如果以上步骤都无法解决，请提供：
1. 云函数部署后的执行日志（云开发控制台 → 云函数 → journalAPI → 日志）
2. 数据库中前3条期刊数据的截图
3. 前端 Network 面板中 cloud.callFunction 的完整返回结果
