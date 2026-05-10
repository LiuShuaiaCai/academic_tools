// utils/citation/formatter.js
// 引用格式生成器（APA/MLA/Chicago/GB-T 7714/IEEE/Harvard/AMA）
// 支持多种文献类型：期刊、图书、会议、学位论文、网页
// 严格按照学术引用管理SKILL标准实现

/**
 * 获取名字的首字母缩写（去除已有标点，统一添加）
 */
function getInitials(given) {
  if (!given) return '';
  // 去除所有非字母空格字符，取每个部分的首字母并加点
  var cleaned = given.replace(/[^a-zA-Z\s]/g, '').trim();
  if (!cleaned) return '';  // 如果清理后为空（如中文），返回空字符串
  return cleaned.split(' ').filter(function(n) {
    return n.length > 0;
  }).map(function(n) {
    return n[0].toUpperCase() + '.';
  }).join(' ');
}

/**
 * 格式化单个作者
 */
function formatSingleAuthor(author, style) {
  var family = author.family || '';
  var given = author.given || '';
  
  switch (style) {
    case 'apa':
    case 'harvard':
      // APA/Harvard: LastName, Initials.
      var initials = getInitials(given);
      if (!initials) return family;
      return family + ', ' + initials;
    
    case 'mla':
    case 'chicago':
      // MLA/Chicago: LastName, FirstName (full first name)
      if (!given) return family;
      return family + ', ' + given;
    
    case 'ieee':
      // IEEE: Initials. LastName
      return getInitials(given) + ' ' + family;
    
    case 'gbt7714':
      // GB/T 7714: 姓 名（英文名取首字母，不加标点；中文名直接拼接）
      if (!given) return family;  // 如果没有名字，只返回姓
      
      // 检测是否包含中文字符
      var hasChinese = /[\u4e00-\u9fa5]/.test(family + given);
      
      if (hasChinese) {
        // 中文名字：直接拼接，无空格
        return family + given;
      } else {
        // 英文名字：姓 + 空格 + 首字母
        var initials = given.replace(/[^a-zA-Z\s]/g, '').split(' ').filter(function(n) {
          return n.length > 0;  // 过滤空字符串
        }).map(function(n) {
          return n[0].toUpperCase();
        }).join(' ');
        return family + ' ' + initials;
      }
    
    case 'ama':
      // AMA: LastName Initials（无逗号，无句点）
      if (!given) return family;
      var amaInitials = given.replace(/[^a-zA-Z\s]/g, '').split(' ').filter(function(n) {
        return n.length > 0;
      }).map(function(n) {
        return n[0].toUpperCase();
      }).join('');
      if (!amaInitials) return family;
      return family + ' ' + amaInitials;
    
    default:
      return family + ', ' + given;
  }
}

/**
 * 格式化作者列表
 */
function formatAuthors(authors, style) {
  if (!authors || authors.length === 0) return 'Unknown Author';
  
  // 根据不同格式设置最大作者数和 "et al." 文本
  var maxAuthors;
  var etAl;
  
  switch (style) {
    case 'apa':
      maxAuthors = 20; // APA 7th: 最多20位作者
      etAl = ', et al.';
      break;
    case 'mla':
      maxAuthors = 3; // MLA 9th: 最多3位作者
      etAl = ', et al.';
      break;
    case 'chicago':
      maxAuthors = 3; // Chicago 17th: 最多3位作者
      etAl = ', et al.';
      break;
    case 'ieee':
      maxAuthors = 6; // IEEE: 最多6位作者
      etAl = ', et al.';
      break;
    case 'gbt7714':
      maxAuthors = 3; // GB/T 7714: 最多3位作者
      etAl = ', 等';
      break;
    case 'harvard':
      maxAuthors = 6; // Harvard: 最多6位作者
      etAl = ', et al.';
      break;
    case 'ama':
      maxAuthors = 6; // AMA 11th: ≤6人全列，>6人列前3人+et al.
      etAl = ', et al.';
      break;
    default:
      maxAuthors = 3;
      etAl = ', et al.';
  }
  
  // 如果作者数超过最大值，只显示前 maxAuthors 位 + "et al."
  if (authors.length > maxAuthors) {
    var truncatedCount = maxAuthors;
    // AMA 11th: >6人只列前3人（而非前6人）
    if (style === 'ama') truncatedCount = 3;
    var truncated = authors.slice(0, truncatedCount);
    var formatted = truncated.map(function(author) {
      return formatSingleAuthor(author, style);
    });
    return formatAuthorsList(formatted, style) + etAl;
  }
  
  // 否则，格式化所有作者
  var formatted = authors.map(function(author) {
    return formatSingleAuthor(author, style);
  });
  
  return formatAuthorsList(formatted, style);
}

