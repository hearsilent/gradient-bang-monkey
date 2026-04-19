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
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Migration: Add columns if they don't exist
    try {
      await env.gb_banana.prepare("ALTER TABLE telemetry ADD COLUMN rankWealth TEXT").run();
      await env.gb_banana.prepare("ALTER TABLE telemetry ADD COLUMN rankTrading TEXT").run();
      await env.gb_banana.prepare("ALTER TABLE telemetry ADD COLUMN rankExploration TEXT").run();
      await env.gb_banana.prepare("ALTER TABLE telemetry ADD COLUMN totalWealth TEXT").run();
    } catch (e) {
      // Columns likely already exist
    }

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
            timestamp: row.timestamp
          };
        });

        return new Response(JSON.stringify(formattedResults), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Return history for specific character
      const { results } = await env.gb_banana.prepare(`
        SELECT bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, timestamp 
        FROM telemetry 
        WHERE charName = ? 
        ORDER BY timestamp DESC 
        LIMIT 50
      `).bind(charName).all();

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: Store telemetry
    if (request.method === "POST") {
      try {
        const data = await request.json();
        const { charName, bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, timestamp } = data;

        if (!charName) throw new Error("Missing charName");

        // Insert new record
        await env.gb_banana.prepare(`
          INSERT INTO telemetry (charName, bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(charName, bank, onHand, fuel, rankWealth, rankTrading, rankExploration, totalWealth, timestamp || new Date().toISOString()).run();
          
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
            color: #eee;
            font-family: 'Consolas', 'Roboto Mono', monospace;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            width: 100%;
            max-width: 1000px;
        }
        .header {
            border-bottom: 2px solid #22c55e;
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
            border: 1px solid #22c55e;
            padding: 20px;
            position: relative;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: #22c55e;
            opacity: 0.8;
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
            width: 8px;
            height: 8px;
            background-color: #22c55e;
            border-radius: 50%;
            animation: breathe 3s infinite ease-in-out;
            vertical-align: middle;
        }
        #loading {
            color: #22c55e;
            margin-top: 50px;
            letter-spacing: 2px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>>> SYSTEM_MONITOR :: 0xCD1BA</h1>
            <div style="font-size: 10px; color: #888;">
                AUTO_REFRESH: 30S <span class="pulse-dot"></span>
            </div>
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
                card.className = 'card';
                
                const lastSeen = new Date(stats.timestamp).toLocaleString();
                
                card.innerHTML = \`
                    <div class="char-name">
                        \${name}
                        <span style="font-size: 8px; opacity: 0.5;">ONLINE</span>
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
                        <span class="stat-label">FUEL_CAPACITY</span>
                        <span class="stat-value">\${stats.fuel}</span>
                    </div>
                    <div class="stat-row">
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

        fetchData();
        setInterval(fetchData, 30000);
    </script>
</body>
</html>`;
}

