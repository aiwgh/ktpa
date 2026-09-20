// Database lookup and print layout
// --- DATABASE LOGIC ---
        const R2_PUBLIC_BUCKET_URL = 'https://pub-317e90bf3d2048eca4c4f97ca6e997e0.r2.dev';

        async function fetchProjectDbVersion() {
            const response = await fetch(`${R2_PUBLIC_BUCKET_URL}/version.json`, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error('Không thể đọc version.json để kiểm tra phiên bản DB.');
            }
            const data = await response.json();
            return (data?.version || '').toString().trim();
        }

        function parseDbVersion(versionStr) {
            const raw = (versionStr || '').toString().trim();
            if (!/^\d{6}$/.test(raw)) return null;
            const month = parseInt(raw.slice(0, 2), 10);
            const year = parseInt(raw.slice(2), 10);
            if (month < 1 || month > 12) return null;
            return { month, year, date: new Date(year, month - 1, 1) };
        }

        function isDbVersionOlderThanTwoMonths(versionStr) {
            const parsed = parseDbVersion(versionStr);
            if (!parsed) return false;
            const now = new Date();
            const monthDiff = (now.getFullYear() - parsed.year) * 12 + (now.getMonth() - (parsed.month - 1));
            return monthDiff >= 2;
        }

        async function getDbCache() {
            if (!('caches' in window)) return null;
            return caches.open(DB_CACHE_NAME);
        }

        async function getCachedDbResponse(dbCandidates) {
            const cache = await getDbCache();
            if (!cache) return null;

            const preferredPath = localStorage.getItem(DB_SOURCE_PATH_STORAGE_KEY);
            const orderedCandidates = preferredPath
                ? [preferredPath, ...dbCandidates.filter(p => p !== preferredPath)]
                : dbCandidates;

            for (const path of orderedCandidates) {
                const cached = await cache.match(path);
                if (cached) {
                    return { response: cached, path };
                }
            }
            return null;
        }

        async function fetchAndCacheDbFromNetwork(dbCandidates) {
            let response = null;
            let matchedPath = null;

            for (const p of dbCandidates) {
                const r = await fetch(p, { cache: 'no-store' });
                if (r.ok) {
                    response = r;
                    matchedPath = p;
                    break;
                }
            }

            if (!response || !matchedPath) {
                throw new Error(`Không thể tải file database. Đảm bảo file tồn tại trong thư mục gốc (${dbCandidates.join(', ')}).`);
            }

            const cache = await getDbCache();
            if (cache) {
                await cache.put(matchedPath, response.clone());
            }

            localStorage.setItem(DB_SOURCE_PATH_STORAGE_KEY, matchedPath);
            return { response, path: matchedPath };
        }

        async function loadDbFileWithVersioning() {
            const dbCandidates = [
                `${R2_PUBLIC_BUCKET_URL}/db.sqlite`,
                `${R2_PUBLIC_BUCKET_URL}/barcodeinbox.sqlite`,
                './db.sqlite',
                './barcodeinbox.sqlite'
            ];
            const storedVersion = localStorage.getItem(DB_VERSION_STORAGE_KEY);
            let projectVersion = null;
            let versionFetchFailed = false;

            try {
                projectVersion = await fetchProjectDbVersion();
            } catch (err) {
                versionFetchFailed = true;
            }

            if (projectVersion && storedVersion === projectVersion) {
                const cached = await getCachedDbResponse(dbCandidates);
                if (cached) {
                    return {
                        response: cached.response,
                        source: 'cache',
                        path: cached.path,
                        version: projectVersion,
                        staleWarning: isDbVersionOlderThanTwoMonths(projectVersion),
                        versionFetchFailed: false
                    };
                }
            }

            if (projectVersion) {
                try {
                    const fresh = await fetchAndCacheDbFromNetwork(dbCandidates);
                    localStorage.setItem(DB_VERSION_STORAGE_KEY, projectVersion);
                    return {
                        response: fresh.response,
                        source: 'network',
                        path: fresh.path,
                        version: projectVersion,
                        staleWarning: isDbVersionOlderThanTwoMonths(projectVersion),
                        versionFetchFailed: false
                    };
                } catch (networkErr) {
                    const cached = await getCachedDbResponse(dbCandidates);
                    if (cached) {
                        return {
                            response: cached.response,
                            source: 'cache-fallback',
                            path: cached.path,
                            version: storedVersion || projectVersion,
                            staleWarning: isDbVersionOlderThanTwoMonths(storedVersion || projectVersion),
                            versionFetchFailed: true
                        };
                    }
                    throw networkErr;
                }
            }

            const cached = await getCachedDbResponse(dbCandidates);
            if (cached) {
                return {
                    response: cached.response,
                    source: 'cache-fallback',
                    path: cached.path,
                    version: storedVersion || '',
                    staleWarning: isDbVersionOlderThanTwoMonths(storedVersion || ''),
                    versionFetchFailed
                };
            }

            throw new Error('Không thể tải version.json và cũng không có DB trong cache để sử dụng offline.');
        }

        async function initDatabase() {
            const statusDiv = document.getElementById('db-loading-status');
            const lookupBtn = document.getElementById('db-lookup-btn');
            
            try {
                const config = {
                    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
                };
                SQL = await initSqlJs(config);

                if (statusDiv) {
                    statusDiv.classList.remove('hidden');
                    statusDiv.innerHTML = 'Đang kiểm tra phiên bản và tải Database...';
                }

                const loadInfo = await loadDbFileWithVersioning();
                const response = loadInfo.response;
                
                const arrayBuffer = await response.arrayBuffer();
                const uInt8Array = new Uint8Array(arrayBuffer);
                
                db = new SQL.Database(uInt8Array);
                
                // Detect table name
                const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
                if (res.length > 0 && res[0].values.length > 0) {
                    const names = res[0].values.map(v => v[0]);
                    tableName = names.includes("data") ? "data" : names[0];
                }
                
                dbLoaded = true;
                if (statusDiv) {
                    const sourceText = loadInfo.source === 'network'
                        ? 'đã tải mới'
                        : (loadInfo.source === 'cache' ? 'đang dùng cache' : 'đang dùng cache offline');
                    let statusHtml = `✅ Đã kết nối Database: <b>${tableName}</b> | ${sourceText}`;
                    if (loadInfo.version) {
                        statusHtml += ` | version: <b>${loadInfo.version}</b>`;
                    }
                    if (loadInfo.versionFetchFailed) {
                        statusHtml += ` | <span class="font-black">không kiểm tra được version online</span>`;
                    }
                    if (loadInfo.staleWarning) {
                        statusHtml += ` | <span class="font-black">DB có thể đã cũ, hãy liên hệ lập trình viên để cập nhật</span>`;
                    }
                    statusDiv.innerHTML = statusHtml;
                    statusDiv.classList.remove('bg-amber-50', 'border-amber-100', 'text-amber-700', 'animate-pulse');
                    if (loadInfo.staleWarning || loadInfo.versionFetchFailed) {
                        statusDiv.classList.add('bg-amber-50', 'border-amber-100', 'text-amber-700');
                    } else {
                        statusDiv.classList.add('bg-emerald-50', 'border-emerald-100', 'text-emerald-700');
                        setTimeout(() => statusDiv.classList.add('hidden'), 4000);
                    }
                }
                if (lookupBtn) lookupBtn.disabled = false;

                if (loadInfo.staleWarning) {
                    showNotification('DB có thể đã cũ hơn 2 tháng. Hãy liên hệ lập trình viên để cập nhật dữ liệu mới.');
                }
                
            } catch (err) {
                console.error(err);
                if (statusDiv) {
                    statusDiv.innerHTML = '❌ Lỗi: ' + err.message;
                    statusDiv.classList.remove('bg-amber-50', 'border-amber-100', 'text-amber-700', 'animate-pulse');
                    statusDiv.classList.add('bg-rose-50', 'border-rose-100', 'text-rose-700');
                }
            }
        }

        function toggleCreateQuickLookup() {
            const panel = document.getElementById('create-db-panel');
            const icon = document.getElementById('create-db-toggle-icon');
            if (!panel || !icon) return;
            const isHidden = panel.classList.contains('hidden');
            if (isHidden) {
                panel.classList.remove('hidden');
                icon.innerText = '−';
            } else {
                panel.classList.add('hidden');
                icon.innerText = '+';
            }
        }

        async function ensureDbReady() {
            if (dbLoaded && db) return true;
            await initDatabase();
            return !!db;
        }

        function getCreateSelectedTypes() {
            return Array.from(document.querySelectorAll('.create-db-type:checked')).map(cb => cb.value);
        }

        function appendToSimpleInput(text) {
            const input = document.getElementById('simpleInput');
            if (!input) return;
            const current = input.value || "";
            const prefix = current.trim().length === 0 ? "" : (current.endsWith("\n") ? "" : "\n");
            input.value = current + prefix + text + "\n";
            input.focus();
        }

        function normalizeBarcodeTypeForUi(t) {
            const v = (t || "").toString().trim().toUpperCase();
            if (v.startsWith("ACN")) return "ACN";
            if (v.startsWith("AKR")) return "AKR";
            return v;
        }

        function escapeHtml(text) {
            return (text || '').toString()
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function renderChangelogSection(title, items, accentClass = 'text-indigo-600') {
            if (!Array.isArray(items) || items.length === 0) return '';
            const listHtml = items.map(item => `<li class="text-sm md:text-[15px] text-slate-700 leading-relaxed">${escapeHtml(item)}</li>`).join('');
            return `
                <div class="p-4 bg-white rounded-2xl border border-slate-200">
                    <div class="text-xs font-black uppercase tracking-[0.2em] ${accentClass} mb-3">${escapeHtml(title)}</div>
                    <ul class="space-y-2">${listHtml}</ul>
                </div>
            `;
        }

        function getCurrentChangelogEntry() {
            if (!appManifestInfo?.version) return null;
            return appChangelogEntries.find(entry => (entry?.version || '').toString().trim() === appManifestInfo.version) || null;
        }

        function renderChangelogModal() {
            const title = document.getElementById('changelog-modal-title');
            const subtitle = document.getElementById('changelog-modal-subtitle');
            const content = document.getElementById('changelog-modal-content');
            if (!title || !subtitle || !content) return;

            const currentVersion = appManifestInfo?.version || 'Không rõ';
            const entry = getCurrentChangelogEntry();

            title.innerText = `Phiên bản ${currentVersion}`;
            subtitle.innerText = entry?.date
                ? `Cập nhật ngày ${entry.date}`
                : 'Các thay đổi và lỗi đã sửa của phiên bản hiện tại';

            if (!entry) {
                content.innerHTML = `
                    <div class="p-5 bg-white rounded-2xl border border-slate-200">
                        <div class="text-sm font-black text-slate-900 mb-2">Chưa có nội dung changelog cho phiên bản ${escapeHtml(currentVersion)}</div>
                        <div class="text-sm text-slate-600 leading-relaxed">Bạn có thể cập nhật thủ công trong file <code class="font-mono bg-slate-100 px-1.5 py-0.5 rounded">changelog.json</code>.</div>
                    </div>
                `;
                return;
            }

            const summaryHtml = entry.summary
                ? `<div class="p-5 bg-indigo-50 rounded-2xl border border-indigo-100 text-sm md:text-[15px] font-bold text-slate-700 leading-relaxed">${escapeHtml(entry.summary)}</div>`
                : '';

            const sections = [
                renderChangelogSection('Tính năng mới', entry.features, 'text-emerald-600'),
                renderChangelogSection('Cải tiến', entry.improvements, 'text-indigo-600'),
                renderChangelogSection('Lỗi đã sửa', entry.fixes, 'text-rose-600'),
                renderChangelogSection('Ghi chú', entry.notes, 'text-amber-600')
            ].filter(Boolean).join('');

            content.innerHTML = `
                ${summaryHtml}
                ${sections || `<div class="p-5 bg-white rounded-2xl border border-slate-200 text-sm text-slate-600">Phiên bản này chưa có chi tiết thay đổi.</div>`}
            `;
        }

        function openChangelogModal() {
            const modal = document.getElementById('changelog-modal');
            if (!modal) return;
            renderChangelogModal();
            modal.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
        }

        function closeChangelogModal() {
            const modal = document.getElementById('changelog-modal');
            if (!modal) return;
            modal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        }

        async function loadAppChangelog() {
            try {
                const manifestRes = await fetch('./manifest.json', { cache: 'no-store' });
                if (!manifestRes.ok) throw new Error('Không thể đọc manifest.json.');
                appManifestInfo = await manifestRes.json();

                const trigger = document.getElementById('app-changelog-trigger');
                const triggerLabel = document.getElementById('app-changelog-trigger-label');
                if (trigger && triggerLabel) {
                    trigger.classList.remove('hidden');
                    triggerLabel.innerText = `Xem thay đổi v${appManifestInfo.version || '?'}`;
                }

                const changelogRes = await fetch('./changelog.json', { cache: 'no-store' });
                if (changelogRes.ok) {
                    const changelogData = await changelogRes.json();
                    appChangelogEntries = Array.isArray(changelogData?.entries) ? changelogData.entries : [];
                } else {
                    appChangelogEntries = [];
                }

                const savedVersion = localStorage.getItem(APP_VERSION_STORAGE_KEY);
                if (appManifestInfo?.version && savedVersion !== appManifestInfo.version) {
                    localStorage.setItem(APP_VERSION_STORAGE_KEY, appManifestInfo.version);
                    showNotification(`Đã cập nhật ứng dụng lên phiên bản ${appManifestInfo.version}.`, {
                        label: 'Xem thay đổi',
                        callback: openChangelogModal
                    });
                }
            } catch (err) {
                console.error('Không thể tải changelog ứng dụng:', err);
            }
        }

        function renderCreateQuickResults(sizeList) {
            const grid = document.getElementById('create-db-size-grid');
            if (!grid) return;
            grid.innerHTML = '';

            sizeList.forEach(sizeText => {
                const typesObj = (createQuickLookupMap && createQuickLookupMap[sizeText]) ? createQuickLookupMap[sizeText] : {};
                const cell = document.createElement('div');
                cell.className = 'p-3 bg-white border border-slate-200 rounded-xl';

                const sizeEl = document.createElement('div');
                sizeEl.className = 'text-xs font-black text-slate-800 mb-2';
                sizeEl.innerText = sizeText;
                cell.appendChild(sizeEl);

                const btnWrap = document.createElement('div');
                btnWrap.className = 'flex flex-wrap gap-1';

                Object.keys(typesObj).sort().forEach(t => {
                    const btn = document.createElement('button');
                    btn.className = 'px-2 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-black hover:bg-indigo-600 transition-all';
                    btn.innerText = t;
                    btn.onclick = () => insertFromCreateQuick(sizeText, t);
                    btnWrap.appendChild(btn);
                });

                if (btnWrap.childNodes.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'text-[10px] font-bold text-slate-400';
                    empty.innerText = 'Không có mã';
                    cell.appendChild(empty);
                } else {
                    cell.appendChild(btnWrap);
                }

                grid.appendChild(cell);
            });
        }

        function insertFromCreateQuick(sizeText, typeText) {
            if (!createQuickLookupMap || !createQuickLookupMap[sizeText] || !createQuickLookupMap[sizeText][typeText]) return;
            const code = createQuickLookupMap[sizeText][typeText];

            let qty = (document.getElementById('create-db-qty')?.value || '').trim();
            const line = (document.getElementById('create-db-line')?.value || '').trim();
            if (!qty && line) qty = '1';

            let out = code;
            if (qty) out += `\t${qty}`;
            if (line) out += `\t${line}`;

            appendToSimpleInput(out);
            navigator.clipboard.writeText(code);
            showNotification(`✓ Đã chèn ${sizeText} (${typeText}) và copy mã.`);
        }

        async function createQuickDbLookup() {
            const status = document.getElementById('create-db-status');
            const grid = document.getElementById('create-db-size-grid');
            if (grid) grid.innerHTML = '';
            if (status) status.innerText = '';

            const ok = await ensureDbReady();
            if (!ok) {
                if (status) status.innerText = 'Không thể tải Database.';
                return;
            }

            const itemVal = (document.getElementById('create-db-item')?.value || '').trim().toUpperCase();
            const colorVal = (document.getElementById('create-db-color')?.value || '').trim();
            const selectedTypes = getCreateSelectedTypes();
            if (!itemVal || !colorVal) {
                alert("Vui lòng nhập Mã Item và Màu (Color).");
                return;
            }
            if (selectedTypes.length === 0) {
                alert("Vui lòng chọn ít nhất một loại tem.");
                return;
            }

            const safeTableName = `"${String(tableName).replace(/"/g, '""')}"`;
            const typeWhere = [];
            const typeParams = [];
            selectedTypes.forEach(t => {
                if (t === "ACN") {
                    typeWhere.push(`"BARCODE TYPE" LIKE ?`);
                    typeParams.push("ACN%");
                } else {
                    typeWhere.push(`"BARCODE TYPE" = ?`);
                    typeParams.push(t);
                }
            });

            const query = `SELECT * FROM ${safeTableName} WHERE "ITEM NO." = ? AND "COLOR" = ? AND (${typeWhere.join(' OR ')})`;
            const params = [itemVal, colorVal, ...typeParams];

            try {
                const stmt = db.prepare(query);
                stmt.bind(params);

                const rows = [];
                while (stmt.step()) {
                    rows.push(normalizeDbRow(stmt.getAsObject()));
                }
                stmt.free();

                if (rows.length === 0) {
                    if (status) status.innerText = 'Không tìm thấy dữ liệu.';
                    createQuickLookupMap = null;
                    return;
                }

                createQuickLookupMap = {};
                const sizeSet = new Set();
                rows.forEach(r => {
                    const sizeKey = (r.size1 && r.size1 !== "null" ? r.size1.trim() : "") || (r.size2 && r.size2 !== "null" ? r.size2.trim() : "");
                    if (!sizeKey) return;
                    const typeKey = normalizeBarcodeTypeForUi(r.bar_type);
                    if (!typeKey) return;
                    if (!r.barcode || r.barcode === "null") return;

                    sizeSet.add(sizeKey);
                    if (!createQuickLookupMap[sizeKey]) createQuickLookupMap[sizeKey] = {};
                    createQuickLookupMap[sizeKey][typeKey] = r.barcode;
                });

                const sizes = Array.from(sizeSet).sort((a, b) => parseSizeToNumeric(a) - parseSizeToNumeric(b));
                if (status) status.innerText = `Tìm thấy ${sizes.length} size. Bấm vào loại tem để chèn.`;
                renderCreateQuickResults(sizes);
            } catch (err) {
                alert("Lỗi truy vấn: " + err.message);
            }
        }

        function dbLookup() {
            if (!db) return;
            
            const barcodeVal = document.getElementById('db-search-barcode').value.trim();
            const itemVal = document.getElementById('db-search-item').value.trim().toUpperCase();
            const colorVal = document.getElementById('db-search-color').value.trim();
            const selectedTypes = getSelectedDbTypes();
            
            let query = "";
            let params = [];
            const safeTableName = `"${String(tableName).replace(/"/g, '""')}"`;
            
            // Lay tat ca ban ghi thoa man dieu kien (khong dung GROUP BY)
            if (barcodeVal) {
                query = `SELECT * FROM ${safeTableName} WHERE "BARCODE" = ?`;
                params = [barcodeVal];
            } else if (itemVal && colorVal) {
                if (selectedTypes.length === 0) {
                    alert("Vui lòng chọn ít nhất một loại tem.");
                    return;
                }

                const typeWhere = [];
                const typeParams = [];
                selectedTypes.forEach(t => {
                    if (t === "ACN") {
                        typeWhere.push(`"BARCODE TYPE" LIKE ?`);
                        typeParams.push("ACN%");
                    } else {
                        typeWhere.push(`"BARCODE TYPE" = ?`);
                        typeParams.push(t);
                    }
                });

                query = `SELECT * FROM ${safeTableName} WHERE "ITEM NO." = ? AND "COLOR" = ? AND (${typeWhere.join(' OR ')})`;
                params = [itemVal, colorVal, ...typeParams];
            } else {
                alert("Vui long nhap Barcode HOAC Ma Item + Mau sac.");
                return;
            }
            
            try {
                const stmt = db.prepare(query);
                stmt.bind(params);
                
                // Buoc 1: Lay tat ca ban ghi thô
                const rawResults = [];
                while (stmt.step()) {
                    rawResults.push(normalizeDbRow(stmt.getAsObject()));
                }
                stmt.free();
                
                if (rawResults.length === 0) {
                    alert("Khong tim thay du lieu phu hop trong bang " + tableName);
                    document.getElementById('db-size-selection').classList.add('hidden');
                    return;
                }
                
                const normalizeType = (t) => {
                    const v = (t || "").toString().trim();
                    if (v.toUpperCase().startsWith("ACN")) return "ACN";
                    if (v.toUpperCase().startsWith("AKR")) return "AKR";
                    return v.toUpperCase();
                };

                const typeSizeMap = new Map();
                const allSizesSet = new Set();

                rawResults.forEach(row => {
                    const t = normalizeType(row.bar_type);
                    const sizeKey = (row.size1 && row.size1 !== "null" ? row.size1.trim() : "") || (row.size2 && row.size2 !== "null" ? row.size2.trim() : "");
                    if (!sizeKey) return;
                    if (!row.barcode || row.barcode === "null") return;

                    allSizesSet.add(sizeKey);
                    if (!typeSizeMap.has(t)) typeSizeMap.set(t, new Map());
                    const m = typeSizeMap.get(t);
                    if (!m.has(sizeKey)) m.set(sizeKey, row.barcode);
                });

                const sortedSizes = Array.from(allSizesSet).sort((a, b) => parseSizeToNumeric(a) - parseSizeToNumeric(b));
                const normalizedSelectedTypes = selectedTypes.map(normalizeType);

                currentDbLookup = {
                    model: rawResults[0].model || "",
                    item: rawResults[0].item || "",
                    clr: rawResults[0].clr || "",
                    selectedTypes: normalizedSelectedTypes,
                    typeSizeMap,
                    sizes: sortedSizes
                };

                currentDbResults = rawResults;

                renderSizeGrid(sortedSizes);
                document.getElementById('db-size-selection').classList.remove('hidden');
                document.getElementById('db-size-selection').scrollIntoView({ behavior: 'smooth' });
                
            } catch (err) {
                alert("Loi truy van: " + err.message);
            }
        }
        
        // Ham ho tro: Thu thap tat ca cac size tu mot ban ghi
        function collectUniqueSizes(row) {
            const sizes = [];
            
            // Thu thap size1
            if (row.size1 && row.size1 !== "null" && row.size1.trim() !== "") {
                sizes.push(row.size1.trim());
            }
            
            // Thu thap size2
            if (row.size2 && row.size2 !== "null" && row.size2.trim() !== "") {
                const s2 = row.size2.trim();
                if (!sizes.includes(s2)) {
                    sizes.push(s2);
                }
            }
            
            return sizes;
        }

        function normalizeDbRow(row) {
            const toCleanString = (v) => (v === null || v === undefined) ? "" : String(v).trim();

            const item = toCleanString(row["ITEM NO."] ?? row["ITEM NO"] ?? row.item);
            const clr = toCleanString(row["COLOR"] ?? row.clr);
            const size1 = toCleanString(row["SIZE"] ?? row.size1);
            const size2 = toCleanString(row["SIZE2"] ?? row.size2);
            const bar_type = toCleanString(row["BARCODE TYPE"] ?? row.bar_type);
            const barcode = toCleanString(row["BARCODE"] ?? row.barcode);
            const model = toCleanString(row.model ?? row["MODEL"]);

            return {
                ...row,
                item: item.toUpperCase(),
                clr,
                size1,
                size2,
                bar_type,
                barcode,
                model
            };
        }

        // Ham ho tro: Chuyen doi size chu thanh gia tri so de sap xep (4H = 4.5)
        function parseSizeToNumeric(sizeStr) {
            if (!sizeStr) return 0;
            let val = parseFloat(sizeStr) || 0;
            if (sizeStr.toUpperCase().endsWith('H')) {
                val += 0.5;
            }
            return val;
        }

        // Hàm helper để lấy size hiển thị
        function getDisplaySize(row) {
            // Neu co displaySize (tu du lieu gop), su dung no
            if (row.displaySize) {
                return row.displaySize;
            }
            
            // Kiem tra uniqueSizes (da duoc xu ly)
            if (row.uniqueSizes && row.uniqueSizes.length > 0) {
                return row.uniqueSizes.join(', ');
            }
            
            // Kiem tra allSizes (chua duoc loc)
            if (row.allSizes && row.allSizes.length > 0) {
                return [...new Set(row.allSizes)].join(', ');
            }
            
            // Mac dinh: Thu tu uu tien size2 > size1
            if (row.bar_type === "JAN") {
                if (row.size2 && row.size2.trim() !== "" && row.size2 !== "null") {
                    return row.size2;
                }
                return row.size1 || "";
            }
            
            // Mac dinh cho UPC va cac loai khac
            let sizeText = row.size1 || "";
            if (row.size2 && row.size2.trim() !== "" && row.size2 !== "null") {
                sizeText += ` (${row.size2})`;
            }
            return sizeText;
        }

        function renderSizeGrid(sizes) {
            const grid = document.getElementById('db-size-grid');
            grid.innerHTML = '';
            document.getElementById('db-select-all-sizes').checked = false;
            
            sizes.forEach((sizeText) => {
                const label = document.createElement('label');
                label.className = 'flex flex-col items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-all';
                
                label.innerHTML = `
                    <input type="checkbox" class="db-size-checkbox w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" value="${sizeText}">
                    <span class="text-xs font-bold text-slate-700">${sizeText}</span>
                `;
                grid.appendChild(label);
            });
        }

        function clampPrintLayoutState() {
            printLayoutState.columns = Math.min(4, Math.max(1, Number(printLayoutState.columns) || 3));
            printLayoutState.orientation = printLayoutState.orientation === 'landscape' ? 'landscape' : 'portrait';
            printLayoutState.margin = Math.min(12, Math.max(3, Number(printLayoutState.margin) || 6));
            printLayoutState.columnGap = Math.min(8, Math.max(1, Number(printLayoutState.columnGap) || 3));
            printLayoutState.itemHeight = Math.min(24, Math.max(9, Number(printLayoutState.itemHeight) || 14));
            printLayoutState.barcodeHeight = Math.min(14, Math.max(4, Number(printLayoutState.barcodeHeight) || 7));
            printLayoutState.itemGap = Math.min(5, Math.max(0, Number(printLayoutState.itemGap) || 0));
        }

        function updatePrintLayoutControls() {
            const setValue = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.value = String(value);
            };
            const setText = (id, value) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (el.tagName === 'OUTPUT') el.textContent = String(value);
                else el.value = String(value);
            };

            setValue('print-columns', printLayoutState.columns);
            setValue('print-orientation', printLayoutState.orientation);
            setValue('print-margin', printLayoutState.margin);
            setValue('print-column-gap', printLayoutState.columnGap);
            setValue('print-item-height', printLayoutState.itemHeight);
            setValue('print-barcode-height', printLayoutState.barcodeHeight);
            setValue('print-item-gap', printLayoutState.itemGap);

            setText('print-margin-value', printLayoutState.margin);
            setText('print-column-gap-value', printLayoutState.columnGap);
            setText('print-item-height-value', printLayoutState.itemHeight);
            setText('print-barcode-height-value', printLayoutState.barcodeHeight);
            setText('print-item-gap-value', printLayoutState.itemGap);
        }

        function applyPrintLayout() {
            clampPrintLayoutState();

            const root = document.documentElement;
            root.style.setProperty('--db-cols', String(printLayoutState.columns));
            root.style.setProperty('--db-col-gap', `${printLayoutState.columnGap}mm`);
            root.style.setProperty('--db-item-height', `${printLayoutState.itemHeight}mm`);
            root.style.setProperty('--db-barcode-height', `${printLayoutState.barcodeHeight}mm`);
            root.style.setProperty('--db-item-gap', `${printLayoutState.itemGap}mm`);
            root.style.setProperty('--db-size-font', printLayoutState.itemHeight <= 12 ? '8px' : '10px');

            const grid = document.querySelector('#result-area .db-type-columns');
            if (grid) {
                grid.style.setProperty('--db-cols', String(printLayoutState.columns));
                grid.style.setProperty('--db-col-gap', `${printLayoutState.columnGap}mm`);
            }

            let pageStyle = document.getElementById('dynamic-print-page-style');
            if (!pageStyle) {
                pageStyle = document.createElement('style');
                pageStyle.id = 'dynamic-print-page-style';
                document.head.appendChild(pageStyle);
            }
            pageStyle.textContent = `@media print { @page { size: A4 ${printLayoutState.orientation}; margin: ${printLayoutState.margin}mm; } }`;

            updatePrintLayoutControls();

            const summary = document.getElementById('print-layout-summary');
            if (summary) {
                summary.textContent = `${printLayoutState.columns} cột · khổ ${printLayoutState.orientation === 'landscape' ? 'ngang' : 'dọc'} · block ${printLayoutState.itemHeight} mm`;
            }

            const hint = document.getElementById('print-layout-hint');
            if (hint) {
                const maxItems = Array.from(document.querySelectorAll('#result-area .db-type-col'))
                    .reduce((max, col) => Math.max(max, col.querySelectorAll('.db-type-item').length), 0);
                hint.textContent = maxItems >= 18
                    ? 'Đang có nhiều item trên một cột. Khuyến nghị 4 cột, khổ dọc, block 9–12 mm để đủ chiều cao; hãy kiểm tra bản xem trước trước khi in thật.'
                    : 'Có thể đổi số cột và kích thước block trước khi bấm In. Barcode vẫn giữ khoảng trắng cần thiết để máy quét nhận diện ổn định.';
            }

            try {
                localStorage.setItem(PRINT_LAYOUT_STORAGE_KEY, JSON.stringify(printLayoutState));
            } catch (e) {
                // Không bắt buộc phải lưu cấu hình nếu trình duyệt chặn localStorage.
            }
        }

        function updatePrintLayoutFromControls(markAsEdited = false) {
            const readNumber = (id, fallback) => {
                const value = Number(document.getElementById(id)?.value);
                return Number.isFinite(value) ? value : fallback;
            };

            printLayoutState.columns = readNumber('print-columns', printLayoutState.columns);
            printLayoutState.orientation = document.getElementById('print-orientation')?.value || printLayoutState.orientation;
            printLayoutState.margin = readNumber('print-margin', printLayoutState.margin);
            printLayoutState.columnGap = readNumber('print-column-gap', printLayoutState.columnGap);
            printLayoutState.itemHeight = readNumber('print-item-height', printLayoutState.itemHeight);
            printLayoutState.barcodeHeight = readNumber('print-barcode-height', printLayoutState.barcodeHeight);
            printLayoutState.itemGap = readNumber('print-item-gap', printLayoutState.itemGap);
            if (markAsEdited) printLayoutUserEdited = true;
            applyPrintLayout();
        }

        function autoOptimizePrintLayout(typeCount = null, maxItems = null) {
            const columnsInResult = document.querySelectorAll('#result-area .db-type-col').length;
            const itemCountInResult = Array.from(document.querySelectorAll('#result-area .db-type-col'))
                .reduce((max, col) => Math.max(max, col.querySelectorAll('.db-type-item').length), 0);
            const typeTotal = Number(typeCount) || columnsInResult || 3;
            const itemTotal = Number(maxItems) || itemCountInResult || 1;

            printLayoutState.columns = Math.min(4, Math.max(1, typeTotal));
            // A4 ngang rộng hơn nhưng thấp hơn; nhiều item cần ưu tiên chiều cao của khổ dọc.
            printLayoutState.orientation = printLayoutState.columns >= 4 && itemTotal <= 10 ? 'landscape' : 'portrait';
            printLayoutState.margin = 6;
            printLayoutState.columnGap = printLayoutState.columns >= 4 ? 2.5 : 3;

            if (itemTotal >= 18) {
                printLayoutState.itemHeight = 11;
                printLayoutState.barcodeHeight = 6;
                printLayoutState.itemGap = 0.5;
            } else if (itemTotal >= 14) {
                printLayoutState.itemHeight = 13;
                printLayoutState.barcodeHeight = 7;
                printLayoutState.itemGap = 1;
            } else if (itemTotal >= 10) {
                printLayoutState.itemHeight = 16;
                printLayoutState.barcodeHeight = 8;
                printLayoutState.itemGap = 1.5;
            } else {
                printLayoutState.itemHeight = 20;
                printLayoutState.barcodeHeight = 10;
                printLayoutState.itemGap = 2;
            }

            printLayoutUserEdited = false;
            printLayoutInitialized = true;
            applyPrintLayout();
        }

        function toggleDbSelectAll(mainCheckbox) {
            const checkboxes = document.querySelectorAll('.db-size-checkbox');
            checkboxes.forEach(cb => cb.checked = mainCheckbox.checked);
        }

        function generateDbBarcodes() {
            if (!currentDbLookup) return;

            const selectedSizes = Array.from(document.querySelectorAll('.db-size-checkbox:checked')).map(cb => cb.value);
            const selectedTypes = getSelectedDbTypes().map(t => (t || "").toString().toUpperCase());
            
            if (selectedSizes.length === 0) {
                alert("Vui lòng chọn ít nhất một size.");
                return;
            }
            if (selectedTypes.length === 0) {
                alert("Vui lòng chọn ít nhất một loại tem.");
                return;
            }
            
            const container = document.getElementById('result-area');
            container.innerHTML = '';
            container.classList.remove('simple-preview');
            container.classList.add('db-print-preview');
            
            const baseData = currentDbLookup;
            const printHeader = document.createElement('div');
            printHeader.className = 'db-print-header no-screen';
            const headerParts = [];
            if (baseData.model) headerParts.push(baseData.model);
            headerParts.push(`ITEM: ${baseData.item}`);
            headerParts.push(`CLR: ${baseData.clr}`);
            printHeader.innerHTML = headerParts.join(' | ');
            container.appendChild(printHeader);

            const normalizeType = (t) => {
                const v = (t || "").toString().trim();
                if (v.toUpperCase().startsWith("ACN")) return "ACN";
                if (v.toUpperCase().startsWith("AKR")) return "AKR";
                return v.toUpperCase();
            };

            // Chỉ giữ lại loại tem có ít nhất 1 size khớp trong dữ liệu DB
            const typeCols = [];
            selectedTypes.forEach(type => {
                const normalizedType = normalizeType(type);
                const sizeMap = currentDbLookup.typeSizeMap.get(normalizedType);
                if (!sizeMap) return;
                // Kiểm tra xem loại tem này có size nào trong selectedSizes không
                const hasMatchingSize = selectedSizes.some(sz => sizeMap.has(sz));
                if (hasMatchingSize) {
                    typeCols.push(normalizedType);
                }
            });
            const printGrid = document.createElement('div');
            printGrid.className = 'db-type-columns animate-fade-in';
            printGrid.style.setProperty('--db-cols', String(Math.min(4, Math.max(1, typeCols.length))));

            const maxItemsPerColumn = typeCols.reduce((max, typeLabel) => {
                const sizeMap = currentDbLookup.typeSizeMap.get(typeLabel) || new Map();
                const itemCount = selectedSizes.reduce((count, sz) => count + (sizeMap.has(sz) ? 1 : 0), 0);
                return Math.max(max, itemCount);
            }, 0);

            typeCols.forEach(typeLabel => {
                const col = document.createElement('div');
                col.className = 'db-type-col';

                const colTitle = document.createElement('div');
                colTitle.className = 'db-type-col-title';
                colTitle.innerText = typeLabel;
                col.appendChild(colTitle);

                const sizeMap = currentDbLookup.typeSizeMap.get(typeLabel) || new Map();

                selectedSizes.forEach(sz => {
                    const code = sizeMap.get(sz);
                    if (!code) return;

                    const row = document.createElement('div');
                    row.className = 'db-type-item';

                    const sizeEl = document.createElement('div');
                    sizeEl.className = 'db-type-size';
                    sizeEl.innerText = sz;
                    row.appendChild(sizeEl);

                    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    try {
                        JsBarcode(svg, code, {
                            ...getDbColumnBarcodeOptions(),
                            format: "CODE128"
                        });
                        row.appendChild(svg);
                    } catch (e) {
                        const err = document.createElement('div');
                        err.className = 'db-type-error';
                        err.innerText = code;
                        row.appendChild(err);
                    }

                    col.appendChild(row);
                });

                printGrid.appendChild(col);
            });

            container.appendChild(printGrid);

            if (!printLayoutInitialized) {
                autoOptimizePrintLayout(typeCols.length, maxItemsPerColumn);
            } else {
                applyPrintLayout();
            }

            const selActions = document.getElementById('selection-actions');
            if (selActions) {
                selActions.classList.remove('hidden');
                selActions.classList.add('flex');
            }
            setSelectionActionsDbMode(true);
            
            setTimeout(() => {
                container.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }

        function getSelectedDbTypes() {
            return Array.from(document.querySelectorAll('.db-type-checkbox:checked')).map(cb => cb.value);
        }

        function toggleDbSelectAllTypes(mainCheckbox) {
            const checkboxes = document.querySelectorAll('.db-type-checkbox');
            checkboxes.forEach(cb => cb.checked = mainCheckbox.checked);
        }

        function syncDbSelectAllTypes() {
            const main = document.getElementById('db-select-all-types');
            const checkboxes = Array.from(document.querySelectorAll('.db-type-checkbox'));
            if (!main || checkboxes.length === 0) return;
            main.checked = checkboxes.every(cb => cb.checked);
        }

        function setSelectionActionsDbMode(isDbMode) {
            const top = document.getElementById('selection-top-controls');
            const lineFilters = document.getElementById('line-filters-wrapper');
            const printLayoutPanel = document.getElementById('print-layout-panel');
            if (isDbMode) {
                if (top) top.classList.add('hidden');
                if (lineFilters) lineFilters.classList.add('hidden');
                if (printLayoutPanel) printLayoutPanel.classList.remove('hidden');
                applyPrintLayout();
                return;
            }
            if (top) top.classList.remove('hidden');
            if (printLayoutPanel) printLayoutPanel.classList.add('hidden');
        }

        function getDbColumnBarcodeOptions() {
            return {
                lineColor: "#000",
                width: 1.7,
                height: 26,
                displayValue: false,
                margin: 0,
                textMargin: 0
            };
        }


