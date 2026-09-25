/**
 * ============================================
 * ONE-CLICK DEPLOY
 * ============================================
 * Deploys the full 5G core topology sequentially.
 * Per-NF logs follow log-scenarios.json (same as manual / terminal deploy).
 */

class OneClickDeploy {
    constructor() {
        this.topology = null;
        this.isDeploying = false;
        this.deployQueue = [];
        this.deployedNFMap = {};   // original topology nfId -> new NF object

        this.TOTAL_DEPLOY_MIN = 10000;
        this.TOTAL_DEPLOY_MAX = 12000;

        this._bindButton();
    }

    _bindButton() {
        const btn = document.getElementById('btn-one-click-deploy');
        if (btn) btn.addEventListener('click', () => this.startDeploy());
    }

    async _loadData() {
        const topoRes = await fetch('../one-click.json');
        this.topology = await topoRes.json();
        console.log('[OneClickDeploy] Topology loaded:', this.topology?.nfs?.length, 'NFs');
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

        return nf;
    }

    // ============================================
    // LOGS — log-scenarios.json (same as manual / terminal)
    // ============================================

    async _replayLogsForNF(nf, nfType, totalMs) {
        if (!this.isDeploying || !nf) return;

        if (window.dockerTerminal && typeof window.dockerTerminal._attachManualStyleDeploymentForNF === 'function') {
            window.dockerTerminal._attachManualStyleDeploymentForNF(nf);
        } else if (window.logEngine) {
            window.logEngine.onNFAdded(nf);
        } else {
            this._emitLog(nf.id, 'SUCCESS', `${nf.name} deployed`, {
                ipAddress: nf.config.ipAddress,
                port: nf.config.port,
                protocol: nf.config.httpProtocol || 'HTTP/2'
            });
        }

        await this._sleep(totalMs);
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
