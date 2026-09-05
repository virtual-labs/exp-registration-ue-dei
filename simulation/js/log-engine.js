/**
 * ============================================
 * LOG ENGINE
 * ============================================
 * Manages all logging for Network Functions
 * 
 * Responsibilities:
 * - Generate logs for NF lifecycle events
 * - Check dependencies and show errors/warnings
 * - Simulate 5G network behavior
 * - Store and manage log entries
 * - Notify UI of new logs
 */

class LogEngine {
    constructor() {
        this.logs = new Map();
        this.maxLogsPerNF = 100;
        this.logListeners = [];
        this.dependencies = null;
        this.logScenarios = null; // Custom log scenarios — loaded via init() after construction
        /** @type {Promise<void>|null} */
        this._initPromise = null;
    }

    /**
     * Load nf-dependencies.json and log-scenarios.json. Must complete before NF logs match scenarios.
     */
    async init() {
        if (this._initPromise) return this._initPromise;

        this._initPromise = this._doInit();
        return this._initPromise;
    }

    async _doInit() {
        console.log('📋 LogEngine: Initializing...');

        const depRaw = await this._fetchJsonFirstOk([
            '../nf-dependencies.json',
            'nf-dependencies.json',
            './nf-dependencies.json'
        ]);
        this.dependencies = this._normalizeLoadedDependencies(depRaw);
        console.log('✅ Dependencies loaded (normalized)', Object.keys(this.dependencies).length, 'NF types');

        this.logScenarios = await this._fetchJsonFirstOk([
            '../log-scenarios.json',
            'log-scenarios.json',
            './log-scenarios.json'
        ]);

        if (this.logScenarios && typeof this.logScenarios === 'object') {
            console.log('✅ Log scenarios loaded:', Object.keys(this.logScenarios).length, 'types');
        } else {
            console.warn('⚠️ Could not load log-scenarios.json from any path — logs will use basic scenario until reload');
            this.logScenarios = null;
        }
    }

    /**
     * Fetch JSON from the first URL that returns ok JSON (handles different servers / paths).
     */
    async _fetchJsonFirstOk(urls) {
        for (const url of urls) {
            try {
                const response = await fetch(url, { cache: 'no-store' });
                if (!response.ok) continue;
                return await response.json();
            } catch (_) {
                /* try next */
            }
        }
        return null;
    }

    /**
     * nf-dependencies.json contains rich metadata; LogEngine only needs required/optional arrays per type.
     */
    _normalizeLoadedDependencies(raw) {
        const fallback = this.getDefaultDependencies();
        if (!raw || typeof raw !== 'object') return fallback;

        const out = {};
        for (const [type, entry] of Object.entries(raw)) {
            if (entry && typeof entry === 'object' && Array.isArray(entry.required)) {
                out[type] = {
                    required: [...entry.required],
                    optional: Array.isArray(entry.optional) ? [...entry.optional] : []
                };
            }
        }
        return Object.keys(out).length ? out : fallback;
    }

    /**
     * Map dataStore NF.type to top-level key in log-scenarios.json
     */
    resolveScenarioKey(nf) {
        if (!nf?.type || !this.logScenarios) return null;
        const t = nf.type;
        if (this.logScenarios[t]) return t;

        const aliases = {
            mysql: 'MySQL',
            MYSQL: 'MySQL',
            gnb: 'gNB',
            GNB: 'gNB',
            ue: 'UE',
            nrf: 'NRF',
            amf: 'AMF',
            smf: 'SMF',
            upf: 'UPF',
            ausf: 'AUSF',
            udm: 'UDM',
            udr: 'UDR',
            pcf: 'PCF',
            nssf: 'NSSF'
        };
        const mapped = aliases[t];
        if (mapped && this.logScenarios[mapped]) return mapped;

        if (String(t).toLowerCase() === 'ext-dn' && this.logScenarios['ext-dn']) return 'ext-dn';

        return null;
    }

    /**
     * Resolve nf-dependencies.json entry for this NF (handles type aliases).
     */
    _getDependencyBundleForNf(nf) {
        if (!this.dependencies || !nf?.type) return null;
        if (this.dependencies[nf.type]) return this.dependencies[nf.type];
        const sk = this.resolveScenarioKey(nf);
        if (sk && this.dependencies[sk]) return this.dependencies[sk];
        return null;
    }

    getDefaultDependencies() {
        return {
            'NRF': { required: [], optional: [] },
            'AMF': { required: ['NRF'], optional: ['AUSF', 'UDM'] },
            'SMF': { required: ['NRF'], optional: ['UPF', 'PCF'] },
            'UPF': { required: ['NRF'], optional: [] },
            'AUSF': { required: ['NRF', 'UDM'], optional: [] },
            'UDM': { required: ['NRF'], optional: ['MySQL'] },
            'PCF': { required: ['NRF'], optional: [] },
            'NSSF': { required: ['NRF'], optional: [] },
            'UDR': { required: ['NRF'], optional: [] },
            'gNB': { required: ['AMF', 'UPF'], optional: [] },
            'UE': { required: ['gNB'], optional: [] },
            'MySQL': { required: [], optional: ['UDM'] },
            'ext-dn': { required: [], optional: ['UPF'] }
        };
    }

