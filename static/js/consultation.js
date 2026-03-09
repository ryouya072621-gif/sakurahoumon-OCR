let selectedJobId = null;

document.addEventListener('DOMContentLoaded', () => {
    renderSidebar();

    document.getElementById('analyze-all-btn').addEventListener('click', analyzeAll);
    document.getElementById('export-csv-btn').addEventListener('click', () => {
        window.location.href = `/consultation/${BATCH_ID}/export-csv`;
    });

    // Auto-select first patient
    if (JOBS_DATA.length > 0) {
        selectPatient(JOBS_DATA[0].job_id);
    }
});


function renderSidebar() {
    const sidebar = document.getElementById('patient-sidebar');
    sidebar.innerHTML = '';

    JOBS_DATA.forEach((job, i) => {
        const hasStruct = !!STRUCTURED_CACHE[job.job_id];
        const badge = hasStruct
            ? '<span class="status-badge bg-emerald-100 text-emerald-700">解析済</span>'
            : '<span class="status-badge bg-gray-100 text-gray-500">未解析</span>';

        // Extract patient name from structured data or filename
        let displayName = job.name.replace(/\.pdf$/i, '');
        if (STRUCTURED_CACHE[job.job_id]) {
            const p = STRUCTURED_CACHE[job.job_id].patient;
            if (p && p.sei) displayName = `${p.sei} ${p.mei || ''}`;
        }

        sidebar.innerHTML += `
            <div class="patient-item" data-job="${job.job_id}" onclick="selectPatient('${job.job_id}')">
                <div class="flex justify-between items-center">
                    <span class="font-medium text-gray-700">${escapeHtml(displayName)}</span>
                    ${badge}
                </div>
            </div>`;
    });
}


function selectPatient(jobId) {
    selectedJobId = jobId;

    // Update sidebar active state
    document.querySelectorAll('.patient-item').forEach(el => {
        el.classList.toggle('active', el.dataset.job === jobId);
    });

    const content = document.getElementById('main-content');
    const struct = STRUCTURED_CACHE[jobId];

    if (struct) {
        renderStructuredView(struct);
    } else {
        // Show image + "AI解析" button
        const job = JOBS_DATA.find(j => j.job_id === jobId);
        content.innerHTML = `
            <div class="text-center py-8">
                <img src="/image/${jobId}/0" class="max-h-96 mx-auto rounded-lg shadow mb-4" alt="Page">
                <p class="text-gray-500 text-sm mb-4">AI解析を実行して構造化データを生成してください</p>
                <button onclick="analyzeOne('${jobId}')" class="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                    AI解析
                </button>
            </div>`;
    }
}


function analyzeOne(jobId) {
    const content = document.getElementById('main-content');
    content.innerHTML = '<div class="text-center py-16"><div class="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div><p class="text-gray-500 mt-4">AI解析中...</p></div>';

    fetch(`/consultation/${BATCH_ID}/ai-analyze-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId })
    })
    .then(r => r.json())
    .then(data => {
        if (!data.ok) {
            content.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded">${escapeHtml(data.error || 'エラー')}</div>`;
            return;
        }
        STRUCTURED_CACHE[jobId] = data.structured;
        renderSidebar();
        selectPatient(jobId);
    })
    .catch(err => {
        content.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded">${escapeHtml(err.message)}</div>`;
    });
}


function analyzeAll() {
    const btn = document.getElementById('analyze-all-btn');
    const orig = btn.textContent;
    btn.textContent = '全件解析中...';
    btn.classList.add('opacity-70', 'pointer-events-none');

    const unanalyzed = JOBS_DATA.filter(j => !STRUCTURED_CACHE[j.job_id]);
    let idx = 0;

    function next() {
        if (idx >= unanalyzed.length) {
            btn.textContent = orig;
            btn.classList.remove('opacity-70', 'pointer-events-none');
            renderSidebar();
            return;
        }

        const job = unanalyzed[idx];
        btn.textContent = `解析中 ${idx + 1}/${unanalyzed.length}...`;

        fetch(`/consultation/${BATCH_ID}/ai-analyze-job`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: job.job_id })
        })
        .then(r => r.json())
        .then(data => {
            if (data.ok) {
                STRUCTURED_CACHE[job.job_id] = data.structured;
                renderSidebar();
                if (selectedJobId === job.job_id) renderStructuredView(data.structured);
            }
            idx++;
            next();
        })
        .catch(() => { idx++; next(); });
    }

    next();
}


// ============ Structured View Rendering ============

function renderStructuredView(data) {
    const content = document.getElementById('main-content');
    let html = '';

    const p = data.patient || {};
    const c = data.contact || {};
    const ins = data.insurance || {};
    const mh = data.medical_history || {};
    const inf = data.infection || {};
    const phy = data.physician || {};
    const diet = data.diet || {};
    const sched = data.schedule || {};
    const req = data.requester || {};
    const kp = data.key_person || {};
    const cm = data.care_manager || {};

    // 本人情報
    html += section('本人情報', [
        field('ふりがな', `${p.furigana_sei || ''} ${p.furigana_mei || ''}`, 'patient.furigana_sei'),
        field('氏名', `${p.sei || ''} ${p.mei || ''}`, 'patient.sei'),
        field('性別', p.gender || '', 'patient.gender'),
        field('生年月日', `${p.dob_era || ''}${p.dob_year || ''}年${p.dob_month || ''}月${p.dob_day || ''}日 (${p.dob_western || ''})`, 'patient.dob_western'),
        field('年齢', p.age || '', 'patient.age'),
        field('郵便番号', p.postal_code || '', 'patient.postal_code'),
        field('住所', p.address || '', 'patient.address'),
        field('施設名', p.facility || '', 'patient.facility'),
        field('部屋番号', p.room || '', 'patient.room'),
        field('駐車場', `${p.parking || ''}${p.parking_note ? ' (' + p.parking_note + ')' : ''}`, 'patient.parking'),
    ]);

    // 連絡先
    html += section('連絡先', [
        field('自宅電話', c.home_phone || '', 'contact.home_phone'),
        field('携帯電話', c.mobile_phone || '', 'contact.mobile_phone'),
    ]);

    // 保険情報
    html += section('保険情報', [
        field('医療負担割合', ins.burden_ratio ? `${ins.burden_ratio}割` : '', 'insurance.burden_ratio'),
        field('公費', ins.public_expense || '', 'insurance.public_expense'),
        field('要介護度', ins.care_level || '', 'insurance.care_level'),
    ]);

    // 既往歴
    const conditions = (mh.conditions || []).map(c =>
        `<span class="condition-tag condition-checked">${escapeHtml(c)}</span>`
    ).join('');
    const otherMH = mh.other ? `<div class="mt-1 text-sm text-blue-700">その他: ${escapeHtml(mh.other)}</div>` : '';
    html += `<div class="section-card">
        <div class="section-header">既往歴</div>
        <div class="p-3">${conditions || '<span class="text-gray-400 text-sm">なし</span>'}${otherMH}</div>
    </div>`;

    // 感染症
    html += section('感染症', [
        field('状態', inf.status || '', 'infection.status'),
        field('詳細', Array.isArray(inf.details) ? inf.details.join(', ') : (inf.details || ''), 'infection.details'),
    ]);

    // 内科主治医
    html += section('内科主治医', [
        field('病院名', phy.hospital || '', 'physician.hospital'),
        field('医師名', phy.doctor || '', 'physician.doctor'),
    ]);

    // 意思疎通・食事
    html += section('身体状況', [
        field('意思疎通', data.communication || '', 'communication'),
        field('食事形態', diet.type || '', 'diet.type'),
        field('誤嚥性肺炎', diet.aspiration_pneumonia || '', 'diet.aspiration_pneumonia'),
    ]);

    // 訪問可能曜日
    if (sched.am || sched.pm) {
        const days = ['日','月','火','水','木','金','土'];
        let schedHtml = '<table class="schedule-grid"><thead><tr><th></th>';
        days.forEach(d => schedHtml += `<th>${d}</th>`);
        schedHtml += '</tr></thead><tbody>';

        ['am', 'pm'].forEach(slot => {
            const label = slot === 'am' ? 'AM' : 'PM';
            schedHtml += `<tr><td class="font-medium">${label}</td>`;
            days.forEach(d => {
                const v = (sched[slot] || {})[d] || '';
                const cls = (v === '○' || v === '◎') ? 'mark-ok' : (v === '×' ? 'mark-ng' : '');
                schedHtml += `<td class="${cls}">${escapeHtml(v)}</td>`;
            });
            schedHtml += '</tr>';
        });
        schedHtml += '</tbody></table>';

        html += `<div class="section-card">
            <div class="section-header">訪問可能曜日</div>
            <div class="p-3">${schedHtml}</div>
        </div>`;
    }

    // 依頼者
    html += section('依頼者', [
        field('区分', req.type || '', 'requester.type'),
        field('氏名', req.name || '', 'requester.name'),
        field('電話', req.phone || '', 'requester.phone'),
    ]);

    // キーパーソン
    html += section('キーパーソン', [
        field('氏名', kp.name || '', 'key_person.name'),
        field('ふりがな', kp.furigana || '', 'key_person.furigana'),
        field('続柄', kp.relationship || '', 'key_person.relationship'),
        field('電話', kp.phone || '', 'key_person.phone'),
        field('住所', kp.address || '', 'key_person.address'),
    ]);

    // ケアマネ
    html += section('ケアマネージャー', [
        field('氏名', cm.name || '', 'care_manager.name'),
        field('事業所', cm.facility || '', 'care_manager.facility'),
        field('電話', cm.phone || '', 'care_manager.phone'),
        field('FAX', cm.fax || '', 'care_manager.fax'),
    ]);

    // 来院理由
    const reasons = (data.visit_reason || []).map(r =>
        `<span class="condition-tag condition-checked">${escapeHtml(r)}</span>`
    ).join('');
    html += `<div class="section-card">
        <div class="section-header">来院理由</div>
        <div class="p-3">${reasons || '<span class="text-gray-400 text-sm">なし</span>'}</div>
    </div>`;

    // 知ったきっかけ
    const sources = (data.referral_source || []).map(s =>
        `<span class="condition-tag" style="background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd">${escapeHtml(s)}</span>`
    ).join('');
    html += `<div class="section-card">
        <div class="section-header">知ったきっかけ</div>
        <div class="p-3">${sources || '<span class="text-gray-400 text-sm">なし</span>'}</div>
    </div>`;

    if (data.notes) {
        html += `<div class="section-card">
            <div class="section-header">備考</div>
            <div class="p-3 text-sm">${escapeHtml(data.notes)}</div>
        </div>`;
    }

    content.innerHTML = html;

    // Attach inline edit handlers
    content.querySelectorAll('.field-value.editable').forEach(el => {
        el.addEventListener('dblclick', () => startFieldEdit(el));
    });
}


function section(title, fieldsHtml) {
    return `<div class="section-card">
        <div class="section-header">${escapeHtml(title)}</div>
        ${fieldsHtml.join('')}
    </div>`;
}


function field(label, value, path) {
    return `<div class="field-row">
        <span class="field-label">${escapeHtml(label)}</span>
        <span class="field-value editable" data-path="${path}">${escapeHtml(String(value))}</span>
    </div>`;
}


// ============ Inline Edit ============

function startFieldEdit(el) {
    if (el.classList.contains('editing')) return;
    const path = el.dataset.path;
    const currentValue = el.textContent;

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
        el.classList.remove('editing');
        el.textContent = newValue;

        if (newValue !== currentValue) {
            el.classList.add('modified');
            // Update structured data
            setNestedValue(STRUCTURED_CACHE[selectedJobId], path, newValue);
            // Save to server
            fetch(`/consultation/${BATCH_ID}/save-structured`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job_id: selectedJobId, structured: STRUCTURED_CACHE[selectedJobId] })
            }).catch(err => console.error('Save failed:', err));
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


function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
}


function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
