/**
 * @file products.js
 * @description Products management module for Product List Generator.
 * Handles product listing, creation, editing, deletion, duplication,
 * live search, image dropzone processing, and shared modal/toast helpers.
 * Attaches to window.Products.
 */

(function () {
  'use strict';

  // ==========================================
  // SHARED ICONS (Clean, modern SVG line icons)
  // ==========================================
  const ICONS = {
    EDIT: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
    DUPLICATE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    DELETE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`
  };

  /**
   * Escapes HTML strings to prevent XSS vulnerabilities.
   * @param {string} str 
   * @returns {string}
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================
  // SHARED MODAL HELPERS (Overlay & Confirm)
  // ==========================================

  function getOverlayEl() {
    return document.getElementById('modal-overlay');
  }

  function showModal(modalEl) {
    const overlay = getOverlayEl();
    if (overlay) {
      overlay.classList.add('active', 'show');
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';
    }
    if (modalEl) {
      modalEl.classList.add('active', 'show');
      modalEl.classList.remove('hidden');
      modalEl.style.display = 'block';
    }
  }

  function hideModal(modalEl) {
    if (modalEl) {
      modalEl.classList.remove('active', 'show');
      modalEl.classList.add('hidden');
      modalEl.style.display = 'none';
    }
    const overlay = getOverlayEl();
    if (overlay) {
      // Check if any other modal is still active
      const anyActive = document.querySelector('.modal.active, .modal.show, [id^="modal-"]:not(#modal-overlay):not(.hidden)[style*="display: block"]');
      if (!anyActive) {
        overlay.classList.remove('active', 'show');
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
      }
    }
  }

  /**
   * Displays a confirmation dialog modal.
   * @param {string} title 
   * @param {string} message 
   * @param {string} [confirmText='Delete'] 
   * @param {boolean} [isDanger=true] 
   * @returns {Promise<boolean>}
   */
  window.showConfirm = function (title, message, confirmText = 'Delete', isDanger = true) {
    return new Promise((resolve) => {
      const confirmModal = document.getElementById('modal-confirm');
      const titleEl = document.getElementById('confirm-title');
      const messageEl = document.getElementById('confirm-message');
      const yesBtn = document.getElementById('btn-confirm-yes');
      const noBtn = document.getElementById('btn-confirm-no');
      const overlay = getOverlayEl();

      if (!confirmModal || !yesBtn || !noBtn) {
        // Fallback to browser confirm if DOM elements missing
        const fallback = window.confirm(`${title}\n\n${message}`);
        return resolve(fallback);
      }

      if (titleEl) titleEl.textContent = title;
      if (messageEl) messageEl.textContent = message;

      yesBtn.textContent = confirmText;
      if (isDanger) {
        yesBtn.classList.add('btn-danger', 'danger');
        yesBtn.classList.remove('btn-primary');
      } else {
        yesBtn.classList.remove('btn-danger', 'danger');
        yesBtn.classList.add('btn-primary');
      }

      showModal(confirmModal);

      function cleanup(result) {
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
        if (overlay) overlay.removeEventListener('click', onOverlay);
        hideModal(confirmModal);
        resolve(result);
      }

      function onYes(e) {
        e.preventDefault();
        cleanup(true);
      }

      function onNo(e) {
        e.preventDefault();
        cleanup(false);
      }

      function onOverlay(e) {
        if (e.target === overlay) {
          cleanup(false);
        }
      }

      yesBtn.addEventListener('click', onYes);
      noBtn.addEventListener('click', onNo);
      if (overlay) {
        overlay.addEventListener('click', onOverlay);
      }
    });
  };

  // ==========================================
  // SHARED TOAST NOTIFICATION HELPER
  // ==========================================

  /**
   * Shows a toast notification.
   * @param {string} message 
   * @param {'success'|'error'|'info'} [type='success'] 
   */
  window.showToast = function (message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');

    // Color indicators / borders based on type
    const colors = {
      success: '#10B981', // emerald green
      error: '#EF4444',   // crimson red
      info: '#F59E0B'     // rich amber gold
    };
    const accentColor = colors[type] || colors.info;

    toast.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      margin-top: 8px;
      background: #1F2937;
      color: #F9FAFB;
      border-left: 4px solid ${accentColor};
      border-radius: 6px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
      font-size: 14px;
      font-family: inherit;
      opacity: 0;
      transform: translateY(-8px);
      transition: opacity 0.25s ease, transform 0.25s ease;
      z-index: 10000;
    `;

    toast.innerHTML = `
      <span class="toast-message" style="flex: 1;">${escapeHtml(message)}</span>
      <button type="button" class="toast-close" style="background: none; border: none; color: #9CA3AF; cursor: pointer; font-size: 16px; line-height: 1; padding: 0 4px;">&times;</button>
    `;

    container.appendChild(toast);

    // Fade and slide in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    const closeBtn = toast.querySelector('.toast-close');
    let timer = null;

    function removeToast() {
      if (timer) clearTimeout(timer);
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 250);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', removeToast);
    }

    timer = setTimeout(removeToast, 3000);
  };

  // Synchronize with window.App if already declared or when created
  if (window.App && typeof window.App.showToast !== 'function') {
    window.App.showToast = window.showToast;
  }

  // ==========================================
  // PRODUCTS MODULE STATE
  // ==========================================

  let cachedProducts = [];
  let currentProcessedImage = { image: null, thumbnail: null };
  let searchDebounceTimer = null;
  let isInitialized = false;

  function getCurrentCompanyId() {
    if (window.App && window.App.currentCompanyId) {
      return Number(window.App.currentCompanyId);
    }
    return 1;
  }

  const Products = {
    /**
     * Initializes the Products module, binds events, and loads initial data.
     */
    init() {
      if (isInitialized) {
        Products.loadProducts();
        return;
      }
      isInitialized = true;

      // 1. Add Product Button
      const btnAdd = document.getElementById('btn-add-product');
      if (btnAdd) {
        btnAdd.addEventListener('click', () => Products.openAddModal());
      }

      // 2. Search Input (debounced 300ms)
      const searchInput = document.getElementById('product-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
          searchDebounceTimer = setTimeout(() => {
            Products.searchProducts(e.target.value);
          }, 300);
        });
      }

      // 3. Products Grid Action Delegation (edit, duplicate, delete)
      const grid = document.getElementById('products-grid');
      if (grid) {
        grid.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-action]');
          if (!btn) return;

          const card = btn.closest('.product-card');
          if (!card) return;

          const productId = Number(card.dataset.productId);
          const action = btn.dataset.action;

          if (action === 'edit') {
            Products.openEditModal(productId);
          } else if (action === 'duplicate') {
            Products.duplicateProduct(productId);
          } else if (action === 'delete') {
            Products.deleteProduct(productId);
          }
        });
      }

      // 4. Modal Dropzone & Image File Input
      const dropzone = document.getElementById('product-image-dropzone');
      const fileInput = document.getElementById('input-product-image');

      if (dropzone && fileInput) {
        // Dropzone click -> trigger hidden file input
        dropzone.addEventListener('click', (e) => {
          if (e.target !== fileInput) {
            fileInput.click();
          }
        });

        // Drag & Drop events
        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragenter', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');

          const files = e.dataTransfer && e.dataTransfer.files;
          if (files && files.length > 0) {
            await Products._handleImageFile(files[0]);
          }
        });

        // File input change
        fileInput.addEventListener('change', async (e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            await Products._handleImageFile(files[0]);
          }
        });
      }

      // 5. Product Form Submission
      const form = document.getElementById('product-form');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          Products.saveProduct();
        });
      }

      // 6. Modal Cancel Button
      const btnCancel = document.getElementById('btn-cancel-product-modal');
      if (btnCancel) {
        btnCancel.addEventListener('click', () => {
          const modal = document.getElementById('modal-product');
          hideModal(modal);
        });
      }

      // 7. Modal Overlay Click to close
      const overlay = getOverlayEl();
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            const modal = document.getElementById('modal-product');
            if (modal && !modal.classList.contains('hidden') && modal.style.display !== 'none') {
              hideModal(modal);
            }
          }
        });
      }

      // Initial fetch
      Products.loadProducts();
    },

    /**
     * Handles processing an uploaded image file via ImageUtils.
     * @private
     * @param {File} file 
     */
    async _handleImageFile(file) {
      if (!file || !file.type.startsWith('image/')) {
        window.showToast('Please select a valid image file', 'error');
        return;
      }

      try {
        const preview = document.getElementById('product-image-preview');
        const dropzone = document.getElementById('product-image-dropzone');
        const dropzonePrompt = dropzone ? dropzone.querySelector('.dropzone-prompt, .dropzone-text, p, span') : null;

        if (window.ImageUtils) {
          const result = await window.ImageUtils.processImage(file, 800, 0.85);
          currentProcessedImage = {
            image: result.image,
            thumbnail: result.thumbnail
          };

          if (preview) {
            preview.src = result.thumbnail || result.image;
            preview.style.display = 'block';
            preview.classList.remove('hidden');
          }

          if (dropzonePrompt) {
            dropzonePrompt.style.display = 'none';
          }
        } else {
          throw new Error('ImageUtils module is not available');
        }
      } catch (err) {
        console.error('Failed to process image:', err);
        window.showToast('Failed to process image: ' + err.message, 'error');
      }
    },

    /**
     * Loads products for the active company and updates the view.
     * @returns {Promise<void>}
     */
    async loadProducts() {
      try {
        const companyId = getCurrentCompanyId();
        cachedProducts = await window.DB.getProducts(companyId);

        const searchInput = document.getElementById('product-search-input');
        const currentQuery = searchInput ? searchInput.value.trim() : '';

        if (currentQuery) {
          Products.searchProducts(currentQuery);
        } else {
          Products.renderGrid(cachedProducts);
        }
      } catch (err) {
        console.error('Failed to load products:', err);
        window.showToast('Failed to load products', 'error');
      }
    },

    /**
     * Renders product cards into #products-grid or shows #products-empty-state.
     * @param {Array<Object>} products 
     */
    renderGrid(products) {
      const grid = document.getElementById('products-grid');
      const emptyState = document.getElementById('products-empty-state');

      if (!grid) return;

      if (!products || products.length === 0) {
        grid.innerHTML = '';
        if (emptyState) {
          emptyState.classList.remove('hidden');
          emptyState.style.display = 'block';
        }
        return;
      }

      if (emptyState) {
        emptyState.classList.add('hidden');
        emptyState.style.display = 'none';
      }

      const cardsHtml = products.map((product) => {
        const hasPrice = product.cartonPrice !== null && product.cartonPrice !== undefined && product.cartonPrice !== '';
        const priceDisplay = hasPrice ? `$${Number(product.cartonPrice).toFixed(2)}` : '';
        const imgSrc = product.thumbnail || product.image || '';

        return `
          <div class="product-card" data-product-id="${product.id}">
            <div class="product-card-image">
              <img src="${imgSrc}" alt="${escapeHtml(product.name)}" loading="lazy">
            </div>
            <div class="product-card-info">
              <h3 class="product-card-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
              <div class="product-card-details">
                <span class="detail-item"><span class="detail-label">Pcs/Carton:</span> ${product.piecesPerCarton || 0}</span>
                ${hasPrice ? `<span class="detail-item"><span class="detail-label">Price:</span> ${priceDisplay}</span>` : ''}
              </div>
            </div>
            <div class="product-card-actions">
              <button type="button" class="card-action-btn" data-action="edit" title="Edit Product">
                ${ICONS.EDIT}
              </button>
              <button type="button" class="card-action-btn" data-action="duplicate" title="Duplicate Product">
                ${ICONS.DUPLICATE}
              </button>
              <button type="button" class="card-action-btn card-action-danger" data-action="delete" title="Delete Product">
                ${ICONS.DELETE}
              </button>
            </div>
          </div>
        `;
      }).join('');

      grid.innerHTML = cardsHtml;
    },

    /**
     * Opens the add product modal with an empty form.
     */
    openAddModal() {
      const modal = document.getElementById('modal-product');
      const form = document.getElementById('product-form');
      const titleEl = document.getElementById('modal-product-title');
      const idInput = document.getElementById('input-product-id');
      const fileInput = document.getElementById('input-product-image');
      const preview = document.getElementById('product-image-preview');
      const dropzone = document.getElementById('product-image-dropzone');
      const dropzonePrompt = dropzone ? dropzone.querySelector('.dropzone-prompt, .dropzone-text, p, span') : null;

      if (form) form.reset();
      if (idInput) idInput.value = '';
      if (fileInput) fileInput.value = '';
      if (titleEl) titleEl.textContent = 'Add Product';

      currentProcessedImage = { image: null, thumbnail: null };

      if (preview) {
        preview.src = '';
        preview.style.display = 'none';
        preview.classList.add('hidden');
      }

      if (dropzonePrompt) {
        dropzonePrompt.style.display = '';
      }

      showModal(modal);

      const nameInput = document.getElementById('input-product-name');
      if (nameInput) setTimeout(() => nameInput.focus(), 50);
    },

    /**
     * Opens the edit product modal pre-filled with the existing product data.
     * @param {number} productId 
     */
    async openEditModal(productId) {
      try {
        const product = await window.DB.getProduct(productId);
        if (!product) {
          window.showToast('Product not found', 'error');
          return;
        }

        const modal = document.getElementById('modal-product');
        const titleEl = document.getElementById('modal-product-title');
        const idInput = document.getElementById('input-product-id');
        const nameInput = document.getElementById('input-product-name');
        const piecesInput = document.getElementById('input-product-pieces');
        const priceInput = document.getElementById('input-product-price');
        const fileInput = document.getElementById('input-product-image');
        const preview = document.getElementById('product-image-preview');
        const dropzone = document.getElementById('product-image-dropzone');
        const dropzonePrompt = dropzone ? dropzone.querySelector('.dropzone-prompt, .dropzone-text, p, span') : null;

        if (titleEl) titleEl.textContent = 'Edit Product';
        if (idInput) idInput.value = product.id;
        if (nameInput) nameInput.value = product.name || '';
        if (piecesInput) piecesInput.value = product.piecesPerCarton || '';
        if (priceInput) priceInput.value = (product.cartonPrice !== null && product.cartonPrice !== undefined) ? product.cartonPrice : '';
        if (fileInput) fileInput.value = '';

        currentProcessedImage = {
          image: product.image || '',
          thumbnail: product.thumbnail || product.image || ''
        };

        if (preview && (product.thumbnail || product.image)) {
          preview.src = product.thumbnail || product.image;
          preview.style.display = 'block';
          preview.classList.remove('hidden');
          if (dropzonePrompt) dropzonePrompt.style.display = 'none';
        } else {
          if (preview) {
            preview.src = '';
            preview.style.display = 'none';
          }
          if (dropzonePrompt) dropzonePrompt.style.display = '';
        }

        showModal(modal);

        if (nameInput) setTimeout(() => nameInput.focus(), 50);
      } catch (err) {
        console.error('Failed to open edit modal:', err);
        window.showToast('Failed to load product details', 'error');
      }
    },

    /**
     * Handles saving product (add or update) from the modal form.
     * @returns {Promise<void>}
     */
    async saveProduct() {
      const idInput = document.getElementById('input-product-id');
      const nameInput = document.getElementById('input-product-name');
      const piecesInput = document.getElementById('input-product-pieces');
      const priceInput = document.getElementById('input-product-price');

      const name = nameInput ? nameInput.value.trim() : '';
      const pieces = piecesInput ? parseInt(piecesInput.value, 10) : 0;
      const priceVal = priceInput ? priceInput.value.trim() : '';
      const cartonPrice = priceVal !== '' && !isNaN(priceVal) ? parseFloat(priceVal) : null;
      const productId = idInput && idInput.value ? Number(idInput.value) : null;
      const companyId = getCurrentCompanyId();

      // Validations
      if (!name) {
        window.showToast('Please enter a product name', 'error');
        if (nameInput) nameInput.focus();
        return;
      }

      if (isNaN(pieces) || pieces < 1) {
        window.showToast('Pieces per carton must be at least 1', 'error');
        if (piecesInput) piecesInput.focus();
        return;
      }

      if (!currentProcessedImage.image) {
        window.showToast('Please provide an image for the product', 'error');
        return;
      }

      try {
        if (productId) {
          // Update existing
          await window.DB.updateProduct(productId, {
            name,
            piecesPerCarton: pieces,
            cartonPrice,
            image: currentProcessedImage.image,
            thumbnail: currentProcessedImage.thumbnail || currentProcessedImage.image
          });
          window.showToast('Product updated successfully', 'success');
        } else {
          // Add new
          await window.DB.addProduct({
            companyId,
            name,
            piecesPerCarton: pieces,
            cartonPrice,
            image: currentProcessedImage.image,
            thumbnail: currentProcessedImage.thumbnail || currentProcessedImage.image
          });
          window.showToast('Product added successfully', 'success');
        }

        const modal = document.getElementById('modal-product');
        hideModal(modal);

        await Products.loadProducts();
      } catch (err) {
        console.error('Failed to save product:', err);
        window.showToast('Failed to save product: ' + err.message, 'error');
      }
    },

    /**
     * Prompts for confirmation and deletes a product.
     * @param {number} productId 
     */
    async deleteProduct(productId) {
      const confirmed = await window.showConfirm(
        'Delete Product',
        'Are you sure you want to delete this product? It will also be removed from any saved lists.',
        'Delete',
        true
      );

      if (!confirmed) return;

      try {
        await window.DB.deleteProduct(productId);
        window.showToast('Product deleted', 'success');
        await Products.loadProducts();
      } catch (err) {
        console.error('Failed to delete product:', err);
        window.showToast('Failed to delete product', 'error');
      }
    },

    /**
     * Clones an existing product with ' (Copy)' appended to its name.
     * @param {number} productId 
     */
    async duplicateProduct(productId) {
      try {
        const original = await window.DB.getProduct(productId);
        if (!original) {
          window.showToast('Product to duplicate not found', 'error');
          return;
        }

        const cloneData = {
          companyId: original.companyId,
          name: `${original.name} (Copy)`,
          image: original.image,
          thumbnail: original.thumbnail,
          piecesPerCarton: original.piecesPerCarton,
          cartonPrice: original.cartonPrice,
          createdAt: Date.now()
        };

        await window.DB.addProduct(cloneData);
        window.showToast(`Duplicated "${original.name}"`, 'success');
        await Products.loadProducts();
      } catch (err) {
        console.error('Failed to duplicate product:', err);
        window.showToast('Failed to duplicate product', 'error');
      }
    },

    /**
     * Filters cached products by query string and updates grid.
     * @param {string} query 
     */
    searchProducts(query) {
      const q = (query || '').trim().toLowerCase();
      if (!q) {
        Products.renderGrid(cachedProducts);
        return;
      }

      const filtered = cachedProducts.filter((product) => {
        return (product.name || '').toLowerCase().includes(q);
      });

      Products.renderGrid(filtered);
    }
  };

  // Attach to window
  window.Products = Products;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Products.init());
  } else {
    Products.init();
  }
})();
