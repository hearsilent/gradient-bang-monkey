// ==UserScript==
// @name         Gradient Bang Monkey
// @namespace    http://tampermonkey.net/
// @version      1.0.1
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
        loginGraceMs: 30000,
        webhookUrl: '',
        webhookInterval: 60000
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
        #gb-tactical-panel { position: fixed; left: 0; top: 48px; z-index: 99999; display: flex; align-items: flex-start; font-family: 'Consolas', 'Roboto Mono', monospace; transition: transform 0.4s; }
        #gb-tactical-panel.collapsed { transform: translateX(-320px); }
        #gb-content { width: 320px; background: rgba(8,8,8,0.98); border: 1px solid ${isConfigReady() ? '#22c55e' : '#f59e0b'}; border-left: none; color: #eee; padding: 20px; backdrop-filter: blur(12px); box-shadow: 10px 0 30px rgba(0,0,0,0.5); }
        #gb-toggle { background: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; color: #000; padding: 24px 8px; cursor: pointer; writing-mode: vertical-lr; text-transform: uppercase; font-size: 10px; font-weight: 900; letter-spacing: 1px; border-radius: 0 4px 4px 0; }
        
        .gb-header { border-bottom: 2px solid ${isConfigReady() ? '#22c55e' : '#f59e0b'}; margin-bottom: 20px; padding-bottom: 8px; }
        .gb-header h2 { margin: 0; font-size: 15px; color: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; letter-spacing: 1px; }

        .gb-label { font-size: 10px; color: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; text-transform: uppercase; margin-bottom: 6px; display: block; font-weight: 800; opacity: 0.9; margin-top: 14px; }
        .gb-label:first-child { margin-top: 0; }
        
        .gb-input { width: 100%; background: #000; border: 1px solid #222; color: #fff; padding: 10px; font-size: 12px; box-sizing: border-box; font-family: inherit; transition: border-color 0.2s; }
        .gb-input:focus { border-color: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; outline: none; }
        
        .gb-telemetry { background: #050505; border: 1px solid #1a1a1a; padding: 15px; margin-bottom: 20px; position: relative; }
        .gb-telemetry::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; opacity: 0.5; }
        .gb-stat-row { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 11px; border-bottom: 1px solid #111; padding-bottom: 4px; }
        .gb-stat-label { color: #888; text-transform: uppercase; font-weight: bold; font-size: 9px; }
        .gb-stat-value { color: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; text-align: right; font-weight: 900; text-shadow: 0 0 8px rgba(34, 197, 94, 0.3); }

        .btn-group { display: flex; gap: 8px; margin-top: 15px; }
        .gb-btn { background: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; color: #000; border: none; padding: 12px; font-weight: 950; text-transform: uppercase; cursor: pointer; flex: 1; font-size: 11px; transition: opacity 0.2s; }
        .gb-btn:hover { opacity: 0.85; }
        .gb-btn-sec { background: transparent; color: #ccc; border: 1px solid #333; }
        .gb-btn-sec:hover { border-color: #666; color: #fff; }
        .gb-btn-danger { background: transparent; color: #ff4444; border: 1px solid #441111; margin-top: 15px; }
        .gb-btn-danger:hover { background: #441111; }

        .gb-scroll-area { max-height: 350px; overflow-y: auto; padding-right: 0; margin-bottom: 20px; scrollbar-width: none; -ms-overflow-style: none; }
        .gb-scroll-area::-webkit-scrollbar { display: none; }

        @keyframes breathe {
            0% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.4); opacity: 1; box-shadow: 0 0 8px currentColor; }
            100% { transform: scale(1); opacity: 0.8; }
        }
        .gb-pulse-dot {
            display: inline-block;
            width: 6px;
            height: 6px;
            background-color: currentColor;
            border-radius: 50%;
            margin-left: 8px;
            vertical-align: middle;
            animation: breathe 3s infinite ease-in-out;
            margin-top: -2px;
            pointer-events: none;
        }
    `;

    function initUI() {
        if (document.getElementById('gb-tactical-panel')) return;
        const styleEl = document.createElement('style'); styleEl.innerHTML = styles; document.head.appendChild(styleEl);
        const panel = document.createElement('div'); panel.id = 'gb-tactical-panel'; panel.className = 'collapsed';
        panel.innerHTML = `
            <div id="gb-content">
                <div class="gb-header">
                    <h2>${isConfigReady() ? '>> SYSTEM READY :: 0xCD1BA' : '>> SETUP REQUIRED'}</h2>
                </div>
                <div class="gb-telemetry">
                    <div id="gb-telemetry-header" style="display: flex; align-items: center; margin-bottom: 5px; cursor: help;" title="Awaiting first update...">
                        <span class="gb-label" style="margin:0; color:${isConfigReady() ? '#22c55e' : '#f59e0b'}; font-size: 9px;">LIVE SENSOR TELEMETRY</span>
                        <span id="gb-status-dot" class="gb-pulse-dot" style="color:${isConfigReady() ? '#22c55e' : '#f59e0b'};"></span>
                    </div>
                    <div class="gb-stat-row"><span class="gb-stat-label">CREDITS_BANK</span><span id="val-bank" class="gb-stat-value">0</span></div>
                    <div class="gb-stat-row"><span class="gb-stat-label">CREDITS_HAND</span><span id="val-hand" class="gb-stat-value">0</span></div>
                    <div class="gb-stat-row"><span class="gb-stat-label">FUEL_CAPACITY</span><span id="val-fuel" class="gb-stat-value">--/--</span></div>
                    <div class="gb-stat-row"><span class="gb-stat-label">RANK_W / T / E</span><span id="val-ranks" class="gb-stat-value">-- / -- / --</span></div>
                </div>
                <div class="gb-scroll-area">
                    <span class="gb-label">Access Email</span>
                    <input type="text" id="cfg-email" class="gb-input" placeholder="contact@hearsilent.app" value="${CONFIG.email}">
                    
                    <span class="gb-label">Security Pass</span>
                    <input type="password" id="cfg-pass" class="gb-input" value="${CONFIG.pass}">
                    
                    <span class="gb-label">Pilot Name</span>
                    <input type="text" id="cfg-char" class="gb-input" placeholder="HearSilent" value="${CONFIG.charName}">
                    
                    <span class="gb-label">Neural Command</span>
                    <textarea id="cfg-cmd" class="gb-input" style="height: 80px; resize: none;">${CONFIG.farmCommand}</textarea>
                    
                    <div class="btn-group" style="margin-top: 5px;">
                        <div style="flex: 1;">
                            <span class="gb-label">Idle Check (Sec)</span>
                            <input type="number" id="cfg-idle" class="gb-input" value="${CONFIG.idleInterval / 1000}">
                        </div>
                        <div style="flex: 1;">
                            <span class="gb-label">Auto Refresh (Min)</span>
                            <input type="number" id="cfg-refresh" class="gb-input" value="${CONFIG.refreshInterval / 60000}">
                        </div>
                    </div>
                    
                    <span class="gb-label">Login Grace (Sec)</span>
                    <input type="number" id="cfg-grace" class="gb-input" value="${CONFIG.loginGraceMs / 1000}">

                    <span class="gb-label">Remote Webhook URL</span>
                    <input type="text" id="cfg-webhook" class="gb-input" placeholder="https://your-worker.workers.dev" value="${CONFIG.webhookUrl || ''}">
                    
                    <span class="gb-label">Remote Sync Interval (Sec)</span>
                    <input type="number" id="cfg-webhook-int" class="gb-input" value="${(CONFIG.webhookInterval || 60000) / 1000}">
                </div>
                
                <button id="gb-save-btn" class="gb-btn" style="width:100%">UPDATE CONFIG & RESTART</button>
                
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
        document.getElementById('clear-logs').onclick = () => { 
            if (confirm('Purge all logs?')) { 
                localStorage.removeItem('gb_history'); 
                localStorage.removeItem('gb_leaderboard_history'); 
                document.getElementById('clear-logs').innerText = `WIPE ALL RECORDS (0)`;
                log('System logs purged successfully.');
            }
        };
        document.getElementById('gb-save-btn').onclick = () => {
            saveConfig({
                email: document.getElementById('cfg-email').value,
                pass: document.getElementById('cfg-pass').value,
                charName: document.getElementById('cfg-char').value,
                farmCommand: document.getElementById('cfg-cmd').value,
                idleInterval: parseInt(document.getElementById('cfg-idle').value) * 1000,
                refreshInterval: parseInt(document.getElementById('cfg-refresh').value) * 60000,
                loginGraceMs: parseInt(document.getElementById('cfg-grace').value) * 1000,
                webhookUrl: document.getElementById('cfg-webhook').value,
                webhookInterval: parseInt(document.getElementById('cfg-webhook-int').value) * 1000
            });
            location.reload();
        };
        window.downloadLogs = (format) => {
            const h = JSON.parse(localStorage.getItem('gb_history') || '[]');
            const l = JSON.parse(localStorage.getItem('gb_leaderboard_history') || '[]');
            const content = format === 'json' ? JSON.stringify({stats:h, leaderboard:l}, null, 2) : "Timestamp,Bank,OnHand,Fuel,Rank_W,Rank_T,Rank_E\n" + h.map(x=>`"${x.t}",${x.b},${x.h},"${x.f}","${x.rw||'N/A'}","${x.rt||'N/A'}","${x.re||'N/A'}"`).join("\n");
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
            if (!window.firstFetchDone) {
                window.firstFetchDone = true;
                reportToWebhook();
            }
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
            window.firstFetchDone = false; // Reset on login screen
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

    function refreshLiveData() {
        try {
            let bank = "0", onHand = "0", fuel = "--/--";
            document.querySelectorAll('div[data-tutorial="credits"]').forEach(el => {
                const p = getPropsFromFiber(el, ['balance', 'label']);
                if (p?.label === 'Bank') bank = p.balance; if (p?.label === 'On Hand') onHand = p.balance;
            });

            // Improved Fuel Capture Logic
            const fuelBadgeEl = document.getElementById('ship-fuel')?.querySelector('div, span');
            if (fuelBadgeEl) {
                const p = getPropsFromFiber(fuelBadgeEl, ['value', 'maxValue']);
                if (p) fuel = `${p.value}/${p.maxValue}`;
            }

            // Fallback to text search if ID fails
            if (fuel === "--/--") {
                const fuelTitle = [...document.querySelectorAll('span')].find(el => el.innerText === 'Fuel');
                if (fuelTitle) {
                    const p = getPropsFromFiber(fuelTitle, ['value', 'maxValue']);
                    if (p) fuel = `${p.value}/${p.maxValue}`;
                }
            }
            
            const bEl = document.getElementById('val-bank'); if (bEl) bEl.innerText = bank;
            const hEl = document.getElementById('val-hand'); if (hEl) hEl.innerText = onHand;
            const fEl = document.getElementById('val-fuel'); if (fEl) fEl.innerText = fuel;

            const dotEl = document.getElementById('gb-status-dot');
            const headerEl = document.getElementById('gb-telemetry-header');
            
            if (dotEl) {
                if (window.lastWebhookError) {
                    dotEl.style.color = '#ff4444';
                } else {
                    dotEl.style.color = isConfigReady() ? '#22c55e' : '#f59e0b';
                }
            }

            if (headerEl) {
                const syncMsg = window.lastWebhookError ? `REMOTE_SYNC_ERROR :: ${window.lastWebhookError}` : `REMOTE_SYNC :: OK`;
                headerEl.title = `LOCAL_SENSE :: ${new Date().toLocaleTimeString()}\n${syncMsg}`;
            }

            return { bank, onHand, fuel };
        } catch (e) { return null; }
    }

    function captureStats() {
        try {
            const stats = refreshLiveData();
            if (!stats) return;
            let history = JSON.parse(localStorage.getItem('gb_history') || '[]');
            const ranks = window.lastRanks || { w: "N/A", t: "N/A", e: "N/A" };
            history.push({ 
                t: new Date().toLocaleString(), 
                b: stats.bank, 
                h: stats.onHand, 
                f: stats.fuel,
                rw: ranks.w,
                rt: ranks.t,
                re: ranks.e
            });
            if (history.length > 2000) history.shift();
            localStorage.setItem('gb_history', JSON.stringify(history));
        } catch (e) { }
    }

    async function reportToWebhook() {
        if (!CONFIG.webhookUrl || !CONFIG.webhookUrl.startsWith('http')) return;
        
        try {
            const stats = refreshLiveData();
            if (!stats) return;
            let rankWealth = "N/A";
            let rankTrading = "N/A";
            let rankExploration = "N/A";
            let totalWealth = "0";

            try {
                const lbResponse = await fetch('https://api.gradient-bang.com/functions/v1/leaderboard_resources');
                const lbData = await lbResponse.json();
                if (lbData.success) {
                    const findR = (arr) => {
                        const humanArr = (arr || []).filter(p => p.player_type === 'human');
                        const idx = humanArr.findIndex(p => p.player_name?.trim().toUpperCase() === CONFIG.charName.trim().toUpperCase());
                        return idx !== -1 ? `#${idx + 1}` : "N/A";
                    };
                    
                    rankWealth = findR(lbData.wealth);
                    rankTrading = findR(lbData.trading);
                    rankExploration = findR(lbData.exploration);

                    const myWealth = lbData.wealth?.find(p => p.player_name?.trim().toUpperCase() === CONFIG.charName.trim().toUpperCase());
                    if (myWealth) totalWealth = myWealth.total_wealth.toLocaleString();

                    window.lastRanks = { w: rankWealth, t: rankTrading, e: rankExploration };
                }
            } catch (lbErr) {
                log('Leaderboard fetch failed: ' + lbErr.message);
            }

            const rEl = document.getElementById('val-ranks');
            if (rEl) rEl.innerText = `${rankWealth} / ${rankTrading} / ${rankExploration}`;

            const payload = {
                charName: CONFIG.charName,
                bank: stats.bank,
                onHand: stats.onHand,
                fuel: stats.fuel,
                rankWealth,
                rankTrading,
                rankExploration,
                totalWealth,
                timestamp: new Date().toISOString()
            };
            const response = await fetch(CONFIG.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP_${response.status}`);

            window.lastWebhookError = null;
            log('Remote telemetry sync successful.');
        } catch (e) {
            window.lastWebhookError = e.message;
            log('Remote telemetry sync failed: ' + e.message);
        }
        refreshLiveData(); // Immediate UI update
    }

    function schedule(ms) { clearTimeout(window.gbTimeout); window.gbTimeout = setTimeout(automate, ms); }
    const bootstrap = () => { 
        if (document.body) { 
            initUI(); schedule(2000); setInterval(refreshLiveData, 5000); 
            if (CONFIG.webhookUrl) {
                setInterval(reportToWebhook, CONFIG.webhookInterval || 60000);
            }
        } else { setTimeout(bootstrap, 500); } 
    };
    bootstrap();

    // Simple Periodic Session Refresh
    setInterval(() => {
        if (isConfigReady()) {
            log('Periodic session refresh triggered.');
            location.reload();
        }
    }, CONFIG.refreshInterval);
})();