    addLog(nfId, level, message, details = {}) {
        // Replace {instance} and {random} placeholders
        const nf = window.dataStore?.getNFById(nfId);
        if (nf) {
            const instance = nf.name.split('-')[1] || '1';
            const random = Math.random().toString(36).substr(2, 6);
            message = message.replace(/\{instance\}/g, instance);
            message = message.replace(/\{random\}/g, random);

            // Replace in details too
            Object.keys(details).forEach(key => {
                if (typeof details[key] === 'string') {
                    details[key] = details[key].replace(/\{random\}/g, random);
                }
            });

            // Generate dynamic endpoint if details contains a static endpoint
            if (details.endpoint && nf.config) {
                details.endpoint = this.generateDynamicEndpoint(nf);
            }
        }

        const logEntry = {
            id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            nfId: nfId,
            timestamp: Date.now(),
            level: level,
            message: message,
            details: details
        };

        if (!this.logs.has(nfId)) {
            this.logs.set(nfId, []);
        }

        const nfLogs = this.logs.get(nfId);
        nfLogs.push(logEntry);

        if (nfLogs.length > this.maxLogsPerNF) {
            nfLogs.shift();
        }

        this.notifyListeners(logEntry);

        // Console log
        const time = new Date(logEntry.timestamp).toLocaleTimeString();
        const nfName = nf?.name || nfId;

        const logStyles = {
            'ERROR': 'color: #e74c3c; font-weight: bold',
            'WARNING': 'color: #ff9800; font-weight: bold',
            'INFO': 'color: #3498db',
            'SUCCESS': 'color: #4caf50; font-weight: bold',
            'DEBUG': 'color: #95a5a6'
        };

        console.log(
            `%c[${time}] ${nfName} | ${level}%c | ${message}`,
            logStyles[level],
            'color: inherit'
        );

        return logEntry;
    }

    /**
     * Generate dynamic endpoint URL based on NF configuration
     * @param {Object} nf - Network Function object
     * @returns {string} Dynamic endpoint URL
     */
    generateDynamicEndpoint(nf) {
        if (!nf.config || !nf.config.ipAddress || !nf.config.port) {
            return 'https://192.168.1.10:8080/api/v1'; // fallback
        }

        const protocol = nf.config.httpProtocol === 'HTTP/1' ? 'http' : 'https';
        const ip = nf.config.ipAddress;
        const port = nf.config.port;

        // Generate NF-specific endpoint paths
        const endpointPaths = {
            'NRF': '/nnrf-nfm/v1',
            'AMF': '/namf-comm/v1',
            'SMF': '/nsmf-pdusession/v1',
            'UPF': '/nupf-upf/v1',
            'AUSF': '/nausf-auth/v1',
            'UDM': '/nudm-sdm/v1',
            'PCF': '/npcf-am-policy/v1',
            'NSSF': '/nnssf-nsselection/v1',
            'UDR': '/nudr-dr/v1',
            'gNB': '/gnb-mgmt/v1',
            'UE': '/ue-mgmt/v1',
            'MySQL': '', // MySQL uses different format
            'ext-dn': '' // ext-dn doesn't use HTTP endpoints
        };

        if (nf.type === 'MySQL') {
            return `mysql://${ip}:${port}/5g_core_db`;
        }

        if (nf.type === 'ext-dn') {
            return `ext-dn://${ip}/internet`;
        }

        const path = endpointPaths[nf.type] || '/api/v1';
        return `${protocol}://${ip}:${port}${path}`;
    }

    /**
     * NF Added — logs always follow log-scenarios.json after async resources load.
     */
    onNFAdded(nf) {
        console.log('📋 LogEngine: NF Added:', nf.name);

        this.init().then(() => {
            const scenarioKey = this.resolveScenarioKey(nf);
            if (this.logScenarios && scenarioKey) {
                this.runCustomScenario(nf);
            } else {
                console.warn('📋 No log-scenarios entry for NF type:', nf?.type, '— using basic scenario');
                this.runBasicScenario(nf);
            }
        }).catch((err) => {
            console.warn('📋 LogEngine init failed, falling back:', err);
            const scenarioKey = this.resolveScenarioKey(nf);
            if (this.logScenarios && scenarioKey) {
                this.runCustomScenario(nf);
            } else {
                this.runBasicScenario(nf);
            }
        });
    }