/**
 * 格式化作者列表的分隔符
 */
function formatAuthorsList(authors, style) {
  if (authors.length === 1) return authors[0];
  
  var lastSeparator;
  
  switch (style) {
    case 'apa':
      lastSeparator = ' & ';
      break;
    case 'mla':
      lastSeparator = ', and ';
      break;
    case 'chicago':
      lastSeparator = ', and ';
      break;
    case 'ieee':
      lastSeparator = ', and ';
      break;
    case 'gbt7714':
      lastSeparator = ', ';
      break;
    case 'harvard':
      lastSeparator = ', and ';
      break;
    case 'ama':
      // AMA: 所有作者之间均用逗号，无 "and"
      lastSeparator = ', ';
      break;
    default:
      lastSeparator = ' & ';
  }
  
  if (authors.length === 2) {
    if (style === 'ieee') {
      return authors[0] + ' and ' + authors[1];
    }
    return authors[0] + lastSeparator + authors[1];
  }
  
  return authors.slice(0, -1).join(', ') + lastSeparator + authors[authors.length - 1];
}

/**
 * 格式化标题（句子格式：仅首字母大写）
 */
function formatTitleSentence(title) {
  if (!title) return '';
  return title.charAt(0).toUpperCase() + title.slice(1).toLowerCase();
}

/**
 * 格式化标题（标题格式：主要单词首字母大写）
 */
