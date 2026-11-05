/**
 * Company Settings Module for Premium Product List Generator
 * Manages company identity, debounced auto-save of company names,
 * company logo upload via ImageUtils, removal with confirmation,
 * and live synchronization with sidebar & company switchers.
 */

(function () {
  'use strict';

  window.Settings = {
    debounceTimer: null,
    currentLogo: null,

    /**
     * Attach DOM event listeners
     */
    init() {
      // Auto-save on input for all settings text fields
      const inputIds = [
        'settings-company-name',
        'settings-company-name-ar',
        'settings-company-phone',
        'settings-company-email',
        'settings-company-address'
      ];

      inputIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', () => {
            const statusEl = document.getElementById('settings-save-status');
            if (statusEl) {
              statusEl.textContent = 'Saving...';
              statusEl.classList.remove('saved');
              statusEl.classList.add('saving');
            }

            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
              this.saveSettings();
            }, 500);
          });
        }
      });

      // Upload logo trigger
      const btnUpload = document.getElementById('btn-upload-logo');
      const fileInput = document.getElementById('settings-logo-input');

      if (btnUpload && fileInput) {
        btnUpload.addEventListener('click', () => {
          fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            await this.handleLogoUpload(file);
            fileInput.value = ''; // Reset to allow re-uploading same file
          }
        });
      }

      // Remove logo button
      const btnRemove = document.getElementById('btn-remove-logo');
      if (btnRemove) {
        btnRemove.addEventListener('click', () => {
          this.removeLogo();
        });
      }
    },

    /**
     * Fetch settings for current company and populate form
     */
    async loadSettings() {
      const companyId = window.App?.currentCompanyId || 1;

      try {
        const settings = (await window.DB.getSettings(companyId)) || {};
        
        const nameInput = document.getElementById('settings-company-name');
        if (nameInput) {
          nameInput.value = settings.companyName || '';
        }

        const nameArInput = document.getElementById('settings-company-name-ar');
        if (nameArInput) {
          nameArInput.value = settings.companyNameAr || '';
        }

        const phoneInput = document.getElementById('settings-company-phone');
        if (phoneInput) {
          phoneInput.value = settings.phone || '';
        }

        const emailInput = document.getElementById('settings-company-email');
        if (emailInput) {
          emailInput.value = settings.email || '';
        }

        const addressInput = document.getElementById('settings-company-address');
        if (addressInput) {
          addressInput.value = settings.address || '';
        }

        this.currentLogo = settings.logo || null;
        this.renderLogoPreview(settings.companyName, this.currentLogo);

        const statusEl = document.getElementById('settings-save-status');
        if (statusEl) {
          statusEl.textContent = '';
          statusEl.classList.remove('saving', 'saved');
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
        if (window.showToast) {
          window.showToast('Failed to load settings.', 'error');
        }
      }
    },

    /**
     * Render logo image or initial letter placeholder
     * @param {string} companyName
     * @param {string|null} logo
     */
    renderLogoPreview(companyName, logo) {
      const previewDiv = document.getElementById('settings-logo-preview');
      const removeBtn = document.getElementById('btn-remove-logo');

      if (!previewDiv) return;

      const companyId = window.App?.currentCompanyId || 1;
      const defaultName = companyId === 1 ? 'Company 1' : 'Company 2';
      const effectiveName = companyName || defaultName;

      if (logo) {
        previewDiv.innerHTML = `
          <img src="${logo}" alt="${effectiveName} Logo" class="settings-logo-image" style="max-width: 120px; max-height: 120px; width: auto; height: auto; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        `;
        if (removeBtn) {
          removeBtn.classList.remove('hidden');
          removeBtn.style.display = 'inline-flex';
        }
      } else {
        const initial = effectiveName.trim().charAt(0).toUpperCase() || 'C';
        previewDiv.innerHTML = `
          <div class="logo-placeholder" style="width: 100px; height: 100px; border-radius: 12px; background: #0F172A; color: #C9A96E; font-size: 2.2rem; font-weight: 700; display: flex; align-items: center; justify-content: center; border: 2px dashed #C9A96E;">
            ${initial}
          </div>
        `;
        if (removeBtn) {
          removeBtn.classList.add('hidden');
          removeBtn.style.display = 'none';
        }
      }
    },

    /**
     * Save current form values to DB and update UI indicators
     */
    async saveSettings() {
      const companyId = window.App?.currentCompanyId || 1;
      const nameInput = document.getElementById('settings-company-name');
      const nameArInput = document.getElementById('settings-company-name-ar');
      const phoneInput = document.getElementById('settings-company-phone');
      const emailInput = document.getElementById('settings-company-email');
      const addressInput = document.getElementById('settings-company-address');

      const companyName = nameInput ? nameInput.value.trim() : '';
      const companyNameAr = nameArInput ? nameArInput.value.trim() : '';
      const phone = phoneInput ? phoneInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const address = addressInput ? addressInput.value.trim() : '';

      const settingsObj = {
        companyId,
        companyName,
        companyNameAr,
        phone,
        email,
        address,
        logo: this.currentLogo,
      };

      try {
        await window.DB.saveSettings(settingsObj);

        // Update indicator span
        const statusEl = document.getElementById('settings-save-status');
        if (statusEl) {
          statusEl.textContent = 'Saved ✓';
          statusEl.classList.remove('saving');
          statusEl.classList.add('saved');

          setTimeout(() => {
            if (statusEl.textContent === 'Saved ✓') {
              statusEl.textContent = '';
              statusEl.classList.remove('saved');
            }
          }, 2500);
        }

        // Re-render preview placeholder letter if no custom logo
        if (!this.currentLogo) {
          this.renderLogoPreview(companyName, null);
        }

        // Update sidebar and company switcher headers
        if (window.App?.updateCompanyNames) {
          await window.App.updateCompanyNames();
        }
      } catch (err) {
        console.error('Error saving settings:', err);
        const statusEl = document.getElementById('settings-save-status');
        if (statusEl) {
          statusEl.textContent = 'Error saving';
          statusEl.classList.remove('saving', 'saved');
        }
        if (window.showToast) {
          window.showToast('Could not save settings.', 'error');
        }
      }
    },

    /**
     * Process and save uploaded logo
     * @param {File} file
     */
    async handleLogoUpload(file) {
      if (!file.type.startsWith('image/')) {
        if (window.showToast) {
          window.showToast('Please select a valid image file (PNG, JPG, SVG, WebP).', 'error');
        }
        return;
      }

      if (window.App?.showLoading) {
        window.App.showLoading();
      }

      try {
        let base64;
        if (window.ImageUtils?.processLogo) {
          base64 = await window.ImageUtils.processLogo(file, 256, 0.9);
        } else {
          // Fallback to FileReader if ImageUtils is absent
          base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }

        this.currentLogo = base64;
        await this.saveSettings();

        const nameInput = document.getElementById('settings-company-name');
        this.renderLogoPreview(nameInput?.value, this.currentLogo);

        if (window.showToast) {
          window.showToast('Company logo updated successfully!', 'success');
        }
      } catch (err) {
        console.error('Failed to process logo:', err);
        if (window.showToast) {
          window.showToast('Failed to process logo image.', 'error');
        }
      } finally {
        if (window.App?.hideLoading) {
          window.App.hideLoading();
        }
      }
    },

    /**
     * Remove company logo after user confirmation
     */
    async removeLogo() {
      let confirmed = true;
      if (typeof window.showConfirm === 'function') {
        confirmed = await window.showConfirm(
          'Remove Company Logo',
          'Are you sure you want to remove the logo for this company?',
          'Remove',
          true
        );
      }

      if (!confirmed) return;

      this.currentLogo = null;
      await this.saveSettings();

      const nameInput = document.getElementById('settings-company-name');
      this.renderLogoPreview(nameInput?.value, null);

      if (window.showToast) {
        window.showToast('Logo removed.', 'info');
      }
    },
  };
})();