    /**
     * Run custom log scenario from JSON
     */
    runCustomScenario(nf) {
        const scenarioKey = this.resolveScenarioKey(nf);
        if (!scenarioKey || !this.logScenarios) {
            this.runBasicScenario(nf);
            return;
        }

        const scenario = this.logScenarios[scenarioKey];
        if (!scenario) {
            this.runBasicScenario(nf);
            return;
        }

        try {

        // ==================================
        // STARTUP LOGS (order: delay asc, then key — matches JSON intent)
        // ==================================
        if (scenario.startup) {
            const keys = Object.keys(scenario.startup).sort((a, b) => {
                const da = scenario.startup[a].delay ?? 0;
                const db = scenario.startup[b].delay ?? 0;
                if (da !== db) return da - db;
                return a.localeCompare(b);
            });
            keys.forEach(k => {
                const logConfig = scenario.startup[k];
                setTimeout(() => {
                    this.addLog(nf.id, logConfig.level, logConfig.message, logConfig.details || {});
                }, logConfig.delay);
            });
        }

        // ==================================
        // DEPENDENCY CHECKS
        // ==================================
        if (scenario.dependencies) {
            Object.keys(scenario.dependencies).forEach(depType => {
                const depConfig = scenario.dependencies[depType];

                // Check if dependency exists
                const exists = this.checkNFTypeExists(depType);
                const isConnected = this.hasConnectionToType(nf, depType);

                if (!exists && depConfig.missing) {
                    // Dependency missing
                    setTimeout(() => {
                        this.addLog(nf.id, depConfig.missing.level, depConfig.missing.message, depConfig.missing.details || {});
                    }, depConfig.missing.delay);
                } else if (exists && !isConnected && depConfig.exists_not_connected) {
                    // Exists but not connected
                    setTimeout(() => {
                        this.addLog(nf.id, depConfig.exists_not_connected.level, depConfig.exists_not_connected.message, depConfig.exists_not_connected.details || {});
                    }, depConfig.exists_not_connected.delay);
                } else if (exists && isConnected) {
                    // Connected - show connection logs
                    if (depConfig.connected) {
                        setTimeout(() => {
                            // Check if connection is via bus
                            const connectionMethod = this.getConnectionMethod(nf, depType);
                            const enhancedDetails = {
                                ...depConfig.connected.details,
                                connectionMethod: connectionMethod
                            };

                            let message = depConfig.connected.message;
                            if (connectionMethod === 'bus') {
                                message = message.replace('connection established', 'connection established via Service Bus');
                            }

                            this.addLog(nf.id, depConfig.connected.level, message, enhancedDetails);
                        }, depConfig.connected.delay);
                    }

                    if (depConfig.registered) {
                        setTimeout(() => {
                            this.addLog(nf.id, depConfig.registered.level, depConfig.registered.message, depConfig.registered.details || {});
                        }, depConfig.registered.delay);
                    }
                }
            });
        }

        // ==================================
        // FINAL STATUS
        // ==================================
        if (scenario.final_status) {
            const depBundle = this._getDependencyBundleForNf(nf);
            const required = Array.isArray(depBundle?.required) ? depBundle.required : [];
            const optional = Array.isArray(depBundle?.optional) ? depBundle.optional : [];

            let hasErrors = false;
            let hasWarnings = false;

            required.forEach(reqType => {
                const exists = this.checkNFTypeExists(reqType);
                const isConnected = this.hasConnectionToType(nf, reqType);
                if (!exists || !isConnected) {
                    hasErrors = true;
                }
            });

            optional.forEach(optType => {
                const exists = this.checkNFTypeExists(optType);
                const isConnected = this.hasConnectionToType(nf, optType);
                if (!exists || !isConnected) {
                    hasWarnings = true;
                }
            });

            let finalStatus;
            const fs = scenario.final_status;
            if (!hasErrors && !hasWarnings) {
                finalStatus = fs.all_ok;
            } else if (hasErrors) {
                finalStatus = fs.failed || fs.partial || fs.all_ok;
            } else {
                finalStatus = fs.partial || fs.all_ok;
            }

            if (finalStatus) {
                setTimeout(() => {
                    this.addLog(nf.id, finalStatus.level, finalStatus.message, finalStatus.details || {});
                }, finalStatus.delay);
            }
        }

        } catch (err) {
            console.error('📋 runCustomScenario failed:', err);
            this.runBasicScenario(nf);
        }
    }

    /**
     * Fallback basic scenario
     */
    runBasicScenario(nf) {
        this.addLog(nf.id, 'INFO', `${nf.type} instance created: ${nf.name}`);

        setTimeout(() => {
            this.addLog(nf.id, 'INFO', `Initializing ${nf.type} services...`);
            setTimeout(() => {
                this.checkDependencies(nf);
            }, 500);
        }, 300);
    }

    checkDependencies(nf) {
        const depInfo = this._getDependencyBundleForNf(nf);
        if (!depInfo) return;
        let hasErrors = false;

        depInfo.required.forEach((requiredType, index) => {
            setTimeout(() => {
                const exists = this.checkNFTypeExists(requiredType);
                const isConnected = this.hasConnectionToType(nf, requiredType);

                if (!exists) {
                    hasErrors = true;
                    this.addLog(nf.id, 'ERROR',
                        `Cannot register with ${requiredType} - ${requiredType} not found in topology`, {
                        suggestion: `Add ${requiredType} to the topology first`
                    });
                } else if (!isConnected) {
                    hasErrors = true;
                    this.addLog(nf.id, 'ERROR',
                        `${requiredType} exists but not connected`, {
                        suggestion: `Connect ${nf.name} to ${requiredType}`
                    });
                } else {
                    this.addLog(nf.id, 'SUCCESS',
                        `Connected to ${requiredType} successfully`);
                }
            }, 200 * index);
        });

        depInfo.optional.forEach((optionalType, index) => {
            setTimeout(() => {
                const exists = this.checkNFTypeExists(optionalType);
                const isConnected = this.hasConnectionToType(nf, optionalType);

                if (!exists || !isConnected) {
                    this.addLog(nf.id, 'WARNING',
                        `${optionalType} not available - Some features may not work`);
                }
            }, 200 * (depInfo.required.length + index));
        });

        setTimeout(() => {
            if (hasErrors) {
                this.addLog(nf.id, 'ERROR',
                    `${nf.type} startup failed - Cannot operate without required dependencies`);
            } else {
                this.addLog(nf.id, 'SUCCESS',
                    `${nf.type} is fully operational ✓`);
            }
        }, 200 * (depInfo.required.length + depInfo.optional.length) + 500);
    }

