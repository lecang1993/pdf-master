const API_URL = 'https://pdf-master-api.onrender.com'; 

// Toast System
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    else if (type === 'warning') icon = 'exclamation-triangle';
    
    toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

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

// ==================== 1. CHUYỂN ĐỔI (Hỗ trợ kéo thả & nhiều ảnh) ====================
const convertUpload = document.getElementById('convert-upload');
const convertFileInput = document.getElementById('convert-file');
const convertFileListDiv = document.getElementById('convert-file-list');
const convertBtn = document.getElementById('convert-btn');

let selectedConvertFiles = [];

// Kích hoạt click
convertUpload.addEventListener('click', () => convertFileInput.click());

// Drag & Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    convertUpload.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});

convertUpload.addEventListener('dragover', () => {
    convertUpload.classList.add('drag-over');
});

convertUpload.addEventListener('dragleave', () => {
    convertUpload.classList.remove('drag-over');
});

convertUpload.addEventListener('drop', (e) => {
    convertUpload.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
        handleSelectedFiles(files);
    }
});

convertFileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        handleSelectedFiles(files);
    }
});

function handleSelectedFiles(files) {
    const validFiles = files.filter(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        const isValid = ['docx', 'xlsx', 'xls', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);
        if (!isValid) {
            showToast(`⚠️ Bỏ qua file không hỗ trợ: ${file.name}`, 'warning');
        }
        return isValid;
    });

    if (validFiles.length === 0) {
        selectedConvertFiles = [];
        convertFileListDiv.innerHTML = '';
        convertBtn.disabled = true;
        return;
    }

    selectedConvertFiles = validFiles;
    renderConvertFileList();
    convertBtn.disabled = false;
}

function renderConvertFileList() {
    convertFileListDiv.innerHTML = selectedConvertFiles.map(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        let icon = 'fa-file';
        if (ext === 'docx') icon = 'fa-file-word';
        else if (ext === 'xlsx' || ext === 'xls') icon = 'fa-file-excel';
        else if (ext === 'pdf') icon = 'fa-file-pdf';
        else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) icon = 'fa-file-image';
        
        return `
            <div class="file-item">
                <span><i class="fas ${icon}"></i> ${file.name}</span>
                <span>${(file.size / 1024).toFixed(2)} KB</span>
            </div>
        `;
    }).join('');
}

