// pages/journal/compare/compare.js
// 期刊对比页 - 横向滚动表格版

Page({
  data: {
    journals: [],
    tableHeaders: [],   // [{ name, shortName, winCount }] - 表头
    tableData: [],      // [{ label, dimType, cells: [{ value, isBest, isTrue, isFalse }] }]
    rightWidth: 590,    // 右侧滚动区宽度(rpx)
    loading: true,
    bestSummary: [],
    hasWinners: true
  },

  _dimensions: [
    { key: 'works_count_latest', label: '发文量' },
    { key: 'cited_by_count_latest', label: '总被引量' },
    { key: 'h_index_latest', label: 'h指数' },
    { key: 'i10_index_latest', label: 'i10指数' },
    { key: 'two_year_mean_citedness_latest', label: '2年均引' },
    { key: 'is_open_access', label: 'OA模式', type: 'boolean' },
    { key: 'is_in_doaj', label: 'DOAJ收录', type: 'boolean' },
    { key: 'is_medline_current', label: 'MEDLINE收录', type: 'boolean' },
    { key: 'is_pmc_journal', label: 'PMC期刊', type: 'boolean' },
    { key: 'pubmed_article_count', label: 'PubMed文章' },
    { key: 'pmc_article_count', label: 'PMC全文' },
    { key: 'apc_amount', label: 'APC费用' },
    { key: 'publisher', label: '出版社' },
    { key: 'country', label: '国家' }
  ],

  onLoad: function(options) {
    if (options.ids) {
      const ids = options.ids.split(',');
      this.loadCompare(ids);
    }
  },

  loadCompare: function(ids) {
    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'journalAPI',
      data: {
        action: 'compareJournals',
        ids: ids
      }
    }).then(res => {
      const apiResult = res.result;
      if (apiResult.code === 0) {
        const journals = apiResult.data.journals || [];
        const built = this._buildTable(journals);
        const hasWinners = built.bestSummary.some(b => b.count > 0);
        this.setData({
          journals: journals,
          tableHeaders: built.tableHeaders,
          tableData: built.tableData,
          rightWidth: built.rightWidth,
          bestSummary: built.bestSummary,
          hasWinners: hasWinners,
          loading: false
        });
      } else {
        wx.showToast({ title: apiResult.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    }).catch(err => {
      console.error('[loadCompare] Error:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
      this.setData({ loading: false });
    });
  },

  _buildTable: function(journals) {
    try {
      var winners = {};
      var rows = [];
      var dims = this._dimensions;

      // 1. 遍历维度，构建行数据 + 判定最优值
      for (var di = 0; di < dims.length; di++) {
        var dim = dims[di];
        var cells = [];
        var bestIdx = -1;
        var bestVal = -Infinity;

        for (var ji = 0; ji < journals.length; ji++) {
          var j = journals[ji];
          var raw = j[dim.key];
          var value = '';
          var numVal = null;

          if (dim.type === 'boolean') {
            value = raw ? '✓' : '✗';
          } else if (dim.key === 'apc_amount') {
            value = raw ? ((j.apc_currency || '') + ' ' + raw) : '-';
            numVal = raw || null;
          } else if (dim.key === 'publisher' || dim.key === 'country') {
            value = raw || '-';
          } else {
            value = (raw !== undefined && raw !== null && raw !== '') ? String(raw) : '-';
            numVal = (raw !== undefined && raw !== null && raw !== '') ? Number(raw) : null;
          }

          cells.push({ value: value, numVal: numVal });

          // 记录最优值
          if (dim.type !== 'boolean' && numVal !== null && numVal > bestVal) {
            bestVal = numVal;
            bestIdx = ji;
          }
        }

        if (bestIdx >= 0) {
          winners[dim.key] = bestIdx;
        }

        rows.push({ label: dim.label, dimKey: dim.key, dimType: dim.type, cells: cells });
      }

      // 2. 汇总每本期刊的优势维度
      var winMap = {};
      for (var dk in winners) {
        var bestIdx = winners[dk];
        if (!winMap[bestIdx]) winMap[bestIdx] = [];
        var dim = dims.find(function(d) { return d.key === dk; });
        winMap[bestIdx].push(dim ? dim.label : dk);
      }

      var bestSummary = journals.map(function(j, idx) {
        return {
          journalId: String(j._id || ''),
          title: j.title || '',
          wins: winMap[idx] || [],
          count: (winMap[idx] || []).length
        };
      });

      // 3. 表头
      var tableHeaders = journals.map(function(j, idx) {
        var title = j.title || '';
        return {
          name: title,
          shortName: title.length > 6 ? title.substring(0, 6) + '…' : title,
          winCount: (winMap[idx] || []).length
        };
      });

      // 4. 表格数据（每行一个维度，cells 对应各期刊的值）
      var tableData = rows.map(function(r) {
        return {
          label: r.label,
          dimType: r.dimType,
          cells: r.cells.map(function(cell, ci) {
            return {
              value: cell.value,
              isBest: r.dimType !== 'boolean' && winners[r.dimKey] === ci,
              isTrue: r.dimType === 'boolean' && journals[ci][r.dimKey] === true,
              isFalse: r.dimType === 'boolean' && !journals[ci][r.dimKey]
            };
          })
        };
      });

      // 5. 计算右侧滚动区宽度（rpx），仅数据列宽
      var rightWidth = 180 * journals.length;
      if (journals.length <= 3) rightWidth = 590; // 750 - 160(指标列)，不滚动

      console.log('[compare] _buildTable done:', { journals: journals.length, tableRows: tableData.length, winners: Object.keys(winners).length, rightWidth: rightWidth });
      return { bestSummary: bestSummary, tableHeaders: tableHeaders, tableData: tableData, rightWidth: rightWidth };
    } catch (e) {
      console.error('[compare] _buildTable error:', e);
      return { bestSummary: [], tableHeaders: [], tableData: [], rightWidth: 590 };
    }
  }
});
