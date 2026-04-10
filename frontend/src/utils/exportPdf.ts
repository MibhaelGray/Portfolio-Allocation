import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface ExportOptions {
  title: string;
  subtitle?: string;
  metadata: { label: string; value: string }[];
  filename: string;
  sections: HTMLElement[];
}

export async function exportToPdf(options: ExportOptions): Promise<void> {
  const { title, subtitle, metadata, filename, sections } = options;

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const usableWidth = pageWidth - margin * 2;
  let y = margin;

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(42, 36, 30);
  pdf.text(title, margin, y + 7);
  y += 12;

  // Subtitle
  if (subtitle) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(138, 130, 121);
    pdf.text(subtitle, margin, y + 4);
    y += 8;
  }

  // Metadata line
  if (metadata.length > 0) {
    pdf.setFontSize(9);
    pdf.setTextColor(138, 130, 121);
    const metaStr = metadata.map(m => `${m.label}: ${m.value}`).join('   ·   ');
    pdf.text(metaStr, margin, y + 4);
    y += 8;
  }

  // Date
  pdf.setFontSize(8);
  pdf.setTextColor(170, 163, 155);
  pdf.text(`Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y + 3);
  y += 10;

  // Divider
  pdf.setDrawColor(224, 220, 213);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Capture each section
  for (const el of sections) {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#faf9f6',
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const imgHeight = (canvas.height * usableWidth) / canvas.width;

    // If this section won't fit, start a new page
    if (y + imgHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }

    pdf.addImage(imgData, 'PNG', margin, y, usableWidth, imgHeight);
    y += imgHeight + 4;
  }

  pdf.save(filename);
}
