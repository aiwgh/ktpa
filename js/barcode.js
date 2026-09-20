// Barcode generation, scan mode, selection actions and bootstrap
// --- GLOBAL SCAN MODE STATE ---

        function showNotification(message, action = null) {
            const existing = document.getElementById('toast-notification');
            if (existing) existing.remove();

            const notification = document.createElement('div');
            notification.id = 'toast-notification';
            notification.className = 'fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-[1.5rem] shadow-2xl z-[200] animate-fade-in flex items-center gap-4 border border-white/10 backdrop-blur-xl min-w-[300px] justify-center';

            const msgSpan = document.createElement('span');
            msgSpan.className = 'font-bold text-sm';
            msgSpan.innerHTML = message;
            notification.appendChild(msgSpan);

            if (action) {
                const actionBtn = document.createElement('button');
                actionBtn.className = 'bg-indigo-500 text-white text-[10px] px-3 py-1.5 rounded-xl hover:bg-indigo-400 font-black uppercase tracking-wider transition-colors';
                actionBtn.innerText = action.label;
                actionBtn.onclick = () => {
                    action.callback();
                    notification.remove();
                };
                notification.appendChild(actionBtn);
            }

            document.body.appendChild(notification);

            setTimeout(() => {
                if (notification && document.body.contains(notification)) {
                    notification.classList.add('opacity-0', 'translate-y-4');
                    notification.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
                    setTimeout(() => {
                        if (notification && document.body.contains(notification)) {
                            notification.remove();
                        }
                    }, 500);
                }
            }, 3500);
        }

        function clearResults() {
            const resultArea = document.getElementById('result-area');
            resultArea.classList.remove('db-print-preview', 'simple-preview');
            resultArea.innerHTML = `
                <div id="placeholder" class="flex flex-col items-center justify-center py-20 no-print">
                    <div class="w-20 h-20 rounded-[2rem] bg-slate-100 flex items-center justify-center text-3xl mb-4 grayscale opacity-50">📦</div>
                    <p class="text-slate-400 font-bold text-sm tracking-widest uppercase">Chưa có barcode nào được tạo</p>
                </div>
            `;
            
            const selActions = document.getElementById('selection-actions');
            if (selActions) {
                selActions.classList.add('hidden');
                selActions.classList.remove('flex');
            }
            setSelectionActionsDbMode(false);

            window.scrollTo({ top: 0, behavior: 'smooth' });
            showNotification("Đã xóa sạch dữ liệu.");
        }

        function getBarcodeOptions() {
            return {
                format: "CODE128",
                lineColor: "#000",
                width: 2.2, /* Tăng độ rộng vạch để lấp đầy ngang Card */
                height: 55,  /* Tăng nhẹ chiều cao vạch */
                displayValue: true,
                fontSize: 14,
                margin: 0,   /* Loại bỏ lề mặc định của thư viện để giãn tối đa */
                textMargin: 2
            };
        }

        function generateSimple() {
            const container = document.getElementById('result-area');
            container.innerHTML = '';
            container.classList.remove('db-print-preview');
            container.classList.add('simple-preview');

            let codes = [];
            let params = {};
            const input = document.getElementById('simpleInput').value;

            if (!input.trim()) {
                alert("Bạn chưa nhập mã nào cả!");
                return;
            }

            params.inputText = input;
            const lines = input.split('\n');
            lines.forEach(line => {
                let text = line.trim();
                if (!text) return;

                let codeVal = text;
                let quantity = null;
                let lineName = null;

                if (text.includes('\t')) {
                    const parts = text.split('\t');
                    codeVal = parts[0].trim();
                    if (parts.length > 1) quantity = parts[1].trim();
                    if (parts.length > 2) lineName = parts[2].trim();
                } else if (text.includes(' ') && text.split(/\s+/).length >= 3) {
                    const parts = text.split(/\s+/);
                    codeVal = parts[0].trim();
                    quantity = parts[1].trim();
                    lineName = parts.slice(2).join(' ').trim();
                } else if (text.includes(' ')) {
                    const parts = text.split(/\s+/);
                    codeVal = parts[0].trim();
                    quantity = parts[1].trim();
                }

                codes.push({ code: codeVal, quantity, lineName });
            });

            if (codes.length === 0) {
                alert("Không có mã nào để tạo!");
                return;
            }

            lastGenerationType = 'simple';
            lastGenerationParams = params;

            const grid = document.createElement('div');
            grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in';

            codes.forEach(item => {
                const card = document.createElement('div');
                card.className = 'barcode-card group relative cursor-pointer hover:border-indigo-400 border border-slate-100 transition-all p-4 md:p-6 min-h-[140px] md:min-h-[180px] flex items-center justify-center flex-col bg-white overflow-hidden';
                
                card.dataset.code = item.code;
                card.dataset.lineName = item.lineName || "";
                let plainTextParts = [];
                let htmlInfoParts = [];

                if (item.lineName) {
                    plainTextParts.push(`Line: ${item.lineName}`);
                    htmlInfoParts.push(`<span class="text-indigo-600 font-black">${item.lineName}</span>`);
                }
                if (item.quantity) {
                    plainTextParts.push(`SL: ${item.quantity}`);
                    htmlInfoParts.push(`<span class="text-slate-400 font-medium mx-1.5 md:mx-2">|</span><span class="text-rose-500 font-black">SL: ${item.quantity}</span>`);
                }
                
                card.dataset.info = plainTextParts.join(' - ');

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'absolute top-3 md:top-5 left-3 md:left-5 w-5 md:w-6 h-5 md:h-6 cursor-pointer barcode-checkbox rounded-lg md:rounded-xl border-slate-200 text-indigo-600 focus:ring-indigo-500 transition-all z-10';
                
                card.onclick = (e) => {
                    if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) {
                        card.classList.add('border-indigo-500', 'bg-indigo-50/30', 'ring-4', 'ring-indigo-500/5');
                    } else {
                        card.classList.remove('border-indigo-500', 'bg-indigo-50/30', 'ring-4', 'ring-indigo-500/5');
                    }
                    updateSelectSelectedUI();
                };
                checkbox.onclick = (e) => {
                    e.stopPropagation();
                    if (checkbox.checked) {
                        card.classList.add('border-indigo-500', 'bg-indigo-50/30', 'ring-4', 'ring-indigo-500/5');
                    } else {
                        card.classList.remove('border-indigo-500', 'bg-indigo-50/30', 'ring-4', 'ring-indigo-500/5');
                    }
                    updateSelectSelectedUI();
                };

                card.appendChild(checkbox);

                if (htmlInfoParts.length > 0) {
                    const info = document.createElement('div');
                    info.className = 'text-xs md:text-base font-bold text-slate-700 mb-4 md:mb-6 mt-2 md:mt-4 text-center w-full px-3 md:px-4 py-1.5 md:py-2 bg-slate-50 rounded-xl md:rounded-2xl border border-slate-100 group-hover:bg-white group-hover:border-indigo-100 transition-colors';
                    info.innerHTML = htmlInfoParts.join('');
                    card.appendChild(info);
                }

                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.className = "transition-transform group-hover:scale-105 duration-500";
                try {
                    JsBarcode(svg, item.code, getBarcodeOptions());
                    card.appendChild(svg);
                } catch (e) {
                    const err = document.createElement('div');
                    err.className = "text-[10px] md:text-xs";
                    err.innerHTML = `<span class="text-rose-500 font-black">Lỗi mã:</span> ${item.code}`;
                    card.appendChild(err);
                }
                grid.appendChild(card);
            });

            container.appendChild(grid);
            
            const selActions = document.getElementById('selection-actions');
            if (selActions) {
                selActions.classList.remove('hidden');
                selActions.classList.add('flex');
                document.getElementById('selectAllCheckbox').checked = false;
                
                const uniqueLines = [...new Set(codes.map(c => c.lineName).filter(Boolean))].sort();
                const filtersContainer = document.getElementById('line-filters-container');
                filtersContainer.innerHTML = '';
                
                if (uniqueLines.length > 0) {
                    uniqueLines.forEach(line => {
                        const wrapper = document.createElement('label');
                        wrapper.className = 'inline-flex items-center gap-2 bg-white px-4 py-2 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all shadow-sm active:scale-95';
                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.className = 'rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500 line-select-cb';
                        cb.value = line;
                        cb.onchange = (e) => {
                            const isChecked = e.target.checked;
                            const lineCards = document.querySelectorAll(`.barcode-card[data-line-name="${line}"]`);
                            lineCards.forEach(c => {
                                const cardCb = c.querySelector('.barcode-checkbox');
                                cardCb.checked = isChecked;
                                if (isChecked) {
                                    c.classList.add('border-indigo-500', 'bg-indigo-50/30', 'ring-4', 'ring-indigo-500/5');
                                } else {
                                    c.classList.remove('border-indigo-500', 'bg-indigo-50/30', 'ring-4', 'ring-indigo-500/5');
                                }
                            });
                            updateSelectSelectedUI(false); 
                        };
                        wrapper.appendChild(cb);
                        wrapper.appendChild(document.createTextNode(line));
                        filtersContainer.appendChild(wrapper);
                    });
                    document.getElementById('line-filters-wrapper').classList.remove('hidden');
                } else {
                    document.getElementById('line-filters-wrapper').classList.add('hidden');
                }
                updateSelectSelectedUI();
            }

            setTimeout(() => {
                container.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }

        function activateScanMode() {
            const resultArea = document.getElementById('result-area');
            const simpleBarcodes = resultArea.querySelectorAll('.barcode-card');

            if (simpleBarcodes.length === 0) {
                alert("Vui lòng tạo barcode trước khi vào chế độ Scan!");
                return;
            }

            scanItems = [];
            scannedItems = new Set();

            simpleBarcodes.forEach((card, index) => {
                const svg = card.querySelector('svg');
                // Use a more generic selector for the info div
                const infoDiv = card.querySelector('.font-bold.text-slate-700'); 
                const infoHtml = infoDiv ? infoDiv.innerHTML : '';
                if (svg) {
                    const value = svg.getAttribute('jsbarcode-value') || svg.textContent;
                    scanItems.push({ index, value, infoHtml });
                }
            });

            if (scanItems.length === 0) {
                alert("Không tìm thấy barcode hợp lệ!");
                return;
            }

            scanModeActive = true;
            scanCurrentIndex = 0;
            document.body.style.overflow = 'hidden';
            document.getElementById('scan-mode-container').classList.remove('hidden');

            renderScanItem();
            updateScanProgress();
        }

        function renderScanItem() {
            if (scanItems.length === 0) return;

            const display = document.getElementById('scan-current-display');
            const currentItem = scanItems[scanCurrentIndex];
            const isScanned = scannedItems.has(scanCurrentIndex);

            display.innerHTML = `
                <div class="w-full flex flex-col items-center relative z-10 animate-fade-in">
                    <div class="mb-4 md:mb-8">
                        <span class="inline-flex items-center gap-2 px-4 md:px-6 py-1.5 md:py-2 rounded-full font-black text-[10px] md:text-xs uppercase tracking-[0.15em] md:tracking-[0.2em] ${isScanned ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}">
                            <span class="w-1.5 md:w-2 h-1.5 md:h-2 rounded-full ${isScanned ? 'bg-emerald-500 animate-pulse' : 'bg-indigo-500'}"></span>
                            ${isScanned ? 'Đã xác nhận' : 'Đang chờ quét'}
                        </span>
                    </div>
                    ${currentItem.infoHtml ? `
                        <div class="mb-4 md:mb-10 text-center px-2">
                            <div class="text-xl md:text-3xl font-black text-slate-800 mb-1 leading-tight flex flex-wrap justify-center items-center gap-1 md:gap-2">
                                ${currentItem.infoHtml}
                            </div>
                            <div class="h-1 w-8 md:w-12 bg-indigo-500 mx-auto rounded-full opacity-20 mt-2 md:mt-3"></div>
                        </div>
                    ` : ''}
                    <div class="p-4 md:p-8 bg-white rounded-2xl md:rounded-[2rem] shadow-sm border border-slate-100">
                        <svg id="scan-simple-svg" class="max-w-full h-auto"></svg>
                    </div>
                    <div class="mt-6 md:mt-8 text-slate-400 font-mono text-[10px] md:text-sm font-bold tracking-widest">
                        VAL: ${currentItem.value}
                    </div>
                </div>
            `;

            try {
                JsBarcode("#scan-simple-svg", currentItem.value, {
                    ...getBarcodeOptions(),
                    width: 3,
                    height: 120,
                    fontSize: 24
                });
            } catch (e) { console.error(e); }

            document.getElementById('scan-prev-btn').disabled = scanCurrentIndex === 0;
            document.getElementById('scan-next-btn').disabled = scanCurrentIndex === scanItems.length - 1;

            const markBtn = document.getElementById('scan-mark-btn');
            if (isScanned) {
                markBtn.className = 'mt-6 w-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-black py-6 px-6 rounded-[2rem] transition-all transform active:scale-95 text-xl flex items-center justify-center gap-4';
                markBtn.innerHTML = '<div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">✕</div> HỦY XÁC NHẬN';
            } else {
                markBtn.className = 'mt-6 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-6 px-6 rounded-[2rem] shadow-2xl shadow-indigo-500/20 transition-all transform active:scale-95 text-xl flex items-center justify-center gap-4';
                markBtn.innerHTML = '<div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">✓</div> XÁC NHẬN ĐÃ QUÉT';
            }
        }

        function updateScanProgress() {
            const scannedCount = scannedItems.size;
            const totalCount = scanItems.length;
            const percentage = totalCount > 0 ? (scannedCount / totalCount) * 100 : 0;
            document.getElementById('scan-progress-text').innerText = `${scannedCount}/${totalCount}`;
            document.getElementById('scan-progress-bar').style.width = `${percentage}%`;
        }

        function scanPrevious() {
            if (scanCurrentIndex > 0) {
                scanCurrentIndex--;
                renderScanItem();
            }
        }

        function scanNext() {
            if (scanCurrentIndex < scanItems.length - 1) {
                scanCurrentIndex++;
                renderScanItem();
            }
        }

        function markAsScanned() {
            const isScanned = scannedItems.has(scanCurrentIndex);
            if (isScanned) {
                scannedItems.delete(scanCurrentIndex);
                showNotification("Đã hủy xác nhận mã này.");
            } else {
                scannedItems.add(scanCurrentIndex);
                if (scanCurrentIndex < scanItems.length - 1) {
                    setTimeout(() => scanNext(), 300);
                } else {
                    showNotification("🎉 Đã hoàn thành quét toàn bộ danh sách!");
                }
            }
            renderScanItem();
            updateScanProgress();
        }

        function exitScanMode() {
            scanModeActive = false;
            document.body.style.overflow = '';
            document.getElementById('scan-mode-container').classList.add('hidden');
        }

        function toggleSelectAll(mainCheckbox) {
            const isChecked = mainCheckbox.checked;
            const checkboxes = document.querySelectorAll('.barcode-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = isChecked;
                const card = cb.closest('.barcode-card');
                if (isChecked) {
                    card.classList.add('border-indigo-500', 'bg-indigo-50/30', 'ring-4', 'ring-indigo-500/5');
                } else {
                    card.classList.remove('border-indigo-500', 'bg-indigo-50/30', 'ring-4', 'ring-indigo-500/5');
                }
            });
            updateSelectSelectedUI();
        }

        function updateSelectSelectedUI(syncFilters = true) {
            const checkboxes = document.querySelectorAll('.barcode-checkbox');
            const checkedCount = document.querySelectorAll('.barcode-checkbox:checked').length;
            document.getElementById('selected-count').innerText = checkedCount;
            const selectAllCheck = document.getElementById('selectAllCheckbox');
            
            if (checkboxes.length > 0) {
                selectAllCheck.checked = (checkedCount === checkboxes.length);
            }

            if (syncFilters) {
                const lineCheckboxes = document.querySelectorAll('.line-select-cb');
                lineCheckboxes.forEach(lcb => {
                    const lineName = lcb.value;
                    const itemsInLine = document.querySelectorAll(`.barcode-card[data-line-name="${lineName}"]`);
                    if (itemsInLine.length > 0) {
                        const allChecked = Array.from(itemsInLine).every(card => card.querySelector('.barcode-checkbox').checked);
                        lcb.checked = allChecked;
                    }
                });
            }
        }

        function sortItemsByLine() {
            const grid = document.querySelector('#result-area .grid');
            if (!grid) return;
            const cards = Array.from(grid.querySelectorAll('.barcode-card'));
            if (cards.length === 0) return;
            cards.sort((a, b) => {
                const lineA = a.dataset.lineName || "ZZZZZ"; 
                const lineB = b.dataset.lineName || "ZZZZZ";
                if (lineA < lineB) return -1;
                if (lineA > lineB) return 1;
                const codeA = a.dataset.code || "";
                const codeB = b.dataset.code || "";
                return codeA.localeCompare(codeB);
            });
            cards.forEach(card => grid.appendChild(card));
            showNotification("Đã sắp xếp mã theo Line.");
        }

        async function copySelectedAsImage() {
            // Function removed as per user request
        }

        async function downloadSelectedAsFiles() {
            // Function removed as per user request
        }

        window.addEventListener('beforeunload', (e) => {
            if (document.getElementById('simpleInput').value.trim()) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        document.getElementById('changelog-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'changelog-modal') {
                closeChangelogModal();
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeChangelogModal();
            }
        });

        loadAppChangelog();
    
