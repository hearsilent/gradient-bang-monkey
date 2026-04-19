// ==UserScript==
// @name         Gradient Bang Monkey
// @namespace    http://tampermonkey.net/
// @version      0.0.1
// @description  Give me 2 x Nano Banana
// @author       HearSilent
// @match        https://game.gradient-bang.com/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 1. Initial Configuration
    const DEFAULT_CONFIG = {
        email: 'your_email',
        pass: 'your_password',
        charName: 'your_character_name',
        farmCommand: "your_farm_command",
        idleInterval: 120000,
        refreshInterval: 1800000,
        loginGraceMs: 30000
    };

    let CONFIG = JSON.parse(localStorage.getItem('gb_tactical_config') || JSON.stringify(DEFAULT_CONFIG));

    function saveConfig(newConfig) {
        CONFIG = { ...CONFIG, ...newConfig };
        localStorage.setItem('gb_tactical_config', JSON.stringify(CONFIG));
    }

    function isConfigReady() {
        return (
            CONFIG.email && CONFIG.email !== 'your_email' &&
            CONFIG.pass && CONFIG.pass !== 'your_password' &&
            CONFIG.charName && CONFIG.charName !== 'your_character_name' &&
            CONFIG.farmCommand && CONFIG.farmCommand !== 'your_farm_command'
        );
    }

    // 2. Data Management Helper (Fixed count display)
    function log(msg) { console.log(`%c[GB-Automator] ${new Date().toLocaleTimeString()} - ${msg}`, 'color: #00ff00; font-weight: bold;'); }
    function getLogCount() {
        try {
            const h = JSON.parse(localStorage.getItem('gb_history') || '[]');
            const l = JSON.parse(localStorage.getItem('gb_leaderboard_history') || '[]');
            return h.length + l.length;
        } catch(e) { return 0; }
    }

    const findFiber = (el) => el ? el[Object.keys(el).find(k => k.startsWith('__reactFiber'))] : null;

    function getPropsFromFiber(el, propsToFind = []) {
        let f = findFiber(el);
        while (f) {
            if (f.memoizedProps) {
                if (propsToFind.every(p => f.memoizedProps[p] !== undefined)) return f.memoizedProps;
            }
            f = f.return;
        }
        return null;
    }

    // 3. UI Implementation
    const styles = `
        #gb-tactical-panel { position: fixed; left: 0; top: 50%; transform: translateY(-50%); z-index: 99999; display: flex; align-items: flex-start; font-family: 'Consolas', monospace; transition: transform 0.4s; }
        #gb-tactical-panel.collapsed { transform: translateY(-50%) translateX(-320px); }
        #gb-content { width: 320px; background: rgba(5,5,5,0.95); border: 2px solid ${isConfigReady() ? '#22c55e' : '#ff9900'}; border-left: none; color: #fff; padding: 20px; backdrop-filter: blur(8px); }
        #gb-toggle { background: ${isConfigReady() ? '#22c55e' : '#ff9900'}; color: #000; padding: 20px 6px; cursor: pointer; writing-mode: vertical-lr; text-transform: uppercase; font-size: 11px; font-weight: 950; }
        .gb-label { font-size: 10px; color: ${isConfigReady() ? '#22c55e' : '#ff9900'}; text-transform: uppercase; margin-bottom: 4px; display: block; font-weight: bold; margin-top: 10px; }
        .gb-label:first-child { margin-top: 0; }
        .gb-input { width: 100%; background: #000; border: 1px solid #333; color: #fff; padding: 8px; font-size: 12px; box-sizing: border-box; }
        .btn-group { display: flex; gap: 5px; margin-top: 10px; }
        .gb-btn { background: ${isConfigReady() ? '#22c55e' : '#ff9900'}; color: #000; border: none; padding: 10px; font-weight: 900; text-transform: uppercase; cursor: pointer; flex: 1; font-size: 10px; }
        .gb-btn-sec { background: #111; color: #fff; border: 1px solid #555; }
        .gb-btn-danger { background: #111; color: #ef4444; border: 1px solid #ef4444; margin-top: 10px; }
        .gb-row { display: flex; gap: 10px; margin-top: 10px; }
        .gb-col { flex: 1; }
    `;

    function initUI() {
        if (document.getElementById('gb-tactical-panel')) return;
        const styleEl = document.createElement('style'); styleEl.innerHTML = styles; document.head.appendChild(styleEl);
        const panel = document.createElement('div'); panel.id = 'gb-tactical-panel'; panel.className = 'collapsed';
        panel.innerHTML = `
            <div id="gb-content">
                <div style="border-bottom: 2px solid ${isConfigReady() ? '#22c55e' : '#ff9900'}; margin-bottom: 15px; padding-bottom: 5px;">
                    <h2 style="margin:0; font-size:16px; color:${isConfigReady() ? '#22c55e' : '#ff9900'}">${isConfigReady() ? '>> SYSTEM READY :: 0xCD1BA' : '>> SETUP REQUIRED'}</h2>
                </div>
                <div style="margin-bottom: 15px; height: 350px; overflow-y: auto; padding-right: 5px;">
                    <span class="gb-label">Access Email</span><input type="text" id="cfg-email" class="gb-input" placeholder="email@example.com" value="${CONFIG.email}">
                    <span class="gb-label">Security Pass</span><input type="password" id="cfg-pass" class="gb-input" value="${CONFIG.pass}">
                    <span class="gb-label">Pilot Name</span><input type="text" id="cfg-char" class="gb-input" placeholder="Pilot-01" value="${CONFIG.charName}">
                    <span class="gb-label">Neural Command</span><textarea id="cfg-cmd" class="gb-input" style="height: 60px; resize: none;">${CONFIG.farmCommand}</textarea>
                    
                    <div class="gb-row">
                        <div class="gb-col">
                            <span class="gb-label">Idle Check (Sec)</span>
                            <input type="number" id="cfg-idle" class="gb-input" value="${CONFIG.idleInterval / 1000}">
                        </div>
                        <div class="gb-col">
                            <span class="gb-label">Auto Refresh (Min)</span>
                            <input type="number" id="cfg-refresh" class="gb-input" value="${CONFIG.refreshInterval / 60000}">
                        </div>
                    </div>
                    <span class="gb-label">Login Grace (Sec)</span>
                    <input type="number" id="cfg-grace" class="gb-input" value="${CONFIG.loginGraceMs / 1000}">
                </div>
                <button id="gb-save-btn" class="gb-btn" style="width:100%; font-size: 12px; margin-bottom:10px;">Update Config & Restart</button>
                <div class="btn-group">
                    <button onclick="window.downloadLogs('json')" class="gb-btn gb-btn-sec">EXPORT JSON</button>
                    <button onclick="window.downloadLogs('csv')" class="gb-btn gb-btn-sec">EXPORT CSV</button>
                </div>
                <button id="clear-logs" class="gb-btn gb-btn-danger" style="width:100%">WIPE ALL RECORDS (${getLogCount()})</button>
            </div>
            <div id="gb-toggle">>> TACTICAL_HUD :: 0xCD1BA</div>
        `;
        document.body.appendChild(panel);
        document.getElementById('gb-toggle').onclick = () => {
            panel.classList.toggle('collapsed');
            if (!panel.classList.contains('collapsed')) {
                document.getElementById('clear-logs').innerText = `WIPE ALL RECORDS (${getLogCount()})`;
            }
        };
        document.getElementById('clear-logs').onclick = () => { if (confirm('Purge all logs?')) { localStorage.removeItem('gb_history'); localStorage.removeItem('gb_leaderboard_history'); location.reload(); }};
        document.getElementById('gb-save-btn').onclick = () => {
            saveConfig({
                email: document.getElementById('cfg-email').value,
                pass: document.getElementById('cfg-pass').value,
                charName: document.getElementById('cfg-char').value,
                farmCommand: document.getElementById('cfg-cmd').value,
                idleInterval: parseInt(document.getElementById('cfg-idle').value) * 1000,
                refreshInterval: parseInt(document.getElementById('cfg-refresh').value) * 60000,
                loginGraceMs: parseInt(document.getElementById('cfg-grace').value) * 1000
            });
            location.reload();
        };
        window.downloadLogs = (format) => {
            const h = JSON.parse(localStorage.getItem('gb_history') || '[]');
            const l = JSON.parse(localStorage.getItem('gb_leaderboard_history') || '[]');
            const content = format === 'json' ? JSON.stringify({stats:h, leaderboard:l}, null, 2) : "Timestamp,Bank,OnHand,Fuel\n" + h.map(x=>`"${x.t}",${x.b},${x.h},"${x.f}"`).join("\n");
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: format==='json'?'application/json':'text/csv' })); a.download = `gb_report.${format}`; a.click();
        };
    }

    // 4. Improved State Synchronization (Keep as is)
    function syncValue(el, val) {
        if (!el) return;
        el.focus(); el.value = val;
        const tracker = el._valueTracker;
        if (tracker) tracker.setValue("");
        const props = el[Object.keys(el).find(k => k.startsWith('__reactProps'))] || findFiber(el)?.memoizedProps;
        if (props?.onChange) props.onChange({ target: el, currentTarget: el, bubbles: true });
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
    }

    // 5. Automation Core
    async function automate() {
        if (!isConfigReady()) {
            const chatInput = document.querySelector('input[placeholder="Enter command"]');
            if (chatInput && chatInput.offsetParent !== null) captureStats();
            schedule(10000); return;
        }

        const chatInput = document.querySelector('input[placeholder="Enter command"]');
        if (chatInput && chatInput.offsetParent !== null) {
            captureStats();
            const worked = handleBridge(chatInput);
            schedule(worked ? CONFIG.idleInterval : 5000);
            return;
        }

        const loginForm = document.querySelector('form');
        if (loginForm && !loginForm.dataset.hooked) {
            loginForm.addEventListener('submit', (e) => e.preventDefault());
            loginForm.dataset.hooked = "true";
        }

        const charMatches = [...document.querySelectorAll('span, p')].filter(el => el.textContent.trim().toUpperCase() === CONFIG.charName.toUpperCase() && el.offsetParent !== null);
        if (charMatches.length > 0) {
            const card = charMatches[0].closest('[role="button"], .interactive-card');
            if (card && !window.charSelected) {
                card.click(); window.charSelected = true; window.loginGraceTimer = Date.now() + CONFIG.loginGraceMs; schedule(10000); return;
            }
        }

        const emailInput = document.querySelector('input[placeholder="Email"]');
        if (emailInput && emailInput.offsetParent !== null) {
            const pass = document.querySelector('input[placeholder="Password"]');
            if (emailInput.value !== CONFIG.email) syncValue(emailInput, CONFIG.email);
            if (pass && pass.value !== CONFIG.pass) syncValue(pass, CONFIG.pass);
            const joinBtn = [...document.querySelectorAll('button')].find(b => b.textContent.toUpperCase().includes('JOIN') && !b.disabled);
            if (joinBtn && !getPropsFromFiber(joinBtn, ['isLoading'])?.isLoading) { joinBtn.click(); }
            schedule(5000); return;
        }

        const signInBtn = [...document.querySelectorAll('button')].find(b => b.textContent.toUpperCase().includes('SIGN IN') && b.offsetParent !== null);
        if (signInBtn) { signInBtn.click(); schedule(2000); return; }
        schedule(5000);
    }

    // --- FIXED: PRECISION STATUS DETECTION ---
    function handleBridge(chatInput) {
        window.charSelected = false;
        if (window.loginGraceTimer && Date.now() < window.loginGraceTimer) return false;

        // 【修正】使用 border="bracket" 精準定位狀態徽章，避免找不到 span 的問題
        const statusBadgeEl = [...document.querySelectorAll('div, span')].find(el => {
            const p = getPropsFromFiber(el, ['border', 'variant']);
            return p?.border === 'bracket';
        });

        const badgeProps = statusBadgeEl ? getPropsFromFiber(statusBadgeEl, ['variant']) : null;

        // 如果 variant 為 'success' 則代表 Active (工作中)
        const isWorking = badgeProps?.variant === 'success';
        const isIdle = !isWorking;

        if (isIdle && !window.farmStarted) {
            log('STATUS: Idle / Inactive detected. Dispatching command...');
            syncValue(chatInput, CONFIG.farmCommand);
            setTimeout(() => {
                const btn = document.querySelector('input[placeholder="Enter command"]').closest('div').querySelector('button');
                if (btn) btn.click();
                window.farmStarted = true;
                setTimeout(() => { window.farmStarted = false; }, 30000);
            }, 1000);
            return false;
        }
        return isWorking;
    }

    function captureStats() {
        try {
            let bank = "0", onHand = "0", fuel = "--/--";
            document.querySelectorAll('div[data-tutorial="credits"]').forEach(el => {
                const p = getPropsFromFiber(el, ['balance', 'label']);
                if (p?.label === 'Bank') bank = p.balance; if (p?.label === 'On Hand') onHand = p.balance;
            });
            const fuelTitle = [...document.querySelectorAll('span')].find(el => el.innerText === 'Fuel');
            if (fuelTitle) { const p = getPropsFromFiber(fuelTitle, ['value', 'maxValue']); if (p) fuel = `${p.value}/${p.maxValue}`; }
            let history = JSON.parse(localStorage.getItem('gb_history') || '[]');
            history.push({ t: new Date().toLocaleString(), b: bank, h: onHand, f: fuel });
            if (history.length > 2000) history.shift();
            localStorage.setItem('gb_history', JSON.stringify(history));
        } catch (e) { }
    }

    function schedule(ms) { clearTimeout(window.gbTimeout); window.gbTimeout = setTimeout(automate, ms); }
    const bootstrap = () => { if (document.body) { initUI(); schedule(2000); } else { setTimeout(bootstrap, 500); } };
    bootstrap();

    setInterval(async () => {
        if (isConfigReady()) {
            const tr = [...document.querySelectorAll('button')].find(b => findFiber(b)?.memoizedProps?.onClick?.toString().includes('leaderboard'));
            if (tr) {
                tr.click(); await new Promise(r => setTimeout(r, 2000));
                const c = document.querySelector('.size-full.overflow-auto');
                if (c) {
                    const rows = [...c.querySelectorAll('div')].filter(el => el.innerText && el.innerText.includes('\n'));
                    const l = JSON.parse(localStorage.getItem('gb_leaderboard_history') || '[]');
                    l.push({ time: new Date().toLocaleString(), myRank: (rows.find(r => r.innerText.includes(CONFIG.charName)) || {}).innerText, top3: rows.slice(0, 3).map(r => r.innerText) });
                    localStorage.setItem('gb_leaderboard_history', JSON.stringify(l));
                }
            }
        }
        location.reload();
    }, CONFIG.refreshInterval);
})();
