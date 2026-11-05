/**
 * @file imageUtils.js
 * @description Image processing utilities for Product List Generator.
 * Uses the HTML5 Canvas API for resizing, square canvas normalization,
 * white/transparent background padding, and thumbnail generation.
 * Attaches to window.ImageUtils.
 */

(function () {
  'use strict';

  /**
   * Reads a File or Blob into a base64 data URL.
   * @param {Blob|File} file 
   * @returns {Promise<string>}
   */
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        return reject(new Error('No file provided for reading'));
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Loads an image from a data URL or source string.
   * @param {string} src 
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      if (!src || typeof src !== 'string') {
        return reject(new Error('Invalid image source string'));
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image element'));
      img.src = src;
    });
  }

  /**
   * Renders an Image element centered on a square canvas with a white background.
   * Maintains aspect ratio.
   * @param {HTMLImageElement} img 
   * @param {number} targetSquareSize 
   * @param {number} quality - JPEG compression quality (0.0 to 1.0)
   * @returns {string} - JPEG base64 data URL
   */
  function renderSquareJpeg(img, targetSquareSize, quality) {
    const naturalWidth = img.naturalWidth || img.width || 1;
    const naturalHeight = img.naturalHeight || img.height || 1;

    // Calculate scale to fit inside square while preserving aspect ratio
    const scale = Math.min(targetSquareSize / naturalWidth, targetSquareSize / naturalHeight);
    const scaledWidth = Math.round(naturalWidth * scale);
    const scaledHeight = Math.round(naturalHeight * scale);

    // Center offsets
    const offsetX = Math.round((targetSquareSize - scaledWidth) / 2);
    const offsetY = Math.round((targetSquareSize - scaledHeight) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = targetSquareSize;
    canvas.height = targetSquareSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }

    // High quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Fill background with pure white
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetSquareSize, targetSquareSize);

    // 2. Draw scaled image centered
    ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

    // 3. Export as JPEG
    return canvas.toDataURL('image/jpeg', quality);
  }

  const ImageUtils = {
    /**
     * Processes an uploaded product image file.
     * Fits image inside a square with white background fill, generating
     * both full-resolution (e.g. 800x800) and thumbnail (300x300) versions.
     * 
     * @param {File|Blob} file - Uploaded image file
     * @param {number} [maxSize=800] - Full image target square dimension
     * @param {number} [quality=0.85] - Full image JPEG compression quality
     * @returns {Promise<{image: string, thumbnail: string}>}
     */
    async processImage(file, maxSize = 800, quality = 0.85) {
      if (!file) {
        throw new Error('Please select an image file to process');
      }

      // 1. Read file as base64 data URL
      const dataUrl = await readFileAsDataUrl(file);

      // 2. Create Image element and wait for load
      const img = await loadImage(dataUrl);

      // 3-7. Render full image (maxSize x maxSize square, #FFFFFF fill, JPEG)
      const fullImage = renderSquareJpeg(img, maxSize, quality);

      // 8. Repeat for thumbnail at 300x300, JPEG quality 0.75
      const thumbnail = renderSquareJpeg(img, 300, 0.75);

      return {
        image: fullImage,
        thumbnail: thumbnail
      };
    },

    /**
     * Processes an uploaded logo image file.
     * Scales logo to fit within maxSize square while maintaining natural aspect ratio
     * and preserving PNG alpha transparency (no background fill).
     * 
     * @param {File|Blob|string} file - Uploaded logo file or base64 string
     * @param {number} [maxSize=400] - Maximum bounding dimension
     * @param {number} [quality=0.9] - Export quality (if applicable)
     * @returns {Promise<string>} - PNG base64 data URL
     */
    async processLogo(file, maxSize = 400, quality = 0.9) {
      if (!file) {
        throw new Error('Please select a logo file to process');
      }

      // Convert file to dataUrl if not already a string
      const dataUrl = (typeof file === 'string') ? file : await readFileAsDataUrl(file);
      const img = await loadImage(dataUrl);

      const naturalWidth = img.naturalWidth || img.width || 1;
      const naturalHeight = img.naturalHeight || img.height || 1;

      // Scale to fit within maxSize square (do not upscale if smaller than maxSize)
      const scale = (naturalWidth > maxSize || naturalHeight > maxSize)
        ? Math.min(maxSize / naturalWidth, maxSize / naturalHeight)
        : 1;

      const scaledWidth = Math.round(naturalWidth * scale);
      const scaledHeight = Math.round(naturalHeight * scale);

      const canvas = document.createElement('canvas');
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas 2D context not available');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Ensure transparent background (no fillRect)
      ctx.clearRect(0, 0, scaledWidth, scaledHeight);
      ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

      return canvas.toDataURL('image/png');
    },

    /**
     * Processes a base64 image string into a square white-padded JPEG.
     * Useful for restoring or re-normalizing images.
     * 
     * @param {string} base64 - Base64 image data URL
     * @param {number} [maxSize=800] - Square dimension
     * @param {number} [quality=0.85] - JPEG quality
     * @returns {Promise<string>} - JPEG base64 data URL
     */
    async processBase64Image(base64, maxSize = 800, quality = 0.85) {
      if (!base64 || typeof base64 !== 'string') {
        throw new Error('Invalid base64 image data');
      }

      const img = await loadImage(base64);
      return renderSquareJpeg(img, maxSize, quality);
    }
  };

  // Attach to window
  window.ImageUtils = ImageUtils;
})();
