/**
 * ============================================
 * ONE-CLICK DEPLOY
 * ============================================
 * Deploys the full 5G core topology silently.
 * Logs are replayed exactly from 5g-logs.json,
 * matched by NF type extracted from the nfId.
 */

class OneClickDeploy {
    constructor() {
        this.topology = null;
        this.isDeploying = false;
        this.deployQueue = [];
        this.deployedNFMap = {};   // original topology nfId -> new NF object
        this.nfLogBuckets = {};    // NF type string -> [ log entries ]

        this.TOTAL_DEPLOY_MIN = 10000;
        this.TOTAL_DEPLOY_MAX = 12000;

        this._bindButton();
    }

    _bindButton() {
        const btn = document.getElementById('btn-one-click-deploy');
        if (btn) btn.addEventListener('click', () => this.startDeploy());
    }

    // ============================================
    // EXTRACT NF TYPE FROM LOG nfId
    // e.g. "amf-1766134029860-ri9n5" -> "AMF"
    //      "ext-dn-1766134272916-zhua2" -> "ext-dn"
    // ============================================
    _typeFromNfId(nfId) {
        if (!nfId || nfId === 'system') return null;

        // ext-dn is a special two-part prefix
        if (nfId.startsWith('ext-dn')) return 'ext-dn';

        // All others: first segment before the first '-timestamp' block
        // nfId format: <type>-<13digitTimestamp>-<random>
        // Extract everything before the first long numeric segment
        const match = nfId.match(/^([a-zA-Z]+)/);
        if (!match) return null;

        const prefix = match[1].toLowerCase();
        const typeMap = {
            'nrf':   'NRF',
            'amf':   'AMF',
            'smf':   'SMF',
            'upf':   'UPF',
            'ausf':  'AUSF',
            'udm':   'UDM',
            'pcf':   'PCF',
            'nssf':  'NSSF',
            'udr':   'UDR',
            'mysql': 'MySQL',
            'gnb':   'gNB',
            'ue':    'UE'
        };
        return typeMap[prefix] || null;
    }

    // ============================================
    // LOAD DATA
    // ============================================

    async _loadData() {
        const [topoRes, logRes] = await Promise.all([
            fetch('../one-click.json'),
            fetch('../5g-logs.json')
        ]);
        this.topology = await topoRes.json();
        const logData = await logRes.json();
        const allLogs = logData.logs || [];

        // Build per-NF-type buckets using the nfId prefix
        this.nfLogBuckets = {};
        for (const log of allLogs) {
            const type = this._typeFromNfId(log.nfId);
            if (!type) continue;
            if (!this.nfLogBuckets[type]) this.nfLogBuckets[type] = [];
            this.nfLogBuckets[type].push(log);
        }

        console.log('[OneClickDeploy] Log buckets loaded:',
            Object.entries(this.nfLogBuckets).map(([k, v]) => `${k}:${v.length}`).join(', '));
    }

    // ============================================
    // DEPLOY ENTRY POINT
    // ============================================

