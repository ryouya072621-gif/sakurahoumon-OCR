let currentPage = 0;

document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    prevBtn.addEventListener('click', () => { if (currentPage > 0) showPage(currentPage - 1); });
    nextBtn.addEventListener('click', () => { if (currentPage < PAGE_COUNT - 1) showPage(currentPage + 1); });

    showPage(0);
});

function showPage(pageIdx) {
    currentPage = pageIdx;
    document.getElementById('page-indicator').textContent = `${pageIdx + 1} / ${PAGE_COUNT}`;
    document.getElementById('prev-page').disabled = (pageIdx === 0);
    document.getElementById('next-page').disabled = (pageIdx >= PAGE_COUNT - 1);

    // Update image
    document.getElementById('page-image').src = `/image/${JOB_ID}/${pageIdx}`;

    // Render OCR content for this page
    renderOcrContent(pageIdx);
}

function getConfidenceClass(score) {
    if (score === undefined || score === null) return '';
    if (score >= 0.8) return 'confidence-high';
    if (score >= 0.5) return 'confidence-mid';
    return 'confidence-low';
}

function renderOcrContent(pageIdx) {
    const container = document.getElementById('ocr-content');
    const pageData = OCR_DATA[pageIdx];

    if (!pageData) {
        container.innerHTML = '<p class="text-gray-400">データがありません</p>';
        return;
    }

    let html = '';

    // Combine paragraphs and tables, sort by order
    const elements = [];

    if (pageData.paragraphs) {
        pageData.paragraphs.forEach((p, i) => {
            // 欄外テキスト（page_header/page_footer）をスキップ
            const role = p.role || '';
            if (role === 'page_header' || role === 'page_footer') return;
            elements.push({ type: 'paragraph', data: p, index: i, order: p.order || i });
        });
    }
    if (pageData.tables) {
        pageData.tables.forEach((t, i) => {
            elements.push({ type: 'table', data: t, index: i, order: t.order || 1000 + i });
        });
    }

    elements.sort((a, b) => a.order - b.order);

    elements.forEach(el => {
        if (el.type === 'paragraph') {
            html += renderParagraph(el.data, pageIdx, el.index);
        } else {
            html += renderTable(el.data, pageIdx, el.index);
        }
    });

    container.innerHTML = html;
}

function renderParagraph(para, pageIdx, paraIdx) {
    const role = para.role || 'body';
    let cls = 'text-block p-2 rounded mb-2';
    let tag = 'p';
    let style = '';

    if (role === 'section_heading') {
        tag = 'h2';
        cls += ' text-lg font-bold text-gray-800';
    } else if (role === 'page_header' || role === 'page_footer') {
        cls += ' text-xs text-gray-400';
    } else {
        cls += ' text-sm text-gray-700';
    }

    const confClass = getConfidenceClass(para.rec_score);
    cls += ` ${confClass}`;

    const text = escapeHtml(para.contents || '');
    const dataAttr = `data-page="${pageIdx}" data-type="paragraph" data-index="${paraIdx}"`;

    return `<${tag} class="${cls}" ${dataAttr}>${text}</${tag}>`;
}

function renderTable(table, pageIdx, tableIdx) {
    if (!table.cells || table.cells.length === 0) return '';

    const nRows = table.n_row || 0;
    const nCols = table.n_col || 0;

    if (nRows === 0 || nCols === 0) return '';

    // Build grid (handle rowspan/colspan)
    const grid = Array.from({ length: nRows }, () => Array(nCols).fill(null));
    const rendered = Array.from({ length: nRows }, () => Array(nCols).fill(false));

    table.cells.forEach((cell, cellIdx) => {
        const r = (cell.row || 1) - 1;
        const c = (cell.col || 1) - 1;
        grid[r][c] = { ...cell, cellIdx };
    });

    let html = `<div class="mb-4 overflow-x-auto"><table class="border-collapse w-full">`;

    for (let r = 0; r < nRows; r++) {
        html += '<tr>';
        for (let c = 0; c < nCols; c++) {
            if (rendered[r][c]) continue;

            const cell = grid[r][c];
            if (!cell) {
                html += `<td class="table-cell">&nbsp;</td>`;
                continue;
            }

            const rs = cell.row_span || 1;
            const cs = cell.col_span || 1;

            // Mark spanned cells as rendered
            for (let ri = r; ri < r + rs && ri < nRows; ri++) {
                for (let ci = c; ci < c + cs && ci < nCols; ci++) {
                    rendered[ri][ci] = true;
                }
            }

            const confClass = getConfidenceClass(cell.rec_score);
            const spanAttr = (rs > 1 ? ` rowspan="${rs}"` : '') + (cs > 1 ? ` colspan="${cs}"` : '');
            const dataAttr = `data-page="${pageIdx}" data-type="table" data-table="${tableIdx}" data-cell="${cell.cellIdx}"`;
            const text = escapeHtml(cell.contents || '');

            html += `<td class="table-cell ${confClass}" ${spanAttr} ${dataAttr}>${text}</td>`;
        }
        html += '</tr>';
    }

    html += '</table></div>';
    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}
