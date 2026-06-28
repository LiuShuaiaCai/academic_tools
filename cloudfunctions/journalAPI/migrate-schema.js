/**
 * 数据库迁移脚本：为现有期刊添加新字段
 * 
 * 执行方式：在 journalAPI/index.js 中添加 migrateSchema action
 * 或直接在小程序云函数本地调试中执行
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 为 journals 表添加新字段
 */
async function migrateJournals() {
  console.log('开始迁移 journals 表...');
  
  const newFields = {
    // 学科分类
    subject_category: [],
    subject_subcategory: [],
    
    // 核心指标
    impact_factor: null,
    if_year: null,
    jcr_quartile: '',
    jcr_year: null,
    cas_quartile: '',
    cas_year: null,
    cas_edition: '',
    
    // 投稿相关
    acceptance_rate: null,
    review_cycle: '',
    first_decision_days: null,
    
    // 自引率
    self_citation_rate: null,
    
    // 数据来源
    metrics_source: '',
    metrics_verified: false,
    metrics_last_verified_at: null
  };
  
  try {
    // 更新所有没有这些字段的文档
    const result = await db.collection('journals')
      .where({
        impact_factor: _.exists(false)
      })
      .update({
        data: newFields
      });
    
    console.log('迁移完成，更新了', result.stats.updated, '条记录');
    
    return {
      code: 0,
      message: '迁移完成',
      data: {
        updated: result.stats.updated
      }
    };
  } catch (err) {
    console.error('迁移失败:', err.message);
    return {
      code: -1,
      message: err.message
    };
  }
}

/**
 * 从现有 topics 提取 field/subfield 到 subject_category/subject_subcategory
 */
async function extractSubjectFromTopics() {
  console.log('开始从 topics 提取学科分类...');
  
  try {
    const journals = await db.collection('journals')
      .where({
        subject_category: _.size(0)  // 只处理还没提取过的
      })
      .limit(1000)
      .get();
    
    let updated = 0;
    
    for (const journal of journals.data) {
      // 从 journal_subject 表提取
      const subjects = await db.collection('journal_subject')
        .where({ journal_id: journal._id })
        .get();
      
      if (subjects.data.length > 0) {
        const subjectCategory = [];
        const subjectSubcategory = [];
        const seen = new Set();
        
        subjects.data.forEach(s => {
          const name = s.subject_name || '';
          // 简单判断：如果包含空格或长度>30，可能是细粒度topic
          // 否则可能是学科分类
          if (name && !seen.has(name)) {
            seen.add(name);
            if (subjectCategory.length < 3) {
              subjectCategory.push(name);
            }
          }
        });
        
        await db.collection('journals').doc(journal._id).update({
          data: {
            subject_category: subjectCategory,
            subject_subcategory: subjectSubcategory
          }
        });
        
        updated++;
      }
    }
    
    console.log('提取完成，更新了', updated, '条记录');
    
    return {
      code: 0,
      message: '提取完成',
      data: {
        updated: updated
      }
    };
  } catch (err) {
    console.error('提取失败:', err.message);
    return {
      code: -1,
      message: err.message
    };
  }
}

module.exports = {
  migrateJournals,
  extractSubjectFromTopics
};
