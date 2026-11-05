/**
 * Main Application Orchestrator for Premium Product List Generator
 * Initializes IndexedDB, registers submodules, handles routing/views,
 * manages dual-company switching, loading overlay, and responsive sidebar navigation.
 */

(function () {
  'use strict';

  window.App = {
    currentView: 'products',

    /**
     * Active company ID getter and setter backed by localStorage
     */
    get currentCompanyId() {
      return parseInt(localStorage.getItem('activeCompanyId'), 10) || 1;
    },
    set currentCompanyId(id) {
      localStorage.setItem('activeCompanyId', id.toString());
    },

    /**
     * App initialization entry point
     */
    async init() {
      try {
        this.showLoading();

        // 1. Initialize IndexedDB storage
        if (window.DB?.init) {
          await window.DB.init();
        }

        // 2-6. Initialize feature modules
        if (window.Products?.init) {
          window.Products.init();
        }
        if (window.Lists?.init) {
          window.Lists.init();
        }
        if (window.PDF?.init) {
          window.PDF.init();
        }
        if (window.Settings?.init) {
          window.Settings.init();
        }
        if (window.Backup?.init) {
          window.Backup.init();
        }

        // 7. Setup company switcher listeners
        this.setupCompanySwitcher();

        // 8. Setup navigation listeners
        this.setupNavigation();

        // 9. Setup mobile responsive sidebar toggle
        this.setupMobileSidebar();

        // 9.5. Setup modal close (X) buttons
        this.setupModalCloseButtons();

        // 10. Load company names for buttons and sidebar indicator
        await this.updateCompanyNames();

        // 11. Load initial view for current company
        await this.showView(this.currentView);
      } catch (err) {
        console.error('Fatal initialization error:', err);
        if (window.showToast) {
          window.showToast(`Initialization failed: ${err.message}`, 'error');
        }
      } finally {
        this.hideLoading();
      }
    },

    /**
     * Set up company switcher event listeners
     */
    setupCompanySwitcher() {
      const company1Btn = document.getElementById('company-1-btn');
      const company2Btn = document.getElementById('company-2-btn');
      const allCompanyBtns = document.querySelectorAll('.company-btn');

      if (company1Btn) {
        company1Btn.addEventListener('click', () => this.switchCompany(1));
      }
      if (company2Btn) {
        company2Btn.addEventListener('click', () => this.switchCompany(2));
      }

      allCompanyBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const cid = parseInt(btn.dataset.company, 10);
          if (cid) {
            this.switchCompany(cid);
          }
        });
      });
    },

    /**
     * Set up navigation buttons (.nav-btn[data-view])
     */
    setupNavigation() {
      const navButtons = document.querySelectorAll('.nav-btn[data-view]');

      navButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const targetView = btn.dataset.view;
          if (targetView) {
            this.showView(targetView);
            this.closeMobileSidebar();
          }
        });
      });
    },

    /**
     * Set up mobile sidebar toggle (#sidebar-toggle)
     */
    setupMobileSidebar() {
      const toggleBtn = document.getElementById('sidebar-toggle');
      const sidebar = document.getElementById('sidebar');

      if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          sidebar.classList.toggle('open');
          sidebar.classList.toggle('active');
        });

        // Close when clicking outside on mobile
        document.addEventListener('click', (e) => {
          if (
            sidebar.classList.contains('open') &&
            !sidebar.contains(e.target) &&
            e.target !== toggleBtn
          ) {
            this.closeMobileSidebar();
          }
        });
      }
    },

    /**
     * Close mobile sidebar if open
     */
    closeMobileSidebar() {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.classList.remove('open');
        sidebar.classList.remove('active');
      }
    },

    /**
     * Setup all modal close (X) buttons
     */
    setupModalCloseButtons() {
      document.querySelectorAll('.modal-close').forEach((btn) => {
        btn.addEventListener('click', () => {
          const modal = btn.closest('.modal');
          if (modal) {
            modal.classList.remove('active', 'show');
            modal.classList.add('hidden');
            modal.style.display = 'none';
          }
          // Check if any other modal is still open
          const overlay = document.getElementById('modal-overlay');
          if (overlay) {
            const anyActive = document.querySelector('.modal.active, .modal.show');
            if (!anyActive) {
              overlay.classList.remove('active', 'show');
              overlay.classList.add('hidden');
              overlay.style.display = 'none';
            }
          }
        });
      });
    },

    /**
     * Switch active company and refresh UI
     * @param {number} companyId - 1 or 2
     */
    async switchCompany(companyId) {
      if (this.currentCompanyId === companyId && document.querySelector(`.company-btn.active`)) {
        return; // Already on this company
      }

      this.currentCompanyId = companyId;

      // Update button active state classes
      const btn1 = document.getElementById('company-1-btn');
      const btn2 = document.getElementById('company-2-btn');
      if (btn1) btn1.classList.toggle('active', companyId === 1);
      if (btn2) btn2.classList.toggle('active', companyId === 2);

      document.querySelectorAll('.company-btn').forEach((btn) => {
        const id = parseInt(btn.dataset.company, 10);
        btn.classList.toggle('active', id === companyId);
      });

      // Update company indicator and names
      await this.updateCompanyNames();

      // Reload current view with the new company's data
      await this.showView(this.currentView);
    },

    /**
     * Transition between application views
     * @param {string} viewName - 'products' | 'lists' | 'pdf' | 'settings' | 'backup'
     */
    async showView(viewName) {
      this.currentView = viewName;

      // 1. Hide all .view sections
      const views = document.querySelectorAll('.view');
      views.forEach((v) => {
        v.classList.remove('active');
        v.classList.add('hidden');
        v.style.display = 'none';
      });

      // 2. Show the target view
      const targetView = document.getElementById(`view-${viewName}`);
      if (targetView) {
        targetView.classList.add('active');
        targetView.classList.remove('hidden');
        targetView.style.display = 'block';
      }

      // 3. Update nav buttons active state
      const navButtons = document.querySelectorAll('.nav-btn');
      navButtons.forEach((btn) => {
        const isActive = btn.dataset.view === viewName;
        btn.classList.toggle('active', isActive);
      });

      // 4. Trigger view-specific data loading
      try {
        switch (viewName) {
          case 'products':
            if (window.Products?.loadProducts) {
              await window.Products.loadProducts();
            }
            break;
          case 'lists':
            if (window.Lists?.loadLists) {
              await window.Lists.loadLists();
            }
            break;
          case 'pdf':
            if (window.PDF?.loadView) {
              await window.PDF.loadView();
            }
            break;
          case 'settings':
            if (window.Settings?.loadSettings) {
              await window.Settings.loadSettings();
            }
            break;
          case 'backup':
            // No dynamic data load required for backup view
            break;
        }
      } catch (err) {
        console.error(`Error loading view '${viewName}':`, err);
        if (window.showToast) {
          window.showToast(`Failed to load ${viewName} view.`, 'error');
        }
      }
    },

    /**
     * Show loading overlay
     */
    showLoading() {
      const overlay = document.getElementById('loading-overlay');
      if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('active');
        overlay.style.display = 'flex';
      }
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
      const overlay = document.getElementById('loading-overlay');
      if (overlay) {
        overlay.classList.remove('active');
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
      }
    },

    /**
     * Fetch settings for both companies and update switcher labels and sidebar indicator
     */
    async updateCompanyNames() {
      try {
        const s1 = (await window.DB.getSettings(1)) || {};
        const s2 = (await window.DB.getSettings(2)) || {};

        const name1 = s1.companyName || 'Company 1';
        const name2 = s2.companyName || 'Company 2';

        // Update button texts
        // Update company switcher buttons (preserve badge span, update text span)
        document.querySelectorAll('.company-btn').forEach((btn) => {
          const cid = parseInt(btn.dataset.company, 10);
          const nameToUse = cid === 1 ? name1 : cid === 2 ? name2 : null;
          if (nameToUse !== null) {
            // Find or create text span (second child span, after badge)
            const spans = btn.querySelectorAll('span');
            const textSpan = spans.length > 1 ? spans[spans.length - 1] : null;
            if (textSpan) {
              textSpan.textContent = nameToUse;
            }
            btn.classList.toggle('active', this.currentCompanyId === cid);
          }
        });

        // Update sidebar indicator
        const activeName = this.currentCompanyId === 2 ? name2 : name1;
        const indicator = document.getElementById('company-indicator');
        if (indicator) {
          indicator.textContent = activeName;
        }
      } catch (err) {
        console.warn('Could not update company names:', err);
      }
    },
  };

  // Launch application on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.App.init());
  } else {
    // DOM already loaded
    window.App.init();
  }
})();
