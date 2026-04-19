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
        safetyProtocol: "Cancel current mission, return to nearest mega-port and refill fuel",
        fuelThreshold: 40,
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

    // Always reset uptime on fresh load/refresh per user request
    localStorage.removeItem('gb_ap_start_time');

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
        #gb-tactical-panel { 
            position: fixed; left: 0; top: 48px; z-index: 99999; display: flex; align-items: flex-start; font-family: 'Consolas', 'Roboto Mono', monospace; transition: transform 0.4s; 
            --gb-accent: #666; /* Default Offline Gray */
            --gb-accent-glow: rgba(100, 100, 100, 0.2);
        }
        #gb-tactical-panel.gb-standby {
            --gb-accent: #f59e0b; /* Standby Orange */
            --gb-accent-glow: rgba(245, 158, 11, 0.4);
        }
        #gb-tactical-panel.gb-active {
            --gb-accent: #22c55e; /* Active Green */
            --gb-accent-glow: rgba(34, 197, 94, 0.4);
        }

        #gb-tactical-panel.collapsed { transform: translateX(-320px); }
        #gb-content { width: 320px; max-height: calc(100vh - 60px); display: flex; flex-direction: column; background: rgba(8,8,8,0.98); border: 1px solid var(--gb-accent); border-left: none; color: #eee; padding: 20px; backdrop-filter: blur(12px); box-shadow: 10px 0 30px rgba(0,0,0,0.5); transition: border-color 0.3s; }
        #gb-toggle { background: var(--gb-accent); color: #000; padding: 24px 8px; cursor: pointer; writing-mode: vertical-lr; text-transform: uppercase; font-size: 10px; font-weight: 900; letter-spacing: 1px; border-radius: 0 4px 4px 0; transition: background 0.3s; }
        
        #gb-tactical-panel.gb-off #gb-toggle { background: #666 !important; }
        #gb-tactical-panel.gb-off #gb-content { border-color: #444 !important; }
        #gb-tactical-panel.gb-off .gb-header { border-bottom-color: #444 !important; }
        #gb-tactical-panel.gb-off .gb-header h2 { color: #666 !important; }
        #gb-tactical-panel.gb-off .gb-label { color: #666 !important; }
        #gb-tactical-panel.gb-off .gb-stat-value { color: #888 !important; text-shadow: none !important; }
        #gb-tactical-panel.gb-off .gb-telemetry::before { background: #666 !important; box-shadow: none !important; }

        .gb-header { border-bottom: 2px solid var(--gb-accent); margin-bottom: 20px; padding-bottom: 8px; transition: border-color 0.3s; }
        .gb-header h2 { margin: 0; font-size: 15px; color: var(--gb-accent); letter-spacing: 1px; transition: color 0.3s; }

        .gb-label { font-size: 10px; color: var(--gb-accent); text-transform: uppercase; margin-bottom: 6px; display: block; font-weight: 800; opacity: 0.9; margin-top: 14px; letter-spacing: 1px; transition: color 0.3s; }
        .gb-label:first-child { margin-top: 0; }
        
        .gb-input { width: 100%; background: #000; border: 1px solid #222; color: #fff; padding: 10px; font-size: 12px; box-sizing: border-box; font-family: inherit; transition: border-color 0.2s; border-radius: 2px; }
        .gb-input:focus { border-color: var(--gb-accent); outline: none; box-shadow: 0 0 10px var(--gb-accent-glow); }
        
        .gb-telemetry { background: #050505; border: 1px solid #1a1a1a; padding: 18px; margin-bottom: 20px; position: relative; border-radius: 4px; box-shadow: inset 0 0 20px rgba(0,0,0,0.8); }
        .gb-telemetry::before { content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: var(--gb-accent); box-shadow: 0 0 10px var(--gb-accent); opacity: 0.6; transition: background 0.3s, box-shadow 0.3s; }
        
        .gb-stat-row { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 11px; padding-bottom: 6px; border-bottom: 1px dashed rgba(255,255,255,0.05); }
        .gb-stat-row:last-child { border-bottom: none; }
        .gb-stat-label { color: #777; text-transform: uppercase; font-weight: bold; font-size: 9px; letter-spacing: 0.5px; display: flex; align-items: center; }
        .gb-prefix-icon { color: var(--gb-accent); opacity: 0.5; transition: color 0.3s; }
        .gb-stat-value { color: var(--gb-accent); text-align: right; font-weight: 900; text-shadow: 0 0 10px var(--gb-accent-glow); font-family: 'Consolas', monospace; transition: color 0.3s, text-shadow 0.3s; }

        .btn-group { display: flex; gap: 8px; margin-top: 15px; }
        .gb-btn { background: var(--gb-accent); color: #000; border: none; padding: 12px; font-weight: 950; text-transform: uppercase; cursor: pointer; flex: 1; font-size: 11px; transition: opacity 0.2s, background 0.3s; }
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

        .gb-rank-gold { color: #fbbf24 !important; text-shadow: 0 0 10px rgba(251, 191, 36, 0.4) !important; font-weight: 900; }
        .gb-rank-cyan { color: #22d3ee !important; text-shadow: 0 0 10px rgba(34, 211, 238, 0.4) !important; font-weight: 800; }
        .gb-rank-purple { color: #a78bfa !important; text-shadow: 0 0 10px rgba(167, 139, 250, 0.4) !important; }
        .gb-rank-green { color: #4ade80 !important; text-shadow: 0 0 10px rgba(74, 222, 128, 0.3) !important; }
        .gb-rank-gray { color: #6b7280 !important; text-shadow: none !important; opacity: 0.8; }
        .gb-warning { background: rgba(68, 17, 17, 0.4); border: 1px solid #ff4444; color: #ff4444; padding: 10px; font-size: 10px; margin-top: 10px; border-radius: 4px; display: none; }
        .gb-warning.active { display: block; animation: pulse-red 2s infinite; }
        @keyframes pulse-red { 
            0% { border-color: #ff4444; box-shadow: 0 0 5px rgba(255, 68, 68, 0.2); }
            50% { border-color: #ff8888; box-shadow: 0 0 15px rgba(255, 68, 68, 0.5); }
            100% { border-color: #ff4444; box-shadow: 0 0 5px rgba(255, 68, 68, 0.2); }
        }
        .gb-btn-set { background: #333; color: #fff; border: 1px solid #444; padding: 2px 8px; font-size: 9px; cursor: pointer; border-radius: 2px; }
        .gb-btn-set:hover { background: #444; border-color: #666; }
        .gb-label-red { color: #ff4444 !important; }
        
        /* Premium Safety Zone */
        .gb-safety-zone { 
            background: rgba(255, 68, 68, 0.04); 
            border: 1px solid rgba(255, 68, 68, 0.1); 
            padding: 15px; 
            border-radius: 8px; 
            margin: 15px 0;
            position: relative;
            box-shadow: inset 0 0 20px rgba(255, 68, 68, 0.02);
        }
        .gb-safety-zone::after {
            content: 'SAFETY_SYSTEM_ENGAGED';
            position: absolute;
            bottom: 4px;
            right: 8px;
            font-size: 6.5px;
            color: rgba(255, 68, 68, 0.3);
            font-weight: 900;
            letter-spacing: 1px;
        }
        
        .gb-input-red { border-color: rgba(255, 68, 68, 0.4) !important; color: #ff8888 !important; background: rgba(255, 68, 68, 0.05) !important; }
        .gb-input-red:focus { border-color: #ff4444 !important; box-shadow: 0 0 12px rgba(255, 68, 68, 0.15) !important; }

        .gb-label-modified { color: #ff4444 !important; text-shadow: 0 0 8px rgba(255, 68, 68, 0.3) !important; }

        .gb-btn-set-green {
            background: rgba(34, 197, 94, 0.1) !important;
            border: 1px solid rgba(34, 197, 94, 0.5) !important;
            color: #22c55e !important;
            text-shadow: 0 0 5px rgba(34, 197, 94, 0.2);
            transition: all 0.2s !important;
        }
        .gb-btn-set-green:hover:not(.disabled) {
            border-color: #22c55e !important;
            box-shadow: 0 0 10px rgba(34, 197, 94, 0.3);
            background: rgba(34, 197, 94, 0.2) !important;
        }
        .gb-btn-set-green.disabled {
            opacity: 0.3;
            pointer-events: none;
            filter: grayscale(1);
            border-color: #444 !important;
        }

        /* Premium Tactical Slider */
        .gb-slider-container {
            position: relative;
            width: 100%;
            height: 32px;
            display: grid;
            align-items: center;
            margin: 10px 0;
        }
        .gb-slider-track-bg {
            grid-area: 1/1;
            width: 100%;
            height: 2px;
            background: rgba(255,255,255,0.08);
            border-radius: 1px;
            z-index: 1;
        }
        .gb-slider-track-fill {
            grid-area: 1/1;
            height: 2px;
            background: #ff4444;
            border-radius: 1px;
            z-index: 2;
            pointer-events: none;
            transition: background 0.3s;
        }
        .gb-slider-native {
            grid-area: 1/1;
            width: 100%;
            height: 32px;
            background: transparent !important;
            z-index: 3;
            -webkit-appearance: none;
            margin: 0 !important;
            cursor: pointer;
            outline: none;
        }
        .gb-slider-native::-webkit-slider-runnable-track { background: transparent; border: none; }
        .gb-slider-native::-webkit-slider-thumb { 
            -webkit-appearance: none; 
            width: 14px; 
            height: 14px; 
            background: var(--thumb-color, #444); 
            border-radius: 50%; 
            cursor: pointer; 
            transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
            box-shadow: 0 0 12px var(--thumb-color, transparent);
            border: none;
            margin-top: 0;
            position: relative;
            top: 0;
        }
        .gb-slider-native::-webkit-slider-thumb:hover { transform: scale(1.2); box-shadow: 0 0 18px var(--thumb-color, transparent); }
        
        /* Uptime Styles */
        .gb-uptime-row { position: relative; }
        .gb-reset-btn { 
            font-size: 8px; 
            color: #666; 
            cursor: pointer; 
            margin-left: 6px; 
            transition: color 0.2s; 
            text-decoration: underline;
            vertical-align: middle;
        }
        .gb-reset-btn:hover { color: #ff4444; }

        /* Financial Bridge Orange Theme */
        #gb-financial-bridge {
            border-top: 1px solid rgba(245, 158, 11, 0.1);
            margin-top: 5px;
            padding-top: 15px;
            margin-bottom: 15px;
        }
        .gb-bridge-btn { background: #f59e0b !important; color: #000 !important; font-weight: 950 !important; }
        .gb-bridge-btn-sec { background: transparent !important; color: #f59e0b !important; border: 1px solid rgba(245, 158, 11, 0.4) !important; }
        .gb-bridge-btn-sec:hover { background: rgba(245, 158, 11, 0.05) !important; border-color: #f59e0b !important; }
    `;

    function formatDuration(ms) {
        if (!ms || ms < 0) return "0s";
        const totalSecs = Math.floor(ms / 1000);
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        let res = "";
        if (h > 0) res += `${h}h `;
        if (m > 0 || h > 0) res += `${m}m `;
        res += `${s}s`;
        return res;
    }

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
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>TOTAL_WEALTH</span><span id="val-tw" class="gb-stat-value">0</span></div>
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>LOC_SECTOR</span><span id="val-sector" class="gb-stat-value">UNKNOWN</span></div>
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>MEGA_PROXIMITY</span><span id="val-mega" class="gb-stat-value">INF</span></div>
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>FUEL_CAPACITY</span><span id="val-fuel" class="gb-stat-value">--/--</span></div>
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>FUEL_CONSUMPTION</span><span id="val-fuel-cost" class="gb-stat-value">-- / HOP</span></div>
                        <div class="gb-stat-row"><span class="gb-stat-label"><span class="gb-prefix gb-prefix-icon">::</span>RUN_TIME</span><span class="gb-stat-value"><span id="val-uptime">0s</span><span id="gb-reset-uptime" class="gb-reset-btn" title="RESET_TIMER">RESET</span></span></div>
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
                    <textarea id="cfg-cmd" class="gb-input" style="height: 105px; resize: none;">${CONFIG.pilotProtocol}</textarea>

                    <!-- Financial Bridge Section -->
                    <div id="gb-financial-bridge">
                        <span class="gb-label" style="color: #f59e0b; margin-top: 20px; display: flex; align-items: center; gap: 6px;">
                            <span style="opacity: 0.5;">::</span> FINANCIAL_BRIDGE
                        </span>
                        <input type="number" id="bank-amount" class="gb-input" style="margin-top: 8px; border-color: rgba(245, 158, 11, 0.2); height: 32px;" placeholder="ENTER AMOUNT...">
                        <div class="btn-group" style="margin-top: 10px; gap: 6px;">
                            <button id="btn-deposit" class="gb-btn gb-bridge-btn" title="SHORT: Deposit amount | LONG: Deposit ALL">DEPOSIT</button>
                            <button id="btn-withdraw" class="gb-btn gb-bridge-btn" title="SHORT: Withdraw amount | LONG: Withdraw ALL">WITHDRAW</button>
                        </div>
                    </div>

                    <div class="gb-safety-zone" id="safety-config-zone">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
                            <span class="gb-label" id="label-safety-threshold" style="margin: 0; display: flex; align-items: center;">SAFETY_THRESHOLD</span>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span id="fuel-pct-display" style="font-size: 11px; color: #777; font-weight: 950; min-width: 35px; text-align: right; line-height: 1;">${CONFIG.fuelThreshold}%</span>
                                <button id="set-fuel-pct" class="gb-btn-set gb-btn-set-green disabled">SET</button>
                            </div>
                        </div>
                        <div class="gb-slider-container">
                            <div class="gb-slider-track-bg"></div>
                            <div id="slider-fill" class="gb-slider-track-fill"></div>
                            <input type="range" id="cfg-fuel-threshold" class="gb-slider-native" min="10" max="90" value="${CONFIG.fuelThreshold}">
                        </div>
                        <div id="safety-warning" class="gb-warning" style="margin-bottom: 15px;"></div>

                        <span class="gb-label" id="label-safety-protocol">SAFETY_PROTOCOL</span>
                        <textarea id="cfg-safety-cmd" class="gb-input" style="height: 105px; resize: none; font-size: 11px; line-height: 1.5; font-weight: 400; margin-bottom: 2px; padding: 10px;">${CONFIG.safetyProtocol}</textarea>
                    </div>
                    
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
            
            // Reset uptime if toggled OFF
            if (!newState) {
                localStorage.removeItem('gb_ap_start_time');
            }

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
                safetyProtocol: document.getElementById('cfg-safety-cmd').value,
                fuelThreshold: parseInt(document.getElementById('cfg-fuel-threshold').value),
                idleInterval: parseInt(document.getElementById('cfg-idle').value) * 1000,
                refreshInterval: parseInt(document.getElementById('cfg-refresh').value) * 60000,
                loginGraceMs: parseInt(document.getElementById('cfg-grace').value) * 1000,
                webhookUrl: document.getElementById('cfg-webhook').value,
                webhookInterval: parseInt(document.getElementById('cfg-webhook-int').value) * 1000
            });
            localStorage.removeItem('gb_ap_start_time');
            location.reload();
        };

        const setBtn = document.getElementById('set-fuel-pct');
        const pctSlider = document.getElementById('cfg-fuel-threshold');
        const pctDisplay = document.getElementById('fuel-pct-display');
        const sliderFill = document.getElementById('slider-fill');
        const cmdInput = document.getElementById('cfg-safety-cmd');
        const labelThreshold = document.getElementById('label-safety-threshold');
        const labelProtocol = document.getElementById('label-safety-protocol');
        
        const updateSafetyUIState = () => {
            const val = parseInt(pctSlider.value);
            const protocol = cmdInput.value;
            const changedThreshold = val !== CONFIG.fuelThreshold;
            const changedProtocol = protocol !== CONFIG.safetyProtocol;

            // Update Label / Input Styles
            labelThreshold.classList.toggle('gb-label-modified', changedThreshold);
            labelProtocol.classList.toggle('gb-label-modified', changedProtocol);
            cmdInput.classList.toggle('gb-input-red', changedProtocol);
            
            // Enable/Disable SET button
            setBtn.classList.toggle('disabled', !changedThreshold && !changedProtocol);

            // Update Slider Color & Fill Logic (Always active, not grey)
            const h = (val - 10) * (120 / 80);
            const color = `hsl(${h}, 80%, 50%)`;
            
            // Calculate precise fill width
            const pct = (val - 10) / 80 * 100;
            if (sliderFill) {
                sliderFill.style.width = `${pct}%`;
                sliderFill.style.background = color;
                sliderFill.style.boxShadow = `0 0 10px ${color}33`;
            }
            
            pctSlider.style.setProperty('--thumb-color', color);
            pctDisplay.style.color = color;
            pctDisplay.style.textShadow = `0 0 8px ${color}66`;
        };

        if (pctSlider && pctDisplay && cmdInput) {
            updateSafetyUIState();
            pctSlider.oninput = () => {
                pctDisplay.innerText = `${pctSlider.value}%`;
                updateSafetyUIState();
            };
            cmdInput.oninput = updateSafetyUIState;
        }

        if (setBtn && pctSlider) {
            setBtn.onclick = () => {
                const val = parseInt(pctSlider.value);
                const protocol = cmdInput.value;
                saveConfig({ fuelThreshold: val, safetyProtocol: protocol });
                setBtn.innerText = 'SAVED';
                setBtn.classList.add('disabled');
                setTimeout(() => { 
                    setBtn.innerText = 'SET';
                    updateSafetyUIState();
                }, 2000);
                log(`Safety configuration updated.`);
            };
        }
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

        // Apply initial state
        if (isConfigReady()) {
            const hasGame = !!document.querySelector('canvas');
            panel.classList.toggle('gb-standby', hasGame);
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

        const resetBtn = panel.querySelector('#gb-reset-uptime');
        if (resetBtn) {
            resetBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Reset Auto-Pilot Run Timer?')) {
                    localStorage.removeItem('gb_ap_start_time');
                    if (CONFIG.isPilotEnabled) localStorage.setItem('gb_ap_start_time', Date.now().toString());
                    log('AP Run Timer reset.');
                }
            };
        }

        // 6. Financial Bridge Handlers
        const amtInput = panel.querySelector('#bank-amount');
        
        const executeBanking = (type, isAll = false) => {
            // 1. Proximity Check
            if (window.lastKnownDistToMega !== 0) {
                const dist = window.lastKnownDistToMega || 'INF';
                alert(`⚠️ TACTICAL_ERROR: Mega-port proximity required for banking.\nCurrent distance: ${dist} HOPS.`);
                log(`ERR: Banking blocked. Not at mega-port.`);
                return;
            }

            let amount = "";
            if (isAll) {
                const sourceId = type === 'deposit' ? 'val-hand' : 'val-bank';
                const sourceEl = document.getElementById(sourceId);
                amount = sourceEl ? sourceEl.innerText.replace(/,/g, '').split('.')[0] : "0";
                if (amount === "N/A" || amount === "0") {
                    log(`ERR: No ${type}able balance detected.`);
                    return;
                }
            } else {
                amount = amtInput.value.trim();
                if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
                    amtInput.style.borderColor = "#ff4444";
                    setTimeout(() => { amtInput.style.borderColor = ""; }, 2000);
                    log(`ERR: Invalid transaction amount.`);
                    return;
                }
            }

            dispatchCommand(`bank ${type} ${amount}`);
        };

        const bindSmartBanking = (btnId, type) => {
            const btn = panel.querySelector(btnId);
            if (!btn) return;

            let timer;
            let longPressed = false;

            btn.onmousedown = (e) => {
                longPressed = false;
                timer = setTimeout(() => {
                    longPressed = true;
                    log(`ACTION: Long-press detected for ${type.toUpperCase()}_MAX`);
                    executeBanking(type, true);
                }, 750);
            };

            btn.onmouseup = (e) => {
                clearTimeout(timer);
                if (!longPressed) {
                    executeBanking(type, false);
                }
            };

            btn.onmouseleave = () => clearTimeout(timer);
            // Support touch
            btn.ontouchstart = btn.onmousedown;
            btn.ontouchend = btn.onmouseup;
        };

        bindSmartBanking('#btn-deposit', 'deposit');
        bindSmartBanking('#btn-withdraw', 'withdraw');
    }

    // 4. Improved State Synchronization
    function dispatchCommand(cmd) {
        if (!cmd) return;
        const chatInput = document.querySelector('input[placeholder="Enter command"]');
        if (!chatInput) { log('ERR: COMMAND_PORT_NOT_FOUND'); return; }
        
        syncValue(chatInput, cmd);
        setTimeout(() => {
            const btn = chatInput.closest('div').querySelector('button');
            if (btn) {
                btn.click();
                log(`DISPATCH: ${cmd}`);
            }
        }, 600);
    }

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
            window.firstSyncDone = false; // Reset on login screen
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

        // --- SAFETY MECHANISM (Highest Priority) ---
        const stats = refreshLiveData();
        if (stats && stats.fuelPct !== undefined && stats.fuelPct < (CONFIG.fuelThreshold || 0)) {
            if (!window.safetyTriggered) {
                log(`CRITICAL_SENSE: Fuel at ${stats.fuelPct.toFixed(1)}%. Initiating Safety Protocol...`);
                dispatchCommand(CONFIG.safetyProtocol);
                window.safetyTriggered = true;
            }
            return true; // Occupied by safety
        }
        if (stats && stats.fuelPct > (CONFIG.fuelThreshold || 0) + 5) {
            window.safetyTriggered = false; // Reset safety when fuel is safe
        }
        // -------------------------------------------

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
            dispatchCommand(CONFIG.pilotProtocol);
            window.pilotStarted = true;
            setTimeout(() => { window.pilotStarted = false; }, 30000);
            return false;
        }
        return isWorking;
    }

    function refreshLiveData() {
        try {
            let bank = "N/A", onHand = "N/A", fuel = "N/A";
            document.querySelectorAll('div[data-tutorial="credits"]').forEach(el => {
                const p = getPropsFromFiber(el, ['balance', 'label']);
                if (p?.label === 'Bank') bank = p.balance; if (p?.label === 'On Hand') onHand = p.balance;
            });

            const fuelBadgeEl = document.getElementById('ship-fuel')?.querySelector('div, span');
            if (fuelBadgeEl) {
                const p = getPropsFromFiber(fuelBadgeEl, ['value', 'maxValue']);
                if (p) fuel = `${p.value}/${p.maxValue}`;
            }

            if (fuel === "N/A") {
                const fuelTitle = [...document.querySelectorAll('span')].find(el => el.innerText === 'Fuel');
                if (fuelTitle) {
                    const p = getPropsFromFiber(fuelTitle, ['value', 'maxValue']);
                    if (p) fuel = `${p.value}/${p.maxValue}`;
                }
            }
            
            // 1. Aggressive Data Extraction First
            let currentSector = null;
            let fuelCur = 0, fuelMax = 0, fuelPct = 100;

            // --- Sector Detection (with fallbacks) ---
            const sectorNodes = [...document.querySelectorAll('div, span, button')].filter(el => /Sector\s*\d+/i.test(el.innerText));
            for (const n of sectorNodes) {
                const m = n.innerText.match(/Sector\s*(\d+)/i);
                if (m) { currentSector = parseInt(m[1]); break; }
            }
            if (currentSector === null) {
                const labels = [...document.querySelectorAll('div, span')].filter(el => el.innerText.trim().toUpperCase() === 'SECTOR');
                for (const l of labels) {
                    const val = l.parentElement?.innerText.match(/\d+/) || l.querySelector('span')?.innerText.match(/\d+/);
                    if (val) { currentSector = parseInt(val[0]); break; }
                }
            }
            if (currentSector === null) {
                const canvas = document.querySelector('canvas');
                if (canvas) {
                    const p = getPropsFromFiber(canvas, ['current_sector_id']);
                    if (p && p.current_sector_id !== undefined) currentSector = p.current_sector_id;
                }
            }

            // --- Fuel Detection ---
            if (fuel !== "N/A") {
                const [cur, tot] = fuel.split('/').map(n => parseFloat(n.replace(/,/g,'')));
                fuelCur = cur; fuelMax = tot;
                if (!isNaN(cur) && !isNaN(tot)) fuelPct = (cur / tot) * 100;
            }

            // 2. Static Siphon Telemetry (Harden search logic)
            if (window.lastFuelPerStep === undefined || window.lastFuelPerStep <= 0) {
                const shipElements = [
                    document.getElementById('ship-status'),
                    document.getElementById('ship-fuel')?.querySelector('div, span'),
                    document.querySelector('canvas'), 
                    ...document.querySelectorAll('div[role="button"]')
                ];

                const fields = ['turns_per_warp', 'turnsPerWarp', 'consumption', 'warp_cost', 'warp_consumption', 'warpConsumption'];
                
                for (const el of shipElements) {
                    if (!el) continue;
                    const props = getPropsFromFiber(el);
                    if (!props) continue;
                    
                    const findInObj = (obj, targetFields, depth = 0) => {
                        if (!obj || depth > 5) return null;
                        for (const f of targetFields) {
                            if (obj[f] !== undefined && !isNaN(obj[f]) && obj[f] > 0) return obj[f];
                        }
                        for (const key in obj) {
                            if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                                const res = findInObj(obj[key], targetFields, depth + 1);
                                if (res) return res;
                            }
                        }
                        return null;
                    };

                    const staticVal = findInObj(props, fields);
                    if (staticVal) {
                        const val = parseFloat(staticVal);
                        if (val > 0) {
                            window.lastFuelPerStep = val;
                            localStorage.setItem('gb_last_fuel_per_step', val.toString());
                            log(`System: Static fuel consumption detected: ${val}/HOP`);
                            break;
                        }
                    }
                }
                
                // Fallbacks: Atlas Hauler & Persistence
                if (window.lastFuelPerStep === undefined || window.lastFuelPerStep <= 0) {
                    if ([...document.querySelectorAll('span, p')].some(el => el.innerText.includes('Atlas Hauler'))) {
                        window.lastFuelPerStep = 4;
                        localStorage.setItem('gb_last_fuel_per_step', "4");
                    } else {
                        const savedFC = localStorage.getItem('gb_last_fuel_per_step');
                        if (savedFC) window.lastFuelPerStep = parseFloat(savedFC);
                    }
                }
            }

            // 3. Movement-based Calculation (The backup)
            if (window.lastKnownSector !== undefined && currentSector !== null && window.lastKnownSector !== currentSector) {
                if (window.lastKnownFuel !== undefined && fuelCur < window.lastKnownFuel) {
                    const diff = window.lastKnownFuel - fuelCur;
                    const dist = Math.abs(currentSector - window.lastKnownSector);
                    if (dist > 0 && dist < 100) { // Safety check for teleport bugs
                        const calculated = diff / dist;
                        if (calculated > 0) {
                            window.lastFuelPerStep = calculated;
                            localStorage.setItem('gb_last_fuel_per_step', calculated.toString());
                        }
                    }
                }
            }
            window.lastKnownSector = currentSector;
            window.lastKnownFuel = fuelCur;

            // 4. UI Rendering
            const sEl = document.getElementById('val-sector'); if (sEl) sEl.innerText = currentSector !== null ? currentSector : 'UNKNOWN';
            const bEl = document.getElementById('val-bank'); if (bEl) bEl.innerText = bank;
            const hEl = document.getElementById('val-hand'); if (hEl) hEl.innerText = onHand;
            const fEl = document.getElementById('val-fuel'); 
            const fcEl = document.getElementById('val-fuel-cost');
            const warnEl = document.getElementById('safety-warning');

            if (fcEl) {
                const displayVal = (window.lastFuelPerStep && window.lastFuelPerStep > 0) ? parseFloat(window.lastFuelPerStep.toFixed(2)) : '--';
                fcEl.innerText = `${displayVal} / HOP`;
            }

            // Proximity Update
            if (currentSector !== null) {
                updateMegaPortDistance(currentSector);
                const mEl = document.getElementById('val-mega'); 
                if (mEl && window.lastKnownDistToMega !== undefined) {
                    const idSuffix = window.lastNearestMegaId !== undefined ? ` (${window.lastNearestMegaId})` : '';
                    const dist = window.lastKnownDistToMega;
                    const color = (window.lastFuelPerStep && window.lastFuelPerStep > 0) ? 
                        (dist * window.lastFuelPerStep + 5 > fuelPct ? '#ef4444' : (dist * window.lastFuelPerStep + 15 > fuelPct ? '#f59e0b' : '#22c55e'))
                        : '#777';
                    mEl.style.color = color;
                    mEl.innerText = `${dist} HOP${dist !== 1 ? 'S' : ''}${idSuffix}`;
                }
            }

            if (fEl) {
                fEl.innerText = fuel;
                fEl.style.color = (fuelPct < (CONFIG.fuelThreshold || 10) + 5) ? '#ef4444' : (fuelPct < (CONFIG.fuelThreshold || 10) + 15 ? '#f59e0b' : '#22c55e');
            }

            // Warning Logic
            if (warnEl && window.lastKnownDistToMega !== undefined && window.lastFuelPerStep && window.lastFuelPerStep > 0) {
                const needed = window.lastKnownDistToMega * window.lastFuelPerStep;
                const minSafePct = ((needed / (fuelMax || 1)) * 100) + 5;
                if (CONFIG.fuelThreshold < minSafePct) {
                    warnEl.innerHTML = `⚠️ THRESHOLD TOO LOW<br>Need ~${needed.toFixed(1)} fuel to reach Mega (${minSafePct.toFixed(1)}%).<br>Suggested: ${Math.ceil(minSafePct)}%`;
                    warnEl.classList.add('active');
                } else {
                    warnEl.classList.remove('active');
                }
            }
            // End of Telemetry Processing

            const dotEl = document.getElementById('gb-status-dot');
            const headerEl = document.getElementById('gb-telemetry-header');
            
            if (dotEl) {
                if (window.lastWebhookError) {
                    dotEl.style.color = '#ff4444';
                } else {
                    const isInGame = !!document.querySelector('canvas');
                    const isSynced = isInGame && isConfigReady() && bank !== 'N/A' && fuel !== 'N/A';
                    const panel = document.getElementById('gb-tactical-panel');
                    if (panel) {
                        panel.classList.toggle('gb-active', isSynced);
                        // Standby (Orange) only if in game but not synced
                        panel.classList.toggle('gb-standby', isInGame && !isSynced);
                    }
                    
                    if (isSynced) {
                        dotEl.style.color = '#22c55e';
                        // Trigger immediate first sync upon successful data capture
                        if (!window.firstSyncDone) {
                            window.firstSyncDone = true;
                            reportToWebhook();
                        }
                    }
                    else if (isInGame) dotEl.style.color = '#f59e0b';
                    else dotEl.style.color = '#666';
                }
            }

            if (headerEl) {
                const syncMsg = window.lastWebhookError ? `REMOTE_SYNC_ERROR :: ${window.lastWebhookError}` : `REMOTE_SYNC :: OK`;
                headerEl.title = `LOCAL_SENSE :: ${new Date().toLocaleTimeString()}\n${syncMsg}`;
            }

            // Auto-detect charName if still at default
            if (CONFIG.charName === 'your_character_name' || !CONFIG.charName) {
                // Try to find character name from game UI (usually in a specific span or profile header)
                const charEl = [...document.querySelectorAll('span, div')].find(el => el.innerText?.includes('HearSilent') || (el.classList.contains('pilot-name') && el.innerText));
                if (charEl) {
                    const detected = charEl.innerText.trim();
                    if (detected && detected !== 'PILOT') {
                        CONFIG.charName = detected;
                        saveConfig(CONFIG);
                        log(`System identity auto-detected: ${detected}`);
                        const charInput = document.getElementById('cfg-char');
                        if (charInput) charInput.value = detected;
                    }
                }
            }

            // Update Uptime (Live ticker handled separately, but we update the storage value here)
            if (CONFIG.isPilotEnabled) {
                let startTime = localStorage.getItem('gb_ap_start_time');
                if (!startTime) {
                    startTime = Date.now().toString();
                    localStorage.setItem('gb_ap_start_time', startTime);
                }
                const uptimeMs = Date.now() - parseInt(startTime);
                window.currentApUptime = Math.floor(uptimeMs / 1000);
            } else {
                window.currentApUptime = 0;
            }

            return { bank, onHand, fuel, currentSector, fuelPct };
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
            const ranks = window.lastRanks || { w: "N/A", t: "N/A", e: "N/A", tw: "0" };
            history.push({ 
                t: new Date().toLocaleString(), 
                b: stats.bank, 
                h: stats.onHand, 
                tw: ranks.tw,
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

    const getRankDisplay = (rank) => {
        if (!rank || rank === 'N/A') return `<span class="gb-rank-gray">N/A</span>`;
        const val = parseInt(rank.replace('#', ''));
        if (isNaN(val)) return `<span class="gb-rank-gray">${rank}</span>`;
        if (val > 500) return `<span class="gb-rank-gray">#${val}</span>`;
        
        let cls = 'gb-rank-gray';
        let icon = '';
        if (val === 1) { cls = 'gb-rank-gold'; icon = '👑 '; }
        else if (val <= 10) { cls = 'gb-rank-cyan'; }
        else if (val <= 100) { cls = 'gb-rank-purple'; }
        else if (val <= 500) { cls = 'gb-rank-green'; }
        
        return `<span class="${cls}">${icon}#${val}</span>`;
    };

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
                let col = '#ff4444';
                const fEl = document.getElementById('val-fuel');
                let fMax = 0;
                if (fEl && fEl.innerText.includes('/')) fMax = parseFloat(fEl.innerText.split('/')[1].replace(/,/g,''));

                if (window.lastFuelPerStep && fMax) {
                    const neededPct = (minDist * window.lastFuelPerStep / fMax) * 100;
                    const buffer = 5;
                    if (neededPct + buffer < CONFIG.fuelThreshold) col = '#22c55e';
                    else if (neededPct < CONFIG.fuelThreshold) col = '#f59e0b';
                } else {
                    col = minDist <= 5 ? '#22c55e' : (minDist <= 12 ? '#f59e0b' : '#ff4444');
                }
                
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
            const fuelEl = document.getElementById('val-fuel');
            let fuelMax = 0;
            if (fuelEl && fuelEl.innerText.includes('/')) fuelMax = parseFloat(fuelEl.innerText.split('/')[1].replace(/,/g,''));

            if (mEl) {
                const idSuffix = window.lastNearestMegaId !== undefined ? ` (${window.lastNearestMegaId})` : '';
                let col = '#ff4444';
                if (distToMega !== null && window.lastFuelPerStep && fuelMax) {
                    const neededPct = (distToMega * window.lastFuelPerStep / fuelMax) * 100;
                    const buffer = 5;
                    if (neededPct + buffer < (CONFIG.fuelThreshold || 40)) col = '#22c55e';
                    else if (neededPct < (CONFIG.fuelThreshold || 40)) col = '#f59e0b';
                } else if (distToMega !== null) {
                    col = distToMega <= 5 ? '#22c55e' : (distToMega <= 12 ? '#f59e0b' : '#ff4444');
                }

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
                    window.lastRanks = { w: rankWealth, t: rankTrading, e: rankExploration, tw: totalWealth };
                }
            } catch (lbErr) { log('Leaderboard fetch failed: ' + lbErr.message); }

            const rEl = document.getElementById('val-ranks');
            if (rEl) {
                rEl.innerHTML = `${getRankDisplay(rankWealth)} / ${getRankDisplay(rankTrading)} / ${getRankDisplay(rankExploration)}`;
            }
            const twEl = document.getElementById('val-tw');
            if (twEl) twEl.innerText = totalWealth;

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
                fuelThreshold: CONFIG.fuelThreshold || 40,
                fuelPerStep: window.lastFuelPerStep || 0,
                apUptime: window.currentApUptime || 0,
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

    function updateUptimeTicker() {
        const upEl = document.getElementById('val-uptime');
        if (!upEl) return;
        if (CONFIG.isPilotEnabled) {
            const startTime = localStorage.getItem('gb_ap_start_time');
            if (startTime) {
                const uptimeMs = Date.now() - parseInt(startTime);
                upEl.innerText = formatDuration(uptimeMs);
            }
        } else {
            upEl.innerText = "OFF";
        }
    }

    function schedule(ms) { clearTimeout(window.gbTimeout); window.gbTimeout = setTimeout(automate, ms); }
    const bootstrap = () => { 
        if (document.body) { 
            initUI(); schedule(2000); 
            refreshLiveData(); // Immediate refresh
            setInterval(refreshLiveData, 5000); 
            setInterval(updateUptimeTicker, 1000);
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
