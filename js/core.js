// Core state and tab navigation
// --- GLOBAL STATE ---
        let scanModeActive = false;
        let scanItems = [];
        let scanCurrentIndex = 0;
        let scannedItems = new Set();
        let lastGenerationType = null;
        let lastGenerationParams = null;
        
        // Database State
        let db = null;
        let SQL = null;
        let dbLoaded = false;
        let currentDbResults = [];
        let currentDbLookup = null;
        let tableName = "data"; // Default, will detect
        let createQuickLookupMap = null;
        const DB_CACHE_NAME = 'ktpa-db-cache-v1';
        const DB_VERSION_STORAGE_KEY = 'ktpa-db-version';
        const DB_SOURCE_PATH_STORAGE_KEY = 'ktpa-db-path';
        const APP_VERSION_STORAGE_KEY = 'ktpa-app-version-last-seen';
        let appManifestInfo = null;
        let appChangelogEntries = [];

        // Bố cục in hàng loạt của tab Tra cứu & In ấn
        const PRINT_LAYOUT_STORAGE_KEY = 'ktpa-db-print-layout-v1';
        let printLayoutState = {
            columns: 3,
            orientation: 'portrait',
            margin: 6,
            columnGap: 3,
            itemHeight: 14,
            barcodeHeight: 7,
            itemGap: 1.5
        };
        let printLayoutUserEdited = false;
        let printLayoutInitialized = false;

        try {
            const savedPrintLayout = JSON.parse(localStorage.getItem(PRINT_LAYOUT_STORAGE_KEY) || 'null');
            if (savedPrintLayout && typeof savedPrintLayout === 'object') {
                printLayoutState = { ...printLayoutState, ...savedPrintLayout };
                printLayoutInitialized = true;
            }
        } catch (e) {
            // Không để lỗi localStorage ảnh hưởng tới việc tạo barcode.
        }

        // --- TAB SYSTEM ---
        function switchTab(tab) {
            const createBtn = document.getElementById('tab-create');
            const lookupBtn = document.getElementById('tab-lookup');
            const createContent = document.getElementById('tab-content-create');
            const lookupContent = document.getElementById('tab-content-lookup');

            if (tab === 'create') {
                createBtn.classList.add('active');
                lookupBtn.classList.remove('active');
                createContent.classList.remove('hidden');
                lookupContent.classList.add('hidden');
            } else {
                createBtn.classList.add('active'); // Wait, should be lookupBtn
                lookupBtn.classList.add('active');
                createBtn.classList.remove('active');
                createContent.classList.add('hidden');
                lookupContent.classList.remove('hidden');
                
                if (!dbLoaded) {
                    initDatabase();
                }
            }
            clearResults();
        }


