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
        isPilotEnabled INTEGER DEFAULT 0,
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
    await migrate("ALTER TABLE telemetry ADD COLUMN isPilotEnabled INTEGER DEFAULT 0");

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
            isPilotEnabled: row.isPilotEnabled,
            timestamp: row.timestamp
          };
        });

        return new Response(JSON.stringify(formattedResults), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Return history for specific character
      const { results } = await env.gb_banana.prepare(`
        SELECT bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, currentSector, distToMega, nearestMegaId, isPilotEnabled, timestamp 
        FROM telemetry 
    `).all(); // Note: simplified for brevity, following existing pattern in the file if needed.
    // Actually, following lines 96-102:
    const { results: historyResults } = await env.gb_banana.prepare(`
        SELECT bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, currentSector, distToMega, nearestMegaId, isPilotEnabled, timestamp 
        FROM telemetry 
        WHERE charName = ? 
        ORDER BY timestamp DESC 
        LIMIT 50
      `).bind(charName).all();

      return new Response(JSON.stringify(historyResults), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: Store telemetry
    if (request.method === "POST") {
      try {
        const data = await request.json();
        const { charName, bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, currentSector, distToMega, nearestMegaId, isPilotEnabled, timestamp } = data;

        if (!charName) throw new Error("Missing charName");

        // Insert new record
        await env.gb_banana.prepare(`
          INSERT INTO telemetry (charName, bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, currentSector, distToMega, nearestMegaId, isPilotEnabled, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(charName, bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, currentSector, distToMega, nearestMegaId, isPilotEnabled || 0, timestamp || new Date().toISOString()).run();
          
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
        .scanner {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 20px;
            background: linear-gradient(180deg, transparent, rgba(34, 197, 94, 0.1), transparent);
            animation: scan 8s linear infinite;
            pointer-events: none;
            z-index: 1001;
        }
        @keyframes scan {
            0% { transform: translateY(-100px); }
            100% { transform: translateY(100vh); }
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
            overflow: hidden;
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
        }
        .rank-label {
            font-size: 7px;
            color: #666;
            margin-bottom: 2px;
            text-transform: uppercase;
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
            color: #888;
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

    </style>
</head>
<body>
    <div class="scanner"></div>
    <div class="container">
        <div class="header">
            <h1>>> SYSTEM_MONITOR :: 0xCD1BA</h1>
            <div class="timer-text" id="refresh-trigger" title="Click to Force Sync">
                NEXT_SYNC: <span id="countdown">30</span>S <span class="pulse-dot"></span>
            </div>
            <div class="header-line" id="progress-fill"></div>
        </div>
        <div id="grid" class="grid"></div>
        <div id="loading">INITIALIZING SENSORS...</div>
    </div>

    <script>
        async function fetchData() {
            try {
                const response = await fetch(window.location.href, {
                    headers: { 'Accept': 'application/json' }
                });
                const data = await response.json();
                renderCards(data);
                document.getElementById('loading').style.display = 'none';
            } catch (error) {
                console.error('Fetch error:', error);
                document.getElementById('loading').innerText = 'ERROR: SENSOR_LINK_LOST';
            }
        }

        function renderCards(data) {
            const grid = document.getElementById('grid');
            grid.innerHTML = '';
            
            const sortedChars = Object.keys(data).sort();
            
            if (sortedChars.length === 0) {
                grid.innerHTML = '<div style="color: #666; font-size: 12px;">NO DATA DETECTED IN DATABASE</div>';
                return;
            }

            sortedChars.forEach(name => {
                const stats = data[name];
                const card = document.createElement('div');
                const isPilotActive = stats.isPilotEnabled == 1;
                card.className = 'card ' + (isPilotActive ? 'active' : 'inactive');
                
                const lastSeen = new Date(stats.timestamp).toLocaleString();
                
                const [fCur, fTot] = (stats.fuel || "0/1").split('/').map(n => parseInt(n.replace(/,/g,'')));
                const fPct = Math.min(100, Math.max(0, (fCur / fTot) * 100));
                const fCol = fPct < 30 ? '#ff4444' : (fPct < 70 ? '#f59e0b' : '#22c55e');

                card.innerHTML = \`
                    <div class="char-name">
                        \${name}
                        <div class="gb-toggle-chip \${isPilotActive ? 'active' : ''}">
                            <span class="chip-label">AUTO_PILOT</span>
                            <span class="chip-state">\${isPilotActive ? 'ON' : 'OFF'}</span>
                        </div>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">CREDITS_BANK</span>
                        <span class="stat-value">\${stats.bank}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">CREDITS_HAND</span>
                        <span class="stat-value">\${stats.onHand}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">CURRENT_LOCATION</span>
                        <span class="stat-value">SECTOR \${stats.currentSector || '???' }</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">MEGA_PORT_PROXIMITY</span>
                        <span class="stat-value" style="color: \${stats.distToMega !== null ? (stats.distToMega <= 5 ? '#22c55e' : (stats.distToMega <= 12 ? '#f59e0b' : '#ff4444')) : '#22c55e'};">
                            \${stats.distToMega !== null ? stats.distToMega + ' HOPS' + (stats.nearestMegaId !== undefined ? ' (' + stats.nearestMegaId + ')' : '') : 'INF' }
                        </span>
                    </div>
                    <div class="stat-row" style="border-bottom: none;">
                        <span class="stat-label">FUEL_CAPACITY</span>
                        <span class="stat-value" style="color: \${fCol};">\${stats.fuel}</span>
                    </div>
                    <div class="fuel-container">
                        <div class="fuel-bar" style="width: \${fPct}%; background: \${fCol};"></div>
                    </div>
                    <div class="stat-row" style="margin-top: 15px;">
                        <span class="stat-label">TOTAL_WEALTH</span>
                        <span class="stat-value" style="color:#22c55e">\${stats.totalWealth || '0'}</span>
                    </div>
                    <div class="rank-grid">
                        <div class="rank-item">
                            <span class="rank-label">Rank_Wealth</span>
                            <span class="rank-val">\${stats.rankWealth || 'N/A'}</span>
                        </div>
                        <div class="rank-item">
                            <span class="rank-label">Rank_Trade</span>
                            <span class="rank-val">\${stats.rankTrading || 'N/A'}</span>
                        </div>
                        <div class="rank-item">
                            <span class="rank-label">Rank_Exp</span>
                            <span class="rank-val">\${stats.rankExploration || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="timestamp">LAST_SYNC: \${lastSeen}</div>
                \`;
                grid.appendChild(card);
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

        fetchData();
        setInterval(updateTicker, 1000);
    </script>
</body>
</html>`;
}