function formatTitleCase(title) {
  if (!title) return '';
  var minorWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'in', 'of'];
  return title.split(' ').map(function(word, index) {
    if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1);
    if (minorWords.indexOf(word.toLowerCase()) >= 0) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

/**
 * 生成文中引用（in-text citation）
 */
function generateInTextCitation(ref, style) {
  if (!ref || !ref.authors || ref.authors.length === 0) {
    return '(Unknown, ' + (ref.year || 'n.d.') + ')';
  }
  
  var firstAuthor = ref.authors[0].family || 'Unknown';
  var year = ref.year || 'n.d.';
  
  switch (style) {
    case 'apa':
    case 'harvard':
      if (ref.authors.length === 1) {
        return '(' + firstAuthor + ', ' + year + ')';
      } else if (ref.authors.length === 2) {
        var secondAuthor = ref.authors[1].family;
        return '(' + firstAuthor + ' & ' + secondAuthor + ', ' + year + ')';
      } else {
        return '(' + firstAuthor + ' et al., ' + year + ')';
      }
    
    case 'mla':
      if (ref.authors.length === 1) {
        return '(' + firstAuthor + ')';
      } else if (ref.authors.length === 2) {
        var secondAuthor = ref.authors[1].family;
        return '(' + firstAuthor + ' and ' + secondAuthor + ')';
      } else {
        return '(' + firstAuthor + ' et al.)';
      }
    
    case 'chicago':
      return '(' + firstAuthor + ' ' + year + ')';
    
    case 'gbt7714':
    case 'ieee':
      return '[1]';
    
    case 'ama':
      // AMA: 上标数字引用
      return '¹';
    
    default:
      return '(' + firstAuthor + ', ' + year + ')';
  }
}

/**
 * 生成参考文献条目（bibliography entry）
 */
function generateBibliographyEntry(ref, style, type, number) {
  if (!ref) return '';
  
  type = type || detectType(ref);
  
  switch (style) {
    case 'apa':       return formatAPA(ref, type);
    case 'mla':       return formatMLA(ref, type);
    case 'chicago':   return formatChicago(ref, type);
    case 'gbt7714':   return formatGBT7714(ref, type, number);
    case 'ieee':      return formatIEEE(ref, type, number);
    case 'harvard':   return formatHarvard(ref, type);
    case 'ama':       return formatAMA(ref, type);
    default:          return formatAPA(ref, type);
  }
}

/**
 * 检测文献类型
 */
function detectType(ref) {
  if (ref.type) return ref.type;
  if (ref.journal) return 'journal';
  if (ref.publisher && !ref.journal) return 'book';
  if (ref.conference) return 'conference';
  if (ref.url && !ref.journal) return 'web';
  return 'journal';
}

/**
 * APA 7th Edition 格式化
 */
function formatAPA(ref, type) {
  var authors = formatAuthors(ref.authors, 'apa');
  var year = ref.year ? '(' + ref.year + ')' : '(n.d.)';
  var title = formatTitleSentence(ref.title || '');
  
  // 确保 authors 末尾有句号作为分隔符
  var authorPart = authors;
  if (!authorPart.endsWith('.')) authorPart += '.';
  
  switch (type) {
    case 'journal':
      var journal = ref.journal ? '*' + ref.journal + '*' : '';
      var volume = ref.volume ? '*' + ref.volume + '*' : '';
      var issue = ref.issue ? '(' + ref.issue + ')' : '';
      var pages = ref.pages || '';
      var doi = ref.doi ? 'https://doi.org/' + ref.doi : '';
      
      // APA期刊格式: Authors. (Year). Title. Journal, Volume(Issue), pages. DOI
      var result = authorPart + ' ' + year + '. ';
      if (title) result += title + '. ';
      if (journal) result += journal;
      if (volume || issue) {
        if (journal) result += ', ';
        result += volume + issue;
      }
      if (pages) {
        if (journal || volume || issue) result += ', ';
        result += pages;
      }
      if (doi) {
        if (journal || volume || issue || pages) result += ', ';
        result += doi;
      }
      
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!doi && !result.endsWith('.')) result += '.';
      return result;
    
    case 'book':
      var publisher = ref.publisher || '';
      var result = authorPart + ' ' + year + '. ';
      if (title) result += '*' + title + '*' + '. ';
      if (publisher) result += publisher;
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'conference':
      var conference = ref.conference ? '*' + ref.conference + '*' : '';
      var pages = ref.pages ? 'pp. ' + ref.pages : '';
      var publisher = ref.publisher || '';
      
      var result = authorPart + ' ' + year + '. ';
      if (title) result += title + '. ';
      var confParts = [];
      if (conference) confParts.push('In ' + conference);
      if (pages) confParts.push(pages);
      if (publisher) confParts.push(publisher);
      if (confParts.length > 0) result += confParts.join(', ');
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'thesis':
      var university = ref.university || '';
      var result = authorPart + ' ' + year + '. ';
      if (title) result += '*' + title + '*' + '. ';
      if (university) result += '[Doctoral dissertation, ' + university + ']';
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'web':
      var website = ref.website || '';
      var url = ref.url || '';
      var result = authorPart + ' ' + year + '. ';
      if (title) result += title + '. ';
      if (website) result += '*' + website + '*' + '. ';
      if (url) result += url;
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!url && !result.endsWith('.')) result += '.';
      return result;
    
    default:
      var result = authorPart + ' ' + year + '. ';
      if (title) result += title;
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
  }
}

/**
 * MLA 9th Edition 格式化
 */
function formatMLA(ref, type) {
  var authors = formatAuthors(ref.authors, 'mla');
  var title = ref.title ? '"' + formatTitleCase(ref.title) + '"' : '';
  
  // 确保 authors 末尾有句号
  var authorPart = authors;
  if (!authorPart.endsWith('.')) authorPart += '.';
  
  switch (type) {
    case 'journal':
      var journal = ref.journal ? '*' + ref.journal + '*' : '';
      var volume = ref.volume ? 'vol. ' + ref.volume : '';
      var issue = ref.issue ? 'no. ' + ref.issue : '';
      var year = ref.year || '';
      var pages = ref.pages ? 'pp. ' + ref.pages : '';
      
      var result = authorPart + ' ';
      if (title) result += title + ', ';
      if (journal) result += journal + ', ';
      if (volume) result += volume + ', ';
      if (issue) result += issue + ', ';
      if (year) result += year + ', ';
      if (pages) result += pages;
      result = result.replace(/,\s*$/, '');
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'book':
      var bookTitle = ref.title ? '*' + formatTitleCase(ref.title) + '*' : '';
      var publisher = ref.publisher || '';
      var year = ref.year || '';
      
      var result = authorPart + ' ';
      if (bookTitle) result += bookTitle + ', ';
      if (publisher) result += publisher + ', ';
      if (year) result += year;
      result = result.replace(/,\s*$/, '');
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'conference':
      var conference = ref.conference ? '*' + ref.conference + '*' : '';
      var year = ref.year || '';
      var pages = ref.pages ? 'pp. ' + ref.pages : '';
      
      var result = authorPart + ' ';
      if (title) result += title + ', ';
      if (conference) result += conference + ', ';
      if (year) result += year + ', ';
      if (pages) result += pages;
      result = result.replace(/,\s*$/, '');
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'thesis':
      var university = ref.university || '';
      var year = ref.year || '';
      
      var result = authorPart + ' ';
      if (title) result += title + '. ';
      var tailParts = ['Doctoral dissertation'];
      if (university) tailParts.push(university);
      if (year) tailParts.push(year);
      result += tailParts.join(', ');
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'web':
      var website = ref.website || '';
      var date = ref.date || '';
      var url = ref.url || '';
      var accessDate = ref.access_date || '';
      
      var result = authorPart + ' ';
      if (title) result += title + '. ';
      if (website) result += website + '. ';
      if (date) result += date + '. ';
      if (url) result += url + '. ';
      if (accessDate) result += 'Accessed ' + accessDate;
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    default:
      var result = authorPart + ' ';
      if (title) result += title;
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
  }
}

/**
 * Chicago 17th Edition 格式化
 */
function formatChicago(ref, type) {
  var authors = formatAuthors(ref.authors, 'chicago');
  // 确保 authors 末尾有句号
  var authorPart = authors;
  if (!authorPart.endsWith('.')) authorPart += '.';
  // Chicago格式：标题末尾句号在引号内
  var title = ref.title ? '"' + formatTitleCase(ref.title) + '."' : '';
  
  switch (type) {
    case 'journal':
      var journal = ref.journal ? '*' + ref.journal + '*' : '';
      var volume = ref.volume || '';
      var issue = ref.issue ? 'no. ' + ref.issue : '';
      var year = ref.year || '';
      var pages = ref.pages ? ': ' + ref.pages : '';
      
      // Chicago: Authors. "Title." Journal Volume, no. Issue (Year): pages.
      var parts = [authorPart];
      if (title) parts.push(title);
      if (journal) parts.push(journal);
      if (volume) parts.push(volume);
      if (issue) {
        if (volume) {
          var last = parts.pop();
          parts.push(last + ', ' + issue);
        } else {
          parts.push(issue);
        }
      }
      if (year) parts.push('(' + year + ')');
      if (pages) {
        if (year) {
          var last = parts.pop();
          parts.push(last + pages);
        } else {
          parts.push(pages);
        }
      }
      
      var result = parts.join(' ');
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'book':
      var bookTitle = ref.title ? '*' + formatTitleCase(ref.title) + '*' : '';
      var publishPlace = ref.publish_place || '';
      var publisher = ref.publisher || '';
      var year = ref.year || '';
      
      // Chicago: Authors. Title. Place: Publisher, Year.
      var result = authorPart + ' ';
      if (bookTitle) result += bookTitle + '. ';
      
      var pubParts = [];
      if (publishPlace) pubParts.push(publishPlace);
      if (publisher) pubParts.push(publisher);
      if (pubParts.length > 0) {
        result += pubParts.join(': ');
        if (year) result += ', ' + year;
      } else if (year) {
        result += year;
      }
      
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'conference':
      var conference = ref.conference ? '*' + ref.conference + '*' : '';
      var pages = ref.pages ? 'pp. ' + ref.pages : '';
      var publisher = ref.publisher || '';
      var year = ref.year || '';
      
      // Chicago: Authors. "Title." In Conference, pages. Publisher, Year.
      var result = authorPart + ' ';
      if (title) result += title + ' ';
      
      var confParts = [];
      if (conference) confParts.push('In ' + conference);
      if (pages) confParts.push(pages);
      if (publisher) confParts.push(publisher);
      if (year) confParts.push(year);
      if (confParts.length > 0) {
        result += confParts.join(', ');
      }
      
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'thesis':
      var university = ref.university || '';
      var year = ref.year || '';
      
      var result = authorPart + ' ';
      if (title) result += title + ' ';
      
      var dissParts = ['Doctoral dissertation'];
      if (university) dissParts.push(university);
      if (year) dissParts.push(year);
      result += dissParts.join(', ');
      
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'web':
      var website = ref.website || '';
      var url = ref.url || '';
      var accessDate = ref.access_date || '';
      
      // Chicago: Authors. "Title." Website. Accessed Month Day, Year. URL.
      var result = authorPart + ' ';
      if (title) result += title + ' ';
      if (website) result += website + '. ';
      if (accessDate) result += 'Accessed ' + accessDate + '. ';
      if (url) result += url;
      
      result = result.replace(/\s+/g, ' ').trim();
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    default:
      var result = authorPart;
      if (title) result += ' ' + title;
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
  }
}

