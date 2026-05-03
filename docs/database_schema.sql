-- =====================================================
-- 学术工具小程序 - 数据库表结构定义
-- 基于微信云开发 MongoDB 结构转换为 SQL 参考
-- 生成时间: 2026-05-03
-- =====================================================

-- =====================================================
-- 1. tools - 工具定义表（全局）
-- 说明: 定义系统中有哪些可用工具，所有用户共享
-- =====================================================
CREATE TABLE IF NOT EXISTS `tools` (
  `_id` VARCHAR(64) PRIMARY KEY COMMENT '数据库自动生成的主键',
  `id` VARCHAR(32) NOT NULL COMMENT '工具唯一标识(submission/review/conference/archive等)',
  `name` VARCHAR(64) NOT NULL COMMENT '工具名称(如"投稿管理")',
  `desc` VARCHAR(128) COMMENT '工具描述(如"跟踪稿件投稿进度")',
  `icon` VARCHAR(32) COMMENT '图标标识(paper-plane/glasses等，展示层映射为emoji)',
  `color` VARCHAR(16) COMMENT '颜色标识(blue/red/green/orange/purple)',
  `category` VARCHAR(16) COMMENT '分类: core(核心工具)/ext(扩展工具)',
  `order` INT DEFAULT 0 COMMENT '排序权重(1~8)',
  `comingSoon` BOOLEAN DEFAULT FALSE COMMENT '是否"即将上线"(为true时灰度显示，不可开启)',
  `createTime` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间，格式: YYYY-MM-DD HH:mm:ss',
  `updateTime` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间，格式: YYYY-MM-DD HH:mm:ss',
  `deleteTime` DATETIME DEFAULT NULL COMMENT '软删除时间，非空表示已删除，格式: YYYY-MM-DD HH:mm:ss',
  UNIQUE KEY `uk_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工具定义表(全局)';

-- 初始化工具定义数据
INSERT INTO `tools` (`id`, `name`, `desc`, `icon`, `color`, `category`, `order`, `comingSoon`, `createTime`, `updateTime`) VALUES
('submission', '投稿管理', '跟踪稿件投稿进度', 'paper-plane', 'blue', 'core', 1, FALSE, NOW(), NOW()),
('review', '审稿任务', '管理审稿deadline', 'glasses', 'red', 'core', 2, FALSE, NOW(), NOW()),
('conference', '学术会议', '跟踪会议截稿日期', 'calendar-alt', 'green', 'core', 3, FALSE, NOW(), NOW()),
('archive', '资料归档', '统一管理附件文件', 'folder-open', 'orange', 'core', 4, FALSE, NOW(), NOW()),
('citation', '文献引用', 'GB/T 7714、APA格式化', 'quote-right', 'purple', 'ext', 5, TRUE, NOW(), NOW()),
('journal', '期刊预警', '预警期刊、假会议检测', 'exclamation-triangle', 'red', 'ext', 6, TRUE, NOW(), NOW()),
('achievement', '成果汇总', '自动汇总论文、导出CV', 'trophy', 'orange', 'ext', 7, TRUE, NOW(), NOW()),
('note', '学术笔记', '文献阅读笔记管理', 'sticky-note', 'green', 'ext', 8, FALSE, NOW(), NOW());


-- =====================================================
-- 2. user_tools - 用户工具配置表
-- 说明: 保存每个用户开启/关闭哪些工具（用户级别配置）
-- =====================================================
CREATE TABLE IF NOT EXISTS `user_tools` (
  `_id` VARCHAR(64) PRIMARY KEY COMMENT '数据库主键',
  `userId` VARCHAR(128) NOT NULL COMMENT '用户ID(UNIONID或OPENID)',
  `toolId` VARCHAR(32) NOT NULL COMMENT '工具ID，关联tools.id',
  `enabled` BOOLEAN DEFAULT FALSE COMMENT '用户是否启用该工具',
  `createTime` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间，格式: YYYY-MM-DD HH:mm:ss',
  `updateTime` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间，格式: YYYY-MM-DD HH:mm:ss',
  `deleteTime` DATETIME DEFAULT NULL COMMENT '软删除时间，非空表示已删除，格式: YYYY-MM-DD HH:mm:ss',
  UNIQUE KEY `uk_user_tool` (`userId`, `toolId`),
  KEY `idx_userId` (`userId`),
  KEY `idx_toolId` (`toolId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户工具配置表';


-- =====================================================
-- 3. submissions - 投稿管理表
-- 说明: 存储用户的论文投稿记录及完整时间线
-- =====================================================
CREATE TABLE IF NOT EXISTS `submissions` (
  `_id` VARCHAR(64) PRIMARY KEY COMMENT '数据库主键',
  `title` VARCHAR(256) NOT NULL COMMENT '论文标题',
  `journal` VARCHAR(128) COMMENT '期刊/会议名称',
  `status` VARCHAR(32) DEFAULT 'preparing' COMMENT '状态: preparing/submitted/under_review/revision/resubmitted/accepted/rejected/withdrawn',
  `role` VARCHAR(32) COMMENT '作者身份: first(一作)/corresponding(通讯)/co_first(共一)/co_corresponding(共通)/collaborator(合作者)',
  `paperType` VARCHAR(32) COMMENT '论文类型: 研究论文/综述/短通信/会议论文/学位论文/预印本/其他',
  `priority` VARCHAR(16) DEFAULT 'normal' COMMENT '优先级: low/normal/high/urgent',
  `revisionDeadline` DATETIME COMMENT '修回截止日期，格式: YYYY-MM-DD HH:mm:ss',
  `nextDeadline` DATETIME COMMENT '下一个截止日期(用于日历显示)，格式: YYYY-MM-DD HH:mm:ss',
  `manuscriptId` VARCHAR(64) COMMENT '稿件编号',
  `doi` VARCHAR(128) COMMENT 'DOI',
  `url` VARCHAR(256) COMMENT '论文链接',
  `corresponding` VARCHAR(64) COMMENT '通讯作者姓名',
  `payee` VARCHAR(64) COMMENT '付款人',
  `coauthors` JSON COMMENT '合作者列表(string数组)',
  `tags` JSON COMMENT '自定义标签(string数组)',
  `fields` JSON COMMENT '学科领域(string数组)',
  `funds` JSON COMMENT '基金项目(string数组)',
  `relatedWorkId` VARCHAR(64) COMMENT '关联稿件ID(用于审稿引用)',
  `timeline` JSON COMMENT '时间线事件列表，每项含{date, event, note}',
  `attachments` JSON COMMENT '附件列表，每项含{name, size, version, fileID}',
  `createTime` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间，格式: YYYY-MM-DD HH:mm:ss',
  `updateTime` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间，格式: YYYY-MM-DD HH:mm:ss',
  `deleteTime` DATETIME DEFAULT NULL COMMENT '软删除时间，非空表示已删除，格式: YYYY-MM-DD HH:mm:ss',
  KEY `idx_status` (`status`),
  KEY `idx_journal` (`journal`),
  KEY `idx_createTime` (`createTime`),
  KEY `idx_deleteTime` (`deleteTime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='投稿管理表';


-- =====================================================
-- 4. reviews - 审稿任务表
-- 说明: 存储用户收到的审稿邀请及审稿决定记录
-- =====================================================
CREATE TABLE IF NOT EXISTS `reviews` (
  `_id` VARCHAR(64) PRIMARY KEY COMMENT '数据库主键',
  `paperTitle` VARCHAR(256) NOT NULL COMMENT '审稿论文标题',
  `journal` VARCHAR(128) COMMENT '期刊/会议名称',
  `deadline` DATETIME COMMENT '审稿截止日期，格式: YYYY-MM-DD HH:mm:ss',
  `status` VARCHAR(32) DEFAULT 'pending' COMMENT '状态: pending(待审稿)/in_progress(审稿中)/submitted(已提交)/completed(已完成)',
  `note` TEXT COMMENT '备注',
  `decision` VARCHAR(16) COMMENT '审稿决定: accept(接收)/minor(小修)/major(大修)/reject(拒稿)',
  `decisionNote` TEXT COMMENT '审稿意见',
  `decisionTime` DATETIME COMMENT '决定提交时间，格式: YYYY-MM-DD HH:mm:ss',
  `createTime` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间，格式: YYYY-MM-DD HH:mm:ss',
  `updateTime` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间，格式: YYYY-MM-DD HH:mm:ss',
  `deleteTime` DATETIME DEFAULT NULL COMMENT '软删除时间，非空表示已删除，格式: YYYY-MM-DD HH:mm:ss',
  KEY `idx_status` (`status`),
  KEY `idx_deadline` (`deadline`),
  KEY `idx_createTime` (`createTime`),
  KEY `idx_deleteTime` (`deleteTime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审稿任务表';


-- =====================================================
-- 5. conferences - 学术会议表
-- 说明: 存储学术会议信息及重要日期
-- =====================================================
CREATE TABLE IF NOT EXISTS `conferences` (
  `_id` VARCHAR(64) PRIMARY KEY COMMENT '数据库主键',
  `name` VARCHAR(256) NOT NULL COMMENT '会议全称',
  `shortName` VARCHAR(64) COMMENT '会议简称',
  `location` VARCHAR(128) COMMENT '举办地点',
  `deadline` DATETIME COMMENT '截稿日期，格式: YYYY-MM-DD HH:mm:ss',
  `notificationDate` DATETIME COMMENT '录用通知日期，格式: YYYY-MM-DD HH:mm:ss',
  `startDate` DATETIME COMMENT '会议开始日期，格式: YYYY-MM-DD HH:mm:ss',
  `url` VARCHAR(256) COMMENT '会议官网链接',
  `note` TEXT COMMENT '备注',
  `createTime` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间，格式: YYYY-MM-DD HH:mm:ss',
  `updateTime` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间，格式: YYYY-MM-DD HH:mm:ss',
  `deleteTime` DATETIME DEFAULT NULL COMMENT '软删除时间，非空表示已删除，格式: YYYY-MM-DD HH:mm:ss',
  KEY `idx_deadline` (`deadline`),
  KEY `idx_startDate` (`startDate`),
  KEY `idx_createTime` (`createTime`),
  KEY `idx_deleteTime` (`deleteTime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学术会议表';


-- =====================================================
-- 6. archives - 资料归档表
-- 说明: 存储用户上传的附件文件信息
-- =====================================================
CREATE TABLE IF NOT EXISTS `archives` (
  `_id` VARCHAR(64) PRIMARY KEY COMMENT '数据库主键',
  `name` VARCHAR(256) NOT NULL COMMENT '文件名',
  `size` BIGINT DEFAULT 0 COMMENT '文件大小(字节)',
  `ext` VARCHAR(16) COMMENT '文件扩展名(pdf/docx/png等)',
  `category` VARCHAR(32) DEFAULT 'other' COMMENT '分类: submission(投稿相关)/image(图片)/other(其他)',
  `fileID` VARCHAR(256) COMMENT '微信云存储文件ID(用于下载/删除)',
  `createTime` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间，格式: YYYY-MM-DD HH:mm:ss',
  `updateTime` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间，格式: YYYY-MM-DD HH:mm:ss',
  `deleteTime` DATETIME DEFAULT NULL COMMENT '软删除时间，非空表示已删除，格式: YYYY-MM-DD HH:mm:ss',
  KEY `idx_category` (`category`),
  KEY `idx_ext` (`ext`),
  KEY `idx_createTime` (`createTime`),
  KEY `idx_deleteTime` (`deleteTime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资料归档表';


-- =====================================================
-- 7. user_config - 用户配置表
-- 说明: 存储用户的角色选择及配置信息
-- =====================================================
CREATE TABLE IF NOT EXISTS `user_config` (
  `_id` VARCHAR(64) PRIMARY KEY COMMENT '数据库主键',
  `userId` VARCHAR(128) COMMENT '用户ID(UNIONID或OPENID)',
  `role` VARCHAR(32) COMMENT '用户角色: researcher(科研人员)/reviewer(审稿人)/editor(学术编辑)',
  `createTime` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '配置创建时间，格式: YYYY-MM-DD HH:mm:ss',
  `updateTime` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '配置更新时间，格式: YYYY-MM-DD HH:mm:ss',
  `deleteTime` DATETIME DEFAULT NULL COMMENT '软删除时间，非空表示已删除，格式: YYYY-MM-DD HH:mm:ss',
  KEY `idx_userId` (`userId`),
  KEY `idx_role` (`role`),
  KEY `idx_deleteTime` (`deleteTime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户配置表';


-- =====================================================
-- 视图: 投稿日历视图 (用于calendar页面查询)
-- 说明: 软删除记录自动过滤
-- =====================================================
CREATE OR REPLACE VIEW `v_submissions_calendar` AS
SELECT
  _id AS id,
  title,
  journal,
  status,
  revisionDeadline AS eventDate,
  'submission' AS source,
  'orange' AS color,
  CONCAT('修回截止: ', title) AS title_display
FROM submissions
WHERE deleteTime IS NULL AND revisionDeadline IS NOT NULL

UNION ALL

SELECT
  _id AS id,
  title,
  journal,
  status,
  createTime AS eventDate,
  'submission' AS source,
  'blue' AS color,
  CONCAT('投稿: ', title) AS title_display
FROM submissions
WHERE deleteTime IS NULL AND status = 'submitted';


-- =====================================================
-- 视图: 审稿日历视图
-- =====================================================
CREATE OR REPLACE VIEW `v_reviews_calendar` AS
SELECT
  _id AS id,
  paperTitle AS title,
  journal,
  status,
  deadline AS eventDate,
  'review' AS source,
  'red' AS color,
  CONCAT('审稿截止: ', paperTitle) AS title_display
FROM reviews
WHERE deleteTime IS NULL AND deadline IS NOT NULL;


-- =====================================================
-- 视图: 会议日历视图
-- =====================================================
CREATE OR REPLACE VIEW `v_conferences_calendar` AS
SELECT
  _id AS id,
  name AS title,
  shortName AS journal,
  'submitted' AS status,
  deadline AS eventDate,
  'conference' AS source,
  'green' AS color,
  CONCAT('截稿: ', name) AS title_display
FROM conferences
WHERE deleteTime IS NULL AND deadline IS NOT NULL;


-- =====================================================
-- 视图: 用户已启用工具视图
-- 说明: 获取某用户已开启的工具列表
-- =====================================================
CREATE OR REPLACE VIEW `v_user_enabled_tools` AS
SELECT
  ut.userId,
  ut.toolId,
  t.name,
  t.desc,
  t.icon,
  t.color,
  t.category,
  t.order,
  t.comingSoon,
  ut.enabled
FROM user_tools ut
JOIN tools t ON ut.toolId = t.id
WHERE ut.deleteTime IS NULL AND t.deleteTime IS NULL AND ut.enabled = TRUE;


-- =====================================================
-- 索引汇总
-- =====================================================
-- submissions 表索引
CREATE INDEX idx_submissions_status_time ON submissions(`status`, `createTime`);
CREATE INDEX idx_submissions_journal_time ON submissions(`journal`, `createTime`);

-- reviews 表索引
CREATE INDEX idx_reviews_status_deadline ON reviews(`status`, `deadline`);

-- conferences 表索引
CREATE INDEX idx_conferences_deadline_date ON conferences(`deadline`, `startDate`);

-- archives 表索引
CREATE INDEX idx_archives_category_time ON archives(`category`, `createTime`);

-- user_tools 表索引
CREATE INDEX idx_user_tools_enabled ON user_tools(`userId`, `enabled`);


-- =====================================================
-- 通用查询过滤条件说明
-- =====================================================
-- 所有查询应默认加上: WHERE deleteTime IS NULL
-- 软删除操作: UPDATE table SET deleteTime = NOW() WHERE ...
-- 而不是: DELETE FROM table WHERE ...


-- =====================================================
-- 时间格式说明
-- =====================================================
-- 所有时间字段统一使用: YYYY-MM-DD HH:mm:ss
-- 示例: 2026-05-03 15:43:28
-- MySQL类型: DATETIME 或 TIMESTAMP
-- 小程序端类型: Date 对象，保存时格式化为字符串
