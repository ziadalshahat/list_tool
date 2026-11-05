/**
 * Backup & Restore Module for Premium Product List Generator
 * Handles full JSON database export (enveloped with version & metadata),
 * file picker trigger, structure validation, destructive restore confirmation,
 * IndexedDB restoration, and multi-view state refresh.
 */

(function () {
  'use strict';

  window.Backup = {
    /**
     * Attach DOM event listeners
     */
    init() {
      // Export backup button
      const btnExport = document.getElementById('btn-export-backup');
      if (btnExport) {
        btnExport.addEventListener('click', () => {
          this.exportBackup();
        });
      }

      // Import backup button and hidden file input
      const btnImport = document.getElementById('btn-import-backup');
      const fileInput = document.getElementById('backup-file-input');

      if (btnImport && fileInput) {
        btnImport.addEventListener('click', () => {
          fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            await this.importBackup(file);
            fileInput.value = ''; // Reset so the same file can be re-selected if needed
          }
        });
      }
    },

    /**
     * Helper to show loading state
     */
    showLoading() {
      if (window.App?.showLoading) {
        window.App.showLoading();
      } else {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
          overlay.classList.remove('hidden');
          overlay.style.display = 'flex';
        }
      }
    },

    /**
     * Helper to hide loading state
     */
    hideLoading() {
      if (window.App?.hideLoading) {
        window.App.hideLoading();
      } else {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
          overlay.classList.add('hidden');
          overlay.style.display = 'none';
        }
      }
    },

    /**
     * Gather all IndexedDB data across both companies, wrap in envelope, and download JSON
     */
    async exportBackup() {
      this.showLoading();

      try {
        const allData = await window.DB.getAllData();

        const envelope = {
          version: 1,
          appName: 'ProductListGenerator',
          exportDate: new Date().toISOString(),
          data: allData,
        };

        const jsonStr = JSON.stringify(envelope, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = `product-list-backup-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (window.showToast) {
          window.showToast('Backup exported successfully.', 'success');
        }
      } catch (err) {
        console.error('Export backup failed:', err);
        if (window.showToast) {
          window.showToast(`Export failed: ${err.message}`, 'error');
        }
      } finally {
        this.hideLoading();
      }
    },

    /**
     * Parse, validate, confirm, and restore database from a JSON file
     * @param {File} file
     */
    async importBackup(file) {
      if (!file) return;

      let fileText = '';
      try {
        fileText = await file.text();
      } catch (readErr) {
        console.error('Error reading file:', readErr);
        if (window.showToast) {
          window.showToast('Failed to read the backup file.', 'error');
        }
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(fileText);
      } catch (parseErr) {
        console.error('Invalid JSON in backup file:', parseErr);
        if (window.showToast) {
          window.showToast('Invalid backup file: Not a valid JSON format.', 'error');
        }
        return;
      }

      // Structure validation
      const isValid =
        parsed &&
        parsed.appName === 'ProductListGenerator' &&
        parsed.version != null &&
        parsed.data &&
        typeof parsed.data === 'object';

      if (!isValid) {
        if (window.showToast) {
          window.showToast(
            'Invalid backup format: File does not match ProductListGenerator schema.',
            'error'
          );
        }
        return;
      }

      // Show destructive restore confirmation
      let confirmed = false;
      const confirmMsg =
        'This will replace ALL current data for both companies. This action cannot be undone. Continue?';

      if (typeof window.showConfirm === 'function') {
        confirmed = await window.showConfirm(
          'Restore All Data',
          confirmMsg,
          'Restore All Data',
          true
        );
      } else {
        confirmed = window.confirm(confirmMsg);
      }

      if (!confirmed) return;

      this.showLoading();

      try {
        await window.DB.restoreAllData(parsed.data);

        // Refresh all views and indicators
        if (window.App?.updateCompanyNames) {
          await window.App.updateCompanyNames();
        }

        const currentView = window.App?.currentView || 'products';
        if (currentView === 'products' && window.Products?.loadProducts) {
          await window.Products.loadProducts();
        } else if (currentView === 'lists' && window.Lists?.loadLists) {
          await window.Lists.loadLists();
        } else if (currentView === 'pdf' && window.PDF?.loadView) {
          await window.PDF.loadView();
        }

        if (window.Settings?.loadSettings) {
          await window.Settings.loadSettings();
        }

        if (window.showToast) {
          window.showToast('Backup restored successfully!', 'success');
        }
      } catch (restoreErr) {
        console.error('Restore failed:', restoreErr);
        if (window.showToast) {
          window.showToast(`Restore failed: ${restoreErr.message}`, 'error');
        }
      } finally {
        this.hideLoading();
      }
    },
  };
})();
