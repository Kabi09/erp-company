import PDFDocument from 'pdfkit';
import type { CompanySettings } from '../../src/types/erp';

export interface PDFDocData {
  title: string;
  docNo: string;
  date: string;
  status?: string;
  referenceNo?: string;
  partyType?: 'Customer' | 'Supplier' | 'Consignee' | 'Internal';
  partyName?: string;
  partyAddress?: string;
  partyGstin?: string;
  items: Array<{
    name: string;
    description?: string;
    quantity: number;
    unit?: string;
    rate?: number;
    amount?: number;
  }>;
  subtotal?: number;
  taxAmount?: number;
  taxPercent?: number;
  grandTotal?: number;
  notes?: string;
  terms?: string[];
  bankDetails?: boolean;
  transportDetails?: {
    method?: string;
    vehicleNo?: string;
    driverName?: string;
    driverPhone?: string;
    courierName?: string;
    trackingNo?: string;
  };
  qcDetails?: {
    visualCheck?: string;
    electricalCheck?: string;
    thermalCheck?: string;
    calibrationCheck?: string;
    finalResult?: string;
    inspectedBy?: string;
  };
  includeDeveloperCredit?: boolean;
}

const DEVELOPER_CREDIT_URL = 'https://www.ameyy.in/';

function drawDeveloperCreditFooter(doc: InstanceType<typeof PDFDocument>): void {
  const prevBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  try {
    const prefix = 'Developed by';
    const companyText = 'Ameyy Digital Services';
    const fontSize = 7.5;
    const footerY = doc.page.height - 24;
    const gapHeart = 3.5;
    const heartW = 7;
    const gapArrow = 2.5;
    const arrowW = 6;

    doc.font('Helvetica').fontSize(fontSize);
    const prefixW = doc.widthOfString(prefix);
    const companyW = doc.widthOfString(companyText);
    const totalW = prefixW + gapHeart + heartW + gapHeart + companyW + gapArrow + arrowW;

    let x = (doc.page.width - totalW) / 2;

    doc.fillColor('#94a3b8').text(prefix, x, footerY, { lineBreak: false });
    x += prefixW + gapHeart;

    // Draw crisp vector red heart aligned with 7.5pt text baseline
    const hx = x + heartW / 2;
    doc.save()
      .moveTo(hx, footerY + 2.3)
      .bezierCurveTo(hx - 1.6, footerY + 0.6, hx - 3.8, footerY + 1.8, hx - 3.4, footerY + 3.8)
      .bezierCurveTo(hx - 3.1, footerY + 5.1, hx - 1.4, footerY + 6.0, hx, footerY + 6.9)
      .bezierCurveTo(hx + 1.4, footerY + 6.0, hx + 3.1, footerY + 5.1, hx + 3.4, footerY + 3.8)
      .bezierCurveTo(hx + 3.8, footerY + 1.8, hx + 1.6, footerY + 0.6, hx, footerY + 2.3)
      .closePath()
      .fillColor('#ef4444')
      .fill()
      .restore();
    x += heartW + gapHeart;

    // Blue underlined company name (draw explicit crisp underline to avoid PDFKit lineBreak NaN bug)
    const linkStartX = x;
    doc.font('Helvetica').fontSize(fontSize).fillColor('#2563eb').text(companyText, x, footerY, {
      lineBreak: false,
    });
    doc.save()
      .strokeColor('#2563eb')
      .lineWidth(0.55)
      .moveTo(linkStartX, footerY + 8.4)
      .lineTo(linkStartX + companyW, footerY + 8.4)
      .stroke()
      .restore();
    x += companyW + gapArrow;

    // Vector northeast arrow
    doc.save()
      .strokeColor('#2563eb')
      .lineWidth(0.85)
      .lineCap('round')
      .lineJoin('round')
      .moveTo(x + 0.8, footerY + 6.2)
      .lineTo(x + 5.0, footerY + 2.0)
      .moveTo(x + 2.0, footerY + 2.0)
      .lineTo(x + 5.0, footerY + 2.0)
      .lineTo(x + 5.0, footerY + 5.0)
      .stroke()
      .restore();
    doc.link(linkStartX, footerY - 1, companyW + gapArrow + arrowW, 10.5, DEVELOPER_CREDIT_URL);
  } finally {
    doc.page.margins.bottom = prevBottomMargin;
  }
}

