// ============ Global State ============
// 構造化データをページごとに保持
const STRUCTURED_DATA = {};

document.addEventListener('DOMContentLoaded', () => {
    const textPanel = document.getElementById('text-panel');
    const exportBtn = document.getElementById('export-btn');
    const exportMenu = document.getElementById('export-menu');
    const aiAnalyzeBtn = document.getElementById('ai-analyze-btn');

    // Double-click to edit text blocks (OCRテキストビュー)
    textPanel.addEventListener('dblclick', (e) => {
        // 構造化ビューの編集
        const structField = e.target.closest('.struct-editable');
        if (structField && !structField.classList.contains('editing')) {
            startStructEdit(structField);
            return;
        }
        // OCRテキストビューの編集
        const block = e.target.closest('.text-block, .table-cell');
        if (!block || block.classList.contains('editing')) return;
        startEdit(block);
    });

    // Export dropdown
    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => exportMenu.classList.add('hidden'));

    document.querySelectorAll('.export-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = `/export/${JOB_ID}?format=${link.dataset.format}`;
            exportMenu.classList.add('hidden');
        });
    });

    // View tabs
    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const view = tab.dataset.view;
            document.getElementById('ocr-content').classList.toggle('hidden', view !== 'ocr');
            document.getElementById('structured-content').classList.toggle('hidden', view !== 'structured');
        });
    });

    // AI解析 (校正→構造化を一括)
    aiAnalyzeBtn.addEventListener('click', () => runAiAnalyze());
});


// ============ AI Analyze (校正 + 構造化 一体化) ============

