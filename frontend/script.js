const API_URL = 'http://localhost:3001/api';

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(`${tabId}-tab`).classList.add('active');
    });
});

// ==================== 1. CHUYỂN ĐỔI ====================
const convertUpload = document.getElementById('convert-upload');
const convertFile = document.getElementById('convert-file');
const convertFileInfo = document.getElementById('convert-file-info');
const convertBtn = document.getElementById('convert-btn');
let selectedConvertFile = null;

convertUpload.addEventListener('click', () => convertFile.click());
convertFile.addEventListener('change', (e) => {
    selectedConvertFile = e.target.files[0];
    if (selectedConvertFile) {
        const fileExt = selectedConvertFile.name.split('.').pop();
        const icon = fileExt === 'docx' ? '📝' : (fileExt === 'xlsx' || fileExt === 'xls' ? '📊' : '📄');
        convertFileInfo.innerHTML = `
            <div class="file-item">
                <span>${icon} ${selectedConvertFile.name}</span>
                <span>${(selectedConvertFile.size / 1024).toFixed(2)} KB</span>
            </div>
        `;
        convertBtn.disabled = false;
    } else {
        convertFileInfo.innerHTML = '';
        convertBtn.disabled = true;
    }
});

convertBtn.addEventListener('click', async () => {
    if (!selectedConvertFile) {
        alert('Vui lòng chọn file cần chuyển đổi');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', selectedConvertFile);
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/convert-to-pdf`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Lỗi chuyển đổi');
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = selectedConvertFile.name.replace(/\.(docx|xlsx|xls)$/i, '.pdf');
        a.click();
        URL.revokeObjectURL(url);
        
        alert('✅ Chuyển đổi thành công!');
        
        selectedConvertFile = null;
        convertFile.value = '';
        convertFileInfo.innerHTML = '';
        convertBtn.disabled = true;
        
    } catch (error) {
        alert('❌ Lỗi: ' + error.message);
    } finally {
        showLoading(false);
    }
});

// ==================== 2. GỘP PDF ====================
const mergeUpload = document.getElementById('merge-upload');
const mergeFiles = document.getElementById('merge-files');
const mergeFileList = document.getElementById('merge-file-list');
const mergeBtn = document.getElementById('merge-btn');
let selectedMergeFiles = [];

mergeUpload.addEventListener('click', () => mergeFiles.click());
mergeFiles.addEventListener('change', (e) => {
    selectedMergeFiles = Array.from(e.target.files);
    updateMergeFileList();
    mergeBtn.disabled = selectedMergeFiles.length < 2;
});

function updateMergeFileList() {
    mergeFileList.innerHTML = selectedMergeFiles.map(file => `
        <div class="file-item">
            <span>📄 ${file.name}</span>
            <span>${(file.size / 1024).toFixed(2)} KB</span>
        </div>
    `).join('');
}

mergeBtn.addEventListener('click', async () => {
    if (selectedMergeFiles.length < 2) {
        alert('Vui lòng chọn ít nhất 2 file PDF');
        return;
    }
    
    const formData = new FormData();
    selectedMergeFiles.forEach(file => formData.append('files', file));
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/merge-pdf`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) throw new Error('Lỗi khi gộp file');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'merged.pdf';
        a.click();
        URL.revokeObjectURL(url);
        
        alert('✅ Gộp PDF thành công!');
        selectedMergeFiles = [];
        mergeFiles.value = '';
        updateMergeFileList();
        mergeBtn.disabled = true;
    } catch (error) {
        alert('❌ Lỗi: ' + error.message);
    } finally {
        showLoading(false);
    }
});

// ==================== 3. TÁCH PDF ====================
const splitUpload = document.getElementById('split-upload');
const splitFile = document.getElementById('split-file');
const splitFileInfo = document.getElementById('split-file-info');
const splitBtn = document.getElementById('split-btn');
const splitRange = document.getElementById('split-range');
let selectedSplitFile = null;

document.querySelectorAll('input[name="split-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        splitRange.disabled = e.target.value !== 'range';
    });
});

splitUpload.addEventListener('click', () => splitFile.click());
splitFile.addEventListener('change', (e) => {
    selectedSplitFile = e.target.files[0];
    if (selectedSplitFile) {
        splitFileInfo.innerHTML = `
            <div class="file-item">
                <span>📄 ${selectedSplitFile.name}</span>
                <span>${(selectedSplitFile.size / 1024).toFixed(2)} KB</span>
            </div>
        `;
        splitBtn.disabled = false;
    } else {
        splitFileInfo.innerHTML = '';
        splitBtn.disabled = true;
    }
});