    /**
     * Connection Created - Generate connection logs
     */
    onConnectionCreated(connection) {
        const sourceNF = window.dataStore?.getNFById(connection.sourceId);
        const targetNF = window.dataStore?.getNFById(connection.targetId);

        if (!sourceNF || !targetNF) return;

        console.log('📋 LogEngine: Connection Created');

        // ========================================
        // SPECIAL CASE: AMF-gNB NGAP Connection
        // ========================================
        if ((sourceNF.type === 'AMF' && targetNF.type === 'gNB') ||
            (sourceNF.type === 'gNB' && targetNF.type === 'AMF')) {
            this.simulateNGAPSetup(sourceNF, targetNF);
            return; // Skip default logs
        }

        // Check if we have custom scenario
        const hasCustom = this.logScenarios &&
            this.logScenarios[sourceNF.type] &&
            this.logScenarios[sourceNF.type].dependencies &&
            this.logScenarios[sourceNF.type].dependencies[targetNF.type];

        if (hasCustom) {
            // Use custom connection logs
            const depConfig = this.logScenarios[sourceNF.type].dependencies[targetNF.type];

            if (depConfig.connected) {
                setTimeout(() => {
                    this.addLog(sourceNF.id, depConfig.connected.level,
                        depConfig.connected.message,
                        depConfig.connected.details || {});
                }, depConfig.connected.delay || 500);
            }

            if (depConfig.registered) {
                setTimeout(() => {
                    this.addLog(sourceNF.id, depConfig.registered.level,
                        depConfig.registered.message,
                        depConfig.registered.details || {});
                }, depConfig.registered.delay || 1000);
            }

            // Also check if target NF needs to log something
            if (targetNF.type === 'NRF' && sourceNF.type !== 'NRF') {
                this.simulateNRFRegistration(sourceNF, targetNF);
            }

        } else {
            // Use default connection logs
            this.addLog(connection.sourceId, 'INFO',
                `Initiating ${connection.interfaceName} connection to ${targetNF.name}`, {
                protocol: 'HTTP/2',
                targetIP: targetNF.config.ipAddress,
                targetPort: targetNF.config.port
            });

            this.addLog(connection.targetId, 'INFO',
                `Incoming connection request from ${sourceNF.name}`, {
                interface: connection.interfaceName,
                sourceIP: sourceNF.config.ipAddress
            });

            setTimeout(() => {
                this.addLog(connection.sourceId, 'INFO', 'TLS handshake in progress...');
                this.addLog(connection.targetId, 'INFO', 'Accepting TLS connection...');
            }, 300);

            setTimeout(() => {
                this.addLog(connection.sourceId, 'SUCCESS', 'TLS handshake complete');
                this.addLog(connection.targetId, 'SUCCESS', 'TLS session established');
            }, 700);

            setTimeout(() => {
                this.addLog(connection.sourceId, 'INFO', 'HTTP/2 connection upgrade...');
            }, 1000);

            setTimeout(() => {
                this.addLog(connection.sourceId, 'SUCCESS',
                    `${connection.interfaceName} connection established with ${targetNF.name}`, {
                    endpoint: `https://${targetNF.config.ipAddress}:${targetNF.config.port}`,
                    protocol: 'HTTP/2',
                    status: 'ACTIVE'
                });

                this.addLog(connection.targetId, 'SUCCESS',
                    `${connection.interfaceName} connection active from ${sourceNF.name}`);

                // Re-check dependencies
                setTimeout(() => {
                    this.recheckDependenciesAfterConnection(sourceNF);
                    this.recheckDependenciesAfterConnection(targetNF);
                }, 500);

                if (targetNF.type === 'NRF') {
                    this.simulateNRFRegistration(sourceNF, targetNF);
                }

            }, 1500);
        }

        // Trigger NGAP/GTP-U simulation for reference point connections
        try {
            const src = window.dataStore.getNFById(connection.sourceId);
            const dst = window.dataStore.getNFById(connection.targetId);

            // gNB -> AMF (N2)
            if (src && dst && ((src.type === 'gNB' && dst.type === 'AMF') || (src.type === 'AMF' && dst.type === 'gNB'))) {
                const gNB = src.type === 'gNB' ? src : dst;
                const AMF = src.type === 'AMF' ? src : dst;
                // ensure not to double-trigger for AMF->gNB direction
                setTimeout(() => this.simulateNGAP(gNB, AMF), 100);
            }

            // gNB -> UPF (N3) — trigger only when both gNB and UPF are involved
            if (src && dst && ((src.type === 'gNB' && dst.type === 'UPF') || (src.type === 'UPF' && dst.type === 'gNB'))) {
                const gNB = src.type === 'gNB' ? src : dst;
                const UPF = src.type === 'UPF' ? src : dst;
                setTimeout(() => this.simulateGTPU(gNB, UPF), 150);
            }
        } catch (e) {
            console.error('Error triggering NGAP/GTP-U simulation:', e);
        }
    }

