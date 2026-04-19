export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (!env.gb_banana) {
      return new Response("D1 Binding 'gb_banana' not found", { status: 500, headers: corsHeaders });
    }

    // Initialize Database
    await env.gb_banana.prepare(`
      CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        charName TEXT NOT NULL,
        bank TEXT,
        onHand TEXT,
        fuel TEXT,
        rankWealth TEXT,
        rankTrading TEXT,
        rankExploration TEXT,
        totalWealth TEXT,
        currentSector INTEGER,
        distToMega INTEGER,
        nearestMegaId INTEGER,
        fuelThreshold INTEGER DEFAULT 40,
        fuelPerStep REAL DEFAULT 0,
        isPilotEnabled INTEGER DEFAULT 0,
        apUptime INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Migration: Add columns if they don't exist
    const migrate = async (sql) => {
      try { await env.gb_banana.prepare(sql).run(); } catch(e) {}
    };
    await migrate("ALTER TABLE telemetry ADD COLUMN rankWealth TEXT");
    await migrate("ALTER TABLE telemetry ADD COLUMN rankTrading TEXT");
    await migrate("ALTER TABLE telemetry ADD COLUMN rankExploration TEXT");
    await migrate("ALTER TABLE telemetry ADD COLUMN totalWealth TEXT");
    await migrate("ALTER TABLE telemetry ADD COLUMN currentSector INTEGER");
    await migrate("ALTER TABLE telemetry ADD COLUMN distToMega INTEGER");
    await migrate("ALTER TABLE telemetry ADD COLUMN nearestMegaId INTEGER");
    await migrate("ALTER TABLE telemetry ADD COLUMN fuelThreshold INTEGER DEFAULT 40");
    await migrate("ALTER TABLE telemetry ADD COLUMN fuelPerStep REAL DEFAULT 0");
    await migrate("ALTER TABLE telemetry ADD COLUMN isPilotEnabled INTEGER DEFAULT 0");
    await migrate("ALTER TABLE telemetry ADD COLUMN apUptime INTEGER DEFAULT 0");

    // GET: Retrieve telemetry
    if (request.method === "GET") {
      const charName = url.searchParams.get("char");
      const acceptHeader = request.headers.get("Accept") || "";

      // Serve HTML Dashboard for browser requests to root
      if (!charName && acceptHeader.includes("text/html")) {
        return new Response(generateDashboardHTML(), {
          headers: { ...corsHeaders, "Content-Type": "text/html" },
        });
      }
      
      if (!charName) {
        // Return latest status for ALL characters
        const { results } = await env.gb_banana.prepare(`
          SELECT t1.* FROM telemetry t1
          JOIN (
            SELECT charName, MAX(timestamp) as latest 
            FROM telemetry 
            GROUP BY charName
          ) t2 ON t1.charName = t2.charName AND t1.timestamp = t2.latest
        `).all();

        const formattedResults = {};
        results.forEach(row => {
          formattedResults[row.charName] = {
            charName: row.charName,
            bank: row.bank,
            onHand: row.onHand,
            fuel: row.fuel,
            rankWealth: row.rankWealth,
            rankTrading: row.rankTrading,
            rankExploration: row.rankExploration,
            totalWealth: row.totalWealth,
            currentSector: row.currentSector,
            distToMega: row.distToMega,
            nearestMegaId: row.nearestMegaId,
            fuelThreshold: row.fuelThreshold,
            fuelPerStep: row.fuelPerStep,
            isPilotEnabled: row.isPilotEnabled,
            apUptime: row.apUptime,
            timestamp: row.timestamp
          };
        });

        return new Response(JSON.stringify(formattedResults), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Return history for specific character
      const { results: historyResults } = await env.gb_banana.prepare(`
        SELECT bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, currentSector, distToMega, nearestMegaId, fuelThreshold, fuelPerStep, isPilotEnabled, apUptime, timestamp 
        FROM telemetry 
        WHERE charName = ? 
        ORDER BY timestamp DESC 
        LIMIT 50
      `).bind(charName ?? null).all();

      return new Response(JSON.stringify(historyResults), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: Store telemetry
    if (request.method === "POST") {
      try {
        const data = await request.json();
        const { charName, bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, currentSector, distToMega, nearestMegaId, fuelThreshold, fuelPerStep, isPilotEnabled, apUptime, timestamp } = data;

        if (!charName) throw new Error("Missing charName");

        // Insert new record with absolute safety against 'undefined'
        await env.gb_banana.prepare(`
          INSERT INTO telemetry (charName, bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, currentSector, distToMega, nearestMegaId, fuelThreshold, fuelPerStep, isPilotEnabled, apUptime, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          charName ?? null, 
          bank ?? null, 
          onHand ?? null, 
          fuel ?? null, 
          rankWealth ?? null, 
          rankTrading ?? null, 
          rankExploration ?? null, 
          totalWealth ?? null, 
          currentSector ?? null, 
          distToMega ?? null, 
          nearestMegaId ?? null, 
          fuelThreshold ?? 40,
          fuelPerStep ?? 0, 
          isPilotEnabled ?? 0, 
          apUptime ?? 0, 
          timestamp ?? new Date().toISOString()
        ).run();
          
        return new Response("OK", { headers: corsHeaders });
      } catch (err) {
        return new Response(err.message, { status: 400, headers: corsHeaders });
      }
    }

    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  },
};

function generateDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GB Telemetry Monitor</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: #050505;
            background-image: 
                radial-gradient(circle at 50% 50%, rgba(34, 197, 94, 0.05) 0%, transparent 80%),
                linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%),
                linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
            background-size: 100% 100%, 100% 4px, 100% 100%;
            color: #eee;
            font-family: 'Consolas', 'Roboto Mono', monospace;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
            overflow-x: hidden;
        }
        body::after {
            content: "";
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: repeating-linear-gradient(0deg, rgba(0,0,0,0.15), rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px);
            pointer-events: none;
            z-index: 1000;
        }
        
        .noise {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: url('https://grainy-gradients.vercel.app/noise.svg');
            opacity: 0.15;
            pointer-events: none;
            z-index: 999;
            filter: contrast(150%) brightness(100%);
        }

        @keyframes surge {
            0% { transform: translate(0,0) skew(0deg); filter: hue-rotate(0deg); }
            20% { transform: translate(-5px, 2px) skew(2deg); filter: hue-rotate(90deg) contrast(150%); }
            40% { transform: translate(5px, -2px) skew(-2deg); }
            60% { transform: translate(-3px, 5px) skew(1deg); filter: hue-rotate(-90deg); }
            80% { transform: translate(3px, -5px) skew(0deg); }
            100% { transform: translate(0,0) skew(0deg); filter: hue-rotate(0deg); }
        }

        body.glitch-active .container {
            animation: surge 0.2s infinite;
        }
        body.glitch-active .noise {
            opacity: 0.4;
            filter: contrast(200%) brightness(150%);
        }
        body.glitch-active .card {
            border-color: #ff00c1 !important;
            box-shadow: 0 0 30px rgba(255, 0, 193, 0.3);
        }

        .glitch-text {
            position: relative;
        }
        /* Keep subtle chromatics but remove the heavy animation */
        .glitch-text::before, .glitch-text::after {
            content: attr(data-text);
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0);
            opacity: 0;
            transition: opacity 0.1s;
        }
        body.glitch-active .glitch-text::before,
        body.glitch-active .glitch-text::after {
            opacity: 0.7;
        }
        .glitch-text::before {
            left: 2px;
            text-shadow: -1px 0 #ff00c1;
            clip-path: inset(0 0 0 0);
        }
        .glitch-text::after {
            left: -2px;
            text-shadow: 1px 0 #00fff9;
            clip-path: inset(0 0 0 0);
        }

        .container {
            width: 100%;
            max-width: 1000px;
        }
        .header {
            position: relative;
            margin-bottom: 30px;
            padding-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 {
            margin: 0;
            font-size: 20px;
            color: #22c55e;
            letter-spacing: 2px;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }
        .card {
            background: rgba(8, 8, 8, 0.95);
            border: 1px solid #444;
            padding: 20px;
            position: relative;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            transition: all 0.4s ease;
        }
        .card.active {
            border-color: #22c55e;
            box-shadow: 0 0 25px rgba(34, 197, 94, 0.4);
            background: rgba(10, 25, 15, 0.95);
        }
        .card.inactive {
            opacity: 0.8;
        }
        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: #444;
            opacity: 0.8;
            transition: background 0.4s;
        }
        .card.active::before {
            background: #22c55e;
        }
        .char-name {
            font-size: 16px;
            font-weight: 900;
            color: #22c55e;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
        }
        .gb-label {
            font-size: 10px;
            color: #22c55e;
            text-transform: uppercase;
            margin-bottom: 4px;
            display: block;
            font-weight: 800;
            opacity: 0.7;
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 10px;
            font-size: 12px;
            border-bottom: 1px solid #1a1a1a;
            padding-bottom: 6px;
        }
        .stat-label {
            color: #888;
            text-transform: uppercase;
            font-weight: bold;
            font-size: 10px;
        }
        .stat-value {
            color: #22c55e;
            font-weight: 900;
            text-shadow: 0 0 8px rgba(34, 197, 94, 0.3);
        }
        .stat-value.rank {
            color: #f59e0b;
            text-shadow: 0 0 8px rgba(245, 158, 11, 0.3);
        }
        .fuel-container {
            width: 100%;
            height: 4px;
            background: #111;
            margin-top: 4px;
            border-radius: 2px;
            position: relative;
        }
        .fuel-bar {
            height: 100%;
            transition: width 0.5s ease, background 0.5s ease;
        }
        .gb-toggle-chip {
            display: flex;
            align-items: center;
            background: rgba(20,20,20,0.8);
            border: 1px solid #333;
            padding: 2px;
            border-radius: 4px;
            font-size: 8px;
            user-select: none;
            margin-left: auto;
        }
        .gb-toggle-chip .chip-label { color: #666; padding: 0 8px; font-weight: 800; letter-spacing: 0.5px; }
        .gb-toggle-chip .chip-state { background: #222; color: #555; padding: 3px 8px; border-radius: 2px; font-weight: 900; }
        
        .gb-toggle-chip.active { border-color: #22c55e; box-shadow: 0 0 15px rgba(34, 197, 94, 0.15); }
        .gb-toggle-chip.active .chip-label { color: #22c55e; text-shadow: 0 0 8px rgba(34, 197, 94, 0.4); }
        .gb-toggle-chip.active .chip-state { background: #22c55e; color: #000; box-shadow: 0 0 10px rgba(34, 197, 94, 0.3); }


        .rank-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 10px;
            margin-top: 10px;
            background: rgba(255,255,255,0.02);
            padding: 8px;
            border: 1px solid #111;
        }
        .rank-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            height: 48px;
            padding-top: 4px;
        }
        .rank-label {
            font-size: 7px;
            color: #666;
            margin-bottom: 0px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .rank-val-container {
            position: relative;
            height: 1.2em;
            overflow: hidden;
            width: 100%;
            display: flex;
            justify-content: center;
            margin-top: 14px;
        }
        .rank-val {
            font-size: 11px;
            color: #f59e0b;
            font-weight: 900;
        }
        .timestamp {
            margin-top: 15px;
            font-size: 9px;
            color: #555;
            text-align: right;
        }
        @keyframes breathe {
            0% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.4); opacity: 1; box-shadow: 0 0 8px #22c55e; }
            100% { transform: scale(1); opacity: 0.8; }
        }
        .pulse-dot {
            display: inline-block;
            width: 5px;
            height: 5px;
            background-color: #22c55e;
            border-radius: 50%;
            animation: breathe 3s infinite ease-in-out;
            margin-left: 6px;
        }
        #loading {
            color: #22c55e;
            margin-top: 50px;
            letter-spacing: 2px;
        }
        .timer-text {
            font-size: 10px; 
            color: #22c55e;
            font-weight: bold;
            cursor: pointer;
            padding: 5px 10px;
            border: 1px solid transparent;
            transition: all 0.3s;
            display: flex;
            align-items: center;
        }
        .timer-text:hover {
            color: #22c55e;
            background: rgba(34, 197, 94, 0.05);
            border-color: rgba(34, 197, 94, 0.2);
        }
        #countdown {
            color: #22c55e;
            display: inline-block;
            min-width: 20px;
            text-align: center;
        }
        .header-line {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 2px;
            background: #22c55e;
            width: 100%;
            transition: width 1s linear;
            box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
        }

        /* Rank Tier Colors */
        .rank-gold { color: #fbbf24 !important; text-shadow: 0 0 10px rgba(251, 191, 36, 0.4) !important; font-weight: 900; }
        .rank-cyan { color: #22d3ee !important; text-shadow: 0 0 10px rgba(34, 211, 238, 0.4) !important; font-weight: 800; }
        .rank-purple { color: #a78bfa !important; text-shadow: 0 0 10px rgba(167, 139, 250, 0.4) !important; }
        .rank-green { color: #4ade80 !important; text-shadow: 0 0 10px rgba(74, 222, 128, 0.3) !important; }
        .rank-gray { color: #6b7280 !important; opacity: 0.8; }

        /* Rank Animation */
        .rank-val-container {
            position: relative;
            height: 1.2em;
            overflow: hidden;
            width: 100%;
            display: flex;
            justify-content: center;
        }
        .rank-stack {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .rank-stack.animate-down { animation: push-down 0.7s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .rank-stack.animate-up { animation: push-up 0.7s cubic-bezier(0.34, 1.56, 0.64, 1); }

        @keyframes push-down {
            0% { transform: translateY(-50%); }
            100% { transform: translateY(0); }
        }
        @keyframes push-up {
            0% { transform: translateY(0); }
            100% { transform: translateY(-50%); }
        }

    </style>
</head>
<body>
    <div class="noise"></div>
    <div class="container">
        <div class="header">
            <h1 class="glitch-text" data-text=">> SYSTEM_MONITOR :: 0xCD1BA">>> SYSTEM_MONITOR :: 0xCD1BA</h1>
            <div class="timer-text" id="refresh-trigger" title="Click to Force Sync">
                NEXT_SYNC: <span id="countdown">30</span>S <span class="pulse-dot"></span>
            </div>
            <div class="header-line" id="progress-fill"></div>
        </div>
        <div id="grid" class="grid"></div>
        <div id="loading">INITIALIZING SENSORS...</div>
    </div>

    <script>
        let previousData = null;

        async function fetchData() {
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('t', Date.now());
                const response = await fetch(url.toString(), {
                    headers: { 'Accept': 'application/json' }
                });
                const data = await response.json();
                renderCards(data, previousData);
                window.latestTelemetry = data;
                previousData = data;
                document.getElementById('loading').style.display = 'none';
            } catch (error) {
                console.error('Fetch error:', error);
                document.getElementById('loading').innerText = 'ERROR: SENSOR_LINK_LOST';
            }
        }

        function formatUptime(seconds) {
            if (!seconds || seconds <= 0) return "0s";
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            let res = "";
            if (h > 0) res += h + "h ";
            if (m > 0 || h > 0) res += m + "m ";
            res += s + "s";
            return res;
        }

        function getRankStyle(rank) {
            if (!rank || rank === 'N/A') return { cls: 'rank-gray', icon: '' };
            const val = parseInt(rank.replace('#', ''));
            if (isNaN(val)) return { cls: 'rank-gray', icon: '' };
            if (val > 500) return { cls: 'rank-gray', icon: '' };
            if (val === 1) return { cls: 'rank-gold', icon: '👑' };
            if (val <= 10) return { cls: 'rank-cyan', icon: '' };
            if (val <= 100) return { cls: 'rank-purple', icon: '' };
            if (val <= 500) return { cls: 'rank-green', icon: '' };
            return { cls: 'rank-gray', icon: '' };
        }

        function renderCards(data, prev) {
            const grid = document.getElementById('grid');
            const sortedChars = Object.keys(data).sort();
            
            if (sortedChars.length === 0) {
                grid.innerHTML = '<div style="color: #666; font-size: 12px;">NO DATA DETECTED IN DATABASE</div>';
                return;
            }

            // Create or update template for each char
            sortedChars.forEach(name => {
                const stats = data[name];
                const prevStats = prev ? prev[name] : null;
                
                let card = document.getElementById('card-' + name);
                if (!card) {
                    card = document.createElement('div');
                    card.id = 'card-' + name;
                    grid.appendChild(card);
                }

                const isPilotActive = stats.isPilotEnabled == 1;
                card.className = 'card ' + (isPilotActive ? 'active' : 'inactive');
                
                const lastSeen = new Date(stats.timestamp).toLocaleString();
                const [fCur, fTot] = (stats.fuel || "0/1").split('/').map(n => parseInt(n.replace(/,/g,'')));
                const fPct = Math.min(100, Math.max(0, (fCur / fTot) * 100));
                const fCol = fPct < 30 ? '#ff4444' : (fPct < 70 ? '#f59e0b' : '#22c55e');

                const renderRankItem = (label, current, previous) => {
                    const curStyle = getRankStyle(current);
                    const curVal = current && current !== 'N/A' ? parseInt(current.replace('#', '')) : null;
                    const preVal = previous && previous !== 'N/A' ? parseInt(previous.replace('#', '')) : null;
                    
                    let aniClass = '';
                    let stackHtml = '';

                    if (preVal !== null && curVal !== null && preVal !== curVal) {
                        if (curVal < preVal) { // Rank Improved
                            aniClass = 'animate-down';
                            stackHtml = '<div class="rank-val ' + curStyle.cls + '">' + curStyle.icon + current + '</div>' +
                                        '<div class="rank-val ' + getRankStyle(previous).cls + '">' + getRankStyle(previous).icon + previous + '</div>';
                        } else { // Rank Dropped
                            aniClass = 'animate-up';
                            stackHtml = '<div class="rank-val ' + getRankStyle(previous).cls + '">' + getRankStyle(previous).icon + previous + '</div>' +
                                        '<div class="rank-val ' + curStyle.cls + '">' + curStyle.icon + current + '</div>';
                        }
                    } else {
                        stackHtml = '<div class="rank-val ' + curStyle.cls + '">' + curStyle.icon + (current || 'N/A') + '</div>';
                    }

                    return '<div class="rank-item">' +
                                '<span class="rank-label">' + label + '</span>' +
                                '<div class="rank-val-container">' +
                                    '<div class="rank-stack ' + aniClass + '">' +
                                        stackHtml +
                                    '</div>' +
                                '</div>' +
                            '</div>';
                };

                card.innerHTML = '\
                    <div class="char-name">\
                        <span class="glitch-text" data-text="' + name + '">' + name + '</span>\
                        <div class="gb-toggle-chip ' + (isPilotActive ? 'active' : '') + '">\
                            <span class="chip-label">AP</span>\
                            <span class="chip-state">' + (isPilotActive ? 'ON' : 'OFF') + '</span>\
                        </div>\
                    </div>\
                    <div class="stat-row">\
                        <span class="stat-label">CREDITS_BANK</span>\
                        <span class="stat-value">' + (stats.bank || '0').toString().split('.')[0] + '</span>\
                    </div>\
                    <div class="stat-row">\
                        <span class="stat-label">CREDITS_HAND</span>\
                        <span class="stat-value">' + (stats.onHand || '0').toString().split('.')[0] + '</span>\
                    </div>\
                    <div class="stat-row">\
                        <span class="stat-label">CURRENT_LOCATION</span>\
                        <span class="stat-value">SECTOR ' + (stats.currentSector || '???') + '</span>\
                    </div>\
                    <div class="stat-row">\
                        <span class="stat-label">MEGA_PORT_PROXIMITY</span>\
                        <span class="stat-value" id="mega-prox-' + name + '">\
                            ' + (stats.distToMega !== null ? stats.distToMega + ' HOPS' + (stats.nearestMegaId !== undefined ? ' (' + stats.nearestMegaId + ')' : '') : 'INF') + '\
                        </span>\
                    </div>\
                    <div class="stat-row" style="border-bottom: none;">\
                        <span class="stat-label">FUEL_CAPACITY</span>\
                        <span class="stat-value" style="color: ' + fCol + ';">' + stats.fuel + '</span>\
                    </div>\
                    <div class="stat-row">\
                        <span class="stat-label">FUEL_CONSUMPTION</span>\
                        <span class="stat-value">' + (stats.fuelPerStep ? parseFloat(stats.fuelPerStep.toFixed(2)) : '--') + ' / HOP</span>\
                    </div>\
                    <div class="fuel-container">\
                        <div class="fuel-bar" style="width: ' + fPct + '%; background: ' + fCol + '; border-radius: 2px; height: 100%;"></div>\
                        <div style="position: absolute; left: ' + (stats.fuelThreshold || 40) + '%; top: -2px; bottom: -2px; width: 1px; background: #ff4444; z-index: 10; box-shadow: 0 0 5px rgba(255, 68, 68, 0.4);"></div>\
                        <div style="position: absolute; left: ' + (stats.fuelThreshold || 40) + '%; top: 9px; transform: translateX(-50%); font-size: 7px; color: #ff4444; font-weight: 800; white-space: nowrap; letter-spacing: 0.5px; text-shadow: 0 0 5px rgba(255, 68, 68, 0.3);">LIMIT: ' + (stats.fuelThreshold || 40) + '%</div>\
                    </div>\
                    <div class="stat-row" style="margin-top: 25px;">\
                        <span class="stat-label">AUTO_PILOT_UPTIME</span>\
                        <span class="stat-value" style="color:' + (isPilotActive ? '#22c55e' : '#666') + '" id="uptime-val-' + name + '">' + (isPilotActive ? formatUptime(stats.apUptime) : 'OFF') + '</span>\
                    </div>\
                    <div class="stat-row">\
                        <span class="stat-label">TOTAL_WEALTH</span>\
                        <span class="stat-value" style="color:#22c55e">' + (stats.totalWealth || '0').toString().split('.')[0] + '</span>\
                    </div>\
                    <div class="rank-grid">\
                        ' + renderRankItem('Rank_Wealth', stats.rankWealth, prevStats?.rankWealth) + '\
                        ' + renderRankItem('Rank_Trade', stats.rankTrading, prevStats?.rankTrading) + '\
                        ' + renderRankItem('Rank_Exp', stats.rankExploration, prevStats?.rankExploration) + '\
                    </div>\
                    <div class="timestamp">LAST_SYNC: ' + lastSeen + '</div>\
                ';

                // Update Proximity Color Dynamically
                const mEl = document.getElementById('mega-prox-' + name);
                if (mEl && stats.distToMega !== null) {
                    let col = '#ff4444';
                    if (stats.fuelPerStep && fTot) {
                        const neededPct = (stats.distToMega * stats.fuelPerStep / fTot) * 100;
                        const buffer = 5;
                        if (neededPct + buffer < (stats.fuelThreshold || 40)) col = '#22c55e';
                        else if (neededPct < (stats.fuelThreshold || 40)) col = '#f59e0b';
                    } else {
                        col = stats.distToMega <= 5 ? '#22c55e' : (stats.distToMega <= 12 ? '#f59e0b' : '#ff4444');
                    }
                    mEl.style.color = col;
                    mEl.style.textShadow = '0 0 8px ' + col + '44';
                }
            });
        }

        let timeLeft = 30;
        const countdownEl = document.getElementById('countdown');
        const progressEl = document.getElementById('progress-fill');

        function updateTicker() {
            timeLeft--;
            if (timeLeft < 0) {
                forceRefresh();
            } else {
                updateUI();
            }
        }

        function updateUI() {
            countdownEl.innerText = timeLeft;
            progressEl.style.width = (timeLeft / 30 * 100) + '%';
        }

        function forceRefresh() {
            timeLeft = 30;
            updateUI();
            fetchData();
        }

        document.getElementById('refresh-trigger').onclick = forceRefresh;

        function triggerGlitch() {
            document.body.classList.add('glitch-active');
            setTimeout(() => {
                document.body.classList.remove('glitch-active');
                scheduleNextGlitch();
            }, 100 + Math.random() * 200);
        }

        function scheduleNextGlitch() {
            const delay = 3000 + Math.random() * 10000;
            setTimeout(triggerGlitch, delay);
        }

        fetchData();
        setInterval(updateTicker, 1000);
        
        // Live Uptime Ticker
        setInterval(() => {
            if (!window.latestTelemetry) return;
            const now = Date.now();
            Object.keys(window.latestTelemetry).forEach(name => {
                const stats = window.latestTelemetry[name];
                if (stats.isPilotEnabled == 1) {
                    const ts = stats.timestamp;
                    const syncTime = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z').getTime();
                    const elapsed = Math.floor((now - syncTime) / 1000);
                    const total = (stats.apUptime || 0) + Math.max(0, elapsed);
                    const el = document.getElementById('uptime-val-' + name);
                    if (el) el.innerText = formatUptime(total);
                }
            });
        }, 1000);

        scheduleNextGlitch();
    </script>
</body>
</html>`;
}

