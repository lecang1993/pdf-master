import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

const app = express();
const PORT = process.env.PORT || 3001;

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
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const page = pdfDoc.addPage([600, 800]);
      const { width, height } = page.getSize();
      
      // Tiêu đề
      page.drawText(`Chuyển đổi từ: ${file.originalname}`, {
        x: 50,
        y: height - 50,
        size: 14,
        font: font,
        color: rgb(0, 0, 0.8)
      });
      
      page.drawText(`Ngày chuyển đổi: ${new Date().toLocaleString()}`, {
        x: 50,
        y: height - 80,
        size: 10,
        font: font,
        color: rgb(0.5, 0.5, 0.5)
      });
      
      // Nội dung
      const lines = text.split('\n').slice(0, 100);
      let y = height - 120;
      
      for (const line of lines) {
        if (y < 50) break;
        const displayLine = line.length > 100 ? line.substring(0, 100) + '...' : line;
        page.drawText(displayLine || ' ', {
          x: 50,
          y: y,
          size: 10,
          font: font,
          color: rgb(0, 0, 0)
        });
        y -= 18;
      }
      
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytes);
      
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      // Chuyển đổi Excel sang PDF
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file.path);
      
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      workbook.eachWorksheet((worksheet, worksheetId) => {
        let page = pdfDoc.addPage([800, 1100]);
        const { width, height } = page.getSize();
        
        // Tiêu đề worksheet
        page.drawText(`Sheet: ${worksheet.name}`, {
          x: 50,
          y: height - 50,
          size: 16,
          font: font,
          color: rgb(0, 0, 0.8)
        });
        
        page.drawText(`File: ${file.originalname}`, {
          x: 50,
          y: height - 80,
          size: 10,
          font: font,
          color: rgb(0.5, 0.5, 0.5)
        });
        
        // Lấy dữ liệu
        const rows = [];
        worksheet.eachRow((row, rowNumber) => {
          const rowData = [];
          row.eachCell((cell) => {
            let value = cell.value;
            if (value && typeof value === 'object') {
              value = value.text || value.result || JSON.stringify(value);
            }
            rowData.push(value || '');
          });
          rows.push(rowData);
        });
        
        // Vẽ bảng
        const startX = 50;
        let startY = height - 120;
        const rowHeight = 25;
        const colWidths = [];
        
        if (rows.length > 0) {
          for (let i = 0; i < rows[0].length; i++) {
            let maxLen = 10;
            for (let j = 0; j < Math.min(rows.length, 20); j++) {
              const cellLen = String(rows[j][i] || '').length;
              if (cellLen > maxLen) maxLen = Math.min(cellLen, 30);
            }
            colWidths.push(maxLen * 6);
          }
          
          for (let i = 0; i < Math.min(rows.length, 40); i++) {
            let x = startX;
            for (let j = 0; j < rows[i].length; j++) {
              const cellText = String(rows[i][j] || '').substring(0, 40);
              page.drawText(cellText, {
                x: x + 3,
                y: startY - 3,
                size: 8,
                font: font,
                color: rgb(0, 0, 0)
              });
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
      });
      
      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(outputPath, pdfBytes);
      
    } else if (fileExt === '.pdf') {
      // Nếu đã là PDF thì copy
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
    
    // Xóa file gốc
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
      // Tách trang đầu
      const [page] = await newPdf.copyPages(sourcePdf, [0]);
      newPdf.addPage(page);
    } else if (mode === 'range' && pageRange) {
      // Tách theo khoảng trang: "1-3,5,7-9"
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
    
    // Đọc file PDF
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
    
    // Vẽ chữ ký ở góc dưới phải
    lastPage.drawImage(signatureImage, {
      x: width - sigWidth - 50,
      y: 50,
      width: sigWidth,
      height: sigHeight
    });
    
    // Thêm thông tin ký
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const yOffset = sigHeight + 20;
    
    if (signerName) {
      lastPage.drawText(`Người ký: ${signerName}`, {
        x: width - 250,
        y: 50 + yOffset,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    if (reason) {
      lastPage.drawText(`Lý do: ${reason}`, {
        x: width - 250,
        y: 35 + yOffset,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    if (location) {
      lastPage.drawText(`Địa điểm: ${location}`, {
        x: width - 250,
        y: 20 + yOffset,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });
    }
    
    lastPage.drawText(`Ngày ký: ${new Date().toLocaleString()}`, {
      x: width - 250,
      y: 5 + yOffset,
      size: 10,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });
    
    const outputPath = `uploads/signed_${Date.now()}.pdf`;
    await fs.writeFile(outputPath, await pdfDoc.save());
    
    // Xóa file tạm
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

app.listen(PORT, () => {
  console.log(`✅ PDF Master Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📄 Hỗ trợ: DOCX, XLSX, XLS, PDF`);
  console.log(`✍️  Tính năng: Chuyển đổi, Gộp, Tách, Ký điện tử`);
});