    /**
     * Simulate NGAP Setup between AMF and gNB
     */
    simulateNGAPSetup(nf1, nf2) {
        // Determine which is AMF and which is gNB
        const amf = nf1.type === 'AMF' ? nf1 : nf2;
        const gnb = nf1.type === 'gNB' ? nf1 : nf2;

        console.log('Simulating NGAP Setup between', gnb.name, 'and', amf.name);

        // Generate unique IDs for this NGAP session
        const globalGNBId = `0x${Math.random().toString(16).substr(2, 8).toUpperCase()}`;
        const ranUENGAPId = Math.floor(Math.random() * 90000) + 10000;
        const amfUENGAPId = Math.floor(Math.random() * 90000) + 10000;

        // Step 1: gNB initiates NGAP Setup Request
        setTimeout(() => {
            this.addLog(gnb.id, 'INFO',
                `Initiating NGAP Setup Request to ${amf.name}...`, {
                messageType: 'NGSetupRequest',
                targetIP: amf.config.ipAddress, targetPort: amf.config.port
            });
        }, 200);

        // Step 2: AMF receives NGAP Setup Request
        setTimeout(() => {
            this.addLog(amf.id, 'INFO',
                `Received NGAP Setup Request from ${gnb.name}`, {
                messageType: 'NGSetupRequest',
                sourceIP: gnb.config.ipAddress, sourcePort: gnb.config.port,
                supportedTAList: ['1']
            });
        }, 400);

        // Step 3: AMF processes and validates
        setTimeout(() => {
            this.addLog(amf.id, 'INFO',
                'Processing NGAP Setup Request...', {
                validating: 'Global gNB ID, Supported TA List',
            });
        }, 700);

        // Step 4: AMF sends NGAP Setup Response
        setTimeout(() => {
            this.addLog(amf.id, 'SUCCESS',
                `Sending NGAP Setup Response to ${gnb.name}`, {
                messageType: 'NGSetupResponse',
                result: 'SUCCESS'
            });
        }, 1000);

        // Step 5: gNB receives NGAP Setup Response
        setTimeout(() => {
            this.addLog(gnb.id, 'SUCCESS',
                `NGAP Setup Response received from ${amf.name}`, {
                messageType: 'NGSetupResponse',
                result: 'SUCCESS'
            });
        }, 1200);

        // Step 6: N2 Connection established
        setTimeout(() => {
            this.addLog(gnb.id, 'SUCCESS',
                `N2 connection established with ${amf.name} ✓`, {
                interface: 'N2',
                protocol: 'NGAP',
                amfEndpoint: `https://${amf.config.ipAddress}:${amf.config.port}/namf-comm/v1`,
                capabilities: 'UE Registration, Context Management, Handover'
            });

            this.addLog(amf.id, 'SUCCESS',
                `N2 connection active with ${gnb.name} ✓`, {
                interface: 'N2',
                protocol: 'NGAP',
            });
        }, 1500);

        // Step 7: Ready for UE registrations
        setTimeout(() => {
            this.addLog(gnb.id, 'INFO',
                'Ready to handle UE registration requests', {
                n2Status: 'ACTIVE',
                n3Status: window.dataStore?.getConnectionsForNF(gnb.id).some(c => {
                    const other = window.dataStore?.getNFById(c.sourceId === gnb.id ? c.targetId : c.sourceId);
                    return other?.type === 'UPF';
                }) ? 'ACTIVE' : 'NOT_CONNECTED',
                radioStatus: 'Broadcasting',
                cellId: globalGNBId
            });

            this.addLog(amf.id, 'INFO',
                `${gnb.name} ready to serve UEs`, {
                registeredGNBs: 1,
                totalCapacity: 1000,
                availableServices: ['Registration', 'Authentication', 'Mobility Management']
            });
        }, 2000);
    }

    // -------------------------
    // NGAP Simulation (gNB <-> AMF)
    // -------------------------
    simulateNGAP(gNB, AMF) {
        // gNB & AMF are NF objects from dataStore
        if (!gNB || !AMF) return;

        // NG Setup Request from gNB to AMF
        setTimeout(() => {
            this.addLog(gNB.id, 'INFO', 'NGAP: NG Setup Request sent to AMF', {
                procedure: 'NG Setup',
            });
        }, 300);

        // NG Setup Response at AMF
        setTimeout(() => {
            this.addLog(AMF.id, 'SUCCESS', 'NGAP: NG Setup Response (successful) from gNB', {
                procedure: 'NG Setup',
                gnbId: gNB.name
            });
        }, 700);

        // Initial UE Message (gNB -> AMF) simulating a registration request
        setTimeout(() => {
            this.addLog(gNB.id, 'INFO', 'NGAP: Initial UE Message (Registration Request) forwarded to AMF', {
                procedure: 'Initial UE Message',
                ue: 'UE-1',
                cause: 'Registration'
            });
        }, 1100);

        // AMF processing + Registration Accept
        setTimeout(() => {
            this.addLog(AMF.id, 'INFO', 'AMF: Authentication and Registration processing', {
                procedure: 'Registration',
                ue: 'UE-1',
                auth: 'EAP-AKA\''
            });
        }, 1600);

        setTimeout(() => {
            this.addLog(AMF.id, 'SUCCESS', 'NGAP: Registration Accept sent to gNB', {
                procedure: 'Registration Accept',
                ue: 'UE-1'
            });
        }, 2000);

        // Final: NGAP session established
        setTimeout(() => {
            this.addLog(gNB.id, 'SUCCESS', 'NGAP: UE context established at gNB', {
                ue: 'UE-1',
                status: 'REGISTERED'
            });
        }, 2400);
    }

