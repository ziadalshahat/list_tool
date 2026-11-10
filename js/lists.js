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
  /** @type {number[]} */
  let currentOrderedProductIds = [];
  /** @type {string[]} */
  let currentCategoryOrder = [];
  let currentGroupByCategories = true;
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

      // 4. Step 2: Product Selection Modal controls & Tab Switcher
      const tabBtnSelect = document.getElementById('tab-btn-select-products');
      const tabBtnReorder = document.getElementById('tab-btn-reorder-products');
      const selectPanel = document.getElementById('list-tab-select-panel');
      const reorderPanel = document.getElementById('list-tab-reorder-panel');

      if (tabBtnSelect && tabBtnReorder) {
        tabBtnSelect.addEventListener('click', () => {
          tabBtnSelect.style.background = 'var(--accent)';
          tabBtnSelect.style.color = '#fff';
          tabBtnReorder.style.background = 'transparent';
          tabBtnReorder.style.color = 'var(--text-secondary)';
          if (selectPanel) selectPanel.style.display = 'block';
          if (reorderPanel) reorderPanel.style.display = 'none';
        });

        tabBtnReorder.addEventListener('click', () => {
          tabBtnReorder.style.background = 'var(--accent)';
          tabBtnReorder.style.color = '#fff';
          tabBtnSelect.style.background = 'transparent';
          tabBtnSelect.style.color = 'var(--text-secondary)';
          if (selectPanel) selectPanel.style.display = 'none';
          if (reorderPanel) {
            reorderPanel.style.display = 'block';
            Lists._renderReorderingPanel();
          }
        });
      }

      const groupByCatCheckbox = document.getElementById('list-group-by-category-checkbox');
      if (groupByCatCheckbox) {
        groupByCatCheckbox.addEventListener('change', (e) => {
          currentGroupByCategories = e.target.checked;
          const catOrderSec = document.getElementById('list-category-order-section');
          if (catOrderSec) {
            catOrderSec.style.opacity = currentGroupByCategories ? '1' : '0.4';
            catOrderSec.style.pointerEvents = currentGroupByCategories ? 'auto' : 'none';
          }
        });
      }

      const btnSaveSelection = document.getElementById('btn-save-list-selection');
      const btnCancelSelection = document.getElementById('btn-cancel-list-selection');
      const searchInput = document.getElementById('list-product-search');
      const catFilter = document.getElementById('list-category-filter');
      const selectGrid = document.getElementById('list-select-grid');

      if (btnSaveSelection) {
        btnSaveSelection.addEventListener('click', (e) => {
          e.preventDefault();
          Lists.saveList(currentListId, currentListName, currentOrderedProductIds, currentCategoryOrder, currentGroupByCategories);
        });
      }

      if (btnCancelSelection) {
        btnCancelSelection.addEventListener('click', () => {
          const modalSelect = document.getElementById('modal-list-select');
          hideModal(modalSelect);
        });
      }

      if (searchInput) {
        searchInput.addEventListener('input', () => {
          Lists._filterProductSelection();
        });
      }

      if (catFilter) {
        catFilter.addEventListener('change', () => {
          Lists._filterProductSelection();
        });
      }

      if (selectGrid) {
        // Handle checkbox toggles
        selectGrid.addEventListener('change', (e) => {
          const checkbox = e.target.closest('.list-select-checkbox');
          if (!checkbox) return;

          const productId = Number(checkbox.value);
          const card = checkbox.closest('.list-select-item');

          if (checkbox.checked) {
            currentSelectedProductIds.add(productId);
            if (!currentOrderedProductIds.includes(productId)) {
              currentOrderedProductIds.push(productId);
            }
            if (card) card.classList.add('selected');
          } else {
            currentSelectedProductIds.delete(productId);
            currentOrderedProductIds = currentOrderedProductIds.filter(id => id !== productId);
            if (card) card.classList.remove('selected');
          }
        });
      }

      // Reorder buttons delegation (Move Up, Down, Top, Bottom, Remove, Category Up/Down)
      const reorderContainer = document.getElementById('list-reorder-items-container');
      if (reorderContainer) {
        reorderContainer.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-action]');
          if (!btn) return;
          const itemEl = btn.closest('[data-product-id]');
          if (!itemEl) return;

          const productId = Number(itemEl.dataset.productId);
          const action = btn.dataset.action;
          const index = currentOrderedProductIds.indexOf(productId);
          if (index === -1) return;

          if (action === 'top') {
            currentOrderedProductIds.splice(index, 1);
            currentOrderedProductIds.unshift(productId);
          } else if (action === 'bottom') {
            currentOrderedProductIds.splice(index, 1);
            currentOrderedProductIds.push(productId);
          } else if (action === 'up' && index > 0) {
            const temp = currentOrderedProductIds[index - 1];
            currentOrderedProductIds[index - 1] = currentOrderedProductIds[index];
            currentOrderedProductIds[index] = temp;
          } else if (action === 'down' && index < currentOrderedProductIds.length - 1) {
            const temp = currentOrderedProductIds[index + 1];
            currentOrderedProductIds[index + 1] = currentOrderedProductIds[index];
            currentOrderedProductIds[index] = temp;
          } else if (action === 'remove') {
            currentSelectedProductIds.delete(productId);
            currentOrderedProductIds.splice(index, 1);
            // Sync checkbox in grid
            const chk = selectGrid?.querySelector(`input.list-select-checkbox[value="${productId}"]`);
            if (chk) {
              chk.checked = false;
              chk.closest('.list-select-item')?.classList.remove('selected');
            }
          }

          Lists._renderReorderingPanel();
        });
      }

      const catOrderList = document.getElementById('list-category-order-list');
      if (catOrderList) {
        catOrderList.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-cat-action]');
          if (!btn) return;
          const catItem = btn.closest('[data-cat-name]');
          if (!catItem) return;

          const catName = catItem.dataset.catName;
          const action = btn.dataset.catAction;
          const index = currentCategoryOrder.indexOf(catName);
          if (index === -1) return;

          if (action === 'up' && index > 0) {
            const temp = currentCategoryOrder[index - 1];
            currentCategoryOrder[index - 1] = currentCategoryOrder[index];
            currentCategoryOrder[index] = temp;
          } else if (action === 'down' && index < currentCategoryOrder.length - 1) {
            const temp = currentCategoryOrder[index + 1];
            currentCategoryOrder[index + 1] = currentCategoryOrder[index];
            currentCategoryOrder[index] = temp;
          }

          Lists._renderReorderingPanel();
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
      currentOrderedProductIds = [];
      currentCategoryOrder = [];
      currentGroupByCategories = true;

      const modalName = document.getElementById('modal-list-name');
      const titleEl = document.getElementById('modal-list-title');
      const idInput = document.getElementById('input-list-id');
      const nameInput = document.getElementById('input-list-name');

      if (titleEl) titleEl.textContent = 'إنشاء قائمة جديدة / Create New List';
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
        const prodIds = (list.productIds || []).map(Number);
        currentSelectedProductIds = new Set(prodIds);
        currentOrderedProductIds = [...prodIds];
        currentCategoryOrder = Array.isArray(list.categoryOrder) ? [...list.categoryOrder] : [];
        currentGroupByCategories = list.groupByCategories !== false;

        const modalName = document.getElementById('modal-list-name');
        const titleEl = document.getElementById('modal-list-title');
        const idInput = document.getElementById('input-list-id');
        const nameInput = document.getElementById('input-list-name');

        if (titleEl) titleEl.textContent = 'تعديل القائمة / Edit List';
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
      const catFilter = document.getElementById('list-category-filter');

      if (titleEl) {
        titleEl.textContent = `اختيار وترتيب المنتجات لـ "${listName}"`;
      }
      if (searchInput) {
        searchInput.value = '';
      }

      currentListId = listId ? Number(listId) : null;
      currentListName = listName;
      if (existingProductIds && existingProductIds.length > 0) {
        currentSelectedProductIds = new Set(existingProductIds.map(Number));
        currentOrderedProductIds = [...existingProductIds.map(Number)];
      }

      // Reset to Tab 1 (Selection Tab)
      const tabBtnSelect = document.getElementById('tab-btn-select-products');
      const tabBtnReorder = document.getElementById('tab-btn-reorder-products');
      const selectPanel = document.getElementById('list-tab-select-panel');
      const reorderPanel = document.getElementById('list-tab-reorder-panel');
      if (tabBtnSelect && tabBtnReorder && selectPanel && reorderPanel) {
        tabBtnSelect.style.background = 'var(--accent)';
        tabBtnSelect.style.color = '#fff';
        tabBtnReorder.style.background = 'transparent';
        tabBtnReorder.style.color = 'var(--text-secondary)';
        selectPanel.style.display = 'block';
        reorderPanel.style.display = 'none';
      }

      const groupByCatCheckbox = document.getElementById('list-group-by-category-checkbox');
      if (groupByCatCheckbox) {
        groupByCatCheckbox.checked = currentGroupByCategories;
      }
      const catOrderSec = document.getElementById('list-category-order-section');
      if (catOrderSec) {
        catOrderSec.style.opacity = currentGroupByCategories ? '1' : '0.4';
        catOrderSec.style.pointerEvents = currentGroupByCategories ? 'auto' : 'none';
      }

      try {
        const companyId = getCurrentCompanyId();
        availableCompanyProducts = await window.DB.getProducts(companyId);

        // Populate Category Filter dropdown
        if (catFilter) {
          const uniqueCats = Array.from(new Set(availableCompanyProducts.map(p => (p.category || '').trim()).filter(Boolean)));
          catFilter.innerHTML = '<option value="">كل الأقسام / All Categories</option>' +
            uniqueCats.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
          catFilter.value = '';
        }

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
     * Renders product checkboxes into #list-select-grid with category badges and styling.
     * @private
     * @param {Array<Object>} products 
     */
    _renderProductSelectionGrid(products) {
      const selectGrid = document.getElementById('list-select-grid');
      if (!selectGrid) return;

      if (!products || products.length === 0) {
        selectGrid.innerHTML = `
          <div class="empty-selection-notice" style="grid-column: 1 / -1; padding: 40px; text-align: center; color: #9CA3AF;">
            لا توجد منتجات مطابقة في هذه الشركة.
          </div>
        `;
        return;
      }

      const itemsHtml = products.map((product) => {
        const isChecked = currentSelectedProductIds.has(Number(product.id));
        const imgSrc = product.thumbnail || product.image || '';
        const hasPrice = product.cartonPrice !== null && product.cartonPrice !== undefined && product.cartonPrice !== '';
        const priceText = hasPrice ? `· ${Number(product.cartonPrice).toFixed(0)} ج.م` : '';
        const catBadge = product.category ? `<span style="font-size: 11px; background: rgba(182,154,104,0.15); color: #B69A68; padding: 2px 7px; border-radius: 4px; font-weight: 600; margin-inline-start: 6px;">${escapeHtml(product.category)}</span>` : '';

        return `
          <label class="list-select-item ${isChecked ? 'selected' : ''}" data-product-id="${product.id}" style="display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid ${isChecked ? 'var(--accent)' : 'var(--border-color)'}; border-radius: 8px; cursor: pointer; transition: all 0.15s ease;">
            <input type="checkbox" class="list-select-checkbox" value="${product.id}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer;">
            <div class="list-select-thumb" style="width: 50px; height: 50px; border-radius: 6px; overflow: hidden; background: #f3f4f6; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
              ${imgSrc ? `<img src="${imgSrc}" alt="${escapeHtml(product.name)}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">` : `<span style="font-size: 20px;">📦</span>`}
            </div>
            <div class="list-select-info" style="flex: 1; min-width: 0;">
              <div class="list-select-name" title="${escapeHtml(product.name)}" style="font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center;">
                <span>${escapeHtml(product.name)}</span>
                ${catBadge}
              </div>
              <div class="list-select-meta" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                ${product.piecesPerCarton ? `${product.piecesPerCarton} قطعة/كرتونة` : ''} ${priceText}
              </div>
            </div>
          </label>
        `;
      }).join('');

      selectGrid.innerHTML = itemsHtml;
    },

    /**
     * Filters the product selection grid by search query and category while preserving selections.
     * @private
     */
    _filterProductSelection() {
      const searchInput = document.getElementById('list-product-search');
      const catFilter = document.getElementById('list-category-filter');
      const q = (searchInput?.value || '').trim().toLowerCase();
      const selectedCat = (catFilter?.value || '').trim();

      const filtered = availableCompanyProducts.filter((p) => {
        const matchesQuery = !q || (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
        const matchesCat = !selectedCat || (p.category || '').trim() === selectedCat;
        return matchesQuery && matchesCat;
      });

      Lists._renderProductSelectionGrid(filtered);
    },

    /**
     * Renders Tab 2: Reordering panel for both Categories order and Product order.
     * @private
     */
    _renderReorderingPanel() {
      const catOrderList = document.getElementById('list-category-order-list');
      const itemsContainer = document.getElementById('list-reorder-items-container');

      const productMap = new Map();
      availableCompanyProducts.forEach(p => productMap.set(Number(p.id), p));

      // 1. Identify selected products
      const selectedProducts = currentOrderedProductIds
        .map(id => productMap.get(id))
        .filter(Boolean);

      // Extract unique categories from selected products
      const presentCats = Array.from(new Set(
        selectedProducts.map(p => (p.category || '').trim()).filter(Boolean)
      ));

      // Synchronize currentCategoryOrder
      currentCategoryOrder = currentCategoryOrder.filter(cat => presentCats.includes(cat));
      presentCats.forEach(cat => {
        if (!currentCategoryOrder.includes(cat)) {
          currentCategoryOrder.push(cat);
        }
      });

      // Render Categories Reorder List
      if (catOrderList) {
        if (currentCategoryOrder.length <= 1) {
          catOrderList.innerHTML = `
            <div style="padding: 12px; text-align: center; color: var(--text-secondary); font-size: 13px;">
              ${currentCategoryOrder.length === 0 ? 'لا توجد أقسام للمنتجات المختارة حالياً.' : `قسم واحد متاح: <b>${escapeHtml(currentCategoryOrder[0])}</b>`}
            </div>
          `;
        } else {
          catOrderList.innerHTML = currentCategoryOrder.map((cat, idx) => `
            <div data-cat-name="${escapeHtml(cat)}" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; color: #B69A68; width: 22px;">#${idx + 1}</span>
                <span style="font-weight: 600; font-size: 14px;">${escapeHtml(cat)}</span>
              </div>
              <div style="display: flex; gap: 4px;">
                <button type="button" data-cat-action="up" ${idx === 0 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} class="btn btn-secondary" style="padding: 3px 8px; font-size: 12px;" title="تقديم القسم للأمام">▲ أعلى</button>
                <button type="button" data-cat-action="down" ${idx === currentCategoryOrder.length - 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} class="btn btn-secondary" style="padding: 3px 8px; font-size: 12px;" title="تأخير القسم للخلف">▼ أسفل</button>
              </div>
            </div>
          `).join('');
        }
      }

      // Render Product Items Reorder List
      if (itemsContainer) {
        if (selectedProducts.length === 0) {
          itemsContainer.innerHTML = `
            <div style="padding: 30px; text-align: center; color: var(--text-secondary); font-size: 13.5px;">
              لم يتم اختيار أي منتجات بعد. يرجى العودة لتبويب "اختيار المنتجات" وتحديد الأصناف.
            </div>
          `;
          return;
        }

        itemsContainer.innerHTML = selectedProducts.map((p, idx) => {
          const imgSrc = p.thumbnail || p.image || '';
          const catTag = p.category ? `<span style="font-size: 11px; background: rgba(182,154,104,0.15); color: #B69A68; padding: 2px 7px; border-radius: 4px; font-weight: 600;">${escapeHtml(p.category)}</span>` : '';
          const hasPrice = p.cartonPrice !== null && p.cartonPrice !== undefined && p.cartonPrice !== '';
          const priceText = hasPrice ? `· ${Number(p.cartonPrice).toFixed(0)} ج.م` : '';

          return `
            <div data-product-id="${p.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                <span style="font-weight: 700; color: #B69A68; width: 26px; text-align: center; flex-shrink: 0;">#${idx + 1}</span>
                <div style="width: 44px; height: 44px; border-radius: 6px; overflow: hidden; background: #eee; flex-shrink: 0;">
                  ${imgSrc ? `<img src="${imgSrc}" alt="${escapeHtml(p.name)}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span style="font-size: 18px; line-height: 44px; display: block; text-align: center;">📦</span>`}
                </div>
                <div style="min-width: 0; flex: 1;">
                  <div style="font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px;">
                    <span>${escapeHtml(p.name)}</span>
                    ${catTag}
                  </div>
                  <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                    ${p.piecesPerCarton ? `${p.piecesPerCarton} قطعة/كرتونة` : ''} ${priceText}
                  </div>
                </div>
              </div>

              <!-- Reorder Controls: Move to Top, Up, Down, Move to Bottom, Remove -->
              <div style="display: flex; gap: 4px; flex-shrink: 0;">
                <button type="button" data-action="top" ${idx === 0 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; font-weight: 600;" title="نقل إلى أول القائمة">⏫ أول القائمة</button>
                <button type="button" data-action="up" ${idx === 0 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px;" title="لأعلى">▲</button>
                <button type="button" data-action="down" ${idx === selectedProducts.length - 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px;" title="لأسفل">▼</button>
                <button type="button" data-action="bottom" ${idx === selectedProducts.length - 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; font-weight: 600;" title="نقل إلى آخر القائمة">⏬ آخر القائمة</button>
                <button type="button" data-action="remove" class="btn btn-danger" style="padding: 4px 8px; font-size: 12px; background: rgba(239, 68, 68, 0.1); color: #EF4444; border: 1px solid rgba(239, 68, 68, 0.2);" title="حذف من القائمة">✕</button>
              </div>
            </div>
          `;
        }).join('');
      }
    },

    /**
     * Saves list to DB (creates new or updates existing) with custom ordered product IDs,
     * category order, and category grouping preference, then refreshes lists grid.
     * @param {number|null} listId 
     * @param {string} name 
     * @param {number[]} selectedProductIds 
     * @param {string[]} categoryOrder 
     * @param {boolean} groupByCategories 
     * @returns {Promise<void>}
     */
    async saveList(listId, name, selectedProductIds, categoryOrder = [], groupByCategories = true) {
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
            productIds: productIds,
            categoryOrder: Array.isArray(categoryOrder) ? categoryOrder : [],
            groupByCategories: Boolean(groupByCategories)
          });
          if (typeof window.showToast === 'function') {
            window.showToast('تم تحديث القائمة بنجاح / List updated successfully', 'success');
          }
        } else {
          await window.DB.addList({
            companyId: companyId,
            name: cleanName,
            productIds: productIds,
            categoryOrder: Array.isArray(categoryOrder) ? categoryOrder : [],
            groupByCategories: Boolean(groupByCategories),
            createdAt: Date.now()
          });
          if (typeof window.showToast === 'function') {
            window.showToast('تم إنشاء القائمة بنجاح / List created successfully', 'success');
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
