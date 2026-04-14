import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Tải Font Roboto hỗ trợ Tiếng Việt
let customFontBytes;
async function loadFont() {
    try {
        const url = 'https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf';
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        customFontBytes = new Uint8Array(arrayBuffer);
        console.log('✅ Đã tải thành công Font Tiếng Việt (Roboto)');
    } catch (error) {
        console.error('❌ Lỗi tải font, sẽ dùng font mặc định:', error);
    }
}
loadFont();

// Cấu hình upload & Bảo mật Filter
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (err) {}
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});

const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/png', 'image/jpeg', 'image/jpg'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Định dạng file không được hỗ trợ để bảo mật.'), false);
    }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 100 * 1024 * 1024 } });

// Helper: Vẽ text hỗ trợ Unicode chuẩn xác
async function drawUnicodeText(page, text, x, y, size, options = {}) {
  try {
    const { doc } = page;
    doc.registerFontkit(fontkit);
    const font = customFontBytes ? await doc.embedFont(customFontBytes) : await doc.embedStandardFont('Helvetica');
    
    const lines = text.split('\n');
    let currentY = y;
    
    for (const line of lines) {
      page.drawText(line, {
        x: x,
        y: currentY,
        size: size,
        font: font,
        color: options.color || rgb(0, 0, 0)
      });
      currentY -= (size + 5);
    }
  } catch (error) {
    console.error('Lỗi vẽ text:', error);
  }
}

// ==================== KIỂM TRA SERVER ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PDF Master Server is running securely!' });
});

// ==================== 1. CHUYỂN ĐỔI DOCX/EXCEL -> PDF ====================
app.post('/api/convert-to-pdf', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Chưa có file hoặc định dạng không hợp lệ' });

    const fileExt = path.extname(file.originalname).toLowerCase();
    const outputPath = file.path.replace(/\.[^/.]+$/, '.pdf');
    
    if (fileExt === '.docx') {
      const inputBuffer = await fs.readFile(file.path);
      const result = await mammoth.extractRawText({ buffer: inputBuffer });
      const text = result.value;
      
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage([600, 800]);
      const { height } = page.getSize();
      
      await drawUnicodeText(page, `Chuyển đổi từ: ${file.originalname}`, 50, height - 50, 12, { color: rgb(0, 0, 0.8) });
      await drawUnicodeText(page, `Ngày xuất: ${new Date().toLocaleString('vi-VN')}`, 50, height - 70, 10, { color: rgb(0.5, 0.5, 0.5) });
      
      // Chia dòng thông minh hơn
      const lines = text.match(/.{1,90}(\s|$)/g) || [];
      let y = height - 110;
      
      for (const line of lines) {
        if (y < 50) {
          page = pdfDoc.addPage([600, 800]);
          y = height - 50;
        }
        if (line.trim()) {
          await drawUnicodeText(page, line.trim(), 50, y, 11);
        }
        y -= 16;
      }
      
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytes);
      
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file.path);
      const pdfDoc = await PDFDocument.create();
      
      for (const worksheet of workbook.worksheets) {
        let page = pdfDoc.addPage([800, 1100]);
        const { width, height } = page.getSize();
        
        await drawUnicodeText(page, `Sheet: ${worksheet.name}`, 50, height - 50, 14, { color: rgb(0, 0, 0.8) });
        
        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber <= 100) { 
            const rowData = [];
            row.eachCell((cell) => {
              let value = cell.value;
              if (value && typeof value === 'object') value = value.text || value.result || JSON.stringify(value);
              rowData.push(String(value || ''));
            });
            rows.push(rowData);
          }
        });
        
        const startX = 50;
        let startY = height - 100;
        const rowHeight = 25;
        
        if (rows.length > 0) {
          const colWidths = rows[0].map((_, i) => {
            let maxLen = 10;
            rows.forEach(r => { if(r[i] && r[i].length > maxLen) maxLen = Math.min(r[i].length, 30); });
            return maxLen * 7;
          });
          
          for (let i = 0; i < Math.min(rows.length, 40); i++) {
            let x = startX;
            for (let j = 0; j < rows[i].length; j++) {
              const cellText = rows[i][j] ? rows[i][j].substring(0, 40) : '';
              await drawUnicodeText(page, cellText, x + 3, startY - 5, 9);
              page.drawRectangle({ x: x, y: startY - rowHeight, width: colWidths[j], height: rowHeight, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
              x += colWidths[j];
            }
            startY -= rowHeight;
            if (startY < 50) break; // Chỉ hỗ trợ 1 trang để tránh lag memory
          }
        }
      }
      
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytes);
      
    } else if (fileExt === '.pdf') {
      await fs.copyFile(file.path, outputPath);
    }
    
    await fs.unlink(file.path).catch(() => {});
    res.download(outputPath, file.originalname.replace(/\.[^/.]+$/, '.pdf'), async () => {
      await fs.unlink(outputPath).catch(() => {});
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Lỗi chuyển đổi: ' + error.message });
  }
});