    // -------------------------
    // GTP-U Simulation (gNB <-> UPF) - Enhanced N3 Interface
    // -------------------------
    simulateGTPU(gNB, UPF) {
        if (!gNB || !UPF) return;

        // Generate unique identifiers for this GTP-U session
        const teidGNB = `0x${Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0')}`;
        const teidUPF = `0x${Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0')}`;
        const sequenceNum = Math.floor(Math.random() * 65535);

        console.log('📡 Simulating GTP-U on N3 interface between', gNB.name, 'and', UPF.name);

        // Step 1: GTP-U Echo Request (Path Management)
        setTimeout(() => {
            this.addLog(gNB.id, 'INFO',
                `GTP-U Echo Request sent to ${UPF.name} on N3 interface`, {
                protocol: 'GTP-U',
                sourceIP: gNB.config.ipAddress,
                destIP: UPF.config.ipAddress,
            });
        }, 200);

        // Step 2: GTP-U Echo Response
        setTimeout(() => {
            this.addLog(UPF.id, 'SUCCESS',
                `GTP-U Echo Response sent to ${gNB.name}`, {
                messageType: 'Echo Response',
                protocol: 'GTP-U',
            });
        }, 400);

        // Step 3: N3 Path Established
        setTimeout(() => {
            this.addLog(gNB.id, 'SUCCESS',
                `N3 path verified - GTP-U tunnel ready`, {
                interface: 'N3',
                protocol: 'GTP-U',
                pathStatus: 'ACTIVE',
                rtt: '2ms'
            });
        }, 600);

        // Step 4: GTP-U Tunnel Setup Request (from SMF via N4, simulated here)
        setTimeout(() => {
            this.addLog(UPF.id, 'INFO',
                `Creating GTP-U tunnel `, {
                interface: 'N3',
                protocol: 'GTP-U',
            });
        }, 900);

        // Step 5: GTP-U Tunnel Setup Response
        setTimeout(() => {
            this.addLog(gNB.id, 'SUCCESS',
                `GTP-U tunnel established with ${UPF.name}`, {
                interface: 'N3',
                status: 'ESTABLISHED',
                qfi: 9
            });
        }, 1200);


        // Step 10: Continuous data flow indication
        setTimeout(() => {
            const totalThroughput = Math.round(500 + Math.random() * 1500);
            this.addLog(UPF.id, 'SUCCESS',
                `N3 GTP-U tunnel active - Data flowing`, {
                interface: 'N3',
                protocol: 'GTP-U',
            });

            this.addLog(gNB.id, 'SUCCESS',
                `N3 tunnel operational - User data transfer active`, {
                interface: 'N3',
                protocol: 'GTP-U',
            });
        }, 2800);
    }

    /**
     * Simulate NAS Registration over N1 (UE <-> AMF) including SUCI exchange
     * @param {Object} ue - UE NF object
     * @param {Object} amf - AMF NF object
     * @param {Object} params - { imsi, dnn, nssai_sst }
     */
    simulateNASRegistration(ue, amf, params = {}) {
        if (!ue || !amf) return;

        const imsi = params.imsi || '001010000000101';
        const suci = `suci-0-001-01-${imsi.slice(-6)}`;
        const dnn = params.dnn || '5G-Lab';
        const sst = params.nssai_sst ?? 1;

        // Preconditions
        this.addLog(ue.id, 'INFO', 'Starting NAS Registration over N1', {
            interface: 'N1',
            registrationType: 'Initial Registration'
        });

        // 1) Registration Request (UE -> AMF) with SUCI
        setTimeout(() => {
            this.addLog(ue.id, 'INFO', 'NAS: Registration Request sent', {
                interface: 'N1',
                suci: suci,
                dnn: dnn,
                requestedSST: sst
            });
            this.addLog(amf.id, 'INFO', 'NAS: Registration Request received from UE', {
                interface: 'N1',
                suci: suci,
                dnn: dnn,
                requestedSST: sst
            });
        }, 200);

        // 2) Authentication Request (AMF -> UE)
        setTimeout(() => {
            this.addLog(amf.id, 'INFO', 'NAS: Authentication Request', {
                method: '5G-AKA',
                rand: `0x${Math.random().toString(16).substr(2, 8)}`
            });
            this.addLog(ue.id, 'INFO', 'NAS: Authentication Request received', {
                method: '5G-AKA'
            });
        }, 600);

        // 3) Authentication Response (UE -> AMF)
        setTimeout(() => {
            this.addLog(ue.id, 'SUCCESS', 'NAS: Authentication Response (RES*)', {
                resStar: `0x${Math.random().toString(16).substr(2, 8)}`
            });
            this.addLog(amf.id, 'SUCCESS', 'NAS: Authentication verified', {
                result: 'SUCCESS'
            });
        }, 1000);

        // 4) Security Mode Command/Complete
        setTimeout(() => {
            this.addLog(amf.id, 'INFO', 'NAS: Security Mode Command', {
                ciphering: '128-NEA2',
                integrity: '128-NIA2'
            });
            this.addLog(ue.id, 'SUCCESS', 'NAS: Security Mode Complete', {
                selectedAlgorithms: { ciphering: 'NEA2', integrity: 'NIA2' }
            });
        }, 1400);

        // 5) Registration Accept / Complete
        setTimeout(() => {
            const guti = `5g-guti-${Math.random().toString(36).substr(2, 6)}`;
            this.addLog(amf.id, 'SUCCESS', 'NAS: Registration Accept', {
                guti: guti,
                allowedNSSAI: [{ sst }],
                dnn: dnn
            });
            this.addLog(ue.id, 'SUCCESS', 'NAS: Registration Complete', {
                guti: guti,
                status: 'REGISTERED'
            });
        }, 1800);

        // 6) Trigger PDU Session Establishment path (delegated to NFManager)
        setTimeout(() => {
            if (window.nfManager) {
                window.nfManager.registerUEAndEstablishPDU(ue.id);
            }
        }, 2200);
    }