/**
 * GB/T 7714-2015 格式化
 */
function formatGBT7714(ref, type, number) {
  var numberStr = number ? '[' + number + '] ' : '';
  var authors = formatAuthors(ref.authors, 'gbt7714');
  var title = ref.title || '';
  
  // 类型标识
  var typeCode = '';
  if (type === 'journal') typeCode = '[J]';
  else if (type === 'book') typeCode = '[M]';
  else if (type === 'conference') typeCode = '[C]';
  else if (type === 'thesis') typeCode = '[D]';
  else if (type === 'web') typeCode = '[EB/OL]';
  
  // 基础部分：作者. 标题[类型].
  var base = numberStr + authors + '. ' + title + typeCode + '.';
  
  switch (type) {
    case 'journal':
      var journal = ref.journal || '';
      var year = ref.year || '';
      var volume = ref.volume ? ref.volume : '';
      var issue = ref.issue ? '(' + ref.issue + ')' : '';
      var pages = ref.pages ? ': ' + ref.pages : '';
      
      // GB/T 7714期刊格式: 作者. 标题[J]. 期刊名, 年, 卷(期): 页码.
      // 使用数组收集所有部分，然后智能拼接
      var parts = [base];
      var hasContent = false;
      
      if (journal) {
        parts.push(journal);
        hasContent = true;
      }
      
      if (year) {
        parts.push(year);
        hasContent = true;
      }
      
      if (volume || issue || pages) {
        parts.push(volume + issue + pages);
        hasContent = true;
      }
      
      if (!hasContent) {
        // 没有任何后续内容，base已经有句号，直接返回
        return base;
      }
      
      // 智能拼接：在base和第一部分之间加空格，其他部分用逗号+空格连接，最后加句号
      var result = parts[0];  // base
      for (var i = 1; i < parts.length; i++) {
        if (i === 1) {
          result += ' ' + parts[i];
        } else {
          result += ', ' + parts[i];
        }
      }
      result += '.';
      
      return result.replace(/\s+/g, ' ').trim();
    
    case 'book':
      var publishPlace = ref.publish_place || '';
      var publisher = ref.publisher || '';
      var year = ref.year || '';
      
      // GB/T 7714图书格式: 作者. 标题[M]. 出版地: 出版社, 年.
      var result = base;
      
      if (publishPlace || publisher) {
        result += ' ';
        if (publishPlace && publisher) {
          result += publishPlace + ': ' + publisher;
        } else if (publishPlace) {
          result += publishPlace;
        } else {
          result += publisher;
        }
        
        if (year) result += ', ' + year + '.';
        else result += '.';
      } else if (year) {
        result += ' ' + year + '.';
      }
      
      return result.replace(/\s+/g, ' ').trim();
    
    case 'conference':
      var conference = ref.conference || '';
      var publishPlace = ref.publish_place || '';
      var publisher = ref.publisher || '';
      var year = ref.year || '';
      var pages = ref.pages ? ': ' + ref.pages : '';
      
      // GB/T 7714会议格式: 作者. 标题[C]//会议名. 出版地: 出版社, 年: 页码.
      var result = base;
      
      if (conference) {
        result += '//' + conference + '.';
      }
      
      if (publishPlace || publisher) {
        if (publishPlace && publisher) {
          result += ' ' + publishPlace + ': ' + publisher;
        } else if (publishPlace) {
          result += ' ' + publishPlace;
        } else {
          result += ' ' + publisher;
        }
        
        if (year || pages) result += ',';
      }
      
      if (year) {
        result += ' ' + year;
        if (pages) result += pages;
        result += '.';
      } else if (pages) {
        result += pages + '.';
      }
      
      // 清理末尾逗号
      result = result.replace(/,\s*$/, '.');
      
      return result.replace(/\s+/g, ' ').trim();
    
    case 'thesis':
      var place = ref.place || '';
      var university = ref.university || '';
      var year = ref.year || '';
      
      // GB/T 7714学位论文格式: 作者. 标题[D]. 地点: 大学, 年.
      var result = base;
      
      if (place || university) {
        result += ' ';
        if (place) {
          result += place + ': ' + university;
        } else {
          // 地点缺失，保留冒号
          result += ': ' + university;
        }
        
        if (year) result += ', ' + year + '.';
        else result += '.';
      } else if (year) {
        result += ' ' + year + '.';
      }
      
      return result.replace(/\s+/g, ' ').trim();
    
    case 'web':
      var publishDate = ref.publish_date || '';
      var accessDate = ref.access_date || '';
      var url = ref.url || '';
      
      // GB/T 7714网页格式: 作者. 标题[EB/OL]. (发布日期)[访问日期]. URL.
      var result = base;
      
      if (publishDate && accessDate) {
        result += ' (' + publishDate + ')[' + accessDate + '].';
      } else if (publishDate) {
        result += ' (' + publishDate + '). ';
      } else if (accessDate) {
        result += ' [' + accessDate + '].';
      }
      
      if (url) result += ' ' + url;
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    default:
      return base;
  }
}