function runAiAnalyze() {
    const btn = document.getElementById('ai-analyze-btn');
    const orig = btn.textContent;
    btn.textContent = 'AI解析中...';
    btn.classList.add('loading-btn');

    fetch(`/results/${JOB_ID}/ai-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: currentPage })
    })
    .then(r => r.json())
    .then(data => {
        btn.textContent = orig;
        btn.classList.remove('loading-btn');
        if (!data.ok) { alert('AI解析エラー: ' + (data.error || '')); return; }

        // OCRデータ更新
        OCR_DATA[currentPage] = data.page_data;
        renderOcrContent(currentPage);

        // 構造化データ保存＆表示
        STRUCTURED_DATA[currentPage] = data.structured;
        renderStructuredView(data.structured);

        // 構造化ビュータブを自動表示
        document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-view="structured"]').classList.add('active');
        document.getElementById('ocr-content').classList.add('hidden');
        document.getElementById('structured-content').classList.remove('hidden');

        // 校正結果をモーダル表示
        const corrections = data.corrections || [];
        if (corrections.length > 0) {
            showCorrectionLog(corrections);
        }
    })
    .catch(err => {
        btn.textContent = orig;
        btn.classList.remove('loading-btn');
        alert('AI解析エラー: ' + err.message);
    });
}


// ============ Correction Log Modal ============

function showCorrectionLog(corrections) {
    const existing = document.getElementById('correction-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'correction-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';

    let logHtml = `<p class="text-sm text-gray-500 mb-3">${corrections.length} 箇所を校正しました</p>`;
    logHtml += '<div style="max-height:400px;overflow-y:auto" class="space-y-3">';
    corrections.forEach(c => {
        const label = c.type === 'paragraph'
            ? `段落 #${c.index + 1}`
            : `テーブル ${c.table + 1} セル ${c.cell + 1}`;
        logHtml += `
            <div class="border border-gray-200 rounded p-3">
                <div class="text-xs text-gray-400 mb-1">${label}</div>
                <div class="ai-diff-old text-sm mb-1">${escapeHtml(c.old)}</div>
                <div class="ai-diff-new text-sm">${escapeHtml(c.new)}</div>
            </div>`;
    });
    logHtml += '</div>';

    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div class="flex items-center justify-between p-4 border-b">
                <h3 class="text-lg font-bold text-indigo-700">AI校正結果</h3>
                <button id="close-modal" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div class="p-4 overflow-y-auto flex-1">${logHtml}</div>
            <div class="p-4 border-t text-right">
                <button id="accept-modal" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">OK</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('close-modal').addEventListener('click', () => modal.remove());
    document.getElementById('accept-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}


// ============ Structured View Rendering ============

function renderStructuredView(data) {
    const container = document.getElementById('structured-content');

    let html = '';
    if (data.document_type) {
        html += `<div class="mb-4 text-lg font-bold text-blue-800">${escapeHtml(data.document_type)}</div>`;
    }

    const sections = data.sections || [];
    sections.forEach((section, sIdx) => {
        html += `<div class="struct-section">`;
        html += `<div class="struct-section-header">${escapeHtml(section.title || '')}</div>`;

        const fields = section.fields || [];
        const type = section.type || 'info';

        fields.forEach((field, fIdx) => {
            if (type === 'info' || type === 'text') {
                html += renderInfoField(field, sIdx, fIdx);
            } else if (type === 'selection') {
                html += renderSelectionField(field, sIdx, fIdx);
            } else if (type === 'checklist') {
                html += renderChecklistField(field, sIdx, fIdx);
            } else if (type === 'schedule') {
                html += renderScheduleField(field, sIdx, fIdx);
            } else {
                html += renderInfoField(field, sIdx, fIdx);
            }
        });

        html += `</div>`;
    });

    container.innerHTML = html || '<p class="text-gray-400">構造化データがありません</p>';
}

function renderInfoField(field, sIdx, fIdx) {
    let html = `<div class="struct-field">
        <span class="struct-label">${escapeHtml(field.label || '')}</span>`;
    if (field.furigana) {
        html += `<span class="struct-value struct-editable" data-section="${sIdx}" data-field="${fIdx}" data-key="value">
            <span class="text-xs text-gray-400 block">${escapeHtml(field.furigana)}</span>${escapeHtml(field.value || '')}
        </span>`;
    } else {
        html += `<span class="struct-value struct-editable" data-section="${sIdx}" data-field="${fIdx}" data-key="value">${escapeHtml(field.value || '')}</span>`;
    }
    html += `</div>`;
    return html;
}

function renderSelectionField(field, sIdx, fIdx) {
    let html = `<div class="struct-field flex-col">
        <span class="struct-label mb-1">${escapeHtml(field.label || '')}</span>
        <div class="flex flex-wrap gap-2 ml-2">`;

    (field.options || []).forEach(opt => {
        if (opt.selected) {
            html += `<span class="struct-selected px-2 py-0.5 bg-green-50 border border-green-300 rounded text-sm">
                <span class="struct-check">&#10003;</span> ${escapeHtml(opt.text || '')}
            </span>`;
        } else {
            html += `<span class="struct-unselected px-2 py-0.5 bg-gray-50 border border-gray-200 rounded text-sm">
                ${escapeHtml(opt.text || '')}
            </span>`;
        }
    });

    if (field.note) {
        html += `<div class="ml-2 mt-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded struct-editable" data-section="${sIdx}" data-field="${fIdx}" data-key="note">${escapeHtml(field.note)}</div>`;
    }

    html += `</div></div>`;
    return html;
}

function renderChecklistField(field, sIdx, fIdx) {
    let html = `<div class="struct-field flex-col">
        <span class="struct-label mb-1">${escapeHtml(field.label || '')}</span>
        <div class="ml-2 space-y-1">`;

    const checkedItems = (field.items || []).filter(item => item.checked);

    if (checkedItems.length === 0) {
        html += `<div class="text-sm text-gray-400">該当なし</div>`;
    } else {
        checkedItems.forEach(item => {
            html += `<div class="struct-selected text-sm">
                <span class="struct-check">&#9745;</span> ${escapeHtml(item.text || '')}
            </div>`;
        });
    }

    if (field.other) {
        html += `<div class="mt-1 text-sm text-blue-700 bg-blue-50 px-2 py-1 rounded struct-editable" data-section="${sIdx}" data-field="${fIdx}" data-key="other">その他: ${escapeHtml(field.other)}</div>`;
    }

    html += `</div></div>`;
    return html;
}

function renderScheduleField(field, sIdx, fIdx) {
    const grid = field.grid;
    if (!grid) return renderInfoField(field, sIdx, fIdx);

    let html = `<div class="struct-field flex-col">
        <span class="struct-label mb-2">${escapeHtml(field.label || '')}</span>
        <table class="schedule-grid">
        <thead><tr><th></th>`;

    (grid.header || []).forEach(h => {
        html += `<th>${escapeHtml(h)}</th>`;
    });
    html += `</tr></thead><tbody>`;

    (grid.rows || []).forEach(row => {
        html += `<tr><td class="font-medium">${escapeHtml(row.label || '')}</td>`;
        (row.values || []).forEach(v => {
            let cls = '';
            const mark = (v || '').trim();
            if (mark === '○' || mark === '◎') cls = 'schedule-mark-ok';
            else if (mark === '×') cls = 'schedule-mark-ng';
            else if (mark === '△') cls = 'schedule-mark-maybe';
            html += `<td class="${cls}">${escapeHtml(v || '')}</td>`;
        });
        html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    return html;
}


// ============ Structured View Inline Edit ============

function startStructEdit(el) {
    const sIdx = parseInt(el.dataset.section);
    const fIdx = parseInt(el.dataset.field);
    const key = el.dataset.key;

    const data = STRUCTURED_DATA[currentPage];
    if (!data) return;

    const field = data.sections[sIdx]?.fields[fIdx];
    if (!field) return;

    const currentValue = field[key] || '';
    el.classList.add('editing');

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.className = 'w-full p-1 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

    const originalHtml = el.innerHTML;
    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();

    const save = () => {
        const newValue = input.value;
        field[key] = newValue;
        el.classList.remove('editing');

        // Re-render with prefix for special keys
        if (key === 'other') {
            el.innerHTML = newValue ? `その他: ${escapeHtml(newValue)}` : '';
        } else {
            el.innerHTML = escapeHtml(newValue);
        }

        if (newValue !== currentValue) {
            el.classList.add('modified');
            // Save to server
            saveStructuredData();
        }
    };

    const cancel = () => {
        el.innerHTML = originalHtml;
        el.classList.remove('editing');
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.removeEventListener('blur', save); cancel(); }
    });
}

function saveStructuredData() {
    const data = STRUCTURED_DATA[currentPage];
    if (!data) return;

    fetch(`/results/${JOB_ID}/save-structured`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: currentPage, structured: data })
    }).catch(err => console.error('Save structured failed:', err));
}