splitBtn.addEventListener('click', async () => {
    if (!selectedSplitFile) {
        alert('Vui lòng chọn file PDF');
        return;
    }
    
    const mode = document.querySelector('input[name="split-mode"]:checked').value;
    const formData = new FormData();
    formData.append('file', selectedSplitFile);
    formData.append('mode', mode);
    
    if (mode === 'range') {
        const range = splitRange.value.trim();
        if (!range) {
            alert('Vui lòng nhập khoảng trang cần tách');
            return;
        }
        formData.append('pageRange', range);
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/split-pdf`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) throw new Error('Lỗi khi tách file');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'split.pdf';
        a.click();
        URL.revokeObjectURL(url);
        
        alert('✅ Tách PDF thành công!');
        selectedSplitFile = null;
        splitFile.value = '';
        splitFileInfo.innerHTML = '';
        splitBtn.disabled = true;
    } catch (error) {
        alert('❌ Lỗi: ' + error.message);
    } finally {
        showLoading(false);
    }
});

// ==================== 4. KÝ ĐIỆN TỬ ====================
const signPdfUpload = document.getElementById('sign-pdf-upload');
const signPdfFile = document.getElementById('sign-pdf-file');
const signPdfInfo = document.getElementById('sign-pdf-info');
const signImageUpload = document.getElementById('sign-image-upload');
const signImageFile = document.getElementById('sign-image-file');
const signImageInfo = document.getElementById('sign-image-info');
const signBtn = document.getElementById('sign-btn');
const signerName = document.getElementById('signer-name');
const signReason = document.getElementById('sign-reason');
const signLocation = document.getElementById('sign-location');

let selectedPdfFile = null;
let selectedSignImage = null;

function checkSignReady() {
    signBtn.disabled = !(selectedPdfFile && selectedSignImage);
}

signPdfUpload.addEventListener('click', () => signPdfFile.click());
signPdfFile.addEventListener('change', (e) => {
    selectedPdfFile = e.target.files[0];
    if (selectedPdfFile) {
        signPdfInfo.innerHTML = `<div class="file-item"><span>📄 ${selectedPdfFile.name}</span></div>`;
    } else {
        signPdfInfo.innerHTML = '';
    }
    checkSignReady();
});

signImageUpload.addEventListener('click', () => signImageFile.click());
signImageFile.addEventListener('change', (e) => {
    selectedSignImage = e.target.files[0];
    if (selectedSignImage) {
        signImageInfo.innerHTML = `<div class="file-item"><span>✍️ ${selectedSignImage.name}</span></div>`;
    } else {
        signImageInfo.innerHTML = '';
    }
    checkSignReady();
});

signBtn.addEventListener('click', async () => {
    if (!selectedPdfFile || !selectedSignImage) {
        alert('Vui lòng chọn file PDF và ảnh chữ ký');
        return;
    }
    
    const formData = new FormData();
    formData.append('pdf', selectedPdfFile);
    formData.append('signature', selectedSignImage);
    formData.append('signerName', signerName.value);
    formData.append('reason', signReason.value);
    formData.append('location', signLocation.value);
    
    showLoading(true);
    
    try {
        const response = await fetch(`${API_URL}/sign-pdf`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) throw new Error('Lỗi khi ký');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'signed.pdf';
        a.click();
        URL.revokeObjectURL(url);
        
        alert('✅ Ký điện tử thành công!');
        
        selectedPdfFile = null;
        selectedSignImage = null;
        signPdfFile.value = '';
        signImageFile.value = '';
        signPdfInfo.innerHTML = '';
        signImageInfo.innerHTML = '';
        signerName.value = '';
        signReason.value = '';
        signLocation.value = '';
        signBtn.disabled = true;
        
    } catch (error) {
        alert('❌ Lỗi: ' + error.message);
    } finally {
        showLoading(false);
    }
});

// ==================== UTILS ====================
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

async function checkServer() {
    try {
        const response = await fetch(`${API_URL}/health`);
        if (response.ok) {
            console.log('✅ Server is running');
        }
    } catch (error) {
        console.error('❌ Cannot connect to server');
        alert('⚠️ Không thể kết nối đến server. Vui lòng chạy backend trước!');
    }
}

checkServer();