/**
 * IEEE 格式化
 */
function formatIEEE(ref, type, number) {
  var numberStr = number ? '[' + number + '] ' : '';
  var authors = formatAuthors(ref.authors, 'ieee');
  var title = ref.title ? '"' + ref.title + '"' : '';
  
  switch (type) {
    case 'journal':
      var journal = ref.journal ? '*' + ref.journal + '*' : '';
      var volume = ref.volume ? 'vol. ' + ref.volume : '';
      var issue = ref.issue ? 'no. ' + ref.issue : '';
      var pages = ref.pages ? 'pp. ' + ref.pages : '';
      var month = ref.month || '';
      var year = ref.year || '';
      
      var datePart = (month && year) ? (month + ' ' + year) : (month || year);
      var parts = [authors, title, journal, volume, issue, pages, datePart].filter(Boolean);
      var result = parts.join(', ');
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return numberStr + result;
    
    case 'book':
      var bookTitle = ref.title ? '*' + ref.title + '*' : '';
      var publishPlace = ref.publish_place || '';
      var publisher = ref.publisher || '';
      var year = ref.year || '';
      
      var parts = [authors, bookTitle].filter(Boolean);
      
      var pubParts = [];
      if (publishPlace) pubParts.push(publishPlace);
      if (publisher) pubParts.push(publisher);
      if (pubParts.length > 0) {
        var pubStr = pubParts.join(': ');
        if (year) pubStr += ', ' + year;
        parts.push(pubStr);
      } else if (year) {
        parts.push(year);
      }
      
      var result = parts.join(', ');
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return numberStr + result;
    
    case 'conference':
      var conference = ref.conference ? '*' + ref.conference + '*' : '';
      var pages = ref.pages ? 'pp. ' + ref.pages : '';
      var publisher = ref.publisher || '';
      var year = ref.year || '';
      
      var parts = [authors, title].filter(Boolean);
      
      var confParts = [];
      if (conference) confParts.push('in ' + conference);
      if (pages) confParts.push(pages);
      if (publisher) confParts.push(publisher);
      if (year) confParts.push(year);
      if (confParts.length > 0) {
        parts.push(confParts.join(', '));
      }
      
      var result = parts.join(', ');
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return numberStr + result;
    
    case 'thesis':
      var university = ref.university || '';
      var year = ref.year || '';
      
      var parts = [authors, title].filter(Boolean);
      
      var dissParts = ['Ph.D. dissertation'];
      if (university) dissParts.push(university);
      if (year) dissParts.push(year);
      parts.push(dissParts.join(', '));
      
      var result = parts.join(', ');
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return numberStr + result;
    
    case 'web':
      var website = ref.website || '';
      var date = ref.date || '';
      var url = ref.url || '';
      
      var parts = [authors, title].filter(Boolean);
      if (website) parts.push(website);
      
      var tailParts = [];
      if (date) tailParts.push(date);
      if (url) tailParts.push('[Online]. Available: ' + url);
      if (tailParts.length > 0) {
        parts.push(tailParts.join('. '));
      }
      
      var result = parts.join(', ');
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return numberStr + result;
    
    default:
      var parts = [authors, title].filter(Boolean);
      var result = parts.join(', ');
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return numberStr + result;
  }
}

