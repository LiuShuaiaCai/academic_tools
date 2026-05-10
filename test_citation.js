// 测试脚本 - 验证所有引用格式
const formatter = require('./miniprogram/utils/citation/formatter.js');

// DOI 10.1038/227680a0 的元数据（期刊文章）
const journalArticle = {
  title: 'Cleavage of structural proteins during the assembly of the head of bacteriophage T4',
  authors: [
    { family: 'LAEMMLI', given: 'U. K.' }
  ],
  journal: 'Nature',
  volume: '227',
  issue: '5259',
  pages: '680-685',
  year: '1970',
  doi: '10.1038/227680a0',
  type: 'journal'
};

// 图书示例数据
const book = {
  title: 'Deep Learning',
  authors: [
    { family: 'LeCun', given: 'Yann' },
    { family: 'Bengio', given: 'Yoshua' },
    { family: 'Hinton', given: 'Geoffrey' }
  ],
  publisher: 'MIT Press',
  year: '2015',
  type: 'book'
};

// 会议论文示例数据
const conferencePaper = {
  title: 'ImageNet Classification with Deep Convolutional Neural Networks',
  authors: [
    { family: 'Krizhevsky', given: 'Alex' },
    { family: 'Sutskever', given: 'Ilya' },
    { family: 'Hinton', given: 'Geoffrey' }
  ],
  conference: 'NIPS',
  year: '2012',
  pages: '1097-1105',
  type: 'conference'
};

// 学位论文示例数据
const thesis = {
  title: 'Dropout as a Bayesian Approximation: Representing Model Uncertainty in Deep Learning',
  authors: [
    { family: 'Gal', given: 'Yarin' }
  ],
  university: 'University of Cambridge',
  year: '2016',
  type: 'thesis'
};

// 网页示例数据
const webpage = {
  title: 'Understanding LSTM Networks',
  authors: [
    { family: 'Olah', given: 'Christopher' }
  ],
  website: 'Colah\'s Blog',
  url: 'https://colah.github.io/posts/2015-08-Understanding-LSTMs/',
  access_date: '2023-10-01',
  year: '2015',
  type: 'web'
};

console.log('=== 测试所有引用格式 ===\n');

const styles = ['apa', 'mla', 'chicago', 'gbt7714', 'ieee', 'harvard'];
const types = ['journal', 'book', 'conference', 'thesis', 'web'];
const testData = {
  journal: journalArticle,
  book: book,
  conference: conferencePaper,
  thesis: thesis,
  web: webpage
};

styles.forEach(style => {
  console.log(`\n## ${style.toUpperCase()} 格式：`);
  types.forEach(type => {
    const ref = testData[type];
    const number = (style === 'gbt7714' || style === 'ieee') ? 1 : undefined;
    const result = formatter.generateBibliographyEntry(ref, style, type, number);
    console.log(`  ${type}: ${result}`);
  });
});

console.log('\n=== 文中引用测试 ===');
styles.forEach(style => {
  const ref = journalArticle;
  const inText = formatter.generateInTextCitation(ref, style);
  console.log(`  ${style}: ${inText}`);
});
