(function () {
    const STORAGE_KEY = 'ktpa-ui-theme-v1';
    const MAX_BACKGROUND_BYTES = 1.5 * 1024 * 1024;

    const DEFAULT_THEME = {
        primary: '#4f46e5',
        accent: '#7c3aed',
        page: '#f8fafc',
        surface: '#ffffff',
        hero: '#0f172a',
        text: '#0f172a',
        backgroundImage: null,
        backgroundName: '',
        radius: 20,
        density: 'comfortable'
    };

    const PRESETS = {
        indigo: { ...DEFAULT_THEME },
        emerald: {
            ...DEFAULT_THEME,
            primary: '#059669',
            accent: '#0f766e',
            hero: '#064e3b'
        },
        rose: {
            ...DEFAULT_THEME,
            primary: '#e11d48',
            accent: '#c026d3',
            hero: '#4c0519'
        }
    };

    let themeState = { ...DEFAULT_THEME };

    function readSavedTheme() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (saved && typeof saved === 'object') {
                themeState = { ...themeState, ...saved };
            }
        } catch (error) {
            // Giao diện mặc định vẫn hoạt động nếu localStorage bị chặn.
        }
    }

    function saveTheme() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(themeState));
        } catch (error) {
            // Không bắt buộc phải lưu theme để ứng dụng tiếp tục hoạt động.
        }
    }

    function syncThemeControls() {
        const values = {
            'theme-primary': themeState.primary,
            'theme-accent': themeState.accent,
            'theme-page': themeState.page,
            'theme-surface': themeState.surface,
            'theme-hero': themeState.hero,
            'theme-radius': themeState.radius,
            'theme-density': themeState.density
        };

        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.value = String(value);
        });

        const radiusValue = document.getElementById('theme-radius-value');
        if (radiusValue) radiusValue.textContent = String(themeState.radius);

        const preview = document.getElementById('theme-background-preview');
        const name = document.getElementById('theme-background-name');
        if (preview) {
            preview.classList.toggle('hidden', !themeState.backgroundImage);
            preview.style.backgroundImage = themeState.backgroundImage ? `url(${themeState.backgroundImage})` : '';
        }
        if (name) {
            name.textContent = themeState.backgroundName
                ? `Đang dùng: ${themeState.backgroundName}`
                : 'Tối đa 1.5 MB. Ảnh được lưu trên thiết bị này.';
        }
    }

    function applyTheme() {
        const root = document.documentElement;
        const body = document.body;
        if (!body) return;

        root.style.setProperty('--theme-primary', themeState.primary);
        root.style.setProperty('--theme-accent', themeState.accent);
        root.style.setProperty('--theme-page', themeState.page);
        root.style.setProperty('--theme-surface', themeState.surface);
        root.style.setProperty('--theme-hero', themeState.hero);
        root.style.setProperty('--theme-text', themeState.text);
        root.style.setProperty('--theme-background-image', themeState.backgroundImage ? `url(${themeState.backgroundImage})` : 'none');
        root.style.setProperty('--theme-radius', `${themeState.radius}px`);
        root.style.setProperty('--theme-density-scale', themeState.density === 'compact' ? '0.88' : '1');
        body.classList.add('theme-enabled');
        body.dataset.themeDensity = themeState.density;
        syncThemeControls();
        saveTheme();
    }

    window.openThemeModal = function () {
        document.getElementById('theme-modal')?.classList.remove('hidden');
        syncThemeControls();
    };

    window.closeThemeModal = function () {
        document.getElementById('theme-modal')?.classList.add('hidden');
    };

    window.updateThemeFromControls = function () {
        const read = (id, fallback) => document.getElementById(id)?.value || fallback;
        themeState.primary = read('theme-primary', themeState.primary);
        themeState.accent = read('theme-accent', themeState.accent);
        themeState.page = read('theme-page', themeState.page);
        themeState.surface = read('theme-surface', themeState.surface);
        themeState.hero = read('theme-hero', themeState.hero);
        themeState.radius = Math.min(32, Math.max(8, Number(read('theme-radius', themeState.radius)) || themeState.radius));
        themeState.density = read('theme-density', themeState.density) === 'compact' ? 'compact' : 'comfortable';
        applyTheme();
    };

    window.handleThemeBackgroundUpload = function (input) {
        const file = input?.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Vui lòng chọn một file hình ảnh.');
            input.value = '';
            return;
        }
        if (file.size > MAX_BACKGROUND_BYTES) {
            alert('Ảnh nền tối đa 1.5 MB để ứng dụng hoạt động ổn định.');
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            themeState.backgroundImage = reader.result;
            themeState.backgroundName = file.name;
            applyTheme();
        };
        reader.readAsDataURL(file);
    };

    window.removeThemeBackground = function () {
        themeState.backgroundImage = null;
        themeState.backgroundName = '';
        const input = document.getElementById('theme-background-file');
        if (input) input.value = '';
        applyTheme();
    };

    window.applyThemePreset = function (name) {
        if (!PRESETS[name]) return;
        themeState = {
            ...PRESETS[name],
            backgroundImage: themeState.backgroundImage,
            backgroundName: themeState.backgroundName
        };
        applyTheme();
    };

    window.resetTheme = function () {
        themeState = { ...DEFAULT_THEME };
        applyTheme();
    };

    document.addEventListener('click', (event) => {
        const modal = document.getElementById('theme-modal');
        if (event.target === modal) window.closeThemeModal();
    });

    readSavedTheme();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyTheme, { once: true });
    } else {
        applyTheme();
    }
})();
