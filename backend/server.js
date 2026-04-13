import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Cấu hình upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (err) {}
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// Helper: Vẽ text hỗ trợ Unicode (tiếng Việt)
async function drawUnicodeText(page, text, x, y, size, options = {}) {
  try {
    // Sử dụng font Helvetica nhưng encode thủ công
    const font = await page.doc.embedFont(StandardFonts.Helvetica);
    const lines = text.split('\n');
    let currentY = y;
    
    for (const line of lines) {
      // Thay thế ký tự đặc biệt
      let safeLine = line
        .replace(/[ểếễệẻẽ]/g, 'e')
        .replace(/[ưứừựửữ]/g, 'u')
        .replace(/[áàảãạâấầẩẫậăắằẳẵặ]/g, 'a')
        .replace(/[óòỏõọôốồổỗộơớờởỡợ]/g, 'o')
        .replace(/[íìỉĩị]/g, 'i')
        .replace(/[ýỳỷỹỵ]/g, 'y')
        .replace(/[đ]/g, 'd')
        .replace(/[ÊẾỀỄỆẺẼ]/g, 'E')
        .replace(/[ƯỨỪỰỬỮ]/g, 'U')
        .replace(/[ÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶ]/g, 'A')
        .replace(/[ÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢ]/g, 'O')
        .replace(/[ÍÌỈĨỊ]/g, 'I')
        .replace(/[ÝỲỶỸỴ]/g, 'Y')
        .replace(/[Đ]/g, 'D');
      
      page.drawText(safeLine, {
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
  res.json({ status: 'ok', message: 'PDF Master Server is running!' });
});

// ==================== 1. CHUYỂN ĐỔI DOCX/EXCEL -> PDF ====================
app.post('/api/convert-to-pdf', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Chưa có file' });
    }

    const fileExt = path.extname(file.originalname).toLowerCase();
    const outputPath = file.path.replace(/\.[^/.]+$/, '.pdf');
    
    if (fileExt === '.docx') {
      // Chuyển đổi DOCX sang PDF
      const inputBuffer = await fs.readFile(file.path);
      const result = await mammoth.extractRawText({ buffer: inputBuffer });
      const text = result.value;
      
      // Tạo PDF từ text
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage([600, 800]);
      const { height } = page.getSize();
      
      // Tiêu đề
      await drawUnicodeText(page, `Chuyen doi tu: ${file.originalname}`, 50, height - 50, 12, { color: rgb(0, 0, 0.8) });
      await drawUnicodeText(page, `Ngay chuyen doi: ${new Date().toLocaleString('vi-VN')}`, 50, height - 80, 10, { color: rgb(0.5, 0.5, 0.5) });
      
      // Nội dung
      const lines = text.split('\n').slice(0, 80);
      let y = height - 120;
      let currentPage = 0;
      
      for (const line of lines) {
        if (y < 50) {
          // Tạo trang mới
          page = pdfDoc.addPage([600, 800]);
          y = height - 50;
          currentPage++;
        }
        
        const displayLine = line.length > 100 ? line.substring(0, 100) + '...' : line;
        if (displayLine.trim()) {
          await drawUnicodeText(page, displayLine, 50, y, 10);
        }
        y -= 18;
      }
      
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytes);
      
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      // Chuyển đổi Excel sang PDF
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file.path);
      
      const pdfDoc = await PDFDocument.create();
      
      for (const worksheet of workbook.worksheets) {
        let page = pdfDoc.addPage([800, 1100]);
        const { width, height } = page.getSize();
        
        // Tiêu đề worksheet
        await drawUnicodeText(page, `Sheet: ${worksheet.name}`, 50, height - 50, 14, { color: rgb(0, 0, 0.8) });
        await drawUnicodeText(page, `File: ${file.originalname}`, 50, height - 80, 10, { color: rgb(0.5, 0.5, 0.5) });
        
        // Lấy dữ liệu
        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber <= 50) { // Giới hạn 50 dòng
            const rowData = [];
            row.eachCell((cell) => {
              let value = cell.value;
              if (value && typeof value === 'object') {
                value = value.text || value.result || JSON.stringify(value);
              }
              rowData.push(String(value || ''));
            });
            rows.push(rowData);
          }
        });
        
        // Vẽ bảng
        const startX = 50;
        let startY = height - 120;
        const rowHeight = 25;
        const colWidths = [];
        
        if (rows.length > 0) {
          // Tính độ rộng cột
          for (let i = 0; i < rows[0].length; i++) {
            let maxLen = 10;
            for (let j = 0; j < Math.min(rows.length, 20); j++) {
              const cellLen = rows[j][i].length;
              if (cellLen > maxLen) maxLen = Math.min(cellLen, 30);
            }
            colWidths.push(maxLen * 6);
          }
          
          // Vẽ dữ liệu
          for (let i = 0; i < Math.min(rows.length, 40); i++) {
            let x = startX;
            for (let j = 0; j < rows[i].length; j++) {
              const cellText = rows[i][j].substring(0, 40);
              await drawUnicodeText(page, cellText, x + 3, startY - 3, 8);
              
              // Vẽ khung
              page.drawRectangle({
                x: x,
                y: startY - rowHeight,
                width: colWidths[j],
                height: rowHeight,
                borderColor: rgb(0.8, 0.8, 0.8),
                borderWidth: 0.5
              });
              x += colWidths[j];
            }
            startY -= rowHeight;
            if (startY < 50) break;
          }
        }
      }
      
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytes);
      
    } else if (fileExt === '.pdf') {
      await fs.copyFile(file.path, outputPath);
    } else {
      await fs.unlink(file.path).catch(() => {});
      return res.status(400).json({ error: 'Định dạng không hỗ trợ. Hỗ trợ: .docx, .xlsx, .xls, .pdf' });
    }
    
    // Xóa file gốc và gửi file kết quả
    await fs.unlink(file.path).catch(() => {});
    res.download(outputPath, file.originalname.replace(/\.[^/.]+$/, '.pdf'), async () => {
      await fs.unlink(outputPath).catch(() => {});
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi chuyển đổi: ' + error.message });
  }
});

