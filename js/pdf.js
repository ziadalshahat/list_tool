/**
 * PDF Generation Module for Premium Product List Generator
 * Handles catalog configuration, manual & list-based selection,
 * jsPDF layout rendering (A4 portrait, dual-column, pagination),
 * Arabic RTL & Amiri font loading, and preview/download.
 */

(function () {
  'use strict';

  /**
   * Color Palette Constants - Google Stitch Luxury Corporate Design System
   */
  const COLORS = {
    NAVY: [23, 38, 56],          // Deep Midnight Navy (#172638)
    GOLD: [182, 154, 104],       // Champagne Gold (#B69A68)
    WHITE: [255, 255, 255],      // Pure White (#FFFFFF)
    WARM_IVORY: [248, 246, 241], // Warm Ivory (#F8F6F1)
    CARD_BG: [255, 255, 255],    // Pure White Card Surface (#FFFFFF)
    GRAY: [119, 119, 119],       // Sophisticated Warm Gray (#777777)
    LIGHT_GRAY: [165, 165, 165], // Secondary Light Gray (#A5A5A5)
    HAIRLINE: [232, 230, 225],   // Delicate divider border (#E8E6E1)
    CARD_BORDER: [224, 221, 214] // Refined card border (#E0DDD6)
  };

  /**
   * Helper function to detect Arabic characters
   * @param {string} text
   * @returns {boolean}
   */
  const isArabic = (text) => {
    if (!text) return false;
    return /[\u0600-\u06FF]/.test(text);
  };

  /**
   * Draws a refined heraldic divider line with a central Champagne Gold diamond ornament
   */
  function drawStitchDivider(doc, startX, endX, y, diamondSize = 1.8) {
    const cx = (startX + endX) / 2;
    // Left line segment
    doc.setDrawColor(COLORS.GOLD[0], COLORS.GOLD[1], COLORS.GOLD[2]);
    doc.setLineWidth(0.35);
    doc.line(startX, y, cx - diamondSize - 1.2, y);
    // Right line segment
    doc.line(cx + diamondSize + 1.2, y, endX, y);

    // Center heraldic diamond rhombus
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(COLORS.GOLD[0], COLORS.GOLD[1], COLORS.GOLD[2]);
    doc.setLineWidth(0.35);
    doc.triangle(cx, y - diamondSize, cx + diamondSize, y, cx - diamondSize, y, 'FD');
    doc.triangle(cx, y + diamondSize, cx + diamondSize, y, cx - diamondSize, y, 'FD');

    // Center tiny gold dot
    doc.setFillColor(COLORS.GOLD[0], COLORS.GOLD[1], COLORS.GOLD[2]);
    doc.circle(cx, y, 0.45, 'F');
  }

  /**
   * High-DPI Native Arabic Canvas Renderer
   * Renders cursive, perfectly connected Arabic text using the browser's native text engine
   * at 4x resolution (300+ DPI print quality) to guarantee zero disconnected letters.
   */
  function drawArabicCanvasText(doc, text, x, y, maxW, fontSizePt, colorRgb, align = 'right', weight = 'bold') {
    if (!text) return;
    if (typeof document !== 'undefined' && document.createElement) {
      const scale = 4;
      const canvas = document.createElement('canvas');
      const ptToPx = 1.333333;
      const fontSizePx = fontSizePt * ptToPx * scale;
      const fontStr = `${weight} ${fontSizePx}px "Amiri", "Cairo", "Noto Sans Arabic", "Segoe UI", "Tahoma", sans-serif`;

      const ctx = canvas.getContext('2d');
      ctx.font = fontStr;
      const metrics = ctx.measureText(text);

      const pad = 4 * scale;
      const canvasW = Math.max(1, Math.ceil(metrics.width + pad * 2));
      const canvasH = Math.max(1, Math.ceil(fontSizePx * 1.55));
      canvas.width = canvasW;
      canvas.height = canvasH;

      ctx.font = fontStr;
      ctx.direction = 'rtl';
      ctx.fillStyle = `rgb(${colorRgb[0]}, ${colorRgb[1]}, ${colorRgb[2]})`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillText(text, canvasW - pad, canvasH / 2);

      const imgData = canvas.toDataURL('image/png');
      const wMm = (canvasW / scale) * 0.264583;
      const hMm = (canvasH / scale) * 0.264583;

      const finalW = Math.min(wMm, maxW);
      const finalH = (finalW / wMm) * hMm;
      let finalX = x;
      if (align === 'right') {
        finalX = x - finalW;
      } else if (align === 'center') {
        finalX = x - finalW / 2;
      } else {
        finalX = x;
      }
      const finalY = y - finalH * 0.65;

      doc.addImage(imgData, 'PNG', finalX, finalY, finalW, finalH);
    } else if (doc.processArabic) {
      doc.setFont('Amiri', weight === 'bold' ? 'bold' : 'normal');
      doc.setFontSize(fontSizePt);
      doc.setTextColor(colorRgb[0], colorRgb[1], colorRgb[2]);
      doc.text(doc.processArabic(text), x, y, { align: align });
    }
  }

  /**
   * Shapes Arabic characters into cursive glyphs and performs RTL reversal
   * for accurate visual rendering in jsPDF text streams (fallback).
   */
  function formatArabicText(doc, text) {
    if (!text) return '';
    if (!/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) return text;
    const shaped = (typeof doc.processArabic === 'function') ? doc.processArabic(text) : text;
    const tokens = shaped.match(/[\uFE70-\uFEFF\u0600-\u06FF]+|[^\uFE70-\uFEFF\u0600-\u06FF]+/g) || [shaped];
    const reversedTokens = tokens.reverse().map(token => {
      if (/[\uFE70-\uFEFF\u0600-\u06FF]/.test(token)) {
        return token.split('').reverse().join('');
      }
      return token;
    });
    return reversedTokens.join('');
  }

  /**
   * Loads and registers Amiri font for jsPDF Arabic text support
   * Caches font data in localStorage / memory
   * @param {object} doc - jsPDF document instance
   * @returns {Promise<boolean>}
   */
  async function loadArabicFont(doc) {
    let fontData = localStorage.getItem('amiri-font-base64');
    if (!fontData) {
      try {
        let response = await fetch('lib/Amiri-Regular.ttf').catch(() => null);
        if (!response || !response.ok) {
          response = await fetch('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Regular.ttf');
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        fontData = btoa(binary);
        try {
          localStorage.setItem('amiri-font-base64', fontData);
        } catch (storageErr) {
          console.warn('LocalStorage quota exceeded for Arabic font:', storageErr);
        }
      } catch (e) {
        console.warn('Could not load Arabic font:', e);
        if (window.showToast) {
          window.showToast('Could not load Arabic font; falling back to standard font.', 'info');
        }
        return false;
      }
    }

    try {
      doc.addFileToVFS('Amiri-Regular.ttf', fontData);
      doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
      return true;
    } catch (e) {
      console.warn('Failed to register Arabic font in jsPDF:', e);
      return false;
    }
  }

  /**
   * Helper to load an image element and obtain natural dimensions
   * @param {string} src
   * @returns {Promise<{width: number, height: number}|null>}
   */
  function getImageDimensions(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  /**
   * Crops/scales an image from its center to completely cover the target aspect ratio,
   * eliminating empty margins (CSS object-fit: cover).
   * @param {string} src - Base64 or URL
   * @param {number} targetW - Target width in mm
   * @param {number} targetH - Target height in mm
   * @returns {Promise<string>} - Base64 JPEG data URL
   */
  function getCoverCroppedImage(src, targetW, targetH) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const imgW = img.naturalWidth || img.width;
          const imgH = img.naturalHeight || img.height;
          if (!imgW || !imgH) return resolve(src);

          const targetRatio = targetW / targetH;
          const currentRatio = imgW / imgH;

          let cropX = 0;
          let cropY = 0;
          let cropW = imgW;
          let cropH = imgH;

          if (currentRatio > targetRatio) {
            // Image is wider than container -> crop left and right
            cropW = imgH * targetRatio;
            cropX = (imgW - cropW) / 2;
          } else {
            // Image is taller than container -> crop top and bottom
            cropH = imgW / targetRatio;
            cropY = (imgH - cropH) / 2;
          }

          const canvas = document.createElement('canvas');
          const maxDim = 1000;
          let scale = 1;
          if (cropW > maxDim || cropH > maxDim) {
            scale = maxDim / Math.max(cropW, cropH);
          }
          canvas.width = Math.max(10, Math.round(cropW * scale));
          canvas.height = Math.max(10, Math.round(cropH * scale));

          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

          resolve(canvas.toDataURL('image/jpeg', 0.92));
        } catch (e) {
          console.warn('Canvas cropping failed, using original src:', e);
          resolve(src);
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }

  /**
   * Renders Stitch luxury header on first page or compact running header on pages 2+
   */
  function renderCatalogHeader(doc, pageNum, totalPages, companyName, companyNameAr, logo, logoDims, tagline, refCode, formattedDate, marginX, pageWidth) {
    if (pageNum === 1) {
      let logoW = 14;
      let logoH = 14;

      if (logo) {
        const maxLogoW = 30;
        const maxLogoH = 14;
        const lRatio = logoDims ? (logoDims.width / logoDims.height) : 2.0;
        if (lRatio > maxLogoW / maxLogoH) {
          logoW = maxLogoW;
          logoH = maxLogoW / lRatio;
        } else {
          logoH = maxLogoH;
          logoW = maxLogoH * lRatio;
        }
        try {
          const lFmt = logo.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(logo, lFmt, marginX, 10 + (maxLogoH - logoH) / 2, logoW, logoH);
        } catch (e) {
          console.warn('Error rendering logo:', e);
        }
      } else {
        doc.setFillColor(COLORS.NAVY[0], COLORS.NAVY[1], COLORS.NAVY[2]);
        doc.roundedRect(marginX, 10, 14, 14, 2.5, 2.5, 'F');
        doc.setTextColor(COLORS.GOLD[0], COLORS.GOLD[1], COLORS.GOLD[2]);
        doc.setFont('times', 'bold');
        doc.setFontSize(11);
        const initial = (companyName || 'O').trim().charAt(0).toUpperCase();
        doc.text(initial, marginX + 7, 18.5, { align: 'center' });
        logoW = 14;
      }

      const nameX = marginX + logoW + 5;
      
      // English Company Name
      doc.setFont('times', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(COLORS.NAVY[0], COLORS.NAVY[1], COLORS.NAVY[2]);
      doc.text(companyName.toUpperCase(), nameX, 15.2);

      // Arabic Company Name in Champagne Gold
      if (companyNameAr) {
        drawArabicCanvasText(doc, companyNameAr, nameX, 19.8, 80, 9.5, COLORS.GOLD, 'left');
      }

      // Company Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.4);
      doc.setTextColor(COLORS.GRAY[0], COLORS.GRAY[1], COLORS.GRAY[2]);
      const subtitleY = companyNameAr ? 24 : 20.5;
      doc.text(tagline.toUpperCase(), nameX, subtitleY);

      // Right Header Block
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(COLORS.GOLD[0], COLORS.GOLD[1], COLORS.GOLD[2]);
      doc.text('P R O D U C T   C O L L E C T I O N', pageWidth - marginX, 14, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(COLORS.NAVY[0], COLORS.NAVY[1], COLORS.NAVY[2]);
      doc.text('Professional Product Selection', pageWidth - marginX, 18.5, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(COLORS.GRAY[0], COLORS.GRAY[1], COLORS.GRAY[2]);
      doc.text(`DATE OF ISSUE • ${formattedDate.toUpperCase()} • ${refCode}`, pageWidth - marginX, 22.5, { align: 'right' });

      // Gold divider with central heraldic rhombus ornament at Y = 26.5mm
      drawStitchDivider(doc, marginX, pageWidth - marginX, 26.5, 1.8);

    } else {
      // Running Header (Pages 2+) - Bilingual
      let logoW = 9;
      if (logo) {
        try {
          const lFmt = logo.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(logo, lFmt, marginX, 8, 9, 9);
        } catch (e) {}
      } else {
        doc.setFillColor(COLORS.NAVY[0], COLORS.NAVY[1], COLORS.NAVY[2]);
        doc.roundedRect(marginX, 8, 9, 9, 1.5, 1.5, 'F');
        doc.setTextColor(COLORS.GOLD[0], COLORS.GOLD[1], COLORS.GOLD[2]);
        doc.setFont('times', 'bold');
        doc.setFontSize(7.5);
        const initial = (companyName || 'O').trim().charAt(0).toUpperCase();
        doc.text(initial, marginX + 4.5, 13.8, { align: 'center' });
      }

      const nameX = marginX + logoW + 4;
      doc.setFont('times', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(COLORS.NAVY[0], COLORS.NAVY[1], COLORS.NAVY[2]);
      doc.text(companyName.toUpperCase(), nameX, 13.5);

      if (companyNameAr) {
        const enW = doc.getTextWidth(companyName.toUpperCase());
        drawArabicCanvasText(doc, companyNameAr, nameX + enW + 4, 13.5, 50, 8, COLORS.GOLD, 'left');
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(COLORS.GRAY[0], COLORS.GRAY[1], COLORS.GRAY[2]);
      doc.text(`CATALOG SPECIFICATIONS • ${refCode}`, 130, 13.5, { align: 'center' });
      doc.text(formattedDate.toUpperCase(), pageWidth - marginX, 13.5, { align: 'right' });

      // Running divider
      drawStitchDivider(doc, marginX, pageWidth - marginX, 19, 1.4);
    }
  }

  /**
   * Renders Stitch luxury footer with dynamic company profile and accurate page numbering
   */
  function renderCatalogFooter(doc, pageNum, totalPages, companyName, address, email, phone, marginX, pageWidth) {
    const footerY = 280;

    // Left: Company Name & Address from Settings
    const footerCompanyName = companyName.toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(COLORS.NAVY[0], COLORS.NAVY[1], COLORS.NAVY[2]);
    doc.text(footerCompanyName, marginX, footerY + 2.8, { maxWidth: 36 });

    if (address) {
      if (isArabic(address)) {
        drawArabicCanvasText(doc, address, marginX, footerY + 6.5, 36, 5.5, COLORS.GRAY, 'left');
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(COLORS.GRAY[0], COLORS.GRAY[1], COLORS.GRAY[2]);
        doc.text(address.toUpperCase(), marginX, footerY + 6.5, { maxWidth: 36 });
      }
    }

    // Vertical divider line
    doc.setDrawColor(COLORS.CARD_BORDER[0], COLORS.CARD_BORDER[1], COLORS.CARD_BORDER[2]);
    doc.setLineWidth(0.25);
    doc.line(marginX + 38, footerY, marginX + 38, footerY + 8.5);

    // Email & Phone from Settings
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.6);
    doc.setTextColor(COLORS.GRAY[0], COLORS.GRAY[1], COLORS.GRAY[2]);
    doc.text(email.toUpperCase(), marginX + 41, footerY + 3.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.6);
    doc.setTextColor(COLORS.GRAY[0], COLORS.GRAY[1], COLORS.GRAY[2]);
    doc.text(phone, marginX + 41, footerY + 6.8);

    // Corporate notice (Center-Right)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.2);
    doc.setTextColor(COLORS.GRAY[0], COLORS.GRAY[1], COLORS.GRAY[2]);
    doc.text('CONFIDENTIAL • SPECIFICATION', 132, footerY + 3.2);
    doc.text('CATALOGUE', 132, footerY + 6.8);

    // Far Right: Page Number Box
    const pageBoxW = 18;
    const pageBoxH = 8.5;
    const pageBoxX = pageWidth - marginX - pageBoxW;
    const pageBoxY = footerY;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(COLORS.CARD_BORDER[0], COLORS.CARD_BORDER[1], COLORS.CARD_BORDER[2]);
    doc.setLineWidth(0.25);
    doc.roundedRect(pageBoxX, pageBoxY, pageBoxW, pageBoxH, 1, 1, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(COLORS.GRAY[0], COLORS.GRAY[1], COLORS.GRAY[2]);
    doc.text(`PAGE ${pageNum} OF`, pageBoxX + pageBoxW / 2, pageBoxY + 3.2, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(COLORS.NAVY[0], COLORS.NAVY[1], COLORS.NAVY[2]);
    doc.text(String(totalPages), pageBoxX + pageBoxW / 2, pageBoxY + 7.2, { align: 'center' });
  }

  /**
   * Renders a single Stitch product card with optional full cover image and specifications
   */
  function renderProductCard(doc, product, globalIndex, cellX, cellY, colWidth, rowHeight, includePrices, imageCover, processedImageMap, imageDimensionsMap) {
    // Subtle luxury Card Container (Very soft Ivory fill, subtle gold border)
    doc.setFillColor(COLORS.CARD_BG[0], COLORS.CARD_BG[1], COLORS.CARD_BG[2]);
    doc.setDrawColor(COLORS.CARD_BORDER[0], COLORS.CARD_BORDER[1], COLORS.CARD_BORDER[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(cellX, cellY, colWidth, rowHeight, 2, 2, 'FD');

    // Product Image Container - Fills the majority of the card
    const imgBoxX = cellX + 1.8;
    const imgBoxY = cellY + 1.8;
    const imgBoxW = colWidth - 3.6; // 82.4mm wide
    const imgBoxHeight = 37.2; // 37.2mm high (covers ~64% of card)

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(COLORS.HAIRLINE[0], COLORS.HAIRLINE[1], COLORS.HAIRLINE[2]);
    doc.setLineWidth(0.15);
    doc.roundedRect(imgBoxX, imgBoxY, imgBoxW, imgBoxHeight, 1.2, 1.2, 'FD');

    const imgSrc = processedImageMap.get(product.id) || product.image || product.thumbnail;
    if (imgSrc) {
      try {
        if (imageCover) {
          // Direct fill since it has been cropped to exact ratio!
          doc.addImage(imgSrc, 'JPEG', imgBoxX, imgBoxY, imgBoxW, imgBoxHeight);
        } else {
          // Contain fallback
          const maxW = imgBoxW - 1.2;
          const maxH = imgBoxHeight - 1.2;
          const dims = imageDimensionsMap.get(product.id) || { width: 1, height: 1 };
          const ratio = dims.width / dims.height;
          let drawW = maxW;
          let drawH = maxH;
          if (ratio > maxW / maxH) {
            drawW = maxW;
            drawH = maxW / ratio;
          } else {
            drawH = maxH;
            drawW = maxH * ratio;
          }
          const imgX = imgBoxX + (imgBoxW - drawW) / 2;
          const imgY = imgBoxY + (imgBoxHeight - drawH) / 2;
          const fmt = imgSrc.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(imgSrc, fmt, imgX, imgY, drawW, drawH);
        }
      } catch (e) {
        console.warn('Could not render image:', e);
      }
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(COLORS.LIGHT_GRAY[0], COLORS.LIGHT_GRAY[1], COLORS.LIGHT_GRAY[2]);
      doc.text('NO IMAGE AVAILABLE', imgBoxX + imgBoxW / 2, imgBoxY + imgBoxHeight / 2 + 1.2, { align: 'center' });
    }

    // Border around image container
    doc.setDrawColor(COLORS.HAIRLINE[0], COLORS.HAIRLINE[1], COLORS.HAIRLINE[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(imgBoxX, imgBoxY, imgBoxW, imgBoxHeight, 1.2, 1.2, 'D');

    // Discreet Corner Badge: N° 01 in Champagne Gold
    const pillW = 9.5;
    const pillH = 3.6;
    const pillX = cellX + colWidth - 2.5 - pillW;
    const pillY = cellY + 2.5;
    doc.setDrawColor(COLORS.GOLD[0], COLORS.GOLD[1], COLORS.GOLD[2]);
    doc.setLineWidth(0.2);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(pillX, pillY, pillW, pillH, 0.8, 0.8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(COLORS.GOLD[0], COLORS.GOLD[1], COLORS.GOLD[2]);
    doc.text(`N° ${String(globalIndex + 1).padStart(2, '0')}`, pillX + pillW / 2, pillY + 2.5, { align: 'center' });

    // Title & Identity Block (Below Image - Centered & Refined)
    const nameY = cellY + 42.8;
    const prodName = product.name || 'منتج بدون اسم';
    const nameIsArabic = isArabic(prodName);
    const centerX = cellX + colWidth / 2;

    if (nameIsArabic) {
      drawArabicCanvasText(doc, prodName, centerX, nameY, colWidth - 5, 8.5, COLORS.NAVY, 'center', 'bold');
    } else {
      doc.setFont('times', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(COLORS.NAVY[0], COLORS.NAVY[1], COLORS.NAVY[2]);
      doc.text(prodName, centerX, nameY, { align: 'center', maxWidth: colWidth - 5 });
    }

    // Bottom Specification Section (Arabic Packaging & EGP Price)
    const tableDividerY = cellY + 47.8;
    doc.setDrawColor(COLORS.HAIRLINE[0], COLORS.HAIRLINE[1], COLORS.HAIRLINE[2]);
    doc.setLineWidth(0.2);
    doc.line(cellX + 3, tableDividerY, cellX + colWidth - 3, tableDividerY);

    const pcsVal = (product.piecesPerCarton != null && product.piecesPerCarton !== '') ? product.piecesPerCarton : 1;

    if (includePrices) {
      // Subtle vertical separator between Packaging (right) and Price (left)
      const midX = cellX + colWidth / 2;
      doc.line(midX, tableDividerY + 1.5, midX, cellY + rowHeight - 2);

      // Right Column: التعبئة (Packaging)
      const rightColCenter = cellX + (colWidth * 0.75);
      drawArabicCanvasText(doc, 'التعبئة', rightColCenter, tableDividerY + 3.2, 36, 4.8, COLORS.GRAY, 'center', 'normal');
      drawArabicCanvasText(doc, `${pcsVal} قطعة / كرتونة`, rightColCenter, tableDividerY + 7.2, 38, 6.2, COLORS.NAVY, 'center', 'bold');

      // Left Column: سعر الكرتونة (Carton Price in EGP - جنيه مصري)
      const leftColCenter = cellX + (colWidth * 0.25);
      drawArabicCanvasText(doc, 'سعر الكرتونة', leftColCenter, tableDividerY + 3.2, 36, 4.8, COLORS.GRAY, 'center', 'normal');

      const hasPrice = (product.cartonPrice != null && product.cartonPrice !== '' && !isNaN(product.cartonPrice));
      if (hasPrice) {
        const numPrice = Number(product.cartonPrice);
        const formattedNum = (numPrice % 1 === 0)
          ? numPrice.toLocaleString('en-US')
          : numPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        drawArabicCanvasText(doc, `${formattedNum} ج.م`, leftColCenter, tableDividerY + 7.2, 38, 7.2, COLORS.NAVY, 'center', 'bold');
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(COLORS.NAVY[0], COLORS.NAVY[1], COLORS.NAVY[2]);
        doc.text('—', leftColCenter, tableDividerY + 7.2, { align: 'center' });
      }

    } else {
      // 1 Column Centered: التعبئة فقط
      const centerCol = cellX + colWidth / 2;
      drawArabicCanvasText(doc, 'التعبئة', centerCol, tableDividerY + 3.2, 50, 4.8, COLORS.GRAY, 'center', 'normal');
      drawArabicCanvasText(doc, `${pcsVal} قطعة في الكرتونة`, centerCol, tableDividerY + 7.2, 60, 7.2, COLORS.NAVY, 'center', 'bold');
    }
  }

  window.PDF = {
    activeTab: 'list', // 'list' | 'manual'
    selectedManualProductIds: new Set(),
    currentSelectedProducts: [],
    generatedDoc: null,
    previewBlobUrl: null,

    /**
     * Initialize DOM event listeners
     */
    init() {
      // Tab switcher
      const tabList = document.getElementById('pdf-tab-list');
      const tabManual = document.getElementById('pdf-tab-manual');

      if (tabList) {
        tabList.addEventListener('click', () => this.switchTab('list'));
      }
      if (tabManual) {
        tabManual.addEventListener('click', () => this.switchTab('manual'));
      }

      // Saved list selection
      const listSelect = document.getElementById('pdf-list-select');
      if (listSelect) {
        listSelect.addEventListener('change', () => this.onListSelected());
      }

      // Generate button
      const btnGenerate = document.getElementById('btn-generate-pdf');
      if (btnGenerate) {
        btnGenerate.addEventListener('click', () => this.generatePDF());
      }

      // Download button
      const btnDownload = document.getElementById('btn-download-pdf');
      if (btnDownload) {
        btnDownload.addEventListener('click', () => this.downloadPDF());
      }

      // Close preview button
      const btnClosePreview = document.getElementById('btn-close-preview');
      if (btnClosePreview) {
        btnClosePreview.addEventListener('click', () => this.closePreview());
      }
    },

    /**
     * Load view data for the current company
     */
    async loadView() {
      const companyId = window.App?.currentCompanyId || 1;

      // Populate Saved Lists dropdown
      const listSelect = document.getElementById('pdf-list-select');
      if (listSelect) {
        listSelect.innerHTML = '<option value="">-- Select a Saved List --</option>';
        try {
          const lists = await window.DB.getLists(companyId);
          lists.forEach((item) => {
            const count = item.productIds ? item.productIds.length : 0;
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.name} (${count} items)`;
            listSelect.appendChild(opt);
          });
        } catch (e) {
          console.error('Failed to load lists for PDF view:', e);
        }
      }

      // Populate Manual Product Grid
      const manualGrid = document.getElementById('pdf-manual-grid');
      if (manualGrid) {
        manualGrid.innerHTML = '';
        try {
          const products = await window.DB.getProducts(companyId);

          if (products.length === 0) {
            manualGrid.innerHTML = `
              <div class="empty-state-notice" style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #94A3B8;">
                No products found for this company. Add products first to build a catalog.
              </div>
            `;
          } else {
            products.forEach((product) => {
              const card = document.createElement('div');
              card.className = 'pdf-product-card';
              if (this.selectedManualProductIds.has(product.id)) {
                card.classList.add('selected');
              }
              card.dataset.productId = product.id;

              const imgSrc = product.thumbnail || product.image || '';
              const imageHtml = imgSrc
                ? `<img src="${imgSrc}" alt="${product.name}" class="pdf-card-thumb" style="width: 100%; height: 110px; object-fit: contain; background: #F8FAFC; border-radius: 6px; margin-bottom: 8px;">`
                : `<div class="pdf-card-thumb-placeholder" style="width: 100%; height: 110px; display: flex; align-items: center; justify-content: center; background: #F1F5F9; color: #94A3B8; border-radius: 6px; margin-bottom: 8px; font-size: 0.85rem;">No Image</div>`;

              const priceText = product.cartonPrice != null ? `$${Number(product.cartonPrice).toFixed(2)}` : '—';
              const pcsText = product.piecesPerCarton != null ? `${product.piecesPerCarton} pcs/ctn` : '—';

              card.innerHTML = `
                <label style="display: block; cursor: pointer; user-select: none;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 0.75rem; color: #64748B;">#${product.id}</span>
                    <input type="checkbox" class="pdf-product-checkbox" data-id="${product.id}" ${this.selectedManualProductIds.has(product.id) ? 'checked' : ''} style="cursor: pointer; width: 18px; height: 18px; accent-color: #C9A96E;">
                  </div>
                  ${imageHtml}
                  <div class="pdf-card-info">
                    <div style="font-weight: 600; font-size: 0.9rem; color: #1E293B; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${product.name}">
                      ${product.name}
                    </div>
                    <div style="font-size: 0.8rem; color: #64748B; display: flex; justify-content: space-between;">
                      <span>${pcsText}</span>
                      <span style="color: #B8934A; font-weight: 600;">${priceText}</span>
                    </div>
                  </div>
                </label>
              `;

              const checkbox = card.querySelector('.pdf-product-checkbox');
              checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                this.toggleManualProduct(product.id);
                card.classList.toggle('selected', this.selectedManualProductIds.has(product.id));
              });

              card.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                  checkbox.checked = !checkbox.checked;
                  this.toggleManualProduct(product.id);
                  card.classList.toggle('selected', this.selectedManualProductIds.has(product.id));
                }
              });

              manualGrid.appendChild(card);
            });
          }
        } catch (e) {
          console.error('Failed to load products for manual grid:', e);
        }
      }

      this.updateSelectedCount();
    },

    /**
     * Switch source type tab ('list' or 'manual')
     * @param {string} tabName
     */
    switchTab(tabName) {
      this.activeTab = tabName;

      const tabList = document.getElementById('pdf-tab-list');
      const tabManual = document.getElementById('pdf-tab-manual');
      const secList = document.getElementById('pdf-list-section');
      const secManual = document.getElementById('pdf-manual-section');

      if (tabName === 'list') {
        tabList?.classList.add('active');
        tabManual?.classList.remove('active');
        if (secList) {
          secList.classList.remove('hidden');
          secList.style.display = 'block';
        }
        if (secManual) {
          secManual.classList.add('hidden');
          secManual.style.display = 'none';
        }
      } else {
        tabManual?.classList.add('active');
        tabList?.classList.remove('active');
        if (secManual) {
          secManual.classList.remove('hidden');
          secManual.style.display = 'block';
        }
        if (secList) {
          secList.classList.add('hidden');
          secList.style.display = 'none';
        }
      }

      this.updateSelectedCount();
    },

    /**
     * Handler when saved list dropdown selection changes
     */
    async onListSelected() {
      const listSelect = document.getElementById('pdf-list-select');
      const listId = listSelect ? listSelect.value : null;

      if (!listId) {
        this.currentSelectedProducts = [];
        this.currentList = null;
        this.updateSelectedCount();
        return;
      }

      try {
        const list = await window.DB.getList(parseInt(listId, 10));
        if (!list || !Array.isArray(list.productIds)) {
          this.currentSelectedProducts = [];
          this.currentList = null;
          this.updateSelectedCount();
          return;
        }

        this.currentList = list;
        const companyId = window.App?.currentCompanyId || 1;
        const allProducts = await window.DB.getProducts(companyId);
        const productMap = new Map();
        allProducts.forEach(p => productMap.set(Number(p.id), p));

        // Preserve list.productIds exact ordering
        this.currentSelectedProducts = (list.productIds || [])
          .map(id => productMap.get(Number(id)))
          .filter(Boolean);

        // Sync groupByCategories option if present in list
        const groupCatCheckbox = document.getElementById('pdf-group-categories');
        if (groupCatCheckbox && list.groupByCategories !== undefined) {
          groupCatCheckbox.checked = list.groupByCategories !== false;
        }
      } catch (e) {
        console.error('Error fetching list products:', e);
        this.currentSelectedProducts = [];
        this.currentList = null;
      }

      this.updateSelectedCount();
    },

    /**
     * Toggle selection for a product in manual grid
     * @param {number|string} productId
     */
    toggleManualProduct(productId) {
      const id = Number(productId);
      if (this.selectedManualProductIds.has(id)) {
        this.selectedManualProductIds.delete(id);
      } else {
        this.selectedManualProductIds.add(id);
      }
      this.updateSelectedCount();
    },

    /**
     * Updates the count badge in DOM based on active tab
     */
    updateSelectedCount() {
      const countEl = document.getElementById('pdf-selected-count');
      if (!countEl) return;

      let count = 0;
      if (this.activeTab === 'list') {
        count = this.currentSelectedProducts.length;
      } else {
        count = this.selectedManualProductIds.size;
      }
      countEl.textContent = count.toString();
    },

    /**
     * Builds and previews the Google Stitch luxury corporate PDF catalog
     */
    async generatePDF() {
      const jsPDFClass = window.jspdf?.jsPDF || window.jsPDF;
      if (!jsPDFClass) {
        if (window.showToast) {
          window.showToast('jsPDF library is not loaded. Please verify script inclusion.', 'error');
        }
        return;
      }

      const companyId = window.App?.currentCompanyId || 1;
      let products = [];

      if (this.activeTab === 'list') {
        products = [...this.currentSelectedProducts];
      } else {
        const allProducts = await window.DB.getProducts(companyId);
        products = allProducts.filter((p) => this.selectedManualProductIds.has(Number(p.id)));
      }

      if (products.length === 0) {
        if (window.showToast) {
          window.showToast('Please select at least one product to generate a PDF catalog.', 'info');
        }
        return;
      }

      if (window.App?.showLoading) {
        window.App.showLoading();
      }

      try {
        const doc = new jsPDFClass({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });

        // Dynamic Company Settings
        const settings = (await window.DB.getSettings(companyId)) || {};
        const companyName = settings.companyName || (companyId === 1 ? 'OSIRIS ITALIAN' : 'AURELIA LIVING');
        const companyNameAr = settings.companyNameAr || (companyId === 1 ? 'أوزوريس للتجهيزات الإيطالية' : 'أوريليا للتجهيزات الفاخرة');
        const logo = settings.logo || null;
        const phone = settings.phone || (companyId === 1 ? '+39 02 8900 1200' : '+1 (555) 019-2834');
        const email = settings.email || ('info@' + companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com');
        const address = settings.address || (companyId === 1 ? 'MILANO • RIYADH' : 'NEW YORK • LONDON');
        const tagline = settings.tagline || (companyId === 1 ? 'CORPORATE PRODUCT SELECTION • EXECUTIVE SPECIFICATION' : 'ARCHITECTURAL LIVING COLLECTION • LUXURY SPECIFICATION');
        const refCode = settings.ref || (companyId === 1 ? 'REF #OS-884' : 'REF #AL-920');

        // Arabic font loading check
        await loadArabicFont(doc);

        const includePrices = !!document.getElementById('pdf-include-prices')?.checked;
        const groupCategories = !!document.getElementById('pdf-group-categories')?.checked;
        const imageCover = !!document.getElementById('pdf-image-cover')?.checked;

        const pageWidth = 210;
        const pageHeight = 297;
        const marginX = 15;
        const printableWidth = pageWidth - marginX * 2; // 180mm
        const colGutter = 8;
        const colWidth = (printableWidth - colGutter) / 2; // 86mm
        const rowHeight = 58.5;
        const rowGap = 3.2;
        const imgBoxW = colWidth - 3.6; // 82.4mm wide
        const imgBoxHeight = 37.2; // 37.2mm high
        const footerY = 280;

        const formattedDate = new Date().toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });

        // Preload / crop images to ensure 100% card filling without white bars
        const processedImageMap = new Map();
        const imageDimensionsMap = new Map();
        for (const product of products) {
          const src = product.image || product.thumbnail;
          if (src) {
            if (imageCover) {
              const cropped = await getCoverCroppedImage(src, imgBoxW, imgBoxHeight);
              processedImageMap.set(product.id, cropped);
            } else {
              const dims = await getImageDimensions(src);
              if (dims) imageDimensionsMap.set(product.id, dims);
              processedImageMap.set(product.id, src);
            }
          }
        }

        let logoDims = null;
        if (logo) {
          logoDims = await getImageDimensions(logo);
        }

        // Check if products have categories and grouping is desired
        const hasCategories = products.some(p => (p.category || '').trim().length > 0);
        const shouldGroup = groupCategories && hasCategories;

        if (!shouldGroup) {
          // ==========================================
          // FLAT LAYOUT: Exactly 8 products per page in user-defined order
          // ==========================================
          const productsPerPage = 8;
          const totalProducts = products.length;
          const totalPages = Math.max(1, Math.ceil(totalProducts / productsPerPage));

          for (let page = 0; page < totalPages; page++) {
            if (page > 0) doc.addPage();
            const isFirstPage = (page === 0);
            const startY = isFirstPage ? 29.5 : 22.5;
            const startIndex = page * productsPerPage;
            const pageProducts = products.slice(startIndex, startIndex + productsPerPage);

            for (let i = 0; i < pageProducts.length; i++) {
              const product = pageProducts[i];
              const globalIdx = startIndex + i;
              const col = i % 2;
              const row = Math.floor(i / 2);
              const cellX = marginX + col * (colWidth + colGutter);
              const cellY = startY + row * (rowHeight + rowGap);

              renderProductCard(doc, product, globalIdx, cellX, cellY, colWidth, rowHeight, includePrices, imageCover, processedImageMap, imageDimensionsMap);
            }
          }

        } else {
          // ==========================================
          // CATEGORY GROUPED LAYOUT: Preserving Category & Item Ordering
          // ==========================================
          const categoryMap = new Map();
          products.forEach(p => {
            const cat = (p.category || '').trim();
            if (!categoryMap.has(cat)) categoryMap.set(cat, []);
            categoryMap.get(cat).push(p);
          });

          let catKeys = [];
          const configuredOrder = Array.isArray(this.currentList?.categoryOrder) ? this.currentList.categoryOrder : [];
          configuredOrder.forEach(cat => {
            if (categoryMap.has(cat) && !catKeys.includes(cat)) {
              catKeys.push(cat);
            }
          });
          categoryMap.forEach((_, cat) => {
            if (cat && !catKeys.includes(cat)) {
              catKeys.push(cat);
            }
          });
          if (categoryMap.has('') && !catKeys.includes('')) {
            catKeys.push('');
          }

          let currentY = 29.5;
          let colIndex = 0;
          let rowY = currentY;
          let globalIdx = 0;

          for (const catName of catKeys) {
            const catProducts = categoryMap.get(catName) || [];
            if (catProducts.length === 0) continue;

            if (colIndex === 1) {
              currentY += rowHeight + rowGap;
              colIndex = 0;
            }

            if (catName) {
              // Ensure category header + at least 1 card row fits on the page
              if (currentY + 12 + rowHeight > footerY - 5) {
                doc.addPage();
                currentY = 22.5;
              }

              // Luxury Category Banner
              doc.setFillColor(248, 246, 241);
              doc.roundedRect(marginX, currentY, printableWidth, 7.5, 1.2, 1.2, 'F');
              doc.setDrawColor(COLORS.GOLD[0], COLORS.GOLD[1], COLORS.GOLD[2]);
              doc.setLineWidth(0.25);
              doc.line(marginX + 8, currentY + 3.75, marginX + 38, currentY + 3.75);
              doc.line(marginX + printableWidth - 38, currentY + 3.75, marginX + printableWidth - 8, currentY + 3.75);
              drawArabicCanvasText(doc, catName, marginX + printableWidth / 2, currentY + 4.9, printableWidth - 80, 7.5, COLORS.NAVY, 'center', 'bold');
              currentY += 10.5;
            }

            for (const product of catProducts) {
              if (colIndex === 0) {
                if (currentY + rowHeight > footerY - 5) {
                  doc.addPage();
                  currentY = 22.5;
                }
                rowY = currentY;
                const cellX = marginX;
                renderProductCard(doc, product, globalIdx++, cellX, rowY, colWidth, rowHeight, includePrices, imageCover, processedImageMap, imageDimensionsMap);
                colIndex = 1;
              } else {
                const cellX = marginX + colWidth + colGutter;
                renderProductCard(doc, product, globalIdx++, cellX, rowY, colWidth, rowHeight, includePrices, imageCover, processedImageMap, imageDimensionsMap);
                currentY += rowHeight + rowGap;
                colIndex = 0;
              }
            }

            if (colIndex === 1) {
              currentY += rowHeight + rowGap;
              colIndex = 0;
            }
            currentY += 2;
          }
        }

        // Apply dynamic luxury headers and footers to all generated pages with accurate total page count
        const totalPages = doc.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
          doc.setPage(p);
          renderCatalogHeader(doc, p, totalPages, companyName, companyNameAr, logo, logoDims, tagline, refCode, formattedDate, marginX, pageWidth);
          renderCatalogFooter(doc, p, totalPages, companyName, address, email, phone, marginX, pageWidth);
        }

        // Save doc instance and show preview
        this.generatedDoc = doc;
        const blob = doc.output('blob');

        if (this.previewBlobUrl) {
          URL.revokeObjectURL(this.previewBlobUrl);
        }
        this.previewBlobUrl = URL.createObjectURL(blob);

        const iframe = document.getElementById('pdf-preview-iframe');
        if (iframe) {
          iframe.src = this.previewBlobUrl;
        }

        const previewSection = document.getElementById('pdf-preview-section');
        if (previewSection) {
          previewSection.classList.remove('hidden');
          previewSection.style.display = 'block';
          previewSection.scrollIntoView({ behavior: 'smooth' });
        }

        if (window.showToast) {
          window.showToast('PDF catalog generated successfully!', 'success');
        }
      } catch (err) {
        console.error('PDF generation error:', err);
        if (window.showToast) {
          window.showToast(`PDF generation failed: ${err.message}`, 'error');
        }
      } finally {
        if (window.App?.hideLoading) {
          window.App.hideLoading();
        }
      }
    },

    /**
     * Download the generated PDF file
     */
    async downloadPDF() {
      if (!this.generatedDoc) {
        if (window.showToast) {
          window.showToast('Please generate a PDF catalog first.', 'info');
        }
        return;
      }

      try {
        const companyId = window.App?.currentCompanyId || 1;
        const settings = (await window.DB.getSettings(companyId)) || {};
        const rawName = settings.companyName || `Company-${companyId}`;
        const sanitized = rawName.toLowerCase().replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-');
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `${sanitized || 'catalog'}-catalog-${dateStr}.pdf`;

        this.generatedDoc.save(filename);

        if (window.showToast) {
          window.showToast('Catalog downloaded.', 'success');
        }
      } catch (err) {
        console.error('Error downloading PDF:', err);
        if (window.showToast) {
          window.showToast('Failed to download PDF.', 'error');
        }
      }
    },

    /**
     * Close the PDF preview section and revoke blob URL
     */
    closePreview() {
      const previewSection = document.getElementById('pdf-preview-section');
      if (previewSection) {
        previewSection.classList.add('hidden');
        previewSection.style.display = 'none';
      }

      const iframe = document.getElementById('pdf-preview-iframe');
      if (iframe) {
        iframe.src = '';
      }

      if (this.previewBlobUrl) {
        URL.revokeObjectURL(this.previewBlobUrl);
        this.previewBlobUrl = null;
      }
    },
  };
})();