// ============ OCR Text Inline Edit ============

function startEdit(block) {
    const currentText = block.textContent;
    block.classList.add('editing');

    const textarea = document.createElement('textarea');
    textarea.value = currentText;
    textarea.className = 'w-full p-2 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';
    textarea.style.minHeight = '60px';
    textarea.style.resize = 'vertical';

    const btnContainer = document.createElement('div');
    btnContainer.className = 'flex gap-2 mt-1';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '保存';
    saveBtn.className = 'px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.className = 'px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300';

    btnContainer.appendChild(saveBtn);
    btnContainer.appendChild(cancelBtn);

    const originalHtml = block.innerHTML;
    block.innerHTML = '';
    block.appendChild(textarea);
    block.appendChild(btnContainer);
    textarea.focus();

    cancelBtn.addEventListener('click', () => {
        block.innerHTML = originalHtml;
        block.classList.remove('editing');
    });

    saveBtn.addEventListener('click', () => {
        const newText = textarea.value;
        if (newText !== currentText) {
            saveEdit(block, newText);
            block.innerHTML = escapeHtml(newText);
            block.classList.add('modified');
        } else {
            block.innerHTML = originalHtml;
        }
        block.classList.remove('editing');
    });

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cancelBtn.click();
    });
}

function saveEdit(block, newText) {
    const pageIdx = parseInt(block.dataset.page);
    const type = block.dataset.type;
    const payload = { page: pageIdx, type, text: newText };

    if (type === 'paragraph') {
        payload.index = parseInt(block.dataset.index);
        OCR_DATA[pageIdx].paragraphs[payload.index].contents = newText;
    } else if (type === 'table') {
        payload.table_index = parseInt(block.dataset.table);
        payload.cell_index = parseInt(block.dataset.cell);
        OCR_DATA[pageIdx].tables[payload.table_index].cells[payload.cell_index].contents = newText;
    }

    fetch(`/results/${JOB_ID}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch(err => console.error('Save failed:', err));
}