    /**
     * Simulate NRF registration
     */
    simulateNRFRegistration(nf, nrfNF) {
        setTimeout(() => {
            this.addLog(nf.id, 'INFO',
                'Sending NF registration request to NRF...', {
                method: 'PUT',
                endpoint: '/nnrf-nfm/v1/nf-instances/' + nf.id,
                payload: 'NF Profile'
            });
        }, 500);
    
        setTimeout(() => {
            const profileId = `profile-${Math.random().toString(36).substr(2, 9)}`;

            this.addLog(nrfNF.id, 'INFO',
                `Processing registration from ${nf.name}`, {
                nfType: nf.type,
                nfInstanceId: nf.id
            });

            this.addLog(nrfNF.id, 'SUCCESS',
                `${nf.name} registered successfully`, {
                profileId: profileId,
                validity: '3600 seconds',
                status: 'REGISTERED'
            });

            this.addLog(nf.id, 'SUCCESS',
                'Successfully registered with NRF', {
                profileId: profileId,
                nrfAddress: nrfNF.config.ipAddress,
                heartbeatInterval: '60 seconds'
            });

        }, 1200);
    }

    /**
     * Re-check dependencies after connection
     */
    recheckDependenciesAfterConnection(nf) {
        if (!this.dependencies || !this.dependencies[nf.type]) return;

        const depInfo = this.dependencies[nf.type];
        let allSatisfied = true;
        let newlySatisfied = [];

        // Check all required dependencies
        depInfo.required.forEach(reqType => {
            const exists = this.checkNFTypeExists(reqType);
            const isConnected = this.hasConnectionToType(nf, reqType);

            if (!exists || !isConnected) {
                allSatisfied = false;
            } else {
                newlySatisfied.push(reqType);
            }
        });

        // If all dependencies are now satisfied
        if (allSatisfied && newlySatisfied.length > 0) {
            this.addLog(nf.id, 'SUCCESS',
                `All dependencies satisfied - ${nf.type} is now fully operational ✓`, {
                status: 'OPERATIONAL',
                mode: 'FULL',
                timestamp: new Date().toISOString()
            });
        } else if (newlySatisfied.length > 0) {
            // Some dependencies satisfied
            this.addLog(nf.id, 'INFO',
                `Dependencies resolved: ${newlySatisfied.join(', ')}`);
        }
    }

    onNFRemoved(nf) {
        console.log('📋 LogEngine: NF Removed:', nf.name);

        this.addLog(nf.id, 'WARNING',
            `${nf.type} instance ${nf.name} is shutting down`, {
            reason: 'Manual removal',
            timestamp: new Date().toISOString()
        });

        const connections = window.dataStore?.getConnectionsForNF(nf.id) || [];
        connections.forEach(conn => {
            const otherNfId = conn.sourceId === nf.id ? conn.targetId : conn.sourceId;
            const otherNf = window.dataStore?.getNFById(otherNfId);

            if (otherNf) {
                this.addLog(otherNfId, 'ERROR',
                    `Connection lost to ${nf.name}`, {
                    reason: 'Peer NF was removed from topology',
                    interface: conn.interfaceName,
                    impact: 'Service disruption'
                });

                setTimeout(() => {
                    this.checkDependencies(otherNf);
                }, 1000);
            }
        });
    }

    onConnectionDeleted(connection) {
        const sourceNF = window.dataStore?.getNFById(connection.sourceId);
        const targetNF = window.dataStore?.getNFById(connection.targetId);

        if (sourceNF) {
            this.addLog(connection.sourceId, 'WARNING',
                `Connection to ${targetNF?.name || 'unknown'} closed`, {
                interface: connection.interfaceName,
                reason: 'Manual disconnection'
            });

            setTimeout(() => this.checkDependencies(sourceNF), 500);
        }

        if (targetNF) {
            this.addLog(connection.targetId, 'WARNING',
                `Connection from ${sourceNF?.name || 'unknown'} closed`);

            setTimeout(() => this.checkDependencies(targetNF), 500);
        }
    }