// ==================== 2. GỘP PDF ====================
app.post('/api/merge-pdf', upload.array('files', 20), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length < 2) {
      return res.status(400).json({ error: 'Cần ít nhất 2 file PDF' });
    }

    const mergedPdf = await PDFDocument.create();
    
    for (const file of files) {
      const pdfBytes = await fs.readFile(file.path);
      const pdf = await PDFDocument.load(pdfBytes);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    const outputPath = `uploads/merged_${Date.now()}.pdf`;
    await fs.writeFile(outputPath, await mergedPdf.save());
    
    for (const file of files) {
      await fs.unlink(file.path).catch(() => {});
    }
    
    res.download(outputPath, `merged_${Date.now()}.pdf`, async () => {
      await fs.unlink(outputPath).catch(() => {});
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi gộp PDF: ' + error.message });
  }
});

// ==================== 3. TÁCH PDF ====================
app.post('/api/split-pdf', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { pageRange, mode } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'Chưa có file PDF' });
    }

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
    console.error(error);
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
    
    if (!pdfFile || !signatureFile) {
      return res.status(400).json({ error: 'Thiếu file PDF hoặc chữ ký' });
    }
    
    const pdfBytes = await fs.readFile(pdfFile.path);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();
    
    // Đọc ảnh chữ ký
    const sigBytes = await fs.readFile(signatureFile.path);
    let signatureImage;
    
    if (signatureFile.mimetype === 'image/png') {
      signatureImage = await pdfDoc.embedPng(sigBytes);
    } else {
      signatureImage = await pdfDoc.embedJpg(sigBytes);
    }
    
    const sigWidth = 150;
    const sigHeight = (signatureImage.height / signatureImage.width) * sigWidth;
    
    // Vẽ chữ ký
    lastPage.drawImage(signatureImage, {
      x: width - sigWidth - 50,
      y: 50,
      width: sigWidth,
      height: sigHeight
    });
    
    // Thêm thông tin (dùng font Helvetica, bỏ dấu)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const yOffset = sigHeight + 20;
    
    const removeAccents = (str) => {
      return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, function(m) { return m === 'đ' ? 'd' : 'D'; });
    };
    
    if (signerName) {
      lastPage.drawText(`Nguoi ky: ${removeAccents(signerName)}`, {
        x: width - 250,
        y: 50 + yOffset,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    if (reason) {
      lastPage.drawText(`Ly do: ${removeAccents(reason)}`, {
        x: width - 250,
        y: 35 + yOffset,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    if (location) {
      lastPage.drawText(`Dia diem: ${removeAccents(location)}`, {
        x: width - 250,
        y: 20 + yOffset,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    lastPage.drawText(`Ngay ky: ${new Date().toLocaleString('vi-VN')}`, {
      x: width - 250,
      y: 5 + yOffset,
      size: 10,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });
    
    const outputPath = `uploads/signed_${Date.now()}.pdf`;
    await fs.writeFile(outputPath, await pdfDoc.save());
    
    await fs.unlink(pdfFile.path).catch(() => {});
    await fs.unlink(signatureFile.path).catch(() => {});
    
    res.download(outputPath, `signed_${Date.now()}.pdf`, async () => {
      await fs.unlink(outputPath).catch(() => {});
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi ký số: ' + error.message });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ PDF Master Server dang chay tai: http://localhost:${PORT}`);
  console.log(`📄 Ho tro: DOCX, XLSX, XLS, PDF`);
  console.log(`✍️  Tinh nang: Chuyen doi, Gop, Tach, Ky dien tu`);
});