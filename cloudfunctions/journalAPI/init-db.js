// cloudfunctions/journalAPI/init-db.js
// 数据库集合与索引初始化脚本

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 初始化数据库 - 创建4张表并添加索引
 * 
 * 数据源：OpenAlex（主）+ Crossref + DOAJ + NCBI
 * 不存：文章明细（走 OpenAlex /works API实时查询）
 */
async function initDatabase() {
  const collections = [
    'journals',                      // 期刊主表（含OpenAlex ID + 核心指标快照）
    'journal_subject',               // 学科分类表（OpenAlex Topics四级层次 + DOAJ LCC）
    'journal_metrics_yearly',        // 年度统计合并表（发文/引用/作者画像/学科主题）
    'journal_warnings'               // 预警期刊表
  ];

  console.log('=== 开始创建集合 ===');
  
  for (const name of collections) {
    try {
      await db.createCollection(name);
      console.log(`✅ 创建集合: ${name}`);
    } catch (err) {
      if (err.errCode === -502001) {
        console.log(`⚠️  集合已存在: ${name}`);
      } else {
        console.error(` 创建失败: ${name}`, err.message);
      }
    }
  }

  console.log('\n=== 索引建议（需在云开发控制台手动添加）===');

  console.log('\n[journals]');
  console.log('  - openalex_id (唯一索引) ⭐');
  console.log('  - crossref_id (普通索引)');
  console.log('  - title (文本索引，用于搜索)');
  console.log('  - issn_print (普通索引)');
  console.log('  - publisher (普通索引)');
  console.log('  - is_open_access (普通索引)');
  console.log('  - is_in_doaj (普通索引)');
  console.log('  - works_count_latest (降序索引，用于排序)');
  console.log('  - cited_by_count_latest (降序索引，用于排序)');

  console.log('\n[journal_subject]');
  console.log('  - journal_id (普通索引) ⭐');
  console.log('  - source + subject_level (复合索引)');
  console.log('  - subject_name (文本索引，用于搜索)');

  console.log('\n[journal_metrics_yearly]');
  console.log('  - journal_id + year (唯一复合索引) ⭐');
  console.log('  - journal_id (普通索引)');
  console.log('  - year (普通索引)');

  console.log('\n[journal_warnings]');
  console.log('  - journal_id (普通索引)');
  console.log('  - status (普通索引，筛选active/resolved)');
  console.log('  - warning_level (普通索引，按级别排序)');

  console.log('\n=== 完成 ===');
  console.log('请在微信云开发控制台确认集合已创建，并按上述建议添加索引以提升查询性能。');

  return {
    code: 0,
    data: {
      collections: collections,
      message: '数据库初始化完成，请按需添加索引'
    }
  };
}

module.exports = { initDatabase };