/**
 * Harvard 格式化
 */
function formatHarvard(ref, type) {
  var authors = formatAuthors(ref.authors, 'harvard');
  // 确保 authors 末尾有句号
  var authorPart = authors;
  if (!authorPart.endsWith('.')) authorPart += '.';
  var year = ref.year || '';
  var title = formatTitleSentence(ref.title || '');
  
  switch (type) {
    case 'journal':
      var journal = ref.journal ? '*' + ref.journal + '*' : '';
      var volume = ref.volume ? ref.volume : '';
      var issue = ref.issue ? '(' + ref.issue + ')' : '';
      var pages = ref.pages ? 'pp. ' + ref.pages : '';
      
      var volPart = (volume || issue) ? (volume + issue) : '';
      
      var result = authorPart + ' ';
      if (year) result += year + '. ';
      if (title) result += title + '. ';
      if (journal) result += journal;
      
      var tailParts = [];
      if (volPart) tailParts.push(volPart);
      if (pages) tailParts.push(pages);
      if (tailParts.length > 0) {
        if (journal) result += ', ';
        result += tailParts.join(', ');
      }
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'book':
      var bookTitle = title ? ('*' + title + '*') : '';
      var publishPlace = ref.publish_place || '';
      var publisher = ref.publisher || '';
      
      var placePub = '';
      if (publishPlace && publisher) {
        placePub = publishPlace + ': ' + publisher;
      } else if (publishPlace) {
        placePub = publishPlace;
      } else if (publisher) {
        placePub = publisher;
      }
      
      var result = authorPart + ' ';
      if (year) result += year + '. ';
      if (bookTitle) result += bookTitle + '. ';
      if (placePub) result += placePub;
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'conference':
      var conference = ref.conference ? '*' + ref.conference + '*' : '';
      var pages = ref.pages ? 'pp. ' + ref.pages : '';
      var publisher = ref.publisher || '';
      
      var result = authorPart + ' ';
      if (year) result += year + '. ';
      if (title) result += title + '. ';
      
      var confParts = [];
      if (conference) confParts.push('In: ' + conference);
      if (pages) confParts.push(pages);
      if (publisher) confParts.push(publisher);
      if (confParts.length > 0) {
        result += confParts.join(', ');
      }
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'thesis':
      var university = ref.university || '';
      
      var result = authorPart + ' ';
      if (year) result += year + '. ';
      if (title) result += '*' + title + '*.';
      if (university) {
        result = result.trim();
        if (!result.endsWith('.')) result += '. ';
        else result += ' ';
        result += university;
      }
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    case 'web':
      var website = ref.website || '';
      var url = ref.url || '';
      var accessDate = ref.access_date || '';
      
      var result = authorPart + ' ';
      if (year) result += year + '. ';
      if (title) result += title + '. ';
      if (website) result += website;
      
      if (url) {
        result = result.trim();
        if (!result.endsWith('.')) result += '. ';
        else result += ' ';
        result += 'Available from: ' + url;
        if (accessDate) {
          result += ' (Accessed: ' + accessDate + ')';
        }
        result += '.';
      }
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
    
    default:
      var result = authorPart + ' ';
      if (year) result += year + '. ';
      if (title) result += title;
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
  }
}

