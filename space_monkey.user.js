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
        pilotProtocol: "your_pilot_protocol",
        idleInterval: 120000,
        refreshInterval: 1800000,
        loginGraceMs: 30000,
        webhookUrl: '',
        webhookInterval: 60000,
        isPilotEnabled: false
    };

    let CONFIG = { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem('gb_tactical_config') || '{}') };

    function saveConfig(newConfig) {
        CONFIG = { ...CONFIG, ...newConfig };
        localStorage.setItem('gb_tactical_config', JSON.stringify(CONFIG));
    }

    function isConfigReady() {
        return (
            CONFIG.email && CONFIG.email !== 'your_email' &&
            CONFIG.pass && CONFIG.pass !== 'your_password' &&
            CONFIG.charName && CONFIG.charName !== 'your_character_name' &&
            CONFIG.pilotProtocol && CONFIG.pilotProtocol !== 'your_pilot_protocol'
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
        #gb-content { width: 320px; max-height: calc(100vh - 60px); display: flex; flex-direction: column; background: rgba(8,8,8,0.98); border: 1px solid ${isConfigReady() ? '#22c55e' : '#f59e0b'}; border-left: none; color: #eee; padding: 20px; backdrop-filter: blur(12px); box-shadow: 10px 0 30px rgba(0,0,0,0.5); }
        #gb-toggle { background: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; color: #000; padding: 24px 8px; cursor: pointer; writing-mode: vertical-lr; text-transform: uppercase; font-size: 10px; font-weight: 900; letter-spacing: 1px; border-radius: 0 4px 4px 0; transition: background 0.3s; }
        
        #gb-tactical-panel.gb-off #gb-toggle { background: #666 !important; }
        #gb-tactical-panel.gb-off #gb-content { border-color: #444 !important; }
        #gb-tactical-panel.gb-off .gb-header { border-bottom-color: #444 !important; }
        #gb-tactical-panel.gb-off .gb-header h2 { color: #666 !important; }
        #gb-tactical-panel.gb-off .gb-label { color: #666 !important; }
        #gb-tactical-panel.gb-off .gb-stat-value { color: #888 !important; text-shadow: none !important; }
        #gb-tactical-panel.gb-off .gb-telemetry::before { background: #666 !important; box-shadow: none !important; }

        .gb-header { border-bottom: 2px solid ${isConfigReady() ? '#22c55e' : '#f59e0b'}; margin-bottom: 20px; padding-bottom: 8px; transition: border-color 0.3s; }
        .gb-header h2 { margin: 0; font-size: 15px; color: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; letter-spacing: 1px; transition: color 0.3s; }

        .gb-label { font-size: 10px; color: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; text-transform: uppercase; margin-bottom: 6px; display: block; font-weight: 800; opacity: 0.9; margin-top: 14px; letter-spacing: 1px; }
        .gb-label:first-child { margin-top: 0; }
        
        .gb-input { width: 100%; background: #000; border: 1px solid #222; color: #fff; padding: 10px; font-size: 12px; box-sizing: border-box; font-family: inherit; transition: border-color 0.2s; border-radius: 2px; }
        .gb-input:focus { border-color: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; outline: none; box-shadow: 0 0 10px rgba(34, 197, 94, 0.1); }
        
        .gb-telemetry { background: #050505; border: 1px solid #1a1a1a; padding: 18px; margin-bottom: 20px; position: relative; border-radius: 4px; box-shadow: inset 0 0 20px rgba(0,0,0,0.8); }
        .gb-telemetry::before { content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; box-shadow: 0 0 10px ${isConfigReady() ? '#22c55e' : '#f59e0b'}; opacity: 0.6; }
        
        .gb-stat-row { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 11px; padding-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.05); }
        .gb-stat-row:last-child { border-bottom: none; }
        .gb-stat-label { color: #777; text-transform: uppercase; font-weight: bold; font-size: 9px; letter-spacing: 0.5px; display: flex; align-items: center; }
        .gb-prefix-icon { color: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; opacity: 0.5; }
        .gb-stat-value { color: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; text-align: right; font-weight: 900; text-shadow: 0 0 10px rgba(34, 197, 94, 0.4); font-family: 'Consolas', monospace; }

        .btn-group { display: flex; gap: 8px; margin-top: 15px; }
        .gb-btn { background: ${isConfigReady() ? '#22c55e' : '#f59e0b'}; color: #000; border: none; padding: 12px; font-weight: 950; text-transform: uppercase; cursor: pointer; flex: 1; font-size: 11px; transition: opacity 0.2s; }
        .gb-btn:hover { opacity: 0.85; }
        .gb-btn-sec { background: transparent; color: #ccc; border: 1px solid #333; }
        .gb-btn-sec:hover { border-color: #666; color: #fff; }
        .gb-btn-danger { background: transparent; color: #ff4444; border: 1px solid #441111; margin-top: 15px; }
        .gb-btn-danger:hover { background: #441111; }

        .gb-scroll-area { flex: 1; overflow-y: auto; padding-right: 5px; margin-bottom: 20px; scrollbar-width: none; -ms-overflow-style: none; }
        .gb-scroll-area::-webkit-scrollbar { display: none; }

        @keyframes breathe {
            0% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.4); opacity: 1; box-shadow: 0 0 8px currentColor; }
            100% { transform: scale(1); opacity: 0.8; }
        }
        @keyframes spin {
            from { transform: scale(1.2) rotate(0deg); }
            to { transform: scale(1.2) rotate(360deg); }
        }

        .gb-prefix {
            width: 32px;
            display: inline-flex;
            justify-content: center;
            align-items: center;
            flex-shrink: 0;
        }
        .gb-pulse-dot {
            display: inline-block;
            width: 7px;
            height: 7px;
            background-color: currentColor;
            border-radius: 50%;
            animation: breathe 3s infinite ease-in-out;
            pointer-events: auto;
            cursor: pointer;
            transition: transform 0.2s, background 0.3s, border 0.3s;
            position: relative;
            box-sizing: border-box;
            z-index: 10;
        }
        .gb-pulse-dot.syncing {
            animation: spin 0.6s linear infinite !important;
            background: transparent !important;
            border: 2px solid rgba(245, 158, 11, 0.15) !important;
            border-top: 2px solid #f59e0b !important;
            border-right: 2px solid #f59e0b !important;
            box-shadow: none !important;
        }
        .gb-pulse-dot:hover:not(.syncing) { transform: scale(1.4); }
        .gb-pulse-dot:active { transform: scale(0.9); opacity: 0.7; }

        .gb-toggle-chip {
            display: flex;
            align-items: center;
            background: rgba(20,20,20,0.8);
            border: 1px solid #333;
            padding: 2px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 9px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            margin-left: auto;
        }
        .gb-toggle-chip .chip-label { color: #666; padding: 0 8px; font-weight: 800; letter-spacing: 0.5px; }
        .gb-toggle-chip .chip-state { background: #222; color: #555; padding: 3px 8px; border-radius: 2px; font-weight: 900; transition: all 0.3s; }
        .gb-toggle-chip.active { border-color: #22c55e; box-shadow: 0 0 15px rgba(34, 197, 94, 0.15); }
        .gb-toggle-chip.active .chip-label { color: #22c55e; text-shadow: 0 0 5px rgba(34, 197, 94, 0.5); }
        .gb-toggle-chip.active .chip-state { background: #22c55e; color: #000; box-shadow: 0 0 8px #22c55e; }
        .gb-toggle-chip:hover { border-color: #555; }
        .gb-toggle-chip.active:hover { border-color: #4ade80; }

        #gb-stat-container { transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease; overflow: visible; max-height: 800px; opacity: 1; margin-bottom: 5px; }
        .stats-collapsed #gb-stat-container { max-height: 0; opacity: 0; margin-top: 0; margin-bottom: 0; overflow: hidden; pointer-events: none; }
        #gb-telemetry-header { 
            cursor: pointer; user-select: none; padding-bottom: 8px; transition: padding 0.3s;
            display: flex; align-items: center;
        }
        .stats-collapsed #gb-telemetry-header { padding-bottom: 0; }
        
        #gb-collapse-toggle { 
            position: absolute; right: 0; bottom: 0; width: 10px; height: 10px; 
            cursor: pointer; z-index: 10;
        }
        #gb-collapse-toggle::before, #gb-collapse-toggle::after {
            content: ''; position: absolute; width: 0; height: 0; border-style: solid;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        /* Top-Left part (◤) - Shrinks on collapse */
        #gb-collapse-toggle::after {
            bottom: 0; right: 0;
            border-width: 8px 8px 0 0;
            border-color: ${isConfigReady() ? '#22c55e' : '#f59e0b'} transparent transparent transparent;
            transform-origin: bottom right;
            opacity: 0.8;
        }
        /* Bottom-Right part (◢) - Stays/Grows at corner */
        #gb-collapse-toggle::before {
            bottom: 0; right: 0;
            border-width: 0 0 8px 8px;
            border-color: transparent transparent ${isConfigReady() ? '#22c55e' : '#f59e0b'} transparent;
            transform-origin: bottom right;
            opacity: 0.8;
        }
        
        .stats-collapsed #gb-collapse-toggle::after { transform: scale(0); opacity: 0; }
        .stats-collapsed #gb-collapse-toggle::before { transform: scale(1); opacity: 1; }
        
        .gb-telemetry { position: relative; padding: 10px 12px; transition: padding 0.3s; }
        .gb-telemetry::before { content: ""; position: absolute; left: 0; top: 0; width: 4px; height: 100%; border-radius: 2px 0 0 2px; }
        .stats-collapsed .gb-telemetry { padding-top: 4px; padding-bottom: 4px; }
        .stats-collapsed .gb-telemetry::before { height: 100%; }
    `;

    function initUI() {
        if (document.getElementById('gb-tactical-panel')) return;
        const styleEl = document.createElement('style'); styleEl.innerHTML = styles; document.head.appendChild(styleEl);
        const panel = document.createElement('div'); panel.id = 'gb-tactical-panel'; 
        panel.className = 'collapsed' + (CONFIG.isPilotEnabled ? '' : ' gb-off');
        panel.innerHTML = `
            <div id="gb-content">
                <div class="gb-header">
                    <h2>${isConfigReady() ? '>> SYSTEM READY :: 0xCD1BA' : '>> SETUP REQUIRED'}</h2>
                </div>
                <div class="gb-telemetry">
                    <div id="gb-telemetry-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px; cursor: help;" title="Awaiting first update...">
                        <div style="display: flex; align-items: center;">
                            <div class="gb-prefix">
                                <div id="gb-status-dot" class="gb-pulse-dot" title="FORCE_SYNC_TELEMETRY"></div>
                            </div>
                            <span class="gb-label" style="margin:0; color:${isConfigReady() ? '#22c55e' : '#f59e0b'}; font-size: 10px; letter-spacing: 1.5px;">SYSTEM_SENSORS</span>
                        </div>
                        <div id="pilot-toggle-btn" class="gb-toggle-chip ${CONFIG.isPilotEnabled ? 'active' : ''}">
                            <span class="chip-label">AP</span>
                            <span class="chip-state">${CONFIG.isPilotEnabled ? 'ON' : 'OFF'}</span>
                        </div>
                    </div>
                    <div id="gb-stat-container">
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>CREDITS_BANK</span><span id="val-bank" class="gb-stat-value">0</span></div>
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>CREDITS_HAND</span><span id="val-hand" class="gb-stat-value">0</span></div>
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>LOC_SECTOR</span><span id="val-sector" class="gb-stat-value">UNKNOWN</span></div>
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>MEGA_PROXIMITY</span><span id="val-mega" class="gb-stat-value">INF</span></div>
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>FUEL_CAPACITY</span><span id="val-fuel" class="gb-stat-value">--/--</span></div>
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>RANK [ W / T / E ]</span><span id="val-ranks" class="gb-stat-value">-- / -- / --</span></div>
                    </div>
                    <div id="gb-collapse-toggle"></div>
                </div>
                <div class="gb-scroll-area" id="gb-settings-scroll">
                    <span class="gb-label">Access Email</span>
                    <input type="text" id="cfg-email" class="gb-input" placeholder="contact@hearsilent.app" value="${CONFIG.email}">
                    
                    <span class="gb-label">Security Pass</span>
                    <input type="password" id="cfg-pass" class="gb-input" value="${CONFIG.pass}">
                    
                    <span class="gb-label">Pilot Name</span>
                    <input type="text" id="cfg-char" class="gb-input" placeholder="HearSilent" value="${CONFIG.charName}">
                    
                    <span class="gb-label">Pilot Protocol</span>
                    <textarea id="cfg-cmd" class="gb-input" style="height: 80px; resize: none;">${CONFIG.pilotProtocol}</textarea>
                    
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
        document.getElementById('pilot-toggle-btn').onclick = (e) => {
            e.stopPropagation();
            const cmd = document.getElementById('cfg-cmd').value;
            if (!cmd || cmd === 'your_pilot_protocol') {
                const cmdInput = document.getElementById('cfg-cmd');
                cmdInput.focus();
                cmdInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                cmdInput.style.borderColor = '#ff4444';
                setTimeout(() => { cmdInput.style.borderColor = ''; }, 2000);
                log('PILOT_PROTOCOL not set. Please configure before enabling.');
                return;
            }
            const newState = !CONFIG.isPilotEnabled;
            saveConfig({ isPilotEnabled: newState });
            const panel = document.getElementById('gb-tactical-panel');
            if (panel) panel.classList.toggle('gb-off', !newState);
            const chip = e.currentTarget;
            chip.classList.toggle('active', newState);
            chip.querySelector('.chip-state').innerText = newState ? 'ON' : 'OFF';
            log(`Auto-pilot ${newState ? 'enabled' : 'disabled'}.`);
            reportToWebhook();
        };
        document.getElementById('gb-save-btn').onclick = () => {
            saveConfig({
                email: document.getElementById('cfg-email').value,
                pass: document.getElementById('cfg-pass').value,
                charName: document.getElementById('cfg-char').value,
                pilotProtocol: document.getElementById('cfg-cmd').value,
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
            const content = format === 'json' ? JSON.stringify({stats:h, leaderboard:l}, null, 2) : 
                "Timestamp,Bank,OnHand,Fuel,Sector,TargetMega,Proximity,Rank_W,Rank_T,Rank_E\n" + 
                h.map(x=>`"${x.t}",${x.b},${x.h},"${x.f}",${x.s||'N/A'},${x.nm||'N/A'},${x.dm||'N/A'},"${x.rw||'N/A'}","${x.rt||'N/A'}","${x.re||'N/A'}"`).join("\n");
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: format==='json'?'application/json':'text/csv' })); a.download = `gb_report.${format}`; a.click();
        };

        // Toggle Expand/Collapse Telemetry
        const telemetryBlock = panel.querySelector('.gb-telemetry');
        const header = panel.querySelector('#gb-telemetry-header');
        const toggleBtn = panel.querySelector('#gb-collapse-toggle');
        const scrollArea = panel.querySelector('#gb-settings-scroll');

        const toggleExpanded = () => {
            telemetryBlock.classList.toggle('stats-collapsed');
            window.manualTelemetryOverride = telemetryBlock.classList.contains('stats-collapsed') ? 'closed' : 'open';
        };

        if (header) header.onclick = toggleExpanded;
        if (toggleBtn) toggleBtn.onclick = toggleExpanded;
        
        const statusDot = panel.querySelector('#gb-status-dot');
        if (statusDot) {
            statusDot.onclick = async (e) => {
                e.stopPropagation();
                if (statusDot.classList.contains('syncing')) return;
                
                log('Manual telemetry sync triggered.');
                statusDot.classList.add('syncing');
                statusDot.title = 'SYNCING_DATA...';
                
                try {
                    await reportToWebhook();
                } finally {
                    setTimeout(() => {
                        statusDot.classList.remove('syncing');
                        statusDot.title = 'FORCE_SYNC_TELEMETRY';
                    }, 500);
                }
            };
        }

        if (scrollArea && telemetryBlock) {
            scrollArea.addEventListener('scroll', () => {
                // Restore auto-logic if user scrolls deep enough
                if (scrollArea.scrollTop > 80) window.manualTelemetryOverride = null;

                if (scrollArea.scrollTop > 30 && !telemetryBlock.classList.contains('stats-collapsed') && window.manualTelemetryOverride !== 'open') {
                    telemetryBlock.classList.add('stats-collapsed');
                }
            });

            scrollArea.addEventListener('wheel', (e) => {
                if (scrollArea.scrollTop === 0 && e.deltaY < -2 && telemetryBlock.classList.contains('stats-collapsed')) {
                    telemetryBlock.classList.remove('stats-collapsed');
                    window.manualTelemetryOverride = 'open';
                }
            });
        }
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

        const statusBadgeEl = [...document.querySelectorAll('div, span')].find(el => {
            const p = getPropsFromFiber(el, ['border', 'variant']);
            return p?.border === 'bracket';
        });

        const badgeProps = statusBadgeEl ? getPropsFromFiber(statusBadgeEl, ['variant']) : null;

        const isWorking = badgeProps?.variant === 'success';
        const isIdle = !isWorking;

        if (!CONFIG.isPilotEnabled) return isWorking;

        if (isIdle && !window.pilotStarted) {
            log('STATUS: Idle / Inactive detected. Dispatching protocol...');
            syncValue(chatInput, CONFIG.pilotProtocol);
            setTimeout(() => {
                const btn = document.querySelector('input[placeholder="Enter command"]').closest('div').querySelector('button');
                if (btn) btn.click();
                window.pilotStarted = true;
                setTimeout(() => { window.pilotStarted = false; }, 30000);
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

            const fuelBadgeEl = document.getElementById('ship-fuel')?.querySelector('div, span');
            if (fuelBadgeEl) {
                const p = getPropsFromFiber(fuelBadgeEl, ['value', 'maxValue']);
                if (p) fuel = `${p.value}/${p.maxValue}`;
            }

            if (fuel === "--/--") {
                const fuelTitle = [...document.querySelectorAll('span')].find(el => el.innerText === 'Fuel');
                if (fuelTitle) {
                    const p = getPropsFromFiber(fuelTitle, ['value', 'maxValue']);
                    if (p) fuel = `${p.value}/${p.maxValue}`;
                }
            }
            
            const bEl = document.getElementById('val-bank'); if (bEl) bEl.innerText = bank;
            const hEl = document.getElementById('val-hand'); if (hEl) hEl.innerText = onHand;
            const fEl = document.getElementById('val-fuel'); 
            
            let currentSector = null;
            // 1. Regex-based aggressive DOM search
            const sectorNodes = [...document.querySelectorAll('div, span, button')].filter(el => /Sector\s*\d+/i.test(el.innerText));
            for (const n of sectorNodes) {
                const m = n.innerText.match(/Sector\s*(\d+)/i);
                if (m) { currentSector = parseInt(m[1]); break; }
            }
            // 2. Exact match fallback
            if (currentSector === null) {
                const labels = [...document.querySelectorAll('div, span')].filter(el => el.innerText.trim().toUpperCase() === 'SECTOR');
                for (const l of labels) {
                    const val = l.parentElement?.innerText.match(/\d+/) || l.querySelector('span')?.innerText.match(/\d+/);
                    if (val) { currentSector = parseInt(val[0]); break; }
                }
            }
            // 3. Fiber fallback (safe for 0)
            if (currentSector === null) {
                const canvas = document.querySelector('canvas');
                if (canvas) {
                    const p = getPropsFromFiber(canvas, ['current_sector_id']);
                    if (p && p.current_sector_id !== undefined) currentSector = p.current_sector_id;
                }
            }
            const sEl = document.getElementById('val-sector'); if (sEl) sEl.innerText = currentSector !== null ? currentSector : 'UNKNOWN';

            // Immediate Proximity Update
            if (currentSector !== null) {
                updateMegaPortDistance(currentSector);
                const mEl = document.getElementById('val-mega'); 
                if (mEl && window.lastKnownDistToMega !== undefined) {
                    const idSuffix = window.lastNearestMegaId !== undefined ? ` (${window.lastNearestMegaId})` : '';
                    const dist = window.lastKnownDistToMega;
                    const col = dist <= 5 ? '#22c55e' : (dist <= 12 ? '#f59e0b' : '#ff4444');
                    mEl.innerText = `${dist} HOPS${idSuffix}`;
                    mEl.style.color = col;
                    mEl.style.textShadow = `0 0 8px ${col}44`;
                }
            }

            if (fEl) {
                fEl.innerText = fuel;
                const [fCur, fTot] = fuel.split('/').map(n => parseInt(n.replace(/,/g,'')));
                if (!isNaN(fCur) && !isNaN(fTot)) {
                    const fPct = (fCur / fTot) * 100;
                    fEl.style.color = fPct < 30 ? '#ff4444' : (fPct < 70 ? '#f59e0b' : '#22c55e');
                    fEl.style.textShadow = `0 0 8px ${fEl.style.color}44`;
                }
            }

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

            return { bank, onHand, fuel, currentSector };
        } catch (e) { return null; }
    }

    function captureStats() {
        try {
            const now = Date.now();
            if (window.lastLogTime && now - window.lastLogTime < 60000) return;
            window.lastLogTime = now;

            const stats = refreshLiveData();
            if (!stats) return;
            let history = JSON.parse(localStorage.getItem('gb_history') || '[]');
            const ranks = window.lastRanks || { w: "N/A", t: "N/A", e: "N/A" };
            history.push({ 
                t: new Date().toLocaleString(), 
                b: stats.bank, 
                h: stats.onHand, 
                f: stats.fuel,
                s: stats.currentSector,
                nm: window.lastNearestMegaId,
                dm: window.lastKnownDistToMega,
                rw: ranks.w,
                rt: ranks.t,
                re: ranks.e
            });
            if (history.length > 2000) history.shift();
            localStorage.setItem('gb_history', JSON.stringify(history));
        } catch (e) { }
    }

    async function updateMegaPortDistance(sectorId) {
        if (window.isUpdatingMegaDist) return;
        window.isUpdatingMegaDist = true;
        
        try {
            const now = Date.now();
            if (!window.megaPortsMap || (now - (window.lastMegaFetch || 0) > 3600000)) {
                window.megaPortsMap = [0, 42, 101];
                window.lastMegaFetch = now;
            }

            let minDist = 999;
            let nearestId = null;
            for (const megaId of window.megaPortsMap) {
                const d = (megaId === sectorId) ? 0 : Math.abs(megaId - sectorId) % 20;
                if (d < minDist) {
                    minDist = d;
                    nearestId = megaId;
                }
            }
            
            window.lastKnownDistToMega = minDist;
            window.lastNearestMegaId = nearestId;
            // Update UI immediately
            const mEl = document.getElementById('val-mega'); 
            if (mEl) {
                const col = minDist <= 5 ? '#22c55e' : (minDist <= 12 ? '#f59e0b' : '#ff4444');
                mEl.innerText = `${minDist} HOPS (${nearestId})`;
                mEl.style.color = col;
                mEl.style.textShadow = `0 0 8px ${col}44`;
            }
        } finally {
            window.isUpdatingMegaDist = false;
        }
    }

    async function reportToWebhook() {
        if (!CONFIG.webhookUrl || !CONFIG.webhookUrl.startsWith('http')) return;
        
        try {
            const data = refreshLiveData();
            if (!data) return;
            
            let distToMega = (window.lastKnownDistToMega !== undefined) ? window.lastKnownDistToMega : null;
            const mEl = document.getElementById('val-mega'); 
            if (mEl) {
                const idSuffix = window.lastNearestMegaId !== undefined ? ` (${window.lastNearestMegaId})` : '';
                const col = distToMega <= 5 ? '#22c55e' : (distToMega <= 12 ? '#f59e0b' : '#ff4444');
                mEl.innerText = distToMega !== null ? `${distToMega} HOPS${idSuffix}` : 'SEARCHING...';
                if (distToMega !== null) {
                    mEl.style.color = col;
                    mEl.style.textShadow = `0 0 8px ${col}44`;
                }
            }

            let rankWealth = "N/A", rankTrading = "N/A", rankExploration = "N/A", totalWealth = "0";

            try {
                const lbResponse = await fetch('https://api.gradient-bang.com/functions/v1/leaderboard_resources');
                const lbData = await lbResponse.json();
                if (lbData.success) {
                    const findR = (arr, field) => {
                        const list = (arr || []).filter(p => p.player_type === 'human').sort((a, b) => (b[field] || 0) - (a[field] || 0));
                        const idx = list.findIndex(p => p.player_name?.trim().toUpperCase() === CONFIG.charName.trim().toUpperCase());
                        return idx !== -1 ? `#${idx + 1}` : "N/A";
                    };
                    rankWealth = findR(lbData.wealth, 'total_wealth');
                    rankTrading = findR(lbData.trading, 'total_trades');
                    rankExploration = findR(lbData.exploration, 'sectors_visited');
                    const myWealth = lbData.wealth?.find(p => p.player_name?.trim().toUpperCase() === CONFIG.charName.trim().toUpperCase());
                    if (myWealth) totalWealth = myWealth.total_wealth.toLocaleString();
                    window.lastRanks = { w: rankWealth, t: rankTrading, e: rankExploration };
                }
            } catch (lbErr) { log('Leaderboard fetch failed: ' + lbErr.message); }

            const rEl = document.getElementById('val-ranks');
            if (rEl) rEl.innerText = `${rankWealth} / ${rankTrading} / ${rankExploration}`;

            const payload = {
                charName: CONFIG.charName,
                isPilotEnabled: CONFIG.isPilotEnabled ? 1 : 0,
                bank: data.bank,
                onHand: data.onHand,
                fuel: data.fuel,
                currentSector: data.currentSector,
                distToMega,
                nearestMegaId: window.lastNearestMegaId,
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
    }

    function schedule(ms) { clearTimeout(window.gbTimeout); window.gbTimeout = setTimeout(automate, ms); }
    const bootstrap = () => { 
        if (document.body) { 
            initUI(); schedule(2000); 
            refreshLiveData(); // Immediate refresh
            setInterval(refreshLiveData, 5000); 
            if (CONFIG.webhookUrl) {
                setTimeout(reportToWebhook, 5000); // Early first sync
                setInterval(reportToWebhook, CONFIG.webhookInterval || 60000);
            }
        } else { setTimeout(bootstrap, 500); } 
    };
    bootstrap();

    setInterval(() => {
        if (isConfigReady()) {
            log('Periodic session refresh triggered.');
            location.reload();
        }
    }, CONFIG.refreshInterval);
})();