    checkNFTypeExists(type) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        return allNFs.some(nf => nf.type === type);
    }

    hasConnectionToType(nf, targetType) {
        // Check direct NF-to-NF connections
        const connections = window.dataStore?.getConnectionsForNF(nf.id) || [];
        const hasDirectConnection = connections.some(conn => {
            const otherNfId = conn.sourceId === nf.id ? conn.targetId : conn.sourceId;
            const otherNf = window.dataStore?.getNFById(otherNfId);
            return otherNf && otherNf.type === targetType;
        });

        if (hasDirectConnection) {
            return true;
        }

        // Check bus connections - if both NFs are on the same bus, consider them connected
        const busConnections = window.dataStore?.getBusConnectionsForNF(nf.id) || [];

        return busConnections.some(busConn => {
            // Get all NFs connected to the same bus
            const sameBusConnections = window.dataStore?.getBusConnectionsForBus(busConn.busId) || [];

            return sameBusConnections.some(otherBusConn => {
                if (otherBusConn.nfId !== nf.id) {
                    const otherNf = window.dataStore?.getNFById(otherBusConn.nfId);
                    return otherNf && otherNf.type === targetType;
                }
                return false;
            });
        });
    }

    /**
     * Get connection method (direct or bus)
     * @param {Object} nf - Network Function
     * @param {string} targetType - Target NF type
     * @returns {string} 'direct' or 'bus'
     */
    getConnectionMethod(nf, targetType) {
        // Check direct connections first
        const connections = window.dataStore?.getConnectionsForNF(nf.id) || [];
        const hasDirectConnection = connections.some(conn => {
            const otherNfId = conn.sourceId === nf.id ? conn.targetId : conn.sourceId;
            const otherNf = window.dataStore?.getNFById(otherNfId);
            return otherNf && otherNf.type === targetType;
        });

        if (hasDirectConnection) {
            return 'direct';
        }

        // Check bus connections
        const busConnections = window.dataStore?.getBusConnectionsForNF(nf.id) || [];
        const hasBusConnection = busConnections.some(busConn => {
            const sameBusConnections = window.dataStore?.getBusConnectionsForBus(busConn.busId) || [];
            return sameBusConnections.some(otherBusConn => {
                if (otherBusConn.nfId !== nf.id) {
                    const otherNf = window.dataStore?.getNFById(otherBusConn.nfId);
                    return otherNf && otherNf.type === targetType;
                }
                return false;
            });
        });

        return hasBusConnection ? 'bus' : 'none';
    }

    getAllLogs() {
        const allLogs = [];
        this.logs.forEach(nfLogs => {
            allLogs.push(...nfLogs);
        });
        return allLogs.sort((a, b) => a.timestamp - b.timestamp);
    }

    getLogsForNF(nfId) {
        return this.logs.get(nfId) || [];
    }

    clearLogsForNF(nfId) {
        this.logs.delete(nfId);
        this.notifyListeners({ type: 'clear', nfId });
    }

    clearAllLogs() {
        this.logs.clear();
        this.notifyListeners({ type: 'clear-all' });
    }

    subscribe(callback) {
        this.logListeners.push(callback);
    }

    notifyListeners(logEntry) {
        this.logListeners.forEach(callback => {
            try {
                callback(logEntry);
            } catch (error) {
                console.error('Error in log listener:', error);
            }
        });
    }

    exportLogsAsJSON() {
        const exportData = {
            exportTime: new Date().toISOString(),
            logs: this.getAllLogs()
        };
        return JSON.stringify(exportData, null, 2);
    }

    exportLogsAsCSV() {
        const logs = this.getAllLogs();
        const headers = ['Timestamp', 'NF Name', 'NF Type', 'Level', 'Message'];
        let csv = headers.join(',') + '\n';

        logs.forEach(log => {
            const nf = window.dataStore?.getNFById(log.nfId);
            const timestamp = new Date(log.timestamp).toISOString();
            csv += [
                timestamp,
                nf?.name || 'Unknown',
                nf?.type || 'Unknown',
                log.level,
                `"${log.message.replace(/"/g, '""')}"`
            ].join(',') + '\n';
        });

        return csv;
    }

    /**
     * Export logs as plain text
     * @returns {string} Plain text string of all logs
     */
    exportLogsAsText() {
        const logs = this.getAllLogs();
        let text = '═══════════════════════════════════════════════════════\n';
        text += '5G SBA DASHBOARD - LOG EXPORT\n';
        text += '═══════════════════════════════════════════════════════\n';
        text += `Export Time: ${new Date().toISOString()}\n`;
        text += `Total Logs: ${logs.length}\n`;
        text += '═══════════════════════════════════════════════════════\n\n';

        logs.forEach(log => {
            const nf = window.dataStore?.getNFById(log.nfId);
            const timestamp = new Date(log.timestamp).toLocaleString();

            text += `[${timestamp}] ${nf?.name || 'Unknown'} (${nf?.type || 'Unknown'}) - ${log.level}\n`;
            text += `${log.message}\n`;

            // Add details if present
            if (log.details && Object.keys(log.details).length > 0) {
                text += 'Details:\n';
                Object.entries(log.details).forEach(([key, value]) => {
                    text += `  ${key}: ${JSON.stringify(value)}\n`;
                });
            }
            text += '\n';
        });

        text += '═══════════════════════════════════════════════════════\n';
        text += 'END OF LOG EXPORT\n';
        text += '═══════════════════════════════════════════════════════\n';

        return text;
    }
}