/**
 * AMA 11th Edition 格式化
 */
function formatAMA(ref, type) {
  var authors = formatAuthors(ref.authors, 'ama');
  var title = formatTitleSentence(ref.title || '');

  // 确保 authors 末尾有句号
  var authorPart = authors;
  if (!authorPart.endsWith('.')) authorPart += '.';

  switch (type) {
    case 'journal':
      var journal = ref.journal ? '*' + ref.journal + '*' : '';
      var volume = ref.volume ? '*' + ref.volume + '*' : '';
      var issue = ref.issue ? '(' + ref.issue + ')' : '';
      var year = ref.year || '';
      var pages = ref.pages || '';

      var result = authorPart + ' ';
      if (title) result += title + '. ';
      if (journal) result += journal + '. ';

      if (year) {
        result += year;
        if (volume || issue) {
          result += ';' + volume + issue;
          if (pages) result += ':' + pages;
        } else if (pages) {
          result += ':' + pages;
        }
      } else {
        if (volume || issue) {
          result += volume + issue;
          if (pages) result += ':' + pages;
        } else if (pages) {
          result += pages;
        }
      }

      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;

    case 'book':
      var bookTitle = ref.title ? '*' + ref.title + '*' : '';
      var edition = ref.edition || '';
      var publishPlace = ref.publish_place || '';
      var publisher = ref.publisher || '';
      var year = ref.year || '';

      var result = authorPart + ' ';
      if (bookTitle) result += bookTitle + '. ';
      if (edition) result += edition + '. ';

      var pubParts = [];
      if (publishPlace) pubParts.push(publishPlace);
      if (publisher) pubParts.push(publisher);
      if (pubParts.length > 0) {
        result += pubParts.join(': ') + '; ';
      }
      if (year) result += year;

      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;

    case 'conference':
      var conference = ref.conference || '';
      var publishPlace = ref.publish_place || '';
      var publisher = ref.publisher || '';
      var year = ref.year || '';
      var pages = ref.pages || '';

      var result = authorPart + ' ';
      if (title) result += title + '. ';
      if (conference) result += 'In: ' + conference + '. ';

      var pubParts = [];
      if (publishPlace) pubParts.push(publishPlace);
      if (publisher) pubParts.push(publisher);
      if (pubParts.length > 0) {
        result += pubParts.join(': ') + '; ';
      }
      if (year) result += year;
      if (pages) result += ':' + pages;

      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;

    case 'thesis':
      var university = ref.university || '';
      var year = ref.year || '';
      var degree = ref.degree || 'doctoral dissertation';

      var result = authorPart + ' ';
      if (title) result += title + ' [' + degree + ']. ';
      if (university) result += university;
      if (year) {
        if (university) result += '; ';
        result += year;
      }

      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;

    case 'web':
      var website = ref.website || '';
      var publishDate = ref.publish_date || ref.date || '';
      var accessDate = ref.access_date || '';
      var url = ref.url || '';

      var result = authorPart + ' ';
      if (title) result += title + '. ';
      if (website) result += website + '. ';
      if (publishDate) result += 'Updated ' + publishDate + '. ';
      if (accessDate) result += 'Accessed ' + accessDate + '. ';
      if (url) result += url;

      result = result.replace(/\s+/g, ' ').trim();
      if (!url && !result.endsWith('.')) result += '.';
      return result;

    default:
      var result = authorPart + ' ';
      if (title) result += title;
      result = result.replace(/\s+/g, ' ').trim();
      if (!result.endsWith('.')) result += '.';
      return result;
  }
}

module.exports = {
  generateInTextCitation: generateInTextCitation,
  generateBibliographyEntry: generateBibliographyEntry,
  formatAuthors: formatAuthors
};