export class PDFService {
  async generatePDF(data: PDFDocData, company: CompanySettings): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 36,
          bufferPages: true,
          info: {
            Title: `${data.title} - ${data.docNo}`,
            Author: company.companyName || 'CRYO Enterprise ERP',
            Subject: data.docNo,
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const pageWidth = 595.28;
        const margin = 36;
        const contentWidth = pageWidth - margin * 2;

        // --- 1. HEADER & BRANDING ---
        doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(company.companyName || 'CRYO SYSTEMS INDIA PVT LTD', margin, margin);
        doc.fillColor('#475569').fontSize(8).font('Helvetica');
        const compAddress = company.address || 'Plot 42, Phase II, Peenya Industrial Area, Bengaluru, Karnataka - 560058';
        doc.text(compAddress, margin, margin + 20, { width: 300 });
        doc.text(`GSTIN: ${company.gstin || '29AABCC1234F1Z5'} | Email: ${company.email || 'info@cryoerp.com'} | Ph: ${company.phone || '+91 80 2839 0000'}`, margin, margin + 40, { width: 340 });

        // Document Title Banner on Right
        doc.fillColor('#0d9488').rect(pageWidth - margin - 180, margin, 180, 26).fill();
        doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold').text(data.title.toUpperCase(), pageWidth - margin - 175, margin + 7, {
          width: 170,
          align: 'center',
        });

        // Document Meta Details
        doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
        doc.text(`Doc No: ${data.docNo}`, pageWidth - margin - 180, margin + 32, { width: 180, align: 'right' });
        doc.font('Helvetica').fillColor('#64748b');
        doc.text(`Date: ${data.date}`, pageWidth - margin - 180, margin + 44, { width: 180, align: 'right' });
        if (data.referenceNo) {
          doc.text(`Ref: ${data.referenceNo}`, pageWidth - margin - 180, margin + 56, { width: 180, align: 'right' });
        }
        if (data.status) {
          doc.text(`Status: ${data.status}`, pageWidth - margin - 180, margin + 68, { width: 180, align: 'right' });
        }

        // Horizontal Rule
        let curY = margin + 85;
        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(margin, curY).lineTo(pageWidth - margin, curY).stroke();
        curY += 10;

        // --- 2. PARTY INFORMATION BLOCK ---
        if (data.partyName) {
          doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(`${data.partyType || 'Party'}:`, margin, curY);
          doc.fontSize(10).font('Helvetica-Bold').text(data.partyName, margin, curY + 12);
          doc.fontSize(8).font('Helvetica').fillColor('#475569');
          if (data.partyAddress) {
            doc.text(data.partyAddress, margin, curY + 25, { width: 300 });
          }
          if (data.partyGstin) {
            doc.text(`GSTIN: ${data.partyGstin}`, margin, curY + 45);
          }
          curY += 60;
        }

        // Transport details if present
        if (data.transportDetails) {
          doc.rect(margin, curY, contentWidth, 24).fillColor('#f8fafc').fill().strokeColor('#e2e8f0').stroke();
          doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold').text('TRANSPORT DETAILS:', margin + 8, curY + 7);
          doc.font('Helvetica').fillColor('#475569');
          const t = data.transportDetails;
          const info = t.method === 'Own Vehicle'
            ? `Vehicle No: ${t.vehicleNo || 'N/A'} | Driver: ${t.driverName || 'N/A'} (${t.driverPhone || 'N/A'})`
            : `Carrier: ${t.courierName || 'Courier'} | AWB/Tracking: ${t.trackingNo || 'N/A'}`;
          doc.text(info, margin + 110, curY + 7, { width: contentWidth - 120 });
          curY += 32;
        }

        // Quality check checklist if present
        if (data.qcDetails) {
          doc.rect(margin, curY, contentWidth, 34).fillColor('#f0fdf4').fill().strokeColor('#bbf7d0').stroke();
          doc.fillColor('#166534').fontSize(8).font('Helvetica-Bold').text('QUALITY INSPECTION RESULTS:', margin + 8, curY + 5);
          doc.font('Helvetica').fontSize(7.5).fillColor('#15803d');
          const qc = data.qcDetails;
          doc.text(
            `Visual: ${qc.visualCheck || 'Pass'} | Electrical: ${qc.electricalCheck || 'Pass'} | Thermal: ${qc.thermalCheck || 'Pass'} | Calibration: ${qc.calibrationCheck || 'Pass'} | Inspector: ${qc.inspectedBy || 'Quality Eng'}`,
            margin + 8,
            curY + 18,
          );
          curY += 42;
        }

        // --- 3. ITEMS TABLE ---
        const tableTop = curY;
        const col1 = margin; // Item (#)
        const col2 = margin + 25; // Description
        const col3 = margin + 280; // Qty
        const col4 = margin + 340; // Rate
        const col5 = margin + 420; // Amount

        // Table Header
        doc.rect(margin, tableTop, contentWidth, 20).fillColor('#f1f5f9').fill().strokeColor('#cbd5e1').stroke();
        doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
        doc.text('#', col1 + 4, tableTop + 5, { width: 20 });
        doc.text('Description / Specifications', col2 + 4, tableTop + 5, { width: 250 });
        doc.text('Quantity', col3 + 4, tableTop + 5, { width: 55, align: 'right' });
        doc.text('Rate', col4 + 4, tableTop + 5, { width: 75, align: 'right' });
        doc.text('Amount', col5 + 4, tableTop + 5, { width: 95, align: 'right' });

        curY = tableTop + 20;

        // Table Rows
        doc.font('Helvetica').fontSize(8).fillColor('#1e293b');
        data.items.forEach((item, idx) => {
          const rowHeight = item.description ? 26 : 18;

          // Page break guard
          if (curY + rowHeight > 730) {
            doc.addPage();
            curY = margin;
          }

          doc.rect(margin, curY, contentWidth, rowHeight).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
          doc.text(String(idx + 1), col1 + 4, curY + 4, { width: 20 });
          doc.font('Helvetica-Bold').text(item.name, col2 + 4, curY + 4, { width: 250 });
          if (item.description) {
            doc.font('Helvetica').fillColor('#64748b').text(item.description, col2 + 4, curY + 14, { width: 250 });
            doc.fillColor('#1e293b');
          }
          doc.font('Helvetica').text(`${item.quantity} ${item.unit || 'Units'}`, col3 + 4, curY + 4, { width: 55, align: 'right' });
          doc.text(item.rate !== undefined ? `${company.currencySymbol || '₹'}${item.rate.toLocaleString('en-IN')}` : '-', col4 + 4, curY + 4, { width: 75, align: 'right' });
          doc.font('Helvetica-Bold').text(item.amount !== undefined ? `${company.currencySymbol || '₹'}${item.amount.toLocaleString('en-IN')}` : '-', col5 + 4, curY + 4, { width: 95, align: 'right' });

          curY += rowHeight;
        });

        curY += 8;

        // --- 4. FINANCIAL SUMMARY BLOCK ---
        if (data.grandTotal !== undefined) {
          if (curY > 660) {
            doc.addPage();
            curY = margin;
          }
          const sumBoxWidth = 200;
          const sumBoxX = pageWidth - margin - sumBoxWidth;

          if (data.subtotal !== undefined) {
            doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('Subtotal:', sumBoxX, curY, { width: 90, align: 'right' });
            doc.font('Helvetica-Bold').fillColor('#0f172a').text(`${company.currencySymbol || '₹'}${data.subtotal.toLocaleString('en-IN')}`, sumBoxX + 95, curY, { width: 100, align: 'right' });
            curY += 14;
          }

          if (data.taxAmount !== undefined) {
            doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(`GST (${data.taxPercent || 18}%):`, sumBoxX, curY, { width: 90, align: 'right' });
            doc.font('Helvetica-Bold').fillColor('#0f172a').text(`${company.currencySymbol || '₹'}${data.taxAmount.toLocaleString('en-IN')}`, sumBoxX + 95, curY, { width: 100, align: 'right' });
            curY += 14;
          }

          doc.rect(sumBoxX, curY, sumBoxWidth, 22).fillColor('#f8fafc').fill().strokeColor('#0d9488').stroke();
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#0d9488').text('Grand Total:', sumBoxX + 5, curY + 6, { width: 85, align: 'right' });
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(`${company.currencySymbol || '₹'}${data.grandTotal.toLocaleString('en-IN')}`, sumBoxX + 95, curY + 6, { width: 100, align: 'right' });
          curY += 30;
        }

        // --- 5. BANK DETAILS & TERMS ---
        if (curY > 685) {
          doc.addPage();
          curY = margin;
        }
        if (data.bankDetails && company.bankName) {
          doc.rect(margin, curY, 260, 50).fillColor('#f8fafc').fill().strokeColor('#cbd5e1').stroke();
          doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold').text('COMPANY BANK DETAILS FOR REMITTANCE:', margin + 6, curY + 5);
          doc.font('Helvetica').fontSize(7.5).fillColor('#475569');
          doc.text(`Bank: ${company.bankName} | A/C Name: ${company.bankAccountName || company.companyName}`, margin + 6, curY + 16);
          doc.text(`A/C No: ${company.bankAccountNumber} | IFSC: ${company.bankIfsc}`, margin + 6, curY + 27);
          doc.text(`Branch: ${company.bankBranch || 'Bangalore'}`, margin + 6, curY + 38);
        }

        // Terms and conditions
        const terms = data.terms || [
          company.defaultPaymentTerms || '100% advance or approved commercial credit.',
          company.defaultDeliveryTerms || 'Ex-Works factory dispatch within promised delivery schedule.',
          company.defaultWarranty || '12 months comprehensive warranty against manufacturing defects.',
        ];

        if (terms.length > 0) {
          const termsX = data.bankDetails && company.bankName ? margin + 275 : margin;
          const termsWidth = data.bankDetails && company.bankName ? contentWidth - 275 : contentWidth;
          doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold').text('TERMS & CONDITIONS:', termsX, curY + 2);
          doc.font('Helvetica').fontSize(7).fillColor('#64748b');
          let termY = curY + 13;
          terms.slice(0, 3).forEach((term, i) => {
            doc.text(`${i + 1}. ${term}`, termsX, termY, { width: termsWidth });
            termY += 10;
          });
        }

        curY += 60;

        // Guard before signature block so footer credit never overlaps signatures on multi-page PDFs
        if (curY > 745) {
          doc.addPage();
          curY = margin;
        }

        // --- 6. SIGNATURE BLOCK ---
        const sigY = Math.max(curY, 730);
        doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(pageWidth - margin - 150, sigY).lineTo(pageWidth - margin, sigY).stroke();
        doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold').text(`For ${company.companyName || 'CRYO Enterprise'}`, pageWidth - margin - 150, sigY + 5, { width: 150, align: 'center' });
        doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Authorized Signatory', pageWidth - margin - 150, sigY + 16, { width: 150, align: 'center' });

        // Footer note
        doc.font('Helvetica').fontSize(7).fillColor('#94a3b8').text('This is a computer-generated document issued by CRYO Enterprise ERP 2.0.', margin, sigY + 16, { width: 300 });

        if (data.includeDeveloperCredit) {
          const range = doc.bufferedPageRange();
          for (let i = range.start; i < range.start + range.count; i += 1) {
            doc.switchToPage(i);
            drawDeveloperCreditFooter(doc);
          }
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

export const pdfService = new PDFService();
