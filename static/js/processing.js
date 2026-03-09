document.addEventListener('DOMContentLoaded', () => {
    const statusText = document.getElementById('status-text');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    const pageInfo = document.getElementById('page-info');
    const errorBox = document.getElementById('error-box');
    const errorMsg = document.getElementById('error-msg');
    const spinner = document.getElementById('spinner');

    function poll() {
        fetch(`/status/${JOB_ID}`)
            .then(r => r.json())
            .then(data => {
                if (data.status === 'error') {
                    spinner.classList.add('hidden');
                    statusText.textContent = 'エラー';
                    errorMsg.textContent = data.error || '不明なエラー';
                    errorBox.classList.remove('hidden');
                    return;
                }

                if (data.status === 'done') {
                    statusText.textContent = '完了！リダイレクト中...';
                    progressBar.style.width = '100%';
                    progressText.textContent = '100%';
                    setTimeout(() => {
                        window.location.href = `/results/${JOB_ID}`;
                    }, 500);
                    return;
                }

                // processing
                const pct = data.page_count > 0
                    ? Math.round((data.current_page / data.page_count) * 100)
                    : 0;

                if (data.status === 'loading_model') {
                    statusText.textContent = 'AIモデル読み込み中...';
                    progressBar.style.width = '5%';
                } else {
                    statusText.textContent = `ページ ${data.current_page} / ${data.page_count} を処理中...`;
                    progressBar.style.width = `${Math.max(pct, 10)}%`;
                    progressText.textContent = `${pct}%`;
                    pageInfo.textContent = `推定残り時間: 約${(data.page_count - data.current_page) * 2}分`;
                }

                setTimeout(poll, 2000);
            })
            .catch(() => {
                setTimeout(poll, 3000);
            });
    }

    poll();
});
