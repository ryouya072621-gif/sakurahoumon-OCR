document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const clearFile = document.getElementById('clear-file');
    const submitBtn = document.getElementById('submit-btn');
    const form = document.getElementById('upload-form');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drop-active');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drop-active');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drop-active');
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            showFileInfo(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            showFileInfo(fileInput.files[0]);
        }
    });

    clearFile.addEventListener('click', () => {
        fileInput.value = '';
        fileInfo.classList.add('hidden');
        submitBtn.disabled = true;
    });

    form.addEventListener('submit', () => {
        submitBtn.disabled = true;
        submitBtn.textContent = 'アップロード中...';
    });

    function showFileInfo(file) {
        fileName.textContent = file.name;
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        fileSize.textContent = `${sizeMB} MB`;
        fileInfo.classList.remove('hidden');
        submitBtn.disabled = false;
    }
});