convertBtn.addEventListener('click', async () => {
    if (selectedConvertFiles.length === 0) {
        showToast('Vui lòng chọn ít nhất một file', 'warning');
        return;
    }

    const imageFiles = selectedConvertFiles.filter(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);
    });
    const officeFiles = selectedConvertFiles.filter(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        return ['docx', 'xlsx', 'xls'].includes(ext);
    });

    if (imageFiles.length > 0 && officeFiles.length > 0) {
        showToast('⚠️ Không thể trộn ảnh và file văn phòng. Vui lòng chọn riêng từng loại.', 'warning');
        return;
    }

    if (imageFiles.length > 0) {
        try {
            showLoading(true);
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            let isFirstPage = true;

            for (let i = 0; i < imageFiles.length; i++) {
                const file = imageFiles[i];
                const imgData = await readFileAsDataURL(file);
                
                const img = await loadImage(imgData);
                const imgWidth = img.width;
                const imgHeight = img.height;
                
                const pdfWidth = 210;
                const pdfHeight = (imgHeight * pdfWidth) / imgWidth;
                
                if (!isFirstPage) {
                    doc.addPage([pdfWidth, pdfHeight], pdfHeight > pdfWidth ? 'portrait' : 'landscape');
                } else {
                    doc.addPage([pdfWidth, pdfHeight], pdfHeight > pdfWidth ? 'portrait' : 'landscape');
                    isFirstPage = false;
                }
                
                doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }

            if (doc.getNumberOfPages() > 1) {
                doc.deletePage(1);
            }

            doc.save('images-converted.pdf');
            showToast(`✅ Đã chuyển ${imageFiles.length} ảnh thành PDF`, 'success');
            
            selectedConvertFiles = [];
            convertFileInput.value = '';
            convertFileListDiv.innerHTML = '';
            convertBtn.disabled = true;
        } catch (error) {
            showToast('❌ Lỗi xử lý ảnh: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
        return;
    }

    if (officeFiles.length > 0) {
        if (officeFiles.length > 1) {
            showToast('⚠️ Backend hiện chỉ hỗ trợ chuyển đổi từng file văn phòng một.', 'warning');
            return;
        }

        const file = officeFiles[0];
        const formData = new FormData();
        formData.append('file', file);
        
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
            a.download = file.name.replace(/\.(docx|xlsx|xls)$/i, '.pdf');
            a.click();
            URL.revokeObjectURL(url);
            
            showToast('✅ Chuyển đổi thành công!', 'success');
            
            selectedConvertFiles = [];
            convertFileInput.value = '';
            convertFileListDiv.innerHTML = '';
            convertBtn.disabled = true;
        } catch (error) {
            showToast('❌ Lỗi: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
        return;
    }

    showToast('ℹ️ File PDF không cần chuyển đổi.', 'warning');
});

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

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
            <span><i class="fas fa-file-pdf"></i> ${file.name}</span>
            <span>${(file.size / 1024).toFixed(2)} KB</span>
        </div>
    `).join('');
}

mergeBtn.addEventListener('click', async () => {
    if (selectedMergeFiles.length < 2) {
        showToast('Vui lòng chọn ít nhất 2 file PDF', 'warning');
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
        
        showToast('✅ Gộp PDF thành công!', 'success');
        selectedMergeFiles = [];
        mergeFiles.value = '';
        updateMergeFileList();
        mergeBtn.disabled = true;
    } catch (error) {
        showToast('❌ Lỗi: ' + error.message, 'error');
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
                <span><i class="fas fa-file-pdf"></i> ${selectedSplitFile.name}</span>
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
        showToast('Vui lòng chọn file PDF', 'warning');
        return;
    }
    
    const mode = document.querySelector('input[name="split-mode"]:checked').value;
    const formData = new FormData();
    formData.append('file', selectedSplitFile);
    formData.append('mode', mode);
    
    if (mode === 'range') {
        const range = splitRange.value.trim();
        if (!range) {
            showToast('Vui lòng nhập khoảng trang cần tách', 'warning');
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
        
        showToast('✅ Tách PDF thành công!', 'success');
        selectedSplitFile = null;
        splitFile.value = '';
        splitFileInfo.innerHTML = '';
        splitBtn.disabled = true;
    } catch (error) {
        showToast('❌ Lỗi: ' + error.message, 'error');
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
        signPdfInfo.innerHTML = `<div class="file-item"><span><i class="fas fa-file-pdf"></i> ${selectedPdfFile.name}</span></div>`;
    } else {
        signPdfInfo.innerHTML = '';
    }
    checkSignReady();
});

signImageUpload.addEventListener('click', () => signImageFile.click());
signImageFile.addEventListener('change', (e) => {
    selectedSignImage = e.target.files[0];
    if (selectedSignImage) {
        signImageInfo.innerHTML = `<div class="file-item"><span><i class="fas fa-image"></i> ${selectedSignImage.name}</span></div>`;
    } else {
        signImageInfo.innerHTML = '';
    }
    checkSignReady();
});

signBtn.addEventListener('click', async () => {
    if (!selectedPdfFile || !selectedSignImage) {
        showToast('Vui lòng chọn file PDF và ảnh chữ ký', 'warning');
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
        
        showToast('✅ Ký điện tử thành công!', 'success');
        
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
        showToast('❌ Lỗi: ' + error.message, 'error');
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
        showToast('⚠️ Không thể kết nối đến server. Vui lòng chạy backend trước!', 'error');
    }
}

// ==================== POPUP GIỚI THIỆU ====================
function showIntro() {
    const dontShow = localStorage.getItem('pdfMasterDontShowIntro');
    if (dontShow === 'true') {
        return;
    }
    
    const popup = document.getElementById('introPopup');
    if (popup) {
        popup.style.display = 'flex';
    }
}

function closeIntro() {
    const popup = document.getElementById('introPopup');
    if (popup) {
        popup.style.display = 'none';
    }
    
    const dontShowAgain = document.getElementById('dontShowIntroAgain');
    if (dontShowAgain && dontShowAgain.checked) {
        localStorage.setItem('pdfMasterDontShowIntro', 'true');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(showIntro, 500);
});

document.addEventListener('click', function(event) {
    const popup = document.getElementById('introPopup');
    if (popup && event.target === popup) {
        closeIntro();
    }
});

checkServer();