    async startDeploy() {
        if (this.isDeploying) return;

        const existingNFs = window.dataStore?.getAllNFs() || [];
        const existingBuses = window.dataStore?.getAllBuses() || [];
        const hasExisting = existingNFs.length > 0 || existingBuses.length > 0;

        if (hasExisting) {
            if (existingNFs.length > 0) {
                const ok = confirm(
                    '⚠️ Canvas already has Network Functions.\n\n' +
                    'One-Click Deploy will clear and redeploy from scratch.\n\nContinue?'
                );
                if (!ok) return;
            }
            // Clear everything including bus lines
            window.dataStore?.clearAll();
            if (window.busManager) window.busManager.buses = [];
            window.logEngine?.clearAllLogs?.();
            const lc = document.getElementById('log-content');
            if (lc) lc.innerHTML = '';
            window.canvasRenderer?.render();
        } else {
            // Even on empty canvas, clear the default bus that BusManager auto-creates
            window.dataStore?.clearAll();
            if (window.busManager) window.busManager.buses = [];
            window.canvasRenderer?.render();
        }

        const btn = document.getElementById('btn-one-click-deploy');
        if (btn) { btn.disabled = true; btn.textContent = '⚡ Deploying...'; }

        try {
            await this._loadData();
        } catch (err) {
            console.error('OneClickDeploy: failed to load data', err);
            if (btn) { btn.disabled = false; btn.textContent = '⚡ One-Click Deploy'; }
            return;
        }

        const ORDER = ['NRF', 'PCF', 'NSSF', 'UDM', 'UDR', 'MySQL', 'AUSF', 'AMF', 'SMF', 'UPF', 'ext-dn', 'gNB', 'UE'];
        this.deployQueue = [...this.topology.nfs].sort((a, b) => {
            const ai = ORDER.indexOf(a.type), bi = ORDER.indexOf(b.type);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

        this.totalSteps = this.deployQueue.length;
        this.currentStep = 0;
        this.isDeploying = true;
        this.deployedNFMap = {};
        this._busMap = {};

        // Step 1: Create bus line(s) on canvas FIRST before any NFs
        await this._createBus();

        // Divide 10-12s total budget evenly across all NFs
        const totalMs = this.TOTAL_DEPLOY_MIN +
            Math.floor(Math.random() * (this.TOTAL_DEPLOY_MAX - this.TOTAL_DEPLOY_MIN));
        this.perNFInterval = Math.floor(totalMs / this.totalSteps);

        console.log(`[OneClickDeploy] Deploying ${this.totalSteps} NFs, ${this.perNFInterval}ms each`);

        await this._deployNext();
    }

    // ============================================
    // SEQUENTIAL DEPLOY LOOP
    // ============================================

    async _deployNext() {
        if (!this.isDeploying) return;

        if (this.currentStep >= this.totalSteps) {
            await this._finalizeDeploy();
            return;
        }

        const nfSpec = this.deployQueue[this.currentStep];
        const nf = this._createNFForDeploy(nfSpec);

        if (nf) {
            this.deployedNFMap[nfSpec.id] = nf;
            await this._replayLogsForNF(nf, nfSpec.type, this.perNFInterval);
        }

        this.currentStep++;
        if (!this.isDeploying) return;
        await this._deployNext();
    }

    // ============================================
    // NF CREATION
    // ============================================

    _createNFForDeploy(nfSpec) {
        if (!window.nfManager || !window.dataStore) return null;

        const nfDef = window.nfManager.getNFDefinition(nfSpec.type);
        const nf = {
            id: `${nfSpec.type.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            type: nfSpec.type,
            name: nfSpec.name,
            position: { ...nfSpec.position },
            color: nfSpec.color || nfDef.color,
            icon: nfSpec.icon || nfDef.icon,
            iconImage: null,
            status: 'starting',
            statusTimestamp: Date.now(),
            config: { ...nfSpec.config }
        };

        if (nf.icon) {
            const img = new Image();
            img.onload = () => { nf.iconImage = img; window.canvasRenderer?.render(); };
            img.src = nf.icon;
        }

        window.dataStore.addNF(nf);

        if (window.nfManager.nfCounters[nf.type] !== undefined) {
            window.nfManager.nfCounters[nf.type] = Math.max(
                window.nfManager.nfCounters[nf.type],
                parseInt(nf.name.split('-')[1]) || 1
            );
        }

        window.canvasRenderer?.render();

        // Transition to stable after 5s
        setTimeout(() => {
            window.dataStore.updateNF(nf.id, { status: 'stable', statusTimestamp: Date.now() });
            window.canvasRenderer?.render();
        }, 5000);

        return nf;
    }

    // ============================================
    // LOG REPLAY — exact entries from 5g-logs.json
    // ============================================

    async _replayLogsForNF(nf, nfType, totalMs) {
        const logs = this.nfLogBuckets[nfType] || [];

        console.log(`[OneClickDeploy] Replaying ${logs.length} logs for ${nf.name} (${nfType}) over ${totalMs}ms`);

        if (logs.length === 0) {
            // Fallback single log if no entries found for this type
            this._emitLog(nf.id, 'SUCCESS', `${nf.name} deployed successfully`, {
                ipAddress: nf.config.ipAddress,
                port: nf.config.port,
                protocol: nf.config.httpProtocol || 'HTTP/2'
            });
            await this._sleep(totalMs);
            return;
        }

        // Spread all logs evenly across the per-NF time window
        const gap = Math.floor(totalMs / (logs.length + 1));

        for (let i = 0; i < logs.length; i++) {
            if (!this.isDeploying) break;
            await this._sleep(gap);

            const src = logs[i];
            const message = this._substituteNFName(src.message, nf.name, nfType);
            const details = this._patchDetails(src.details, nf);

            this._emitLog(nf.id, src.level, message, details);
        }

        await this._sleep(gap);
    }

    /**
     * Push a log entry directly through logEngine's listener pipeline
     * so it appears in the log panel exactly like a real log.
     */
    _emitLog(nfId, level, message, details) {
        if (!window.logEngine) return;

        const entry = {
            id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            nfId,
            timestamp: Date.now(),
            level,
            message,
            details: details || {}
        };

        // Store in logEngine's internal map
        if (!window.logEngine.logs.has(nfId)) {
            window.logEngine.logs.set(nfId, []);
        }
        const bucket = window.logEngine.logs.get(nfId);
        bucket.push(entry);
        if (bucket.length > window.logEngine.maxLogsPerNF) bucket.shift();

        // Notify UI listeners — same path as logEngine.addLog
        window.logEngine.notifyListeners(entry);
    }

    /**
     * Replace original NF name patterns in message with actual deployed name.
     * e.g. "NRF-1 created successfully" -> "NRF-1 created successfully" (same)
     *      "AMF-1 registered with NRF" -> "AMF-1 registered with NRF" (same)
     */
    _substituteNFName(message, actualName, nfType) {
        // Replace exact type-number patterns like "NRF-1", "AMF-1", "ext-dn-1"
        return message.replace(
            /\b(NRF|AMF|SMF|UPF|AUSF|UDM|PCF|NSSF|UDR|MySQL|gNB|UE|ext-dn)-\d+\b/gi,
            (match) => {
                // Only replace if it matches the current NF's type
                const matchType = match.replace(/-\d+$/, '').toLowerCase();
                const currentType = nfType.toLowerCase();
                if (matchType === currentType) return actualName;
                return match; // keep other NF references as-is
            }
        );
    }

    /**
     * Patch IP/port/endpoint in log details to match the actual deployed NF.
     */
    _patchDetails(details, nf) {
        if (!details || typeof details !== 'object') return details || {};
        const out = JSON.parse(JSON.stringify(details));

        if (out.ipAddress !== undefined) out.ipAddress = nf.config.ipAddress;
        if (out.port !== undefined) out.port = nf.config.port;
        if (out.address !== undefined) out.address = `${nf.config.ipAddress}:${nf.config.port}`;
        if (typeof out.endpoint === 'string') {
            out.endpoint = out.endpoint.replace(
                /192\.168\.\d+\.\d+:\d+/,
                `${nf.config.ipAddress}:${nf.config.port}`
            );
        }
        if (typeof out.subnet === 'string') {
            const parts = nf.config.ipAddress.split('.');
            out.subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
        }
        return out;
    }

    // ============================================
    // FINALIZE
    // ============================================

    async _finalizeDeploy() {
        await this._createConnections();
        await this._wireBusConnections();
        // Bus was already created at deploy start — just re-render to show final state

        this.isDeploying = false;

        this._emitLog('system', 'SUCCESS',
            `⚡ One-Click Deploy complete — ${this.totalSteps} NFs deployed`, {
            totalNFs: this.totalSteps,
            connections: this.topology.connections?.length || 0,
            timestamp: new Date().toISOString()
        });

        window.canvasRenderer?.render();

        const btn = document.getElementById('btn-one-click-deploy');
        if (btn) { btn.disabled = false; btn.textContent = '⚡ One-Click Deploy'; }
    }

    async _createConnections() {
        if (!this.topology.connections) return;
        for (const conn of this.topology.connections) {
            const src = this.deployedNFMap[conn.sourceId];
            const dst = this.deployedNFMap[conn.targetId];
            if (!src || !dst) continue;
            window.dataStore?.addConnection({
                id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                sourceId: src.id,
                targetId: dst.id,
                interfaceName: conn.interfaceName,
                protocol: conn.protocol || 'HTTP/2',
                status: 'connected',
                createdAt: Date.now(),
                isManual: true,
                showVisual: true
            });
            await this._sleep(60);
        }
        window.canvasRenderer?.render();
    }

    async _createBus() {
        if (!this.topology.buses || !window.dataStore) return;
        for (const busSpec of this.topology.buses) {
            const bus = {
                id: `bus-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                name: busSpec.name,
                orientation: busSpec.orientation,
                position: { ...busSpec.position },
                length: busSpec.length,
                thickness: busSpec.thickness,
                color: busSpec.color,
                type: busSpec.type,
                connections: []
            };
            window.dataStore.addBus(bus);
            // Also register in busManager so it's tracked
            if (window.busManager) window.busManager.buses.push(bus);
            // Store mapping from topology busId -> deployed bus, for later NF wiring
            this._busMap = this._busMap || {};
            this._busMap[busSpec.id] = bus;
        }
        window.canvasRenderer?.render();
    }

    async _wireBusConnections() {
        if (!this.topology.busConnections || !this._busMap) return;
        for (const bc of this.topology.busConnections) {
            const bus = this._busMap[bc.busId];
            const nf = this.deployedNFMap[bc.nfId];
            if (!bus || !nf) continue;
            window.dataStore.addBusConnection({
                id: `bus-conn-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                nfId: nf.id,
                busId: bus.id,
                type: 'bus-connection',
                interfaceName: bc.interfaceName,
                protocol: bc.protocol || 'HTTP/2',
                status: 'connected',
                createdAt: Date.now()
            });
            bus.connections.push(nf.id);
            await this._sleep(20);
        }
        window.canvasRenderer?.render();
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Instantiate globally via app.js after all managers are ready
