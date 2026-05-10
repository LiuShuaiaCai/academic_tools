// utils/citation/crossref.js
// 调用 Crossref API 获取文献元数据

const CROSSREF_API_BASE = 'https://api.crossref.org/works';

/**
 * 通过 DOI 获取文献信息
 * @param {string} doi - 文献 DOI
 * @returns {Promise<object>} 文献信息
 */
function fetchByDOI(doi) {
  return new Promise(function(resolve, reject) {
    wx.request({
      url: CROSSREF_API_BASE + '/' + encodeURIComponent(doi),
      method: 'GET',
      success: function(res) {
        if (res.statusCode === 200 && res.data && res.data.message) {
          var msg = res.data.message;
          resolve(parseCrossrefWork(msg));
        } else {
          reject(new Error('未找到该 DOI 对应的文献'));
        }
      },
      fail: function(err) {
        reject(new Error('网络请求失败：' + (err.errMsg || '未知错误')));
      }
    });
  });
}

/**
 * 通过标题搜索文献
 * @param {string} title - 文献标题
 * @param {number} rows - 返回数量，默认5
 * @returns {Promise<Array>} 文献列表
 */
function searchByTitle(title, rows) {
  rows = rows || 5;
  return new Promise(function(resolve, reject) {
    wx.request({
      url: CROSSREF_API_BASE,
      method: 'GET',
      data: {
        query: title,
        rows: rows,
        sort: 'relevance'
      },
      success: function(res) {
        if (res.statusCode === 200 && res.data && res.data.message) {
          var items = res.data.message.items || [];
          var results = [];
          for (var i = 0; i < items.length; i++) {
            results.push(parseCrossrefWork(items[i]));
          }
          resolve(results);
        } else {
          reject(new Error('搜索失败'));
        }
      },
      fail: function(err) {
        reject(new Error('网络请求失败：' + (err.errMsg || '未知错误')));
      }
    });
  });
}

/**
 * 解析 Crossref 返回的数据结构
 * @param {object} work - Crossref work 对象
 * @returns {object} 标准化的文献对象
 */
function parseCrossrefWork(work) {
  var authors = [];
  if (work.author && work.author.length > 0) {
    for (var i = 0; i < work.author.length; i++) {
      var a = work.author[i];
      authors.push({
        family: a.family || '',
        given: a.given || ''
      });
    }
  }

  var containerTitle = '';
  if (work['container-title'] && work['container-title'].length > 0) {
    containerTitle = work['container-title'][0];
  }

  var issuedDate = null;
  if (work.issued && work.issued['date-parts'] && work.issued['date-parts'][0]) {
    var parts = work.issued['date-parts'][0];
    issuedDate = parts[0] ? String(parts[0]) : '';
    if (parts[1]) issuedDate += '-' + String(parts[1]).padStart(2, '0');
    if (parts[2]) issuedDate += '-' + String(parts[2]).padStart(2, '0');
  }

  return {
    doi: work.DOI || '',
    title: work.title && work.title.length > 0 ? work.title[0] : '',
    authors: authors,
    containerTitle: containerTitle,
    volume: work.volume || '',
    issue: work.issue || '',
    page: work.page || '',
    publishedDate: issuedDate,
    year: issuedDate ? parseInt(issuedDate.substring(0, 4)) : null,
    publisher: work.publisher || '',
    type: mapCrossrefType(work.type),
    url: work.URL || (work.DOI ? 'https://doi.org/' + work.DOI : '')
  };
}

/**
 * 映射 Crossref 类型到本地类型
 */
function mapCrossrefType(type) {
  var typeMap = {
    'journal-article': 'journal',
    'book': 'book',
    'book-chapter': 'book_chapter',
    'proceedings-article': 'conference',
    'dissertation': 'thesis',
    'report': 'report',
    'journal-issue': 'journal',
    'book-series': 'book',
    'edited-book': 'book',
    'monograph': 'book'
  };
  return typeMap[type] || 'other';
}

module.exports = {
  fetchByDOI: fetchByDOI,
  searchByTitle: searchByTitle,
  parseCrossrefWork: parseCrossrefWork
};
