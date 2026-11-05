/**
 * @file lists.js
 * @description Saved Product Lists management module for Product List Generator.
 * Supports multi-step list creation/editing (naming -> product selection with checkboxes),
 * product search in selector, duplication, deletion, and responsive list card rendering.
 * Attaches to window.Lists.
 */

(function () {
  'use strict';

  // ==========================================
  // SHARED ICONS (Clean, modern SVG line icons)
  // ==========================================
  const ICONS = {
    LIST: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
    EDIT: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
    DUPLICATE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    DELETE: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`
  };

  /**
   * Escapes HTML strings to prevent XSS.
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

  /**
   * Formats timestamp into human-readable date string.
   * @param {number} timestamp 
   * @returns {string}
   */
  function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  // ==========================================
  // MODAL DOM CONTROLS
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
      const anyActive = document.querySelector('.modal.active, .modal.show, [id^="modal-"]:not(#modal-overlay):not(.hidden)[style*="display: block"]');
      if (!anyActive) {
        overlay.classList.remove('active', 'show');
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
      }
    }
  }

  function getCurrentCompanyId() {
    if (window.App && window.App.currentCompanyId) {
      return Number(window.App.currentCompanyId);
    }
    return 1;
  }

  // ==========================================
  // LISTS MODULE STATE
  // ==========================================

  let cachedLists = [];
  let currentListId = null;
  let currentListName = '';
  /** @type {Set<number>} */
  let currentSelectedProductIds = new Set();
  let availableCompanyProducts = [];
  let isInitialized = false;

  const Lists = {
    /**
     * Initializes the Lists module, attaches event listeners, and performs initial load.
     */
    init() {
      if (isInitialized) {
        Lists.loadLists();
        return;
      }
      isInitialized = true;

      // 1. Create List Button
      const btnCreate = document.getElementById('btn-create-list');
      if (btnCreate) {
        btnCreate.addEventListener('click', () => Lists.openCreateModal());
      }

      // 2. Lists Grid Action Delegation (edit, duplicate, delete)
      const grid = document.getElementById('lists-grid');
      if (grid) {
        grid.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-action]');
          if (!btn) return;

          const card = btn.closest('.list-card');
          if (!card) return;

          const listId = Number(card.dataset.listId);
          const action = btn.dataset.action;

          if (action === 'edit') {
            Lists.openEditModal(listId);
          } else if (action === 'duplicate') {
            Lists.duplicateList(listId);
          } else if (action === 'delete') {
            Lists.deleteList(listId);
          }
        });
      }

      // 3. Step 1: List Name Modal controls
      const btnNextStep = document.getElementById('btn-next-list-step');
      const btnCancelNameModal = document.getElementById('btn-cancel-list-modal');
      const inputListName = document.getElementById('input-list-name');

      if (btnNextStep) {
        btnNextStep.addEventListener('click', (e) => {
          e.preventDefault();
          Lists._handleProceedToProductSelection();
        });
      }

      if (inputListName) {
        inputListName.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            Lists._handleProceedToProductSelection();
          }
        });
      }

      if (btnCancelNameModal) {
        btnCancelNameModal.addEventListener('click', () => {
          const modalName = document.getElementById('modal-list-name');
          hideModal(modalName);
        });
      }

      // 4. Step 2: Product Selection Modal controls
      const btnSaveSelection = document.getElementById('btn-save-list-selection');
      const btnCancelSelection = document.getElementById('btn-cancel-list-selection');
      const searchInput = document.getElementById('list-product-search');
      const selectGrid = document.getElementById('list-select-grid');

      if (btnSaveSelection) {
        btnSaveSelection.addEventListener('click', (e) => {
          e.preventDefault();
          Lists.saveList(currentListId, currentListName, Array.from(currentSelectedProductIds));
        });
      }

      if (btnCancelSelection) {
        btnCancelSelection.addEventListener('click', () => {
          const modalSelect = document.getElementById('modal-list-select');
          hideModal(modalSelect);
        });
      }

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          Lists._filterProductSelection(e.target.value);
        });
      }

      if (selectGrid) {
        // Handle checkbox toggles and card clicks
        selectGrid.addEventListener('change', (e) => {
          const checkbox = e.target.closest('.list-select-checkbox');
          if (!checkbox) return;

          const productId = Number(checkbox.value);
          const card = checkbox.closest('.list-select-item');

          if (checkbox.checked) {
            currentSelectedProductIds.add(productId);
            if (card) card.classList.add('selected');
          } else {
            currentSelectedProductIds.delete(productId);
            if (card) card.classList.remove('selected');
          }
        });
      }

      // 5. Overlay Click Handling
      const overlay = getOverlayEl();
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            const modalName = document.getElementById('modal-list-name');
            const modalSelect = document.getElementById('modal-list-select');
            if (modalName && !modalName.classList.contains('hidden') && modalName.style.display !== 'none') {
              hideModal(modalName);
            }
            if (modalSelect && !modalSelect.classList.contains('hidden') && modalSelect.style.display !== 'none') {
              hideModal(modalSelect);
            }
          }
        });
      }

      // Initial load
      Lists.loadLists();
    },

    /**
     * Internal transition helper from Step 1 (Name) to Step 2 (Product Selection).
     * @private
     */
    _handleProceedToProductSelection() {
      const inputName = document.getElementById('input-list-name');
      const name = inputName ? inputName.value.trim() : '';

      if (!name) {
        if (typeof window.showToast === 'function') {
          window.showToast('Please enter a list name', 'error');
        }
        if (inputName) inputName.focus();
        return;
      }

      currentListName = name;
      Lists.openProductSelection(currentListId, currentListName, Array.from(currentSelectedProductIds));
    },

    /**
     * Loads saved lists for the current company and updates UI.
     * @returns {Promise<void>}
     */
    async loadLists() {
      try {
        const companyId = getCurrentCompanyId();
        cachedLists = await window.DB.getLists(companyId);
        Lists.renderGrid(cachedLists);
      } catch (err) {
        console.error('Failed to load lists:', err);
        if (typeof window.showToast === 'function') {
          window.showToast('Failed to load lists', 'error');
        }
      }
    },

    /**
     * Renders list cards into #lists-grid or displays #lists-empty-state.
     * @param {Array<Object>} lists 
     */
    renderGrid(lists) {
      const grid = document.getElementById('lists-grid');
      const emptyState = document.getElementById('lists-empty-state');

      if (!grid) return;

      if (!lists || lists.length === 0) {
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

      const cardsHtml = lists.map((list) => {
        const count = Array.isArray(list.productIds) ? list.productIds.length : 0;
        const countText = `${count} ${count === 1 ? 'product' : 'products'}`;
        const dateText = formatDate(list.createdAt);

        return `
          <div class="list-card" data-list-id="${list.id}">
            <div class="list-card-icon">
              ${ICONS.LIST}
            </div>
            <div class="list-card-info">
              <h3 class="list-card-name" title="${escapeHtml(list.name)}">${escapeHtml(list.name)}</h3>
              <span class="list-card-count">${countText}</span>
              <span class="list-card-date">${dateText}</span>
            </div>
            <div class="list-card-actions">
              <button type="button" class="card-action-btn" data-action="edit" title="Edit List">
                ${ICONS.EDIT}
              </button>
              <button type="button" class="card-action-btn" data-action="duplicate" title="Duplicate List">
                ${ICONS.DUPLICATE}
              </button>
              <button type="button" class="card-action-btn card-action-danger" data-action="delete" title="Delete List">
                ${ICONS.DELETE}
              </button>
            </div>
          </div>
        `;
      }).join('');

      grid.innerHTML = cardsHtml;
    },

    /**
     * Opens the list name modal in creation mode.
     */
    openCreateModal() {
      currentListId = null;
      currentListName = '';
      currentSelectedProductIds = new Set();

      const modalName = document.getElementById('modal-list-name');
      const titleEl = document.getElementById('modal-list-title');
      const idInput = document.getElementById('input-list-id');
      const nameInput = document.getElementById('input-list-name');

      if (titleEl) titleEl.textContent = 'Create New List';
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';

      showModal(modalName);

      if (nameInput) setTimeout(() => nameInput.focus(), 50);
    },

    /**
     * Opens the list name modal pre-filled for editing an existing list.
     * @param {number} listId 
     */
    async openEditModal(listId) {
      try {
        const list = await window.DB.getList(listId);
        if (!list) {
          if (typeof window.showToast === 'function') {
            window.showToast('List not found', 'error');
          }
          return;
        }

        currentListId = list.id;
        currentListName = list.name || '';
        currentSelectedProductIds = new Set((list.productIds || []).map(Number));

        const modalName = document.getElementById('modal-list-name');
        const titleEl = document.getElementById('modal-list-title');
        const idInput = document.getElementById('input-list-id');
        const nameInput = document.getElementById('input-list-name');

        if (titleEl) titleEl.textContent = 'Edit List';
        if (idInput) idInput.value = list.id;
        if (nameInput) nameInput.value = list.name || '';

        showModal(modalName);

        if (nameInput) setTimeout(() => nameInput.focus(), 50);
      } catch (err) {
        console.error('Failed to open edit list modal:', err);
        if (typeof window.showToast === 'function') {
          window.showToast('Failed to load list details', 'error');
        }
      }
    },

    /**
     * Opens the product selection modal, displaying available products with checkboxes.
     * @param {number|null} listId 
     * @param {string} listName 
     * @param {number[]} existingProductIds 
     */
    async openProductSelection(listId, listName, existingProductIds = []) {
      const modalName = document.getElementById('modal-list-name');
      hideModal(modalName);

      const modalSelect = document.getElementById('modal-list-select');
      const titleEl = document.getElementById('modal-list-select-title');
      const searchInput = document.getElementById('list-product-search');

      if (titleEl) {
        titleEl.textContent = `Select Products for "${listName}"`;
      }
      if (searchInput) {
        searchInput.value = '';
      }

      currentListId = listId ? Number(listId) : null;
      currentListName = listName;
      currentSelectedProductIds = new Set(existingProductIds.map(Number));

      try {
        const companyId = getCurrentCompanyId();
        availableCompanyProducts = await window.DB.getProducts(companyId);

        Lists._renderProductSelectionGrid(availableCompanyProducts);
        showModal(modalSelect);
      } catch (err) {
        console.error('Failed to load products for list selection:', err);
        if (typeof window.showToast === 'function') {
          window.showToast('Failed to load products for selection', 'error');
        }
      }
    },

    /**
     * Renders product checkboxes into #list-select-grid.
     * @private
     * @param {Array<Object>} products 
     */
    _renderProductSelectionGrid(products) {
      const selectGrid = document.getElementById('list-select-grid');
      if (!selectGrid) return;

      if (!products || products.length === 0) {
        selectGrid.innerHTML = `
          <div class="empty-selection-notice" style="grid-column: 1 / -1; padding: 30px; text-align: center; color: #9CA3AF;">
            No products available. Please add products to this company first.
          </div>
        `;
        return;
      }

      const itemsHtml = products.map((product) => {
        const isChecked = currentSelectedProductIds.has(Number(product.id));
        const imgSrc = product.thumbnail || product.image || '';
        const hasPrice = product.cartonPrice !== null && product.cartonPrice !== undefined && product.cartonPrice !== '';
        const priceText = hasPrice ? `· $${Number(product.cartonPrice).toFixed(2)}` : '';

        return `
          <label class="list-select-item ${isChecked ? 'selected' : ''}" data-product-id="${product.id}">
            <input type="checkbox" class="list-select-checkbox" value="${product.id}" ${isChecked ? 'checked' : ''}>
            <div class="list-select-thumb">
              <img src="${imgSrc}" alt="${escapeHtml(product.name)}" loading="lazy">
            </div>
            <div class="list-select-info">
              <div class="list-select-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</div>
              <div class="list-select-meta">${product.piecesPerCarton || 0} pcs/ctn ${priceText}</div>
            </div>
          </label>
        `;
      }).join('');

      selectGrid.innerHTML = itemsHtml;
    },

    /**
     * Filters the product selection grid by search query while preserving selections.
     * @private
     * @param {string} query 
     */
    _filterProductSelection(query) {
      const q = (query || '').trim().toLowerCase();
      if (!q) {
        Lists._renderProductSelectionGrid(availableCompanyProducts);
        return;
      }

      const filtered = availableCompanyProducts.filter((p) => {
        return (p.name || '').toLowerCase().includes(q);
      });

      Lists._renderProductSelectionGrid(filtered);
    },

    /**
     * Saves list to DB (creates new or updates existing) and refreshes lists grid.
     * @param {number|null} listId 
     * @param {string} name 
     * @param {number[]} selectedProductIds 
     * @returns {Promise<void>}
     */
    async saveList(listId, name, selectedProductIds) {
      const cleanName = String(name || '').trim();
      const productIds = Array.isArray(selectedProductIds) ? selectedProductIds.map(Number) : [];
      const companyId = getCurrentCompanyId();

      if (!cleanName) {
        if (typeof window.showToast === 'function') {
          window.showToast('List name cannot be empty', 'error');
        }
        return;
      }

      try {
        if (listId) {
          await window.DB.updateList(listId, {
            name: cleanName,
            productIds: productIds
          });
          if (typeof window.showToast === 'function') {
            window.showToast('List updated successfully', 'success');
          }
        } else {
          await window.DB.addList({
            companyId: companyId,
            name: cleanName,
            productIds: productIds,
            createdAt: Date.now()
          });
          if (typeof window.showToast === 'function') {
            window.showToast('List created successfully', 'success');
          }
        }

        const modalSelect = document.getElementById('modal-list-select');
        hideModal(modalSelect);

        await Lists.loadLists();
      } catch (err) {
        console.error('Failed to save list:', err);
        if (typeof window.showToast === 'function') {
          window.showToast('Failed to save list: ' + err.message, 'error');
        }
      }
    },

    /**
     * Prompts for confirmation and deletes a list.
     * @param {number} listId 
     * @returns {Promise<void>}
     */
    async deleteList(listId) {
      const confirmed = typeof window.showConfirm === 'function'
        ? await window.showConfirm(
            'Delete List',
            'Are you sure you want to delete this list? The products inside will remain intact.',
            'Delete',
            true
          )
        : window.confirm('Are you sure you want to delete this list?');

      if (!confirmed) return;

      try {
        await window.DB.deleteList(listId);
        if (typeof window.showToast === 'function') {
          window.showToast('List deleted', 'success');
        }
        await Lists.loadLists();
      } catch (err) {
        console.error('Failed to delete list:', err);
        if (typeof window.showToast === 'function') {
          window.showToast('Failed to delete list', 'error');
        }
      }
    },

    /**
     * Clones an existing list with ' (Copy)' appended to its name.
     * @param {number} listId 
     * @returns {Promise<void>}
     */
    async duplicateList(listId) {
      try {
        const original = await window.DB.getList(listId);
        if (!original) {
          if (typeof window.showToast === 'function') {
            window.showToast('List to duplicate not found', 'error');
          }
          return;
        }

        const cloneData = {
          companyId: original.companyId,
          name: `${original.name} (Copy)`,
          productIds: Array.isArray(original.productIds) ? [...original.productIds] : [],
          createdAt: Date.now()
        };

        await window.DB.addList(cloneData);
        if (typeof window.showToast === 'function') {
          window.showToast(`Duplicated "${original.name}"`, 'success');
        }
        await Lists.loadLists();
      } catch (err) {
        console.error('Failed to duplicate list:', err);
        if (typeof window.showToast === 'function') {
          window.showToast('Failed to duplicate list', 'error');
        }
      }
    }
  };

  // Attach to window
  window.Lists = Lists;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Lists.init());
  } else {
    Lists.init();
  }
})();
