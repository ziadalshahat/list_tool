/**
 * @file db.js
 * @description Core IndexedDB wrapper for Product List Generator.
 * Manages isolated storage for products, lists, and settings across companies.
 * Attaches to window.DB.
 */

(function () {
  'use strict';

  const DB_NAME = 'ProductListGeneratorDB';
  const DB_VERSION = 1;

  const STORES = {
    PRODUCTS: 'products',
    LISTS: 'lists',
    SETTINGS: 'settings'
  };

  /** @type {IDBDatabase|null} */
  let dbInstance = null;
  /** @type {Promise<IDBDatabase>|null} */
  let initPromise = null;

  /**
   * Helper to execute an IndexedDB transaction as a Promise.
   * @param {string|string[]} storeNames 
   * @param {'readonly'|'readwrite'} mode 
   * @param {function(IDBTransaction, Record<string, IDBObjectStore>): Promise<any>|void} callback 
   * @returns {Promise<any>}
   */
  async function withTransaction(storeNames, mode, callback) {
    const db = await DB.init();
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];

    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode);
      const storeMap = {};
      for (const name of names) {
        storeMap[name] = tx.objectStore(name);
      }

      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('Transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));

      try {
        const cbResult = callback(tx, storeMap);
        if (cbResult && typeof cbResult.then === 'function') {
          cbResult.then((res) => {
            result = res;
          }).catch(reject);
        } else {
          result = cbResult;
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Promisify an IDBRequest.
   * @param {IDBRequest} request 
   * @returns {Promise<any>}
   */
  function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IDBRequest failed'));
    });
  }

  const DB = {
    /**
     * Initializes the IndexedDB database and ensures default settings exist.
     * @returns {Promise<IDBDatabase>}
     */
    init() {
      if (dbInstance) {
        return Promise.resolve(dbInstance);
      }
      if (initPromise) {
        return initPromise;
      }

      initPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (event) => {
          const db = req.result;

          // 1. Products Store
          if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
            const productStore = db.createObjectStore(STORES.PRODUCTS, {
              keyPath: 'id',
              autoIncrement: true
            });
            productStore.createIndex('companyId', 'companyId', { unique: false });
            productStore.createIndex('name', 'name', { unique: false });
          }

          // 2. Lists Store
          if (!db.objectStoreNames.contains(STORES.LISTS)) {
            const listStore = db.createObjectStore(STORES.LISTS, {
              keyPath: 'id',
              autoIncrement: true
            });
            listStore.createIndex('companyId', 'companyId', { unique: false });
          }

          // 3. Settings Store (companyId as primary key, NOT autoIncrement)
          if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
            db.createObjectStore(STORES.SETTINGS, {
              keyPath: 'companyId',
              autoIncrement: false
            });
          }
        };

        req.onsuccess = async () => {
          dbInstance = req.result;

          // Ensure connection close handler cleans cached instance
          dbInstance.onclose = () => {
            dbInstance = null;
            initPromise = null;
          };

          try {
            // Seed default settings for company 1 and 2 if not present
            await DB._ensureDefaultSettings();
            resolve(dbInstance);
          } catch (seedErr) {
            reject(seedErr);
          }
        };

        req.onerror = () => {
          initPromise = null;
          reject(req.error || new Error('Failed to open database'));
        };

        req.onblocked = () => {
          console.warn('IndexedDB database open blocked. Please close other open tabs.');
        };
      });

      return initPromise;
    },

    /**
     * Internal helper to verify and seed default company settings.
     * @private
     * @returns {Promise<void>}
     */
    async _ensureDefaultSettings() {
      const defaults = [
        { companyId: 1, companyName: 'Company 1', logo: null },
        { companyId: 2, companyName: 'Company 2', logo: null }
      ];

      for (const def of defaults) {
        const existing = await DB.getSettings(def.companyId);
        if (!existing) {
          await DB.saveSettings(def);
        }
      }
    },

    // ==========================================
    // PRODUCTS API
    // ==========================================

    /**
     * Returns an array of all products for the specified company, sorted by createdAt desc.
     * @param {number|string} companyId 
     * @returns {Promise<Array<Object>>}
     */
    async getProducts(companyId) {
      const targetCompanyId = Number(companyId);
      return withTransaction(STORES.PRODUCTS, 'readonly', (tx, stores) => {
        const index = stores[STORES.PRODUCTS].index('companyId');
        const req = index.getAll(targetCompanyId);
        return promisifyRequest(req).then((products) => {
          return (products || []).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
        });
      });
    },

    /**
     * Returns a single product by ID.
     * @param {number|string} id 
     * @returns {Promise<Object|null>}
     */
    async getProduct(id) {
      const targetId = Number(id);
      return withTransaction(STORES.PRODUCTS, 'readonly', (tx, stores) => {
        const req = stores[STORES.PRODUCTS].get(targetId);
        return promisifyRequest(req).then((res) => res || null);
      });
    },

    /**
     * Adds a new product and returns the generated autoIncrement ID.
     * @param {Object} productData 
     * @returns {Promise<number>}
     */
    async addProduct(productData) {
      const cleanData = {
        companyId: Number(productData.companyId),
        name: String(productData.name || '').trim(),
        image: productData.image || '',
        thumbnail: productData.thumbnail || productData.image || '',
        piecesPerCarton: Number(productData.piecesPerCarton) || 0,
        cartonPrice: (productData.cartonPrice !== null && productData.cartonPrice !== undefined && productData.cartonPrice !== '' && !isNaN(productData.cartonPrice))
          ? Number(productData.cartonPrice)
          : null,
        createdAt: Number(productData.createdAt) || Date.now()
      };

      return withTransaction(STORES.PRODUCTS, 'readwrite', (tx, stores) => {
        const req = stores[STORES.PRODUCTS].add(cleanData);
        return promisifyRequest(req);
      });
    },

    /**
     * Merges updates into an existing product.
     * @param {number|string} id 
     * @param {Object} updates 
     * @returns {Promise<Object>}
     */
    async updateProduct(id, updates) {
      const targetId = Number(id);
      return withTransaction(STORES.PRODUCTS, 'readwrite', async (tx, stores) => {
        const store = stores[STORES.PRODUCTS];
        const existing = await promisifyRequest(store.get(targetId));
        if (!existing) {
          throw new Error(`Product with ID ${targetId} not found`);
        }

        const merged = {
          ...existing,
          ...updates,
          id: targetId // lock primary key
        };

        if (updates.companyId !== undefined) {
          merged.companyId = Number(updates.companyId);
        }
        if (updates.name !== undefined) {
          merged.name = String(updates.name).trim();
        }
        if (updates.piecesPerCarton !== undefined) {
          merged.piecesPerCarton = Number(updates.piecesPerCarton) || 0;
        }
        if (updates.cartonPrice !== undefined) {
          merged.cartonPrice = (updates.cartonPrice !== null && updates.cartonPrice !== '' && !isNaN(updates.cartonPrice))
            ? Number(updates.cartonPrice)
            : null;
        }

        await promisifyRequest(store.put(merged));
        return merged;
      });
    },

    /**
     * Deletes a product by ID.
     * @param {number|string} id 
     * @returns {Promise<void>}
     */
    async deleteProduct(id) {
      const targetId = Number(id);
      return withTransaction(STORES.PRODUCTS, 'readwrite', (tx, stores) => {
        const req = stores[STORES.PRODUCTS].delete(targetId);
        return promisifyRequest(req);
      });
    },

    // ==========================================
    // LISTS API
    // ==========================================

    /**
     * Returns an array of all lists for the specified company, sorted by createdAt desc.
     * @param {number|string} companyId 
     * @returns {Promise<Array<Object>>}
     */
    async getLists(companyId) {
      const targetCompanyId = Number(companyId);
      return withTransaction(STORES.LISTS, 'readonly', (tx, stores) => {
        const index = stores[STORES.LISTS].index('companyId');
        const req = index.getAll(targetCompanyId);
        return promisifyRequest(req).then((lists) => {
          return (lists || []).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
        });
      });
    },

    /**
     * Returns a single list by ID.
     * @param {number|string} id 
     * @returns {Promise<Object|null>}
     */
    async getList(id) {
      const targetId = Number(id);
      return withTransaction(STORES.LISTS, 'readonly', (tx, stores) => {
        const req = stores[STORES.LISTS].get(targetId);
        return promisifyRequest(req).then((res) => res || null);
      });
    },

    /**
     * Adds a new list and returns the generated autoIncrement ID.
     * @param {Object} listData 
     * @returns {Promise<number>}
     */
    async addList(listData) {
      const cleanData = {
        companyId: Number(listData.companyId),
        name: String(listData.name || '').trim(),
        productIds: Array.isArray(listData.productIds) ? listData.productIds.map(Number) : [],
        createdAt: Number(listData.createdAt) || Date.now()
      };

      return withTransaction(STORES.LISTS, 'readwrite', (tx, stores) => {
        const req = stores[STORES.LISTS].add(cleanData);
        return promisifyRequest(req);
      });
    },

    /**
     * Merges updates into an existing list.
     * @param {number|string} id 
     * @param {Object} updates 
     * @returns {Promise<Object>}
     */
    async updateList(id, updates) {
      const targetId = Number(id);
      return withTransaction(STORES.LISTS, 'readwrite', async (tx, stores) => {
        const store = stores[STORES.LISTS];
        const existing = await promisifyRequest(store.get(targetId));
        if (!existing) {
          throw new Error(`List with ID ${targetId} not found`);
        }

        const merged = {
          ...existing,
          ...updates,
          id: targetId
        };

        if (updates.companyId !== undefined) {
          merged.companyId = Number(updates.companyId);
        }
        if (updates.name !== undefined) {
          merged.name = String(updates.name).trim();
        }
        if (updates.productIds !== undefined && Array.isArray(updates.productIds)) {
          merged.productIds = updates.productIds.map(Number);
        }

        await promisifyRequest(store.put(merged));
        return merged;
      });
    },

    /**
     * Deletes a list by ID.
     * @param {number|string} id 
     * @returns {Promise<void>}
     */
    async deleteList(id) {
      const targetId = Number(id);
      return withTransaction(STORES.LISTS, 'readwrite', (tx, stores) => {
        const req = stores[STORES.LISTS].delete(targetId);
        return promisifyRequest(req);
      });
    },

    // ==========================================
    // SETTINGS API
    // ==========================================

    /**
     * Returns company settings for the given companyId.
     * @param {number|string} companyId 
     * @returns {Promise<Object|null>}
     */
    async getSettings(companyId) {
      const targetCompanyId = Number(companyId);
      return withTransaction(STORES.SETTINGS, 'readonly', (tx, stores) => {
        const req = stores[STORES.SETTINGS].get(targetCompanyId);
        return promisifyRequest(req).then((res) => res || null);
      });
    },

    /**
     * Upserts company settings.
     * @param {Object} settingsObj 
     * @returns {Promise<Object>}
     */
    async saveSettings(settingsObj) {
      const cleanSettings = {
        ...settingsObj,
        companyId: Number(settingsObj.companyId),
        companyName: String(settingsObj.companyName || `Company ${settingsObj.companyId}`).trim(),
        logo: settingsObj.logo || null
      };

      return withTransaction(STORES.SETTINGS, 'readwrite', (tx, stores) => {
        const req = stores[STORES.SETTINGS].put(cleanSettings);
        return promisifyRequest(req).then(() => cleanSettings);
      });
    },

    // ==========================================
    // BACKUP & RESTORE API
    // ==========================================

    /**
     * Exports all database data grouped by company.
     * @returns {Promise<{ companies: { '1': Object, '2': Object } }>}
     */
    async getAllData() {
      const [c1Settings, c2Settings] = await Promise.all([
        DB.getSettings(1),
        DB.getSettings(2)
      ]);

      const [c1Products, c2Products] = await Promise.all([
        DB.getProducts(1),
        DB.getProducts(2)
      ]);

      const [c1Lists, c2Lists] = await Promise.all([
        DB.getLists(1),
        DB.getLists(2)
      ]);

      return {
        companies: {
          '1': {
            settings: c1Settings || { companyId: 1, companyName: 'Company 1', logo: null },
            products: c1Products || [],
            lists: c1Lists || []
          },
          '2': {
            settings: c2Settings || { companyId: 2, companyName: 'Company 2', logo: null },
            products: c2Products || [],
            lists: c2Lists || []
          }
        }
      };
    },

    /**
     * Clears all object stores.
     * @returns {Promise<void>}
     */
    async clearAllData() {
      return withTransaction(
        [STORES.PRODUCTS, STORES.LISTS, STORES.SETTINGS],
        'readwrite',
        (tx, stores) => {
          stores[STORES.PRODUCTS].clear();
          stores[STORES.LISTS].clear();
          stores[STORES.SETTINGS].clear();
        }
      );
    },

    /**
     * Restores database from a backup object.
     * Clears all stores, regenerates autoIncrement IDs for products,
     * and maps the new IDs into list productIds references.
     * @param {Object} data - Backup object matching getAllData() output.
     * @returns {Promise<boolean>}
     */
    async restoreAllData(data) {
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid backup data format');
      }

      const companiesData = data.companies || data;

      // 1. Wipe current database
      await DB.clearAllData();

      // 2. Iterate each company
      const companyKeys = Object.keys(companiesData);
      for (const compKey of companyKeys) {
        const comp = companiesData[compKey];
        if (!comp) continue;

        const companyId = Number(compKey) || (comp.settings && Number(comp.settings.companyId)) || 1;

        // Restore Settings
        if (comp.settings) {
          await DB.saveSettings({
            companyId: companyId,
            companyName: comp.settings.companyName || `Company ${companyId}`,
            logo: comp.settings.logo || null
          });
        } else {
          await DB.saveSettings({
            companyId: companyId,
            companyName: `Company ${companyId}`,
            logo: null
          });
        }

        // Map oldProductId -> newProductId for this company
        const idMap = new Map();

        // Restore Products
        const products = Array.isArray(comp.products) ? comp.products : [];
        for (const prod of products) {
          const oldId = prod.id;
          const newId = await DB.addProduct({
            companyId: companyId,
            name: prod.name,
            image: prod.image,
            thumbnail: prod.thumbnail,
            piecesPerCarton: prod.piecesPerCarton,
            cartonPrice: prod.cartonPrice,
            createdAt: prod.createdAt || Date.now()
          });

          if (oldId !== undefined && oldId !== null) {
            idMap.set(Number(oldId), Number(newId));
          }
        }

        // Restore Lists with re-mapped product IDs
        const lists = Array.isArray(comp.lists) ? comp.lists : [];
        for (const list of lists) {
          const originalIds = Array.isArray(list.productIds) ? list.productIds : [];
          const remappedProductIds = originalIds
            .map((oldId) => idMap.get(Number(oldId)))
            .filter((newId) => newId !== undefined && newId !== null);

          await DB.addList({
            companyId: companyId,
            name: list.name,
            productIds: remappedProductIds,
            createdAt: list.createdAt || Date.now()
          });
        }
      }

      // Ensure both company 1 and 2 exist even if missing from backup
      await DB._ensureDefaultSettings();

      return true;
    }
  };

  // Attach to window
  window.DB = DB;

  // Auto-initialize on DOM ready or script load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      DB.init().catch((err) => console.error('IndexedDB auto-init failed:', err));
    });
  } else {
    DB.init().catch((err) => console.error('IndexedDB auto-init failed:', err));
  }
})();