// ==================== 2. GỘP PDF ====================
app.post('/api/merge-pdf', upload.array('files', 20), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length < 2) return res.status(400).json({ error: 'Cần ít nhất 2 file PDF' });

    const mergedPdf = await PDFDocument.create();
    
    for (const file of files) {
      const pdfBytes = await fs.readFile(file.path);
      const pdf = await PDFDocument.load(pdfBytes);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    const outputPath = `uploads/merged_${Date.now()}.pdf`;
    await fs.writeFile(outputPath, await mergedPdf.save());
    
    for (const file of files) await fs.unlink(file.path).catch(() => {});
    
    res.download(outputPath, `merged_${Date.now()}.pdf`, async () => {
      await fs.unlink(outputPath).catch(() => {});
    });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi gộp PDF: ' + error.message });
  }
});

// ==================== 3. TÁCH PDF ====================
app.post('/api/split-pdf', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { pageRange, mode } = req.body;
    if (!file) return res.status(400).json({ error: 'Chưa có file PDF' });

    const pdfBytes = await fs.readFile(file.path);
    const sourcePdf = await PDFDocument.load(pdfBytes);
    const totalPages = sourcePdf.getPageCount();
    const newPdf = await PDFDocument.create();
    
    if (mode === 'first') {
      const [page] = await newPdf.copyPages(sourcePdf, [0]);
      newPdf.addPage(page);
    } else if (mode === 'range' && pageRange) {
      const ranges = pageRange.split(',');
      const pageIndices = [];
      
      for (const range of ranges) {
        if (range.includes('-')) {
          const [start, end] = range.split('-').map(Number);
          for (let i = start - 1; i <= end - 1 && i < totalPages; i++) {
            if (i >= 0) pageIndices.push(i);
          }
        } else {
          const pageNum = parseInt(range) - 1;
          if (pageNum >= 0 && pageNum < totalPages) pageIndices.push(pageNum);
        }
      }
      
      const pages = await newPdf.copyPages(sourcePdf, pageIndices);
      pages.forEach(page => newPdf.addPage(page));
    }
    
    const outputPath = `uploads/split_${Date.now()}.pdf`;
    await fs.writeFile(outputPath, await newPdf.save());
    await fs.unlink(file.path).catch(() => {});
    
    res.download(outputPath, `split_${Date.now()}.pdf`, async () => {
      await fs.unlink(outputPath).catch(() => {});
    });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi tách PDF: ' + error.message });
  }
});

// ==================== 4. KÝ ĐIỆN TỬ ====================
app.post('/api/sign-pdf', upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'signature', maxCount: 1 }
]), async (req, res) => {
  try {
    const pdfFile = req.files['pdf']?.[0];
    const signatureFile = req.files['signature']?.[0];
    const { signerName, reason, location } = req.body;
    
    if (!pdfFile || !signatureFile) return res.status(400).json({ error: 'Thiếu file PDF hoặc chữ ký' });
    
    const pdfBytes = await fs.readFile(pdfFile.path);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();
    
    const sigBytes = await fs.readFile(signatureFile.path);
    let signatureImage;
    if (signatureFile.mimetype === 'image/png') {
      signatureImage = await pdfDoc.embedPng(sigBytes);
    } else {
      signatureImage = await pdfDoc.embedJpg(sigBytes);
    }
    
    const sigWidth = 140;
    const sigHeight = (signatureImage.height / signatureImage.width) * sigWidth;
    
    // Tọa độ động: Góc dưới bên phải, cách lề 50px
    const drawX = width - sigWidth - 50;
    const drawY = 80;

    lastPage.drawImage(signatureImage, {
      x: drawX,
      y: drawY,
      width: sigWidth,
      height: sigHeight
    });
    
    // Thêm Text Tiếng Việt có dấu bằng Fontkit
    pdfDoc.registerFontkit(fontkit);
    const font = customFontBytes ? await pdfDoc.embedFont(customFontBytes) : await pdfDoc.embedStandardFont('Helvetica');
    const yOffset = drawY - 15;
    const textX = width - 250;
    
    if (signerName) {
      lastPage.drawText(`Người ký: ${signerName}`, { x: textX, y: yOffset, size: 10, font: font, color: rgb(0, 0, 0) });
    }
    if (reason) {
      lastPage.drawText(`Lý do: ${reason}`, { x: textX, y: yOffset - 15, size: 10, font: font, color: rgb(0, 0, 0) });
    }
    if (location) {
      lastPage.drawText(`Địa điểm: ${location}`, { x: textX, y: yOffset - 30, size: 10, font: font, color: rgb(0, 0, 0) });
    }
    lastPage.drawText(`Ngày ký: ${new Date().toLocaleString('vi-VN')}`, { x: textX, y: yOffset - 45, size: 9, font: font, color: rgb(0.5, 0.5, 0.5) });
    
    const outputPath = `uploads/signed_${Date.now()}.pdf`;
    await fs.writeFile(outputPath, await pdfDoc.save());
    
    await fs.unlink(pdfFile.path).catch(() => {});
    await fs.unlink(signatureFile.path).catch(() => {});
    
    res.download(outputPath, `signed_${Date.now()}.pdf`, async () => {
      await fs.unlink(outputPath).catch(() => {});
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi ký số: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ PDF Master Server đang chạy tại Port: ${PORT}`);
});