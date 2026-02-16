/**
 * ============================================
 * UI CONTROLLER
 * ============================================
 * Manages all user interface interactions and updates
 * 
 * Responsibilities:
 * - Handle button clicks
 * - Manage modals
 * - Update configuration panel
 * - Display logs in UI
 * - Handle connection mode (source/destination selection)
 * - File save/load operations
 */

class UIController {
    constructor() {
        this.connectionMode = 'idle'; // 'idle', 'selecting-source', 'selecting-destination'
        this.selectedSourceNF = null;
        this.selectedDestinationNF = null;
        this.iperf3Servers = new Map(); // Track active iperf3 servers: nfId -> { server, output, intervalId }

        console.log('✅ UIController initialized');
    }

    /**
     * Initialize all UI components and event listeners
     */
    init() {
        console.log('🎮 Initializing UI...');

        // Setup all button handlers
        this.setupAddNFButton();
        this.setupClearButton();
        this.setupValidateButton();
        this.setupTerminalButton();
        this.setupHelpButton();
        this.setupConnectionButtons();
        this.setupNFPalette();
        this.setupConfigPanelToggle();

        // Initialize log panel
        this.initializeLogPanel();

        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();

        console.log('✅ UI initialized');
    }

    // ==========================================
    // NF PALETTE SETUP
    // ==========================================

    /**
     * Setup NF palette in left sidebar
     */
    setupNFPalette() {
        const palette = document.querySelector('.nf-palette');
        if (!palette) return;

        const nfTypes = ['NRF', 'AMF', 'SMF', 'UPF', 'AUSF', 'UDM', 'PCF', 'NSSF', 'UDR', 'gNB', 'UE'];

        nfTypes.forEach(type => {
            const nfDef = window.nfDefinitions?.[type] || {
                name: type,
                color: '#95a5a6'
            };

            const item = document.createElement('div');
            item.className = 'nf-palette-item';
            item.dataset.type = type;

            item.innerHTML = `
                <div class="nf-icon-small" style="background: ${nfDef.color}">
                    ${type[0]}
                </div>
                <div class="nf-label">
                    <div class="nf-name">${type}</div>
                    <div class="nf-desc">${nfDef.name || type}</div>
                </div>
            `;

            // Click to add NF
            item.addEventListener('click', () => {
                console.log('🖱️ Palette item clicked:', type);
                this.createNFFromPalette(type);
            });

            palette.appendChild(item);
        });
    }

    /**
     * Create NF from palette click - NEW WORKFLOW: Show config first
     * @param {string} type - NF type
     */
    createNFFromPalette(type) {
        console.log('🖱️ Palette item clicked:', type);
        // NEW: Show configuration panel first, don't create NF yet
        this.showNFConfigurationForNewNF(type);
    }

    // ==========================================
    // ADD NF BUTTON & MODAL
    // ==========================================

    /**
     * Setup Add NF button and modal
     */
    setupAddNFButton() {
        const addNFBtn = document.getElementById('btn-add-nf');
        if (!addNFBtn) {
            console.error('❌ Add NF button not found');
            return;
        }

        addNFBtn.addEventListener('click', () => {
            console.log('🖱️ Add NF button clicked');
            this.showAddNFModal();
        });

        // Setup modal
        this.setupAddNFModal();
    }

    /**
     * Setup Add NF modal
     */
    setupAddNFModal() {
        const modal = document.getElementById('add-nf-modal');
        const modalCancel = document.getElementById('modal-cancel');
        const nfGrid = document.getElementById('nf-grid');

        if (!modal || !nfGrid) return;

        // Create NF selection buttons
        const nfTypes = ['NRF', 'AMF', 'SMF', 'UPF', 'AUSF', 'UDM', 'PCF', 'NSSF', 'UDR', 'gNB', 'ext-dn', 'UE'];

        nfGrid.innerHTML = '';

        nfTypes.forEach(type => {
            const nfDef = window.nfDefinitions?.[type] || {
                name: type,
                color: '#95a5a6'
            };

            const btn = document.createElement('button');
            btn.className = 'nf-select-btn';
            btn.dataset.type = type;

            btn.innerHTML = `
                <div class="nf-icon" style="background: ${nfDef.color}">
                    ${type[0]}
                </div>
                <div class="nf-label">${type}</div>
            `;

            // Click handler - NEW WORKFLOW: Show config first
            btn.addEventListener('click', () => {
                console.log('🖱️ Modal: Selected NF type:', type);

                // NEW: Show configuration panel first, don't create NF yet
                this.showNFConfigurationForNewNF(type);

                // Close modal
                modal.style.display = 'none';
            });

            nfGrid.appendChild(btn);
        });

        // Cancel button
        if (modalCancel) {
            modalCancel.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    /**
     * Show Add NF modal
     */
    showAddNFModal() {
        const modal = document.getElementById('add-nf-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    // ==========================================
    // CONNECTION BUTTONS (Source/Destination)
    // ==========================================

    /**
     * Setup connection control buttons
     */
    setupConnectionButtons() {
        const btnSource = document.getElementById('btn-select-source');
        const btnDestination = document.getElementById('btn-select-destination');
        const btnCancel = document.getElementById('btn-cancel-connection');

        if (!btnSource || !btnDestination || !btnCancel) {
            console.error('❌ Connection buttons not found');
            return;
        }

        // Select Source button
        btnSource.addEventListener('click', () => {
            console.log('🖱️ Select Source clicked');
            this.enterSourceSelectionMode();
        });

        // Select Destination button
        btnDestination.addEventListener('click', () => {
            console.log('🖱️ Select Destination clicked');
            if (this.selectedSourceNF) {
                // Simplified: Just enter destination mode - user can click NF or Bus
                this.enterDestinationSelectionMode();
                console.log('💡 You can now click on an NF or Bus Line to connect!');
            } else {
                alert('Please select a source NF first!');
            }
        });

        // Cancel button
        btnCancel.addEventListener('click', () => {
            console.log('🖱️ Connection cancelled');
            this.cancelConnectionMode();
        });

        // Listen to canvas clicks for connection mode
        this.setupConnectionModeListener();
    }

    /**
     * Enter bus selection mode
     */
    enterBusSelectionMode() {
        this.connectionMode = 'selecting-bus';

        const btnDestination = document.getElementById('btn-select-destination');
        btnDestination.classList.add('active');
        btnDestination.style.background = '#27ae60';

        this.showCanvasMessage(`Select a SERVICE BUS to connect ${this.selectedSourceNF.name}`);
    }

    /**
     * Select bus and create connection
         */
    selectBus(bus) {
        console.log('✅ Bus selected as destination:', bus.name);

        if (this.selectedSourceNF) {
            // NF to Bus connection
            console.log('🔗 Creating NF-to-Bus connection:', this.selectedSourceNF.name, '→', bus.name);
            if (window.busManager) {
                const connection = window.busManager.connectNFToBus(this.selectedSourceNF.id, bus.id);
                if (connection) {
                    console.log('✅ NF-to-Bus connection created successfully!');
                }
            }
        } else if (this.selectedSourceBus) {
            // Bus to Bus connection
            console.log('🔗 Creating Bus-to-Bus connection:', this.selectedSourceBus.name, '→', bus.name);
            if (window.busManager) {
                const connection = window.busManager.connectBusToBus(this.selectedSourceBus.id, bus.id);
                if (connection) {
                    console.log('✅ Bus-to-Bus connection created successfully!');
                }
            }
        } else {
            console.error('❌ No source selected!');
            alert('Error: No source selected');
        }

        this.cancelConnectionMode();
    }

    /**
     * Setup listener for connection mode canvas clicks
     */
    setupConnectionModeListener() {
        if (window.dataStore) {
            window.dataStore.subscribe((event, data) => {
                if (event === 'nf-added') {
                    this.updateLogNFFilter();
                }
            });
        }

        const canvas = document.getElementById('main-canvas');
        if (canvas) {
            canvas.addEventListener('click', (e) => {
                if (this.connectionMode === 'idle') return;

                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const clickedNF = window.canvasRenderer?.getNFAtPosition(x, y);
                const clickedBus = this.getBusAtPosition(x, y);

                console.log('🖱️ Canvas click in connection mode:', this.connectionMode);
                console.log('🖱️ Clicked NF:', clickedNF?.name || 'none');
                console.log('🖱️ Clicked Bus:', clickedBus?.name || 'none');

                if (this.connectionMode === 'selecting-source') {
                    // In source mode, allow clicking either NF or Bus
                    if (clickedNF) {
                        console.log('🔗 Selecting NF as source...');
                        this.selectSourceNF(clickedNF);
                    } else if (clickedBus) {
                        console.log('🚌 Selecting Bus as source...');
                        this.selectSourceBus(clickedBus);
                    } else {
                        console.log('❌ Please click on an NF or Bus Line');
                    }
                } else if (this.connectionMode === 'selecting-destination') {
                    // In destination mode, allow clicking either NF or Bus
                    if (clickedNF) {
                        console.log('🔗 Connecting to NF...');
                        this.selectDestinationNF(clickedNF);
                    } else if (clickedBus) {
                        console.log(' Connecting to Bus...');
                        this.selectBus(clickedBus);
                    } else {
                        console.log('❌ Please click on an NF or Bus Line');
                    }
                } else if (this.connectionMode === 'selecting-bus' && clickedBus) {
                    // Keep this for backward compatibility
                    console.log(' Bus click detected, calling selectBus...');
                    this.selectBus(clickedBus);
                }
            });
        }
    }
    /**
     * Enter source selection mode
     */
    enterSourceSelectionMode() {
        this.connectionMode = 'selecting-source';
        this.selectedSourceNF = null;
        this.selectedSourceBus = null; // NEW: Clear bus source
        this.selectedDestinationNF = null;

        // Update UI
        const btnSource = document.getElementById('btn-select-source');
        const btnDestination = document.getElementById('btn-select-destination');
        const btnCancel = document.getElementById('btn-cancel-connection');

        btnSource.classList.add('active');
        btnSource.style.background = '#3498db';
        btnDestination.disabled = true;
        btnCancel.style.display = 'block';

        // Show canvas message
        // this.showCanvasMessage('Click an NF or BUS LINE to set as SOURCE');
    }

    /**
     * Enter destination selection mode
     */
    enterDestinationSelectionMode() {
        this.connectionMode = 'selecting-destination';

        // Update UI
        const btnSource = document.getElementById('btn-select-source');
        const btnDestination = document.getElementById('btn-select-destination');

        btnSource.classList.remove('active');
        btnSource.style.background = '';
        btnDestination.classList.add('active');
        btnDestination.style.background = '#4caf50';

        // // Show canvas message
        // const sourceName = this.selectedSourceNF?.name || this.selectedSourceBus?.name || 'source';
        // this.showCanvasMessage(`Click on an NF or BUS LINE to connect from ${sourceName}`);
    }

    /**
     * Select source NF
     * @param {Object} nf - Selected NF
     */
    selectSourceNF(nf) {
        console.log('✅ Source selected:', nf.name);
        this.selectedSourceNF = nf;

        // Enable destination button
        const btnDestination = document.getElementById('btn-select-destination');
        btnDestination.disabled = false;

        // Auto-switch to destination mode
        this.enterDestinationSelectionMode();
    }

    /**
     * Select source Bus
     * @param {Object} bus - Selected Bus
     */
    selectSourceBus(bus) {
        console.log('✅ Bus source selected:', bus.name);
        this.selectedSourceBus = bus;
        this.selectedSourceNF = null; // Clear NF selection

        // Enable destination button
        const btnDestination = document.getElementById('btn-select-destination');
        btnDestination.disabled = false;

        // Auto-switch to destination mode
        this.enterDestinationSelectionMode();
    }

    /**
     * Select destination NF and create connection
     * @param {Object} nf - Selected NF
     */
    selectDestinationNF(nf) {
        console.log('✅ NF selected as destination:', nf.name);
        this.selectedDestinationNF = nf;

        if (this.selectedSourceNF) {
            // NF to NF connection (standard)
            console.log('🔗 Creating NF-to-NF connection:', this.selectedSourceNF.name, '→', nf.name);
            if (window.connectionManager) {
                // Create manual connection (with visual line)
                const connection = window.connectionManager.createManualConnection(
                    this.selectedSourceNF.id,
                    this.selectedDestinationNF.id
                );

                if (connection) {
                    console.log('✅ NF-to-NF connection created successfully');
                }
            }
        } else if (this.selectedSourceBus) {
            // Bus to NF connection
            console.log('🔗 Creating Bus-to-NF connection:', this.selectedSourceBus.name, '→', nf.name);
            if (window.busManager) {
                const connection = window.busManager.connectBusToNF(this.selectedSourceBus.id, nf.id);
                if (connection) {
                    console.log('✅ Bus-to-NF connection created successfully');
                }
            }
        } else {
            console.error('❌ No source selected!');
            alert('Error: No source selected');
        }

        // Reset connection mode
        this.cancelConnectionMode();
    }

    /**
     * Cancel connection mode
     */
    cancelConnectionMode() {
        this.connectionMode = 'idle';
        this.selectedSourceNF = null;
        this.selectedSourceBus = null; // NEW: Clear bus source
        this.selectedDestinationNF = null;

        // Update UI
        const btnSource = document.getElementById('btn-select-source');
        const btnDestination = document.getElementById('btn-select-destination');
        const btnCancel = document.getElementById('btn-cancel-connection');

        btnSource.classList.remove('active');
        btnSource.style.background = '';
        btnDestination.classList.remove('active');
        btnDestination.style.background = '';
        btnDestination.disabled = true;
        btnCancel.style.display = 'none';

        // Hide canvas message
        this.hideCanvasMessage();
    }

    /**
     * Show canvas message
     * @param {string} message - Message to display
     */
    showCanvasMessage(message) {
        const msgElement = document.getElementById('canvas-message');
        if (msgElement) {
            msgElement.textContent = message;
            msgElement.classList.add('show');
        }
    }

    /**
     * Hide canvas message
     */
    hideCanvasMessage() {
        const msgElement = document.getElementById('canvas-message');
        if (msgElement) {
            msgElement.classList.remove('show');
        }
    }

    // ==========================================
    // SAVE / LOAD / CLEAR BUTTONS
    // ==========================================



    /**
     * Setup Clear button
     */
    setupClearButton() {
        const clearBtn = document.getElementById('btn-clear');
        if (!clearBtn) return;

        clearBtn.addEventListener('click', () => {
            console.log('🗑️ Clear clicked');
            this.clearTopology();
        });
    }

    /**
     * Clear entire topology
     */
    clearTopology() {
        if (!confirm('Are you sure you want to clear the entire topology? This cannot be undone.')) {
            return;
        }

        // Clear data
        if (window.dataStore) {
            window.dataStore.clearAll();
        }

        // Clear logs
        if (window.logEngine) {
            window.logEngine.clearAllLogs();
        }

        // Clear log UI
        const logContent = document.getElementById('log-content');
        if (logContent) {
            logContent.innerHTML = '';
        }

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }

        console.log('✅ Topology cleared');
        alert('Topology cleared successfully!');
    }

    /**
     * Setup Validate button
     */
    setupValidateButton() {
        const validateBtn = document.getElementById('btn-validate');
        if (!validateBtn) return;

        validateBtn.addEventListener('click', () => {
            console.log('✓ Validate clicked');
            this.validateTopology();
        });
    }

    /**
     * Validate topology
     */
    validateTopology() {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const allConnections = window.dataStore?.getAllConnections() || [];

        if (allNFs.length === 0) {
            alert('Topology is empty. Add some Network Functions first.');
            return;
        }

        let report = '═══════════════════════════════════\n';
        report += '5G TOPOLOGY VALIDATION REPORT\n';
        report += '═══════════════════════════════════\n\n';

        // Check for NRF
        const hasNRF = allNFs.some(nf => nf.type === 'NRF');
        if (!hasNRF) {
            report += '❌ CRITICAL: NRF is missing!\n';
            report += '   NRF is required as the central registry.\n\n';
        } else {
            report += '✅ NRF exists\n\n';
        }

        // Check each NF
        report += 'NETWORK FUNCTIONS:\n';
        report += '─────────────────────────────────\n';
        allNFs.forEach(nf => {
            const connections = window.dataStore.getConnectionsForNF(nf.id);
            report += `${nf.name} (${nf.type}): ${connections.length} connections\n`;
        });

        report += '\n';
        report += `Total NFs: ${allNFs.length}\n`;
        report += `Total Connections: ${allConnections.length}\n`;

        report += '\n═══════════════════════════════════\n';
        report += hasNRF ? 'STATUS: ✅ VALID' : 'STATUS: ❌ INVALID';
        report += '\n═══════════════════════════════════';

        alert(report);
        console.log(report);
    }

    /**
     * Setup Help button
     */
    setupHelpButton() {
        const helpBtn = document.getElementById('btn-help');
        if (!helpBtn) return;

        helpBtn.addEventListener('click', () => {
            console.log('❓ Help clicked');
            this.showHelpModal();
        });
    }

    /**
     * Setup Terminal button in header
     */
    setupTerminalButton() {
        const terminalBtn = document.getElementById('btn-terminal-header');
        if (!terminalBtn) return;

        terminalBtn.addEventListener('click', () => {
            console.log('💻 Docker Terminal button clicked');
            // Open Docker terminal (main terminal for managing NFs)
            if (window.dockerTerminal) {
                window.dockerTerminal.openTerminal();
            } else {
                console.error('❌ Docker Terminal not initialized');
                alert('Docker Terminal not available. Please refresh the page.');
            }
        });
    }

    /**
     * Show Help modal
     */
    showHelpModal() {
        const modal = document.getElementById('help-modal');
        if (modal) {
            modal.style.display = 'flex';
        }

        // Setup close button
        const closeBtn = document.getElementById('help-close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.style.display = 'none';
            };
        }

        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    // ==========================================
    // CONFIGURATION PANEL
    // ==========================================

    /**
     * Show NF configuration panel for NEW NF (before creation)
     * @param {string} nfType - NF type to configure
     */
    showNFConfigurationForNewNF(nfType) {
        const configForm = document.getElementById('config-form');
        if (!configForm) return;

        // Get NF definition for defaults
        const nfDef = window.nfManager?.getNFDefinition(nfType) || { name: nfType, color: '#95a5a6' };

        // Generate unique default values automatically
        const count = (window.nfManager?.nfCounters[nfType] || 0) + 1;
        const defaultName = `${nfType}-${count}`;
        
        // Get next available unique IP and port
        const defaultIP = this.getNextAvailableIP();
        const defaultPort = this.getNextAvailablePort();
        const globalProtocol = window.globalHTTPProtocol || 'HTTP/2';

        // UE Configuration: Show subscriber information form
        if (nfType === 'UE') {
            // Get default subscriber configuration from UDR store
            const subscribers = window.dataStore?.getSubscribers() || [];
            let defaultIMSI = '001010000000101';
            let defaultKey = 'fec86ba6eb707ed08905757b1bb44b8f';
            let defaultOpc = 'C42449363BBAD02B66D16BC975D77CC1';
            let defaultDnn = '5G-Lab';
            let defaultSst = 1;
            
            // Initialize default subscribers if not present
            if (subscribers.length === 0) {
                if (window.dataStore?.setSubscribers) {
                    window.dataStore.setSubscribers([
                        { imsi: '001010000000101', key: 'fec86ba6eb707ed08905757b1bb44b8f', opc: 'C42449363BBAD02B66D16BC975D77CC1', dnn: '5G-Lab', nssai_sst: 1 },
                        { imsi: '001010000000102', key: 'fec86ba6eb707ed08905757b1bb44b8f', opc: 'C42449363BBAD02B66D16BC975D77CC1', dnn: '5G-Lab', nssai_sst: 1 }
                    ]);
                }
            }
            
            // Find first available subscriber that's not assigned to any UE
            const updatedSubscribers = window.dataStore?.getSubscribers() || [];
            const allUEs = window.dataStore?.getAllNFs().filter(n => n.type === 'UE') || [];
            const usedIMSI = new Set(allUEs.map(ue => ue.config.subscriberImsi).filter(Boolean));
            const availableSubscriber = updatedSubscribers.find(sub => !usedIMSI.has(sub.imsi));
            
            if (availableSubscriber) {
                defaultIMSI = availableSubscriber.imsi;
                defaultKey = availableSubscriber.key;
                defaultOpc = availableSubscriber.opc;
                defaultDnn = availableSubscriber.dnn;
                defaultSst = availableSubscriber.nssai_sst;
            }
            
            configForm.innerHTML = `
                <h4>📱 Configure New UE</h4>
                
                <div class="form-group">
                    <label>IMSI (International Mobile Subscriber Identity) *</label>
                    <input type="text" id="config-imsi" value="${defaultIMSI}" placeholder="001010000000101" required>
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        15-digit unique subscriber identifier
                    </small>
                </div>
                
                <div class="form-group">
                    <label>Key (K) *</label>
                    <input type="text" id="config-key" value="${defaultKey}" placeholder="fec86ba6eb707ed08905757b1bb44b8f" required>
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        128-bit authentication key (32 hex characters)
                    </small>
                </div>
                
                <div class="form-group">
                    <label>OPc (Operator Code) *</label>
                    <input type="text" id="config-opc" value="${defaultOpc}" placeholder="C42449363BBAD02B66D16BC975D77CC1" required>
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        128-bit operator variant key (32 hex characters)
                    </small>
                </div>
                
                <div class="form-group">
                    <label>DNN (Data Network Name) *</label>
                    <input type="text" id="config-dnn" value="${defaultDnn}" placeholder="5G-Lab" required>
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        Network slice identifier (e.g., internet, 5G-Lab)
                    </small>
                </div>
                
                <div class="form-group">
                    <label>NSSAI SST (Slice/Service Type) *</label>
                    <input type="number" id="config-sst" value="${defaultSst}" min="1" max="255" required>
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        1=eMBB, 2=URLLC, 3=MIoT (typically 1)
                    </small>
                </div>
                
                <button class="btn btn-success btn-block" id="btn-start-nf" data-nf-type="${nfType}">
                    🚀 Start UE
                </button>
                <button class="btn btn-secondary btn-block" id="btn-cancel-nf">Cancel</button>
            `;
        } else {
            // Standard configuration for other NF types
            configForm.innerHTML = `
                <h4>Configure New ${nfType}</h4>
                
                <div class="form-group">
                    <label>IP Address *</label>
                    <input type="text" id="config-ip" value="${defaultIP}" required>
                </div>
                
                <div class="form-group">
                    <label>Port *</label>
                    <input type="number" id="config-port" value="${defaultPort}" required>
                </div>
                
                <div class="form-group">
                    <label>🌐 HTTP Protocol (Global Setting)</label>
                    <select id="config-http-protocol">
                        <option value="HTTP/1" ${globalProtocol === 'HTTP/1' ? 'selected' : ''}>HTTP/1.1</option>
                        <option value="HTTP/2" ${globalProtocol === 'HTTP/2' ? 'selected' : ''}>HTTP/2</option>
                    </select>
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        ⚠️ Changing this will update ALL Network Functions in topology
                    </small>
                </div>
                
                <button class="btn btn-success btn-block" id="btn-start-nf" data-nf-type="${nfType}">
                    🚀 Start Network Function
                </button>
                <button class="btn btn-secondary btn-block" id="btn-cancel-nf">Cancel</button>
            `;
        }

        // Protocol change event listener
        const protocolSelect = document.getElementById('config-http-protocol');
        if (protocolSelect) {
            protocolSelect.addEventListener('change', (e) => {
                const newProtocol = e.target.value;
                const currentProtocol = window.globalHTTPProtocol || 'HTTP/2';

                if (newProtocol !== currentProtocol) {
                    const allNFs = window.dataStore?.getAllNFs() || [];
                    const confirmMsg = `⚠️ GLOBAL PROTOCOL CHANGE\n\n` +
                        `This will change HTTP protocol for ALL ${allNFs.length} Network Functions from ${currentProtocol} to ${newProtocol}.\n\n` +
                        `All NFs will use ${newProtocol} for Service-Based Interfaces.\n\n` +
                        `Do you want to continue?`;

                    if (confirm(confirmMsg)) {
                        if (window.nfManager) {
                            const updateCount = window.nfManager.updateGlobalProtocol(newProtocol);
                            alert(`✅ Success!\n\nUpdated ${updateCount} Network Functions to ${newProtocol}`);
                        }
                    } else {
                        protocolSelect.value = currentProtocol;
                    }
                }
            });
        }

        // Start button handler
        const startBtn = document.getElementById('btn-start-nf');
        startBtn.addEventListener('click', () => {
            this.startNewNetworkFunction(nfType);
        });

        // Cancel button handler
        const cancelBtn = document.getElementById('btn-cancel-nf');
        cancelBtn.addEventListener('click', () => {
            this.hideNFConfigPanel();
        });
    }

    /**
     * Show NF configuration panel
     * @param {Object} nf - Network Function to configure
     */
    showNFConfigPanel(nf) {
        const configForm = document.getElementById('config-form');
        if (!configForm) return;

        // UE Configuration: Show subscriber information instead of network details
        if (nf.type === 'UE') {
            const imsi = nf.config.subscriberImsi || '001010000000101';
            const key = nf.config.subscriberKey || 'fec86ba6eb707ed08905757b1bb44b8f';
            const opc = nf.config.subscriberOpc || 'C42449363BBAD02B66D16BC975D77CC1';
            const dnn = nf.config.subscriberDnn || '5G-Lab';
            const sst = nf.config.subscriberSst || 1;
            
            configForm.innerHTML = `
                <h4>📱 ${nf.name} - Subscriber Configuration</h4>
                
                <div class="form-group">
                    <label>UE Type</label>
                    <input type="text" value="${nf.type}" disabled>
                </div>
                
                <div class="form-group">
                    <label>IMSI (International Mobile Subscriber Identity)</label>
                    <input type="text" id="config-imsi" value="${imsi}" placeholder="001010000000101">
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        15-digit unique subscriber identifier
                    </small>
                </div>
                
                <div class="form-group">
                    <label>Key (K)</label>
                    <input type="text" id="config-key" value="${key}" placeholder="fec86ba6eb707ed08905757b1bb44b8f">
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        128-bit authentication key (32 hex characters)
                    </small>
                </div>
                
                <div class="form-group">
                    <label>OPc (Operator Code)</label>
                    <input type="text" id="config-opc" value="${opc}" placeholder="C42449363BBAD02B66D16BC975D77CC1">
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        128-bit operator variant key (32 hex characters)
                    </small>
                </div>
                
                <div class="form-group">
                    <label>DNN (Data Network Name)</label>
                    <input type="text" id="config-dnn" value="${dnn}" placeholder="5G-Lab">
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        Network slice identifier (e.g., internet, 5G-Lab)
                    </small>
                </div>
                
                <div class="form-group">
                    <label>NSSAI SST (Slice/Service Type)</label>
                    <input type="number" id="config-sst" value="${sst}" min="1" max="255">
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        1=eMBB, 2=URLLC, 3=MIoT (typically 1)
                    </small>
                </div>
                
                <button class="btn btn-primary btn-block" id="btn-save-config">Save Subscriber Info</button>
                
                <div class="form-group" style="margin-top: 15px;">
                    <h4>📋 Validation & Testing</h4>
                    <button class="btn btn-info btn-block" id="btn-validate-ue">
                        ✓ Validate UE Against UDR
                    </button>
                    <button class="btn btn-success btn-block" id="btn-collect-logs" style="margin-top: 10px;">
                        📊 Collect Network Logs
                    </button>
                </div>
                
                <button class="btn btn-danger btn-block" id="btn-delete-nf" style="margin-top: 15px;">Delete UE</button>
                
                <div class="troubleshoot-section">
                    <h4>🔧 Troubleshoot</h4>
                    <p class="config-hint">Open Windows-style terminal for network diagnostics</p>
                    
                    <button class="btn btn-terminal btn-block" id="btn-open-terminal">
                        💻 Open Command Prompt
                    </button>
                </div>
            `;
        } else {
            // Standard configuration for other NF types
            configForm.innerHTML = `
                <h4>${nf.name} Configuration</h4>
                
                <div class="form-group">
                    <label>NF Type</label>
                    <input type="text" value="${nf.type}" disabled>
                </div>
                
                <div class="form-group">
                    <label>IP Address</label>
                    <input type="text" id="config-ip" value="${nf.config.ipAddress}">
                </div>
                
                <div class="form-group">
                    <label>Port</label>
                    <input type="number" id="config-port" value="${nf.config.port}">
                </div>
                
                
                <div class="form-group">
                    <label>🌐 HTTP Protocol (Global Setting)</label>
                    <select id="config-http-protocol">
                        <option value="HTTP/1" ${nf.config.httpProtocol === 'HTTP/1' ? 'selected' : ''}>HTTP/1.1</option>
                        <option value="HTTP/2" ${nf.config.httpProtocol === 'HTTP/2' ? 'selected' : ''}>HTTP/2</option>
                    </select>
                    <small style="color: #95a5a6; font-size: 11px; display: block; margin-top: 4px;">
                        ⚠️ Changing this will update ALL Network Functions in topology
                    </small>
                </div>
                
                
                <button class="btn btn-primary btn-block" id="btn-save-config">Save Changes</button>
                <button class="btn btn-danger btn-block" id="btn-delete-nf">Delete NF</button>

            ${nf.type === 'UDR' ? `
            <div class="form-group">
                <h4>UDR Subscriber Management</h4>
                <button class="btn btn-info btn-block" id="btn-show-subs">Show Subscriber Info</button>
            </div>
            ` : ''}
            
            ${nf.type === 'gNB' ? `
            <div class="form-group">
                <h4>Student Triggers</h4>
                <button class="btn btn-info btn-block" id="btn-trigger-ngap">Trigger NGAP Flow</button>
                <button class="btn btn-info btn-block" id="btn-trigger-gtpu">Trigger GTP-U Packet</button>
            </div>
            ` : ''}
            
            <div class="troubleshoot-section">
                <h4>🔧 Troubleshoot</h4>
                <p class="config-hint">Open Windows-style terminal for network diagnostics</p>
                
                <button class="btn btn-terminal btn-block" id="btn-open-terminal">
                    💻 Open Command Prompt
                </button>
            </div>
        `;
        }

        // Protocol change event listener (only for non-UE types)
        const protocolSelect = document.getElementById('config-http-protocol');
        if (protocolSelect) {
            protocolSelect.addEventListener('change', (e) => {
                const newProtocol = e.target.value;

                // Show confirmation dialog
                const currentProtocol = window.globalHTTPProtocol || 'HTTP/2';
                if (newProtocol !== currentProtocol) {
                    const allNFs = window.dataStore?.getAllNFs() || [];
                    const confirmMsg = `⚠️ GLOBAL PROTOCOL CHANGE\n\n` +
                        `This will change HTTP protocol for ALL ${allNFs.length} Network Functions from ${currentProtocol} to ${newProtocol}.\n\n` +
                        `All NFs will use ${newProtocol} for Service-Based Interfaces.\n\n` +
                        `Do you want to continue?`;

                    if (confirm(confirmMsg)) {
                        // Update global protocol
                        if (window.nfManager) {
                            const updateCount = window.nfManager.updateGlobalProtocol(newProtocol);
                            alert(`✅ Success!\n\nUpdated ${updateCount} Network Functions to ${newProtocol}`);

                            // Refresh config panel to show updated value
                            this.showNFConfigPanel(nf);
                        }
                    } else {
                        // Revert selection
                        protocolSelect.value = currentProtocol;
                    }
                }
            });
        }

        // Save button handler
        const saveBtn = document.getElementById('btn-save-config');
        saveBtn.addEventListener('click', () => {
            this.saveNFConfig(nf.id);
        });

        // Delete button handler
        const deleteBtn = document.getElementById('btn-delete-nf');
        deleteBtn.addEventListener('click', () => {
            this.deleteNF(nf.id);
        });

        // UE: Validation and Log Collection
        if (nf.type === 'UE') {
            const btnValidate = document.getElementById('btn-validate-ue');
            if (btnValidate) {
                btnValidate.addEventListener('click', () => {
                    this.validateUEAgainstUDR(nf.id);
                });
            }

            const btnCollectLogs = document.getElementById('btn-collect-logs');
            if (btnCollectLogs) {
                btnCollectLogs.addEventListener('click', () => {
                    this.collectNetworkLogs(nf.id);
                });
            }
        }

        // UDR: Show Subscriber Info
        if (nf.type === 'UDR') {
            const btnSubs = document.getElementById('btn-show-subs');
            if (btnSubs) {
                btnSubs.onclick = () => {
                    const store = window.dataStore;
                    const current = store.getSubscribers();
                    // Pre-populate two records if empty
                    if (current.length === 0) {
                        store.setSubscribers([
                            { imsi: '001010000000101', key: 'fec86ba6eb707ed08905757b1bb44b8f', opc: 'C42449363BBAD02B66D16BC975D77CC1', dnn: '5G-Lab', nssai_sst: 1 },
                            { imsi: '001010000000102', key: 'fec86ba6eb707ed08905757b1bb44b8f', opc: 'C42449363BBAD02B66D16BC975D77CC1', dnn: '5G-Lab', nssai_sst: 1 }
                        ]);
                    }
                    const list = store.getSubscribers();
                    const lines = list.map((s, i) => `${i+1}) IMSI=${s.imsi} DNN=${s.dnn} SST=${s.nssai_sst}`).join('\n');
                    const choiceStr = prompt(`Subscribers:\n\n${lines}\n\nEnter 1 or 2 to edit, or IMSI to add:`, '1');
                    if (!choiceStr) return;
                    let sub = null;
                    if (choiceStr === '1' || choiceStr === '2') {
                        sub = list[parseInt(choiceStr,10)-1];
                    } else {
                        sub = { imsi: choiceStr, key: '', opc: '', dnn: '5G-Lab', nssai_sst: 1 };
                    }
                    const imsi = prompt('IMSI:', sub.imsi) || sub.imsi;
                    const key = prompt('Key (hex16/32):', sub.key) || sub.key;
                    const opc = prompt('OPC (hex32):', sub.opc) || sub.opc;
                    const dnn = prompt('DNN:', sub.dnn) || sub.dnn;
                    const sst = parseInt(prompt('NSSAI SST:', String(sub.nssai_sst)) || String(sub.nssai_sst), 10) || sub.nssai_sst;
                    store.upsertSubscriber(imsi, { key, opc, dnn, nssai_sst: sst });
                    alert('✅ Subscriber saved. UDR/MySQL store updated.');
                };
            }
        }

        // Student trigger button handlers (only available for gNB)
        if (nf.type === 'gNB') {
            const btnNgap = document.getElementById('btn-trigger-ngap');
            const btnGtpu = document.getElementById('btn-trigger-gtpu');

            if (btnNgap) {
                btnNgap.onclick = () => {
                    const amf = window.dataStore.getAllNFs().find(x => x.type === 'AMF');
                    if (!amf) return alert('Please add and connect an AMF to see NGAP flows.');
                    // Use logEngine (exists globally)
                    if (window.logEngine && typeof window.logEngine.simulateNGAP === 'function') {
                        window.logEngine.simulateNGAP(nf, amf);
                    } else {
                        alert('NGAP simulator not available.');
                    }
                };
            }

            if (btnGtpu) {
                btnGtpu.onclick = () => {
                    const upf = window.dataStore.getAllNFs().find(x => x.type === 'UPF');
                    if (!upf) return alert('Please add and connect a UPF to see GTP-U flows.');
                    if (window.logEngine && typeof window.logEngine.simulateGTPU === 'function') {
                        window.logEngine.simulateGTPU(nf, upf);
                    } else {
                        alert('GTP-U simulator not available.');
                    }
                };
            }
        }

        // UE registration happens automatically when UE becomes stable
        // No manual button needed

        // Ping troubleshooting handlers
        this.setupPingTroubleshootingHandlers(nf.id);
    }

    /**
     * Start new Network Function with IP conflict prevention
     * @param {string} nfType - NF type
     */
    startNewNetworkFunction(nfType) {
        // UE: Handle subscriber information
        if (nfType === 'UE') {
            const imsi = document.getElementById('config-imsi')?.value;
            const key = document.getElementById('config-key')?.value;
            const opc = document.getElementById('config-opc')?.value;
            const dnn = document.getElementById('config-dnn')?.value;
            const sst = parseInt(document.getElementById('config-sst')?.value);

            if (!imsi || !key || !opc || !dnn || !sst) {
                alert('Please fill all subscriber fields');
                return;
            }

            // Validate IMSI (15 digits)
            if (!/^\d{15}$/.test(imsi)) {
                alert('❌ Invalid IMSI!\n\nIMSI must be exactly 15 digits.');
                return;
            }

            // Validate Key (32 hex characters)
            if (!/^[0-9a-fA-F]{32}$/.test(key)) {
                alert('❌ Invalid Key!\n\nKey must be exactly 32 hexadecimal characters.');
                return;
            }

            // Validate OPc (32 hex characters)
            if (!/^[0-9a-fA-F]{32}$/.test(opc)) {
                alert('❌ Invalid OPc!\n\nOPc must be exactly 32 hexadecimal characters.');
                return;
            }

            // Check for duplicate IMSI - ensure no other UE has the same IMSI
            const allUEs = window.dataStore?.getAllNFs().filter(n => n.type === 'UE') || [];
            const duplicateUE = allUEs.find(ue => ue.config.subscriberImsi === imsi);
            if (duplicateUE) {
                alert(`❌ Duplicate IMSI Detected!\n\nIMSI ${imsi} is already assigned to ${duplicateUE.name}.\n\nEach UE must have a unique IMSI number.`);
                return;
            }

            // Validate IMSI exists in UDR subscriber database
            const subscribers = window.dataStore?.getSubscribers() || [];
            const subscriber = subscribers.find(s => s.imsi === imsi);
            if (!subscriber) {
                alert(`❌ IMSI Not Found in UDR!\n\nIMSI ${imsi} is not registered in the UDR/MySQL subscriber database.\n\nPlease register this subscriber in UDR first before creating the UE.`);
                return;
            }

            // Validate that UE configuration matches subscriber profile
            if (subscriber.dnn && subscriber.dnn !== dnn) {
                alert(`❌ DNN Mismatch!\n\nUE DNN (${dnn}) does not match subscriber profile DNN (${subscriber.dnn}).\n\nPlease update UE configuration to match the subscriber profile.`);
                return;
            }

            if (subscriber.nssai_sst && subscriber.nssai_sst !== sst) {
                alert(`❌ NSSAI SST Mismatch!\n\nUE SST (${sst}) does not match subscriber profile SST (${subscriber.nssai_sst}).\n\nPlease update UE configuration to match the subscriber profile.`);
                return;
            }

            console.log('🚀 Starting new UE with subscriber info:', { imsi, dnn, sst });

            // Calculate position with proper spacing
            const position = this.calculateNFPositionWithSpacing(nfType);

            // Create UE with automatic unique IP/port
            if (window.nfManager) {
                const nf = window.nfManager.createNetworkFunction(nfType, position);

                if (nf) {
                    // Set subscriber configuration
                    nf.config.subscriberImsi = imsi;
                    nf.config.subscriberKey = key;
                    nf.config.subscriberOpc = opc;
                    nf.config.subscriberDnn = dnn;
                    nf.config.subscriberSst = sst;

                    // Update in data store
                    window.dataStore.updateNF(nf.id, nf);

                    console.log('✅ UE started successfully:', nf.name);

                    // Log UE creation with subscriber info
                    if (window.logEngine) {
                        window.logEngine.addLog(nf.id, 'SUCCESS',
                            `${nf.name} created with subscriber profile`, {
                            IMSI: imsi,
                            DNN: dnn,
                            NSSAI_SST: sst,
                            IP: nf.config.ipAddress,
                            Subnet: window.nfManager?.getNetworkFromIP(nf.config.ipAddress) + '.0/24'
                        });
                    }

                    // Re-render canvas
                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }

                    // Show config panel for the new UE
                    this.showNFConfigPanel(nf);
                }
            }
            return;
        }

        // Standard NF configuration
        const ipAddress = document.getElementById('config-ip')?.value;
        const port = parseInt(document.getElementById('config-port')?.value);
        const httpProtocol = document.getElementById('config-http-protocol')?.value;

        if (!ipAddress || !port) {
            alert('Please fill all required fields');
            return;
        }

        // Validate IP address format
        if (!this.isValidIP(ipAddress)) {
            alert('❌ Invalid IP address format!\n\nPlease enter a valid IP address (e.g., 192.168.1.20)');
            return;
        }

        // Check for IP conflicts
        if (!window.nfManager?.isIPAddressAvailable(ipAddress)) {
            alert(`❌ IP Conflict Detected!\n\nIP address ${ipAddress} is already in use by another service.\n\nPlease choose a different IP address.`);
            return;
        }

        // Check for port conflicts
        if (!window.nfManager?.isPortAvailable(port)) {
            alert(`❌ Port Conflict Detected!\n\nPort ${port} is already in use by another service.\n\nPlease choose a different port number.`);
            return;
        }

        console.log('🚀 Starting new NF:', { nfType, ipAddress, port, httpProtocol });

        // Calculate position with proper spacing
        const position = this.calculateNFPositionWithSpacing(nfType);

        // Create NF with automatic unique IP/port (will be overridden)
        if (window.nfManager) {
            const nf = window.nfManager.createNetworkFunction(nfType, position);

            if (nf) {
                // Override with user-specified configuration
                nf.config.ipAddress = ipAddress;
                nf.config.port = port;
                nf.config.httpProtocol = httpProtocol;

                // Update in data store
                window.dataStore.updateNF(nf.id, nf);

                console.log('✅ NF started successfully:', nf.name);

                // Log service creation with network info
                if (window.logEngine) {
                    window.logEngine.addLog(nf.id, 'SUCCESS',
                        `${nf.name} created successfully`, {
                        ipAddress: ipAddress,
                        port: port,
                        subnet: window.nfManager?.getNetworkFromIP(ipAddress) + '.0/24',
                        protocol: httpProtocol,
                        status: 'starting',
                        note: 'Service will be stable in 5 seconds'
                    });
                }

                // Auto-connect to bus if applicable
                this.autoConnectToBusIfApplicable(nf);

                // Clear configuration panel
                this.hideNFConfigPanel();

                // Re-render canvas
                if (window.canvasRenderer) {
                    window.canvasRenderer.render();
                }
            } else {
                // NF creation failed (e.g., UE limit reached)
                console.warn('⚠️ NF creation failed for type:', nfType);
                // Don't clear the config panel so user can try a different NF type
                return;
            }
        } else {
            console.error('❌ NFManager not available');
            alert('Error: NFManager not available');
        }
    }

    /**
     * Calculate NF position with proper spacing
     * @param {string} nfType - NF type
     * @returns {Object} {x, y} position
     */
    calculateNFPositionWithSpacing(nfType) {
        const allNFs = window.dataStore?.getAllNFs() || [];

        // Grid layout with better spacing
        const nfsPerRow = 6;  // More NFs per row
        const nfWidth = 60;   // Smaller width for better fit
        const nfHeight = 80;  // Height including label
        const marginX = 40;   // Horizontal spacing
        const marginY = 60;   // Vertical spacing
        const startX = 120;   // Start position X
        const startY = 120;   // Start position Y

        const totalNFs = allNFs.length;
        const row = Math.floor(totalNFs / nfsPerRow);
        const col = totalNFs % nfsPerRow;

        return {
            x: startX + col * (nfWidth + marginX),
            y: startY + row * (nfHeight + marginY)
        };
    }

    /**
     * Auto-connect NF to bus line if applicable
     * @param {Object} nf - Network Function
     */
    autoConnectToBusIfApplicable(nf) {
        // Don't auto-connect UPF, gNB, and UE as per requirement
        const excludedTypes = ['UPF', 'gNB', 'UE'];

        if (excludedTypes.includes(nf.type)) {
            console.log(`🚫 Skipping auto-connect for ${nf.type} (excluded type)`);
            return;
        }

        // Find available bus lines
        const allBuses = window.dataStore?.getAllBuses() || [];

        if (allBuses.length === 0) {
            console.log('ℹ️ No bus lines available for auto-connect');
            return;
        }

        // Connect to the first available bus (or you can add logic to choose the best bus)
        const targetBus = allBuses[0];

        if (window.busManager) {
            console.log(`🔗 Auto-connecting ${nf.name} to ${targetBus.name}`);
            const connection = window.busManager.connectNFToBus(nf.id, targetBus.id);

            if (connection) {
                
                // Add log for auto-connection
                if (window.logEngine) {
                    window.logEngine.addLog(nf.id, 'INFO',
                        `Auto-connected to ${targetBus.name} service bus`, {
                        busId: targetBus.id,
                        interfaceName: connection.interfaceName,
                        autoConnect: true
                    });
                }
            }
        }
    }

    /**
     * Hide NF configuration panel
     */
    hideNFConfigPanel() {
        const configForm = document.getElementById('config-form');
        if (configForm) {
            configForm.innerHTML = '<p class="hint">Select a Network Function type to configure and start it</p>';
        }
    }

    /**
     * Save NF configuration with IP conflict prevention
     * @param {string} nfId - NF ID
     */
    saveNFConfig(nfId) {
        const nf = window.dataStore.getNFById(nfId);
        if (!nf) return;

        // UE: Save subscriber information
        if (nf.type === 'UE') {
            const imsi = document.getElementById('config-imsi')?.value;
            const key = document.getElementById('config-key')?.value;
            const opc = document.getElementById('config-opc')?.value;
            const dnn = document.getElementById('config-dnn')?.value;
            const sst = parseInt(document.getElementById('config-sst')?.value);

            if (!imsi || !key || !opc || !dnn || !sst) {
                alert('Please fill all subscriber fields');
                return;
            }

            // Validate IMSI (15 digits)
            if (!/^\d{15}$/.test(imsi)) {
                alert('❌ Invalid IMSI!\n\nIMSI must be exactly 15 digits.');
                return;
            }

            // Validate Key (32 hex characters)
            if (!/^[0-9a-fA-F]{32}$/.test(key)) {
                alert('❌ Invalid Key!\n\nKey must be exactly 32 hexadecimal characters.');
                return;
            }

            // Validate OPc (32 hex characters)
            if (!/^[0-9a-fA-F]{32}$/.test(opc)) {
                alert('❌ Invalid OPc!\n\nOPc must be exactly 32 hexadecimal characters.');
                return;
            }

            // Check for duplicate IMSI - ensure no other UE has the same IMSI
            const allUEs = window.dataStore?.getAllNFs().filter(n => n.type === 'UE' && n.id !== nfId) || [];
            const duplicateUE = allUEs.find(ue => ue.config.subscriberImsi === imsi);
            if (duplicateUE) {
                alert(`❌ Duplicate IMSI Detected!\n\nIMSI ${imsi} is already assigned to ${duplicateUE.name}.\n\nEach UE must have a unique IMSI number.`);
                return;
            }

            // Validate IMSI exists in UDR subscriber database
            const subscribers = window.dataStore?.getSubscribers() || [];
            const subscriber = subscribers.find(s => s.imsi === imsi);
            if (!subscriber) {
                alert(`❌ IMSI Not Found in UDR!\n\nIMSI ${imsi} is not registered in the UDR/MySQL subscriber database.\n\nPlease register this subscriber in UDR first before configuring the UE.`);
                return;
            }

            // Validate that UE configuration matches subscriber profile
            if (subscriber.dnn && subscriber.dnn !== dnn) {
                alert(`❌ DNN Mismatch!\n\nUE DNN (${dnn}) does not match subscriber profile DNN (${subscriber.dnn}).\n\nPlease update UE configuration to match the subscriber profile.`);
                return;
            }

            if (subscriber.nssai_sst && subscriber.nssai_sst !== sst) {
                alert(`❌ NSSAI SST Mismatch!\n\nUE SST (${sst}) does not match subscriber profile SST (${subscriber.nssai_sst}).\n\nPlease update UE configuration to match the subscriber profile.`);
                return;
            }

            // Update subscriber configuration
            nf.config.subscriberImsi = imsi;
            nf.config.subscriberKey = key;
            nf.config.subscriberOpc = opc;
            nf.config.subscriberDnn = dnn;
            nf.config.subscriberSst = sst;

            window.dataStore.updateNF(nfId, nf);

            // Log configuration change
            if (window.logEngine) {
                window.logEngine.addLog(nfId, 'SUCCESS',
                    `Subscriber information updated`, {
                    IMSI: imsi,
                    DNN: dnn,
                    NSSAI_SST: sst,
                    Key: key.substring(0, 8) + '...',
                    OPc: opc.substring(0, 8) + '...'
                });
            }

            alert('✅ Subscriber information saved successfully!');
            
            // Re-render canvas
            if (window.canvasRenderer) {
                window.canvasRenderer.render();
            }
            return;
        }

        // Standard NF configuration
        const ipAddress = document.getElementById('config-ip')?.value;
        const port = parseInt(document.getElementById('config-port')?.value);
        const httpProtocol = document.getElementById('config-http-protocol')?.value;

        if (!ipAddress || !port) {
            alert('Please fill all required fields');
            return;
        }

        // Validate IP address format
        if (!this.isValidIP(ipAddress)) {
            alert('❌ Invalid IP address format!\n\nPlease enter a valid IP address (e.g., 192.168.1.20)');
            return;
        }

        // Check for IP conflicts (excluding current NF)
        if (nf.config.ipAddress !== ipAddress) {
            if (!window.nfManager?.isIPAddressAvailable(ipAddress)) {
                alert(`❌ IP Conflict Detected!\n\nIP address ${ipAddress} is already in use by another service.\n\nPlease choose a different IP address.`);
                return;
            }
        }

        // Check for port conflicts (excluding current NF)
        if (nf.config.port !== port) {
            if (!window.nfManager?.isPortAvailable(port)) {
                alert(`❌ Port Conflict Detected!\n\nPort ${port} is already in use by another service.\n\nPlease choose a different port number.`);
                return;
            }
        }

        // Update NF
        const oldIP = nf.config.ipAddress;
        const oldPort = nf.config.port;

        nf.config.ipAddress = ipAddress;
        nf.config.port = port;
        nf.config.httpProtocol = httpProtocol;

        window.dataStore.updateNF(nfId, nf);

        // Log configuration change
        if (window.logEngine) {
            const changes = [];
            if (oldIP !== ipAddress) changes.push(`IP: ${oldIP} → ${ipAddress}`);
            if (oldPort !== port) changes.push(`Port: ${oldPort} → ${port}`);
            
            if (changes.length > 0) {
                window.logEngine.addLog(nfId, 'INFO',
                    `Configuration updated: ${changes.join(', ')}`, {
                    previousIP: oldIP,
                    newIP: ipAddress,
                    previousPort: oldPort,
                    newPort: port,
                    subnet: window.nfManager?.getNetworkFromIP(ipAddress) + '.0/24'
                });
            }
        }

        // Re-render
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }

        alert('✅ Configuration saved successfully!\n\n' + 
              `IP: ${ipAddress}\n` +
              `Port: ${port}\n` +
              `Subnet: ${window.nfManager?.getNetworkFromIP(ipAddress)}.0/24`);
        console.log('✅ NF config saved:', nf.name);
    }

    /**
     * Delete NF
     * @param {string} nfId - NF ID
     */
    deleteNF(nfId) {
        const nf = window.dataStore.getNFById(nfId);
        if (!nf) return;

        if (!confirm(`Are you sure you want to delete ${nf.name}?`)) {
            return;
        }

        if (window.nfManager) {
            window.nfManager.deleteNetworkFunction(nfId);
        }

        this.hideNFConfigPanel();
    }

    // ==========================================
    // LOG PANEL
    // ==========================================

    /**
     * Initialize log panel
     */
    initializeLogPanel() {
        console.log('📋 Initializing log panel...');

        // Subscribe to log engine
        if (window.logEngine) {
            window.logEngine.subscribe((logEntry) => {
                if (logEntry.type) return; // Skip event objects
                this.appendLogToUI(logEntry);
            });
        }

        // Setup log controls
        const filterNF = document.getElementById('log-filter-nf');
        const filterLevel = document.getElementById('log-filter-level');
        const clearBtn = document.getElementById('btn-clear-logs');
        const exportBtn = document.getElementById('btn-export-logs');
        const toggleBtn = document.getElementById('btn-toggle-logs');

        if (filterNF) {
            filterNF.addEventListener('change', () => this.filterLogs());
        }

        if (filterLevel) {
            filterLevel.addEventListener('change', () => this.filterLogs());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const logContent = document.getElementById('log-content');
                if (logContent) {
                    logContent.innerHTML = '';
                }
                if (window.logEngine) {
                    window.logEngine.clearAllLogs();
                }
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportLogs());
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleLogPanel());
        }

        console.log('✅ Log panel initialized');
    }

    /**
     * Append log entry to UI
     * @param {Object} logEntry - Log entry object
     */
    appendLogToUI(logEntry) {
        const logContent = document.getElementById('log-content');
        if (!logContent) return;

        const nf = window.dataStore?.getNFById(logEntry.nfId);
        const nfName = nf?.name || logEntry.nfId;

        const logDiv = document.createElement('div');
        logDiv.className = `log-entry ${logEntry.level}`;
        logDiv.dataset.nfId = logEntry.nfId;
        logDiv.dataset.level = logEntry.level;

        const time = new Date(logEntry.timestamp).toLocaleTimeString();

        logDiv.innerHTML = `
            <span class="log-timestamp">[${time}]</span>
            <span class="log-nf-name">${nfName}</span>
            <span class="log-level">${logEntry.level}</span>
            <span class="log-message">${this.escapeHtml(logEntry.message)}</span>
        `;

        // Add details if present
        if (logEntry.details && Object.keys(logEntry.details).length > 0) {
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'log-details';

            Object.entries(logEntry.details).forEach(([key, value]) => {
                const detailLine = document.createElement('div');
                detailLine.textContent = `${key}: ${JSON.stringify(value)}`;
                detailsDiv.appendChild(detailLine);
            });

            logDiv.appendChild(detailsDiv);
        }

        logContent.appendChild(logDiv);

        // Auto-scroll to bottom
        logContent.scrollTop = logContent.scrollHeight;

        // Limit displayed logs
        while (logContent.children.length > 500) {
            logContent.removeChild(logContent.firstChild);
        }
    }

    /**
     * Filter logs based on selected filters
     */
    filterLogs() {
        const filterNF = document.getElementById('log-filter-nf')?.value || 'all';
        const filterLevel = document.getElementById('log-filter-level')?.value || 'all';
        const logContent = document.getElementById('log-content');

        if (!logContent) return;

        const allLogEntries = logContent.querySelectorAll('.log-entry');

        allLogEntries.forEach(entry => {
            let show = true;

            if (filterNF !== 'all' && entry.dataset.nfId !== filterNF) {
                show = false;
            }

            if (filterLevel !== 'all' && entry.dataset.level !== filterLevel) {
                show = false;
            }

            entry.style.display = show ? 'flex' : 'none';
        });
    }

    /**
     * Update NF filter dropdown in log panel
     */
    updateLogNFFilter() {
        const select = document.getElementById('log-filter-nf');
        if (!select) return;

        const currentValue = select.value;

        // Clear options except "All NFs"
        while (select.options.length > 1) {
            select.remove(1);
        }

        // Add option for each NF
        const allNFs = window.dataStore?.getAllNFs() || [];
        allNFs.forEach(nf => {
            const option = document.createElement('option');
            option.value = nf.id;
            option.textContent = `${nf.name} (${nf.type})`;
            select.appendChild(option);
        });

        // Restore previous selection if valid
        if (currentValue && [...select.options].some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        }
    }

    /**
     * Export logs
     */
    exportLogs() {
        if (!window.logEngine) return;

        const format = prompt('Export format (json/csv/txt):', 'txt');

        if (!format) return;

        let content, filename, mimeType;

        if (format.toLowerCase() === 'json') {
            content = window.logEngine.exportLogsAsJSON();
            filename = `5g-logs-${Date.now()}.json`;
            mimeType = 'application/json';
        } else if (format.toLowerCase() === 'csv') {
            content = window.logEngine.exportLogsAsCSV();
            filename = `5g-logs-${Date.now()}.csv`;
            mimeType = 'text/csv';
        } else if (format.toLowerCase() === 'txt') {
            content = window.logEngine.exportLogsAsText();
            filename = `5g-logs-${Date.now()}.txt`;
            mimeType = 'text/plain';
        } else {
            alert('Invalid format. Use "json", "csv", or "txt"');
            return;
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        console.log('✅ Logs exported as', format);
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Toggle log panel visibility
     */
    toggleLogPanel() {
        const logPanel = document.getElementById('log-panel');
        const toggleIcon = document.getElementById('toggle-icon');

        if (!logPanel || !toggleIcon) return;

        const isCollapsed = logPanel.classList.contains('collapsed');

        if (isCollapsed) {
            // Show logs
            logPanel.classList.remove('collapsed');
            toggleIcon.textContent = '▼';
            console.log('📋 Log panel expanded');
        } else {
            // Hide logs
            logPanel.classList.add('collapsed');
            toggleIcon.textContent = '▲';
            console.log('📋 Log panel collapsed');
        }

        // Trigger canvas resize after panel toggle animation completes
        setTimeout(() => {
            if (window.canvasRenderer) {
                window.canvasRenderer.resizeCanvas();
            }
        }, 350); // Wait for CSS transition to complete (300ms + buffer)
    }

    /**
     * Setup configuration panel toggle
     */
    setupConfigPanelToggle() {
        const toggleBtn = document.getElementById('btn-toggle-config');
        
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleConfigPanel());
            console.log('✅ Config panel toggle initialized');
        } else {
            console.warn('⚠️ Config panel toggle button not found');
        }
    }

    /**
     * Toggle configuration panel visibility
     */
    toggleConfigPanel() {
        const sidebar = document.querySelector('.sidebar-right');
        const toggleIcon = document.getElementById('config-toggle-icon');

        if (!sidebar || !toggleIcon) return;

        const isCollapsed = sidebar.classList.contains('collapsed');

        if (isCollapsed) {
            // Show config panel
            sidebar.classList.remove('collapsed');
            toggleIcon.textContent = '◀';
            console.log('⚙️ Config panel expanded');
        } else {
            // Hide config panel
            sidebar.classList.add('collapsed');
            toggleIcon.textContent = '▶';
            console.log('⚙️ Config panel collapsed');
        }

        // Trigger canvas resize after panel toggle animation completes
        setTimeout(() => {
            if (window.canvasRenderer) {
                window.canvasRenderer.resizeCanvas();
            }
        }, 350); // Wait for CSS transition to complete (300ms + buffer)
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + L to toggle logs
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                this.toggleLogPanel();
            }

            // Ctrl/Cmd + K to toggle config panel
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.toggleConfigPanel();
            }

            // F1 or Ctrl/Cmd + H to show help
            if (e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.key === 'h')) {
                e.preventDefault();
                this.showHelpModal();
            }
        });

        console.log('⌨️ Keyboard shortcuts initialized (Ctrl+L: Toggle logs, Ctrl+K: Toggle config, F1/Ctrl+H: Help)');
    }




    /**
     * Setup ping troubleshooting handlers
     * @param {string} nfId - NF ID
     */
    setupPingTroubleshootingHandlers(nfId) {
        const terminalBtn = document.getElementById('btn-open-terminal');
        const pingHistoryBtn = document.getElementById('btn-ping-history');

        if (terminalBtn) {
            terminalBtn.addEventListener('click', () => {
                this.openWindowsTerminal(nfId);
            });
        }

        if (pingHistoryBtn) {
            pingHistoryBtn.addEventListener('click', () => {
                this.showPingHistory(nfId);
            });
        }
    }

    /**
     * Execute ping to specific target IP
     * @param {string} nfId - Source NF ID
     */
    async executePingTarget(nfId) {
        const targetIP = document.getElementById('ping-target-ip')?.value?.trim();
        
        if (!targetIP) {
            alert('Please enter a target IP address');
            return;
        }

        // Validate IP format
        if (!this.isValidIP(targetIP)) {
            alert('Please enter a valid IP address (e.g., 192.168.1.20)');
            return;
        }

        const nf = window.dataStore?.getNFById(nfId);
        if (!nf) return;

        // Check if ping is already active
        if (window.pingManager && window.pingManager.isPingActive(nfId)) {
            alert('Ping is already in progress. Please wait for it to complete.');
            return;
        }

        console.log(`🏓 Executing ping from ${nf.name} to ${targetIP}`);

        // Disable button during ping
        const btn = document.getElementById('btn-ping-target');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '🏓 Pinging...';
        }

        try {
            if (window.pingManager) {
                await window.pingManager.executePing(nfId, targetIP, 4);
            } else {
                console.error('❌ PingManager not available');
                alert('Ping functionality not available');
            }
        } catch (error) {
            console.error('❌ Ping error:', error);
            if (window.logEngine) {
                window.logEngine.addLog(nfId, 'ERROR', `Ping failed: ${error.message}`);
            }
        } finally {
            // Re-enable button
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🏓 Ping Target IP';
            }
        }
    }

    /**
     * Execute ping to all network services
     * @param {string} nfId - Source NF ID
     */
    async executePingNetwork(nfId) {
        const nf = window.dataStore?.getNFById(nfId);
        if (!nf) return;

        // Check if ping is already active
        if (window.pingManager && window.pingManager.isPingActive(nfId)) {
            alert('Ping is already in progress. Please wait for it to complete.');
            return;
        }

        console.log(`📡 Executing network ping from ${nf.name}`);

        // Disable button during ping
        const btn = document.getElementById('btn-ping-network');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '📡 Scanning Network...';
        }

        try {
            if (window.pingManager) {
                await window.pingManager.pingNetworkServices(nfId);
            } else {
                console.error('❌ PingManager not available');
                alert('Ping functionality not available');
            }
        } catch (error) {
            console.error('❌ Network ping error:', error);
            if (window.logEngine) {
                window.logEngine.addLog(nfId, 'ERROR', `Network ping failed: ${error.message}`);
            }
        } finally {
            // Re-enable button
            if (btn) {
                btn.disabled = false;
                btn.textContent = '📡 Ping Network Services';
            }
        }
    }

    /**
     * Show ping history for NF
     * @param {string} nfId - NF ID
     */
    showPingHistory(nfId) {
        const nf = window.dataStore?.getNFById(nfId);
        if (!nf) return;

        if (!window.pingManager) {
            alert('Ping functionality not available');
            return;
        }

        const history = window.pingManager.getPingHistory(nfId);
        
        if (history.length === 0) {
            alert(`No ping history available for ${nf.name}\n\nExecute some ping commands first to see history.`);
            return;
        }

        let historyText = `═══════════════════════════════════\n`;
        historyText += `PING HISTORY FOR ${nf.name}\n`;
        historyText += `═══════════════════════════════════\n\n`;

        history.slice(-10).forEach((entry, index) => {
            const timestamp = new Date(entry.timestamp).toLocaleString();
            historyText += `${index + 1}. ${timestamp}\n`;
            historyText += `   Target: ${entry.targetIP}\n`;
            historyText += `   Result: ${entry.summary.received}/${entry.summary.sent} packets received (${entry.summary.lossPercentage}% loss)\n\n`;
        });

        historyText += `═══════════════════════════════════\n`;
        historyText += `Total ping sessions: ${history.length}\n`;
        historyText += `Showing last ${Math.min(10, history.length)} sessions\n`;
        historyText += `═══════════════════════════════════`;

        alert(historyText);
    }

    /**
     * Open Windows-style terminal for NF
     * @param {string} nfId - NF ID
     */
    openWindowsTerminal(nfId) {
        const nf = window.dataStore?.getNFById(nfId);
        if (!nf) return;

        // Check if terminal already exists for this NF
        const modalId = `windows-terminal-modal-${nf.id}`;
        if (document.getElementById(modalId)) {
            // Focus existing by bringing to front
            const existing = document.getElementById(modalId);
            existing.style.zIndex = String(2000 + Date.now() % 1000);
            return;
        }

        // Create terminal modal
        this.createTerminalModal(nf);
    }

    /**
     * Create Windows-style terminal modal
     * @param {Object} nf - Network Function
     */
    createTerminalModal(nf) {
        // Unique modal per NF
        const modalId = `windows-terminal-modal-${nf.id}`;
        if (document.getElementById(modalId)) {
            // Focus existing by bringing to front
            const existing = document.getElementById(modalId);
            existing.style.zIndex = String(2000 + Date.now() % 1000);
            return;
        }

        // Offset second terminal position
        const openWindows = document.querySelectorAll('.windows-terminal-modal');
        const offset = openWindows.length * 3; // Offset by 3vw/vh for each existing terminal

        // Create terminal modal
        const terminalModal = document.createElement('div');
        terminalModal.id = modalId;
        terminalModal.className = 'windows-terminal-modal';
        
        terminalModal.innerHTML = `
            <div class="windows-terminal-window" data-terminal-type="${nf.type}" style="position:absolute; left: ${10 + offset}vw; top: ${10 + offset}vh;">
                <div class="windows-terminal-titlebar">
                    <div class="terminal-title">
                        <span class="terminal-icon">⬛</span>
                        Command Prompt - ${nf.name} (${nf.config.ipAddress})
                    </div>
                    <div class="terminal-controls">
                        <button class="terminal-btn minimize">−</button>
                        <button class="terminal-btn maximize">□</button>
                        <button class="terminal-btn close" id="terminal-close-${nf.id}">×</button>
                    </div>
                </div>
                <div class="windows-terminal-content" id="terminal-content-${nf.id}">
                    <div class="terminal-header">
                        Microsoft Windows [Version 10.0.19045.3570]<br>
                        (c) Microsoft Corporation. All rights reserved.<br><br>
                    </div>
                    <div class="terminal-output" id="terminal-output-${nf.id}"></div>
                    <div class="terminal-input-line">
                        <span class="terminal-prompt">C:\\${nf.name}></span>
                        <input type="text" id="terminal-input-${nf.id}" class="terminal-input" autocomplete="off" spellcheck="false">
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(terminalModal);

        // Setup terminal functionality
        this.setupWindowsTerminal(nf, terminalModal);

        // Show terminal with animation
        setTimeout(() => {
            terminalModal.classList.add('show');
        }, 10);

        // Focus on input
        const input = document.getElementById(`terminal-input-${nf.id}`);
        if (input) {
            input.focus();
        }
    }

    /**
     * Setup Windows terminal functionality
     * @param {Object} nf - Network Function
     * @param {HTMLElement} terminalModal - Terminal modal element
     */
    setupWindowsTerminal(nf, terminalModal) {
        const win = terminalModal.querySelector('.windows-terminal-window');
        const input = terminalModal.querySelector(`#terminal-input-${nf.id}`);
        const output = terminalModal.querySelector(`#terminal-output-${nf.id}`);
        const closeBtn = terminalModal.querySelector(`#terminal-close-${nf.id}`);
        
        let commandHistory = [];
        let historyIndex = -1;

        // Close button - cleanup iperf3 server if running
        closeBtn.addEventListener('click', () => {
            // Stop iperf3 server if running
            if (this.iperf3Servers.has(nf.id)) {
                this.iperf3Servers.delete(nf.id);
            }
            
            terminalModal.classList.remove('show');
            setTimeout(() => {
                terminalModal.remove();
            }, 300);
        });

        // Make window draggable by titlebar
        const titlebar = terminalModal.querySelector('.windows-terminal-titlebar');
        let dragging = false, dx = 0, dy = 0;
        titlebar.addEventListener('mousedown', (e) => {
            dragging = true;
            dx = e.clientX - win.offsetLeft;
            dy = e.clientY - win.offsetTop;
            document.body.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            win.style.left = `${e.clientX - dx}px`;
            win.style.top = `${e.clientY - dy}px`;
        });
        document.addEventListener('mouseup', () => {
            dragging = false;
            document.body.style.userSelect = '';
        });

        // Resizer (bottom-right)
        let resizer = win.querySelector('.terminal-resizer');
        if (!resizer) {
            resizer = document.createElement('div');
            resizer.className = 'terminal-resizer';
            win.appendChild(resizer);
        }
        let resizing = false, sw = 0, sh = 0, sx = 0, sy = 0;
        resizer.addEventListener('mousedown', (e) => {
            resizing = true;
            sw = win.offsetWidth;
            sh = win.offsetHeight;
            sx = e.clientX;
            sy = e.clientY;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!resizing) return;
            const w = Math.max(600, sw + (e.clientX - sx));
            const h = Math.max(380, sh + (e.clientY - sy));
            win.style.width = `${w}px`;
            win.style.height = `${h}px`;
        });
        document.addEventListener('mouseup', () => {
            resizing = false;
        });

        // Input handling
        input.addEventListener('keydown', async (e) => {
            // Handle Ctrl+C to stop iperf3 server
            if (e.ctrlKey && e.key === 'c' && this.iperf3Servers.has(nf.id)) {
                e.preventDefault();
                this.stopIperf3Server(nf, output);
                input.value = '';
                return;
            }
            
            if (e.key === 'Enter') {
                const command = input.value.trim();
                if (command) {
                    // Add to history
                    commandHistory.push(command);
                    historyIndex = commandHistory.length;

                    // Display command
                    this.addTerminalLine(output, `C:\\${nf.name}>${command}`, 'command');
                    
                    // Clear input
                    input.value = '';

                    // Process command
                    await this.processWindowsCommand(nf, command, output);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (historyIndex > 0) {
                    historyIndex--;
                    input.value = commandHistory[historyIndex];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (historyIndex < commandHistory.length - 1) {
                    historyIndex++;
                    input.value = commandHistory[historyIndex];
                } else {
                    historyIndex = commandHistory.length;
                    input.value = '';
                }
            }
        });

        // Initial welcome message
        this.addTerminalLine(output, `Connected to ${nf.name} (${nf.config.ipAddress})`, 'info');
        this.addTerminalLine(output, 'Type "help" for available commands.', 'info');
        this.addTerminalLine(output, '', 'blank');
    }

    /**
     * Process Windows command
     * @param {Object} nf - Network Function
     * @param {string} command - Command to process
     * @param {HTMLElement} output - Output element
     */
    async processWindowsCommand(nf, command, output) {
        const cmd = command.toLowerCase().trim();
        const args = command.split(' ');

        if (cmd === 'help' || cmd === '?') {
            this.showWindowsHelp(output);
        } else if (cmd === 'ipconfig') {
            this.showIPConfig(nf, output);
        } else if (cmd.startsWith('ping ')) {
            // Parse ping command with -I and -c options
            await this.executeLinuxPing(nf, command, output);
        } else if (cmd === 'ping subnet') {
            await this.executeWindowsPingSubnet(nf, output);
        } else if (cmd === 'cls' || cmd === 'clear') {
            output.innerHTML = '';
        } else if (cmd === 'exit') {
            const closeBtn = document.getElementById('terminal-close');
            if (closeBtn) closeBtn.click();
        } else if (cmd === 'dir') {
            this.showDirectory(output);
        } else if (cmd === 'systeminfo') {
            this.showSystemInfo(nf, output);
        } else if (cmd === 'netstat') {
            this.showNetstat(nf, output);
        } else if (cmd === 'ifconfig' || cmd === 'ip addr') {
            this.showIfConfig(nf, output);
        } else if (cmd.startsWith('iperf3 ')) {
            await this.processIperf3Command(nf, command, output);
        } else if (cmd === '') {
            // Empty command, just show prompt
        } else {
            this.addTerminalLine(output, `'${command}' is not recognized as an internal or external command,`, 'error');
            this.addTerminalLine(output, 'operable program or batch file.', 'error');
        }

        this.addTerminalLine(output, '', 'blank');
    }

    /**
     * Add line to terminal output
     * @param {HTMLElement} output - Output element
     * @param {string} text - Text to add
     * @param {string} type - Line type (command, info, error, success, blank)
     */
    addTerminalLine(output, text, type = 'normal') {
        const line = document.createElement('div');
        line.className = `terminal-line terminal-${type}`;
        line.innerHTML = text || '&nbsp;';
        output.appendChild(line);
        
        // Auto-scroll to bottom
        output.scrollTop = output.scrollHeight;
    }

    /**
     * Show Windows help
     * @param {HTMLElement} output - Output element
     */
    showWindowsHelp(output) {
        const helpText = [
            'Available commands:',
            '',
            'HELP        - Display this help message',
            'IPCONFIG    - Display network configuration (Windows style)',
            'IFCONFIG    - Display network interfaces (Linux style)',
            'PING        - Test network connectivity',
            '  Format:   ping -I <interface> <target> [-c<count>]',
            '  Examples: ping -I oaitun_ue1 8.8.8.8 -c4',
            '            ping -I oaitun_ue1 10.0.0.1 -c8',
            '            ping -I oaitun_ue1 12.45.0.39 -c4',
            '  Note:     -c4 = 4 replies, -c8 = 8 replies',
            '            No -c = continuous ping (not recommended)',
            'IPERF3      - Network throughput testing',
            '  Server:   iperf3 -s (ext-dn only)',
            '  Client:   iperf3 -B <UE_IP> -c <EXT_DN_IP> [-R] (UE only)',
            'SYSTEMINFO  - Display system information',
            'NETSTAT     - Display network connections',
            'CLS         - Clear the screen',
            'EXIT        - Close this terminal',
            ''
        ];

        helpText.forEach(line => {
            this.addTerminalLine(output, line, 'info');
        });
    }

    /**
     * Show IP configuration
     * @param {Object} nf - Network Function
     * @param {HTMLElement} output - Output element
     */
    showIPConfig(nf, output) {
        const lines = [
            'Windows IP Configuration',
            '',
            'Ethernet adapter Local Area Connection:',
            '',
            `   Connection-specific DNS Suffix  . : 5g.local`,
            `   IPv4 Address. . . . . . . . . . . : ${nf.config.ipAddress}`,
            `   Subnet Mask . . . . . . . . . . . : 255.255.255.0`,
            `   Default Gateway . . . . . . . . . : 192.168.1.1`,
            `   DNS Servers . . . . . . . . . . . : 8.8.8.8`,
            `                                       8.8.4.4`,
            ''
        ];

        lines.forEach(line => {
            this.addTerminalLine(output, line, 'info');
        });

        // Show ogstun interface for UPF
        if (nf.type === 'UPF' && nf.config.ogstunInterface) {
            const ogstun = nf.config.ogstunInterface;
            const tunLines = [
                'Tunnel adapter ogstun (tun0):',
                '',
                `   Connection-specific DNS Suffix  . : `,
                `   IPv4 Address. . . . . . . . . . . : ${ogstun.ipAddress}`,
                `   Subnet Mask . . . . . . . . . . . : ${ogstun.netmask}`,
                `   Default Gateway . . . . . . . . . : ${ogstun.gatewayIP}`,
                `   MTU . . . . . . . . . . . . . . . : ${ogstun.mtu}`,
                `   Flags . . . . . . . . . . . . . . : ${ogstun.flags}`,
                `   IPv6 Address. . . . . . . . . . . : ${ogstun.ipv6}`,
                ''
            ];
            tunLines.forEach(line => {
                this.addTerminalLine(output, line, 'info');
            });
        }

        // Show tun interface for UE
        if (nf.type === 'UE' && nf.config.tunInterface) {
            const tun = nf.config.tunInterface;
            const tunLines = [
                `Tunnel adapter ${tun.name}:`,
                '',
                `   Connection-specific DNS Suffix  . : `,
                `   IPv4 Address. . . . . . . . . . . : ${tun.ipAddress}`,
                `   Subnet Mask . . . . . . . . . . . : ${tun.netmask}`,
                `   Default Gateway . . . . . . . . . : ${tun.gateway}`,
                `   MTU . . . . . . . . . . . . . . . : ${tun.mtu}`,
                `   Flags . . . . . . . . . . . . . . : ${tun.flags}`,
                `   IPv6 Address. . . . . . . . . . . : ${tun.ipv6}`,
                `   Destination . . . . . . . . . . . : ${tun.destination}`,
                ''
            ];
            tunLines.forEach(line => {
                this.addTerminalLine(output, line, 'info');
            });
        }
    }

    /**
     * Show Linux-style ifconfig output
     * @param {Object} nf - Network Function
     * @param {HTMLElement} output - Output element
     */
    showIfConfig(nf, output) {
        // Show eth0 interface (main IP)
        const eth0Lines = [
            `eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500`,
            `        inet ${nf.config.ipAddress}  netmask 255.255.255.0  broadcast ${this.getBroadcastIP(nf.config.ipAddress)}`,
            `        inet6 fe80::${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}:${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}:${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}:${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}  prefixlen 64  scopeid 0x20<link>`,
            `        ether ${this.generateMACAddress()}  txqueuelen 1000  (Ethernet)`,
            `        RX packets ${Math.floor(Math.random() * 10000) + 1000}  bytes ${Math.floor(Math.random() * 1000000) + 100000} (${(Math.random() * 100).toFixed(1)} KB)`,
            `        RX errors 0  dropped 0  overruns 0  frame 0`,
            `        TX packets ${Math.floor(Math.random() * 10000) + 1000}  bytes ${Math.floor(Math.random() * 1000000) + 100000} (${(Math.random() * 100).toFixed(1)} KB)`,
            `        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0`,
            ''
        ];
        eth0Lines.forEach(line => {
            this.addTerminalLine(output, line, 'info');
        });

        // Show tun0 interface for UPF (when connected to ext-dn)
        if (nf.type === 'UPF' && nf.config.tun0Interface) {
            const tun0 = nf.config.tun0Interface;
            const flagsValue = 4305; // UP,POINTOPOINT,RUNNING,NOARP,MULTICAST
            const tun0Lines = [
                `tun0: flags=${flagsValue}<UP,POINTOPOINT,RUNNING,NOARP,MULTICAST>  mtu 1500`,
                `        inet ${tun0.ipAddress}  netmask ${tun0.netmask}  destination ${tun0.ipAddress}`,
                `        inet6 fe80::${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}:${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}:${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}:${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}  prefixlen 64  scopeid 0x20<link>`,
                `        unspec 00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00  txqueuelen 500  (UNSPEC)`,
                `        RX packets ${Math.floor(Math.random() * 100)}  bytes ${Math.floor(Math.random() * 10000)} (${(Math.random() * 10).toFixed(1)} KB)`,
                `        RX errors 0  dropped 0  overruns 0  frame 0`,
                `        TX packets ${Math.floor(Math.random() * 100) + 5}  bytes ${Math.floor(Math.random() * 1000) + 300} (${(Math.random() * 1).toFixed(1)} KB)`,
                `        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0`,
                ''
            ];
            tun0Lines.forEach(line => {
                this.addTerminalLine(output, line, 'info');
            });
        }

        // Show tun_ue interface for UE (when PDU session is established)
        if (nf.type === 'UE' && nf.config.tunInterface && nf.config.pduSession) {
            const tun = nf.config.tunInterface;
            const flagsValue = 4305; // UP,POINTOPOINT,RUNNING,NOARP,MULTICAST
            const tunLines = [
                `${tun.name}: flags=${flagsValue}<UP,POINTOPOINT,RUNNING,NOARP,MULTICAST>  mtu ${tun.mtu}`,
                `        inet ${tun.ipAddress}  netmask ${tun.netmask}  destination ${tun.destination}`,
                `        inet6 ${tun.ipv6}  prefixlen 64  scopeid 0x20<link>`,
                `        unspec 00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00  txqueuelen 500  (UNSPEC)`,
                `        RX packets ${Math.floor(Math.random() * 100)}  bytes ${Math.floor(Math.random() * 10000)} (${(Math.random() * 10).toFixed(1)} KB)`,
                `        RX errors 0  dropped 0  overruns 0  frame 0`,
                `        TX packets ${Math.floor(Math.random() * 100) + 5}  bytes ${Math.floor(Math.random() * 1000) + 300} (${(Math.random() * 1).toFixed(1)} KB)`,
                `        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0`,
                ''
            ];
            tunLines.forEach(line => {
                this.addTerminalLine(output, line, 'info');
            });
        }
    }

    /**
     * Generate MAC address
     * @returns {string} MAC address
     */
    generateMACAddress() {
        const parts = [];
        for (let i = 0; i < 6; i++) {
            parts.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
        }
        return parts.join(':');
    }

    /**
     * Get broadcast IP from IP address
     * @param {string} ip - IP address
     * @returns {string} Broadcast IP
     */
    getBroadcastIP(ip) {
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}.255`;
    }

    /**
     * Execute Linux-style ping with -I and -c options (for UE)
     * @param {Object} nf - Network Function
     * @param {string} command - Full ping command
     * @param {HTMLElement} output - Output element
     */
    async executeLinuxPing(nf, command, output) {
        // Parse command: ping -I <interface> <target> -c<count>
        const args = command.split(' ');
        let targetIP = null;
        let interfaceName = null;
        let count = 4; // default
        
        // Parse arguments
        for (let i = 1; i < args.length; i++) {
            if (args[i] === '-I' && i + 1 < args.length) {
                interfaceName = args[i + 1];
                i++; // skip next arg
            } else if (args[i].startsWith('-c')) {
                const countStr = args[i].substring(2);
                count = parseInt(countStr) || 4;
            } else if (!targetIP && args[i] && !args[i].startsWith('-')) {
                targetIP = args[i];
            }
        }
        
        if (!targetIP) {
            this.addTerminalLine(output, 'Usage: ping -I <interface> <target> [-c<count>]', 'error');
            this.addTerminalLine(output, 'Example: ping -I oaitun_ue1 8.8.8.8 -c4', 'info');
            return;
        }
        
        // STRONG IP VALIDATION
        if (!this.isStrictValidIP(targetIP)) {
            this.addTerminalLine(output, `ping: ${targetIP}: Invalid IP address format`, 'error');
            this.addTerminalLine(output, 'IP address must be in format: X.X.X.X (e.g., 192.168.1.1)', 'error');
            return;
        }
        
        // VALIDATE TARGET IP - Only allow specific IPs
        const validationResult = this.validatePingTarget(nf, targetIP, interfaceName);
        if (!validationResult.valid) {
            this.addTerminalLine(output, `ping: ${targetIP}: ${validationResult.error}`, 'error');
            if (validationResult.allowedTargets) {
                this.addTerminalLine(output, '', 'blank');
                this.addTerminalLine(output, 'Allowed ping targets:', 'info');
                validationResult.allowedTargets.forEach(target => {
                    this.addTerminalLine(output, `  ${target}`, 'info');
                });
            }
            return;
        }
        
        // Check if UE has tun interface
        if (nf.type === 'UE' && !nf.config.tunInterface) {
            this.addTerminalLine(output, `Error: No tun interface configured for ${nf.name}`, 'error');
            this.addTerminalLine(output, 'Please establish a PDU session first', 'info');
            return;
        }
        
        // Get source IP based on interface
        let sourceIP = nf.config.ipAddress;
        if (interfaceName && nf.config.tunInterface) {
            sourceIP = nf.config.tunInterface.ipAddress;
        }
        
        // Determine if target is reachable
        const isReachable = this.isLinuxPingReachable(nf, targetIP, interfaceName);
        
        // Display initial message
        const iface = interfaceName || 'eth0';
        this.addTerminalLine(output, `PING ${targetIP} (${targetIP}) from ${sourceIP} ${iface}: 56(84) bytes of data.`, 'info');
        
        // Execute ping
        const results = [];
        for (let i = 1; i <= count; i++) {
            await this.delay(1000); // 1 second between pings
            
            if (isReachable) {
                const responseTime = this.generateLinuxResponseTime(targetIP);
                const ttl = this.getTTLForTarget(targetIP);
                
                results.push({
                    sequence: i,
                    time: responseTime,
                    ttl: ttl,
                    success: true
                });
                
                this.addTerminalLine(output, 
                    `64 bytes from ${targetIP}: icmp_seq=${i} ttl=${ttl} time=${responseTime} ms`, 
                    'success'
                );
            } else {
                results.push({
                    sequence: i,
                    success: false,
                    timeout: true
                });
                
                this.addTerminalLine(output, `Request timeout for icmp_seq ${i}`, 'error');
            }
        }
        
        // Display statistics
        await this.delay(500);
        this.showLinuxPingStatistics(targetIP, results, output, count);
    }
    
    /**
     * Strict IP validation - ensures proper IP format
     * @param {string} ip - IP address to validate
     * @returns {boolean} True if valid IP format
     */
    isStrictValidIP(ip) {
        // Must match exact pattern: X.X.X.X where X is 0-255
        const ipPattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const match = ip.match(ipPattern);
        
        if (!match) {
            return false;
        }
        
        // Check each octet is 0-255
        for (let i = 1; i <= 4; i++) {
            const octet = parseInt(match[i], 10);
            if (octet < 0 || octet > 255) {
                return false;
            }
            // Reject leading zeros (e.g., 10.0.00.1 or 10.0.001.1)
            if (match[i].length > 1 && match[i][0] === '0') {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Validate ping target - only allow specific IPs
     * @param {Object} nf - Network Function
     * @param {string} targetIP - Target IP to validate
     * @param {string} interfaceName - Interface name
     * @returns {Object} {valid: boolean, error: string, allowedTargets: array}
     */
    validatePingTarget(nf, targetIP, interfaceName) {
        // Build list of allowed targets
        const allowedTargets = [];
        
        // 1. Internet IP (8.8.8.8) - only via tun interface
        if (interfaceName && nf.config.tunInterface) {
            allowedTargets.push('8.8.8.8 - Google DNS (Internet)');
        }
        
        // 2. Gateway IP (10.0.0.1) - only via tun interface
        if (interfaceName && nf.config.tunInterface) {
            allowedTargets.push('10.0.0.1 - Data Network Gateway (ext-dn)');
        }
        
        // 3. UPF IP - only if PDU session established
        if (nf.config.pduSession) {
            const upf = window.dataStore?.getNFById(nf.config.pduSession.upfId);
            if (upf) {
                allowedTargets.push(`${upf.config.ipAddress} - UPF (User Plane Function)`);
            }
        }
        
        // 4. Other network function IPs in topology (same subnet only)
        const allNFs = window.dataStore?.getAllNFs() || [];
        const sourceNetwork = this.getNetworkFromIP(nf.config.ipAddress);
        allNFs.forEach(otherNf => {
            if (otherNf.id !== nf.id) {
                const targetNetwork = this.getNetworkFromIP(otherNf.config.ipAddress);
                if (sourceNetwork === targetNetwork) {
                    allowedTargets.push(`${otherNf.config.ipAddress} - ${otherNf.name} (${otherNf.type})`);
                }
            }
        });
        
        // Check if target is in allowed list
        const allowedIPs = [
            '8.8.8.8',  // Internet
            '10.0.0.1', // Gateway
        ];
        
        // Add UPF IP if PDU session exists
        if (nf.config.pduSession) {
            const upf = window.dataStore?.getNFById(nf.config.pduSession.upfId);
            if (upf) {
                allowedIPs.push(upf.config.ipAddress);
            }
        }
        
        // Add all NF IPs in same subnet
        allNFs.forEach(otherNf => {
            if (otherNf.id !== nf.id) {
                const sourceNetwork = this.getNetworkFromIP(nf.config.ipAddress);
                const targetNetwork = this.getNetworkFromIP(otherNf.config.ipAddress);
                if (sourceNetwork === targetNetwork) {
                    allowedIPs.push(otherNf.config.ipAddress);
                }
            }
        });
        
        // Validate target
        if (!allowedIPs.includes(targetIP)) {
            return {
                valid: false,
                error: 'Target IP not found in network topology',
                allowedTargets: allowedTargets
            };
        }
        
        // Special validation for internet and gateway - require tun interface
        if ((targetIP === '8.8.8.8' || targetIP === '10.0.0.1') && !interfaceName) {
            return {
                valid: false,
                error: 'Internet and gateway IPs require -I <tun_interface> parameter',
                allowedTargets: ['Use: ping -I oaitun_ue1 ' + targetIP + ' -c4']
            };
        }
        
        // Check if PDU session is required
        if ((targetIP === '8.8.8.8' || targetIP === '10.0.0.1') && !nf.config.pduSession) {
            return {
                valid: false,
                error: 'PDU session not established. Cannot reach internet/gateway.',
                allowedTargets: ['Establish PDU session first (UE → gNB → AMF → SMF → UPF)']
            };
        }
        
        return {
            valid: true,
            error: null,
            allowedTargets: null
        };
    }
    
    /**
     * Check if target is reachable via Linux ping
     * @param {Object} nf - Network Function
     * @param {string} targetIP - Target IP
     * @param {string} interfaceName - Interface name
     * @returns {boolean} True if reachable
     */
    isLinuxPingReachable(nf, targetIP, interfaceName) {
        // Internet connectivity (8.8.8.8) via tun interface
        if (interfaceName && nf.config.tunInterface) {
            if (targetIP === '8.8.8.8' || targetIP === '8.8.4.4') {
                return nf.config.pduSession ? true : false;
            }
            // Gateway (10.0.0.1)
            if (targetIP === '10.0.0.1') {
                return nf.config.pduSession ? true : false;
            }
            // UPF IP
            if (nf.config.pduSession) {
                const upf = window.dataStore?.getNFById(nf.config.pduSession.upfId);
                if (upf && targetIP === upf.config.ipAddress) {
                    return true;
                }
            }
        }
        
        // Default reachability check
        return Math.random() < 0.9;
    }
    
    /**
     * Generate Linux-style response time
     * @param {string} targetIP - Target IP
     * @returns {string} Response time with decimal
     */
    generateLinuxResponseTime(targetIP) {
        // Internet (8.8.8.8) - 30-40ms
        if (targetIP === '8.8.8.8' || targetIP === '8.8.4.4') {
            return (Math.random() * 10 + 30).toFixed(1);
        }
        // Gateway (10.0.0.1) - 9-20ms
        if (targetIP === '10.0.0.1') {
            return (Math.random() * 11 + 9).toFixed(1);
        }
        // UPF or local network - 20-25ms
        return (Math.random() * 5 + 20).toFixed(1);
    }
    
    /**
     * Get TTL value for target
     * @param {string} targetIP - Target IP
     * @returns {number} TTL value
     */
    getTTLForTarget(targetIP) {
        // Internet - TTL 111
        if (targetIP === '8.8.8.8' || targetIP === '8.8.4.4') {
            return 111;
        }
        // Gateway - TTL 64
        if (targetIP === '10.0.0.1') {
            return 64;
        }
        // UPF or local network - TTL 63
        return 63;
    }
    
    /**
     * Show Linux-style ping statistics
     * @param {string} targetIP - Target IP
     * @param {Array} results - Ping results
     * @param {HTMLElement} output - Output element
     * @param {number} count - Number of packets
     */
    showLinuxPingStatistics(targetIP, results, output, count) {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        const lossPercentage = Math.round((failed.length / results.length) * 100);
        
        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, `--- ${targetIP} ping statistics ---`, 'info');
        this.addTerminalLine(output, 
            `${results.length} packets transmitted, ${successful.length} received, ${lossPercentage}% packet loss, time ${count * 1000}ms`, 
            'info'
        );
        
        if (successful.length > 0) {
            const times = successful.map(r => parseFloat(r.time));
            const min = Math.min(...times).toFixed(3);
            const max = Math.max(...times).toFixed(3);
            const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3);
            const mdev = this.calculateMdev(times, parseFloat(avg)).toFixed(3);
            
            this.addTerminalLine(output, 
                `rtt min/avg/max/mdev = ${min}/${avg}/${max}/${mdev} ms`, 
                'info'
            );
        }
    }
    
    /**
     * Calculate mean deviation
     * @param {Array} times - Array of times
     * @param {number} avg - Average time
     * @returns {number} Mean deviation
     */
    calculateMdev(times, avg) {
        const squaredDiffs = times.map(t => Math.pow(t - avg, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / times.length;
        return Math.sqrt(variance);
    }

    /**
     * Execute Windows-style ping with subnet restrictions
     * @param {Object} nf - Network Function
     * @param {string} target - Target IP or hostname
     * @param {HTMLElement} output - Output element
     */
    async executeWindowsPing(nf, target, output) {
        // Validate IP
        if (!this.isValidIP(target)) {
            this.addTerminalLine(output, `Ping request could not find host ${target}. Please check the name and try again.`, 'error');
            return;
        }

        // SPECIAL CASE: UE can ping its gateway (10.0.0.1) via tun interface
        if (nf.type === 'UE' && nf.config.tunInterface && target === nf.config.tunInterface.gateway) {
            this.addTerminalLine(output, `Pinging ${target} (UPF Gateway) with 32 bytes of data:`, 'info');
            this.addTerminalLine(output, '', 'blank');
            
            // Simulate successful ping to gateway
            for (let i = 0; i < 4; i++) {
                await this.delay(500);
                const time = Math.floor(Math.random() * 10) + 1;
                this.addTerminalLine(output, `Reply from ${target}: bytes=32 time=${time}ms TTL=64`, 'success');
            }
            
            this.addTerminalLine(output, '', 'blank');
            this.addTerminalLine(output, `Ping statistics for ${target}:`, 'info');
            this.addTerminalLine(output, `    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),`, 'info');
            this.addTerminalLine(output, `Approximate round trip times in milli-seconds:`, 'info');
            this.addTerminalLine(output, `    Minimum = 1ms, Maximum = 10ms, Average = 5ms`, 'info');
            return;
        }

        // SPECIAL CASE: UE can ping other IPs in 10.0.0.0/24 network via tun interface
        if (nf.type === 'UE' && nf.config.tunInterface) {
            const tunNetwork = this.getNetworkFromIP(nf.config.tunInterface.ipAddress);
            const targetNetwork = this.getNetworkFromIP(target);
            
            if (tunNetwork === targetNetwork) {
                // UE can ping within ogstun network
                this.addTerminalLine(output, `Pinging ${target} via ${nf.config.tunInterface.name} with 32 bytes of data:`, 'info');
                this.addTerminalLine(output, '', 'blank');
                
                // Use ping manager for realistic ping
                if (window.pingManager) {
                    await window.pingManager.executePing(nf.id, target, 4);
                }
                return;
            }
        }

        // Check subnet restriction FIRST
        const sourceNetwork = this.getNetworkFromIP(nf.config.ipAddress);
        const targetNetwork = this.getNetworkFromIP(target);
        
        if (sourceNetwork !== targetNetwork) {
            this.addTerminalLine(output, `Pinging ${target} with 32 bytes of data:`, 'info');
            this.addTerminalLine(output, '', 'blank');
            this.addTerminalLine(output, `PING: transmit failed. General failure.`, 'error');
            this.addTerminalLine(output, '', 'blank');
            this.addTerminalLine(output, `Network Error: Cannot reach ${target}`, 'error');
            this.addTerminalLine(output, `Source subnet: ${sourceNetwork}.0/24`, 'error');
            this.addTerminalLine(output, `Target subnet: ${targetNetwork}.0/24`, 'error');
            this.addTerminalLine(output, `Reason: Cross-subnet communication not allowed`, 'error');
            this.addTerminalLine(output, '', 'blank');
            this.addTerminalLine(output, `Ping statistics for ${target}:`, 'info');
            this.addTerminalLine(output, `    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),`, 'info');
            return;
        }

        // Initial ping message
        this.addTerminalLine(output, `Pinging ${target} with 32 bytes of data:`, 'info');
        this.addTerminalLine(output, '', 'blank');

        // Check if target is reachable (same subnet)
        const isReachable = this.isTargetReachable(nf, target);
        const results = [];

        // Send 4 ping packets with 0.5 second delays
        for (let i = 1; i <= 4; i++) {
            await this.delay(500); // 0.5 second delay

            if (isReachable) {
                const responseTime = this.generateResponseTime();
                const ttl = 255;
                
                results.push({
                    sequence: i,
                    time: responseTime,
                    ttl: ttl,
                    success: true
                });

                this.addTerminalLine(output, 
                    `Reply from ${target}: bytes=32 time=${responseTime}ms TTL=${ttl}`, 
                    'success'
                );
            } else {
                await this.delay(500); // Additional delay for timeout
                
                results.push({
                    sequence: i,
                    success: false,
                    timeout: true
                });

                this.addTerminalLine(output, 'Request timed out.', 'error');
            }
        }

        // Show statistics after final delay
        await this.delay(500);
        this.showPingStatistics(target, results, output);
    }

    /**
     * Execute ping subnet with detailed subnet information
     * @param {Object} nf - Network Function
     * @param {HTMLElement} output - Output element
     */
    async executeWindowsPingSubnet(nf, output) {
        const sourceNetwork = this.getNetworkFromIP(nf.config.ipAddress);
        const allNFs = window.dataStore?.getAllNFs() || [];
        
        // Find services in the same subnet only
        const sameSubnetServices = allNFs.filter(otherNf => 
            otherNf.id !== nf.id && 
            this.getNetworkFromIP(otherNf.config.ipAddress) === sourceNetwork
        );

        // Show subnet scan header
        this.addTerminalLine(output, `Subnet Scan: ${sourceNetwork}.0/24`, 'info');
        this.addTerminalLine(output, `Source: ${nf.name} (${nf.config.ipAddress})`, 'info');
        this.addTerminalLine(output, `Restriction: Only same-subnet services can be pinged`, 'info');
        this.addTerminalLine(output, '', 'blank');

        if (sameSubnetServices.length === 0) {
            this.addTerminalLine(output, `No other services found in subnet ${sourceNetwork}.0/24`, 'error');
            this.addTerminalLine(output, `Add more services with IPs in range ${sourceNetwork}.1-${sourceNetwork}.254`, 'info');
            return;
        }

        this.addTerminalLine(output, `Found ${sameSubnetServices.length} services in subnet ${sourceNetwork}.0/24:`, 'info');
        
        // List all services in subnet first
        sameSubnetServices.forEach(targetNf => {
            const statusIcon = targetNf.status === 'stable' ? '✅' : '⚠️';
            this.addTerminalLine(output, `  ${statusIcon} ${targetNf.name} (${targetNf.config.ipAddress}) [${targetNf.status.toUpperCase()}]`, 'info');
        });
        
        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, 'Starting connectivity tests...', 'info');
        this.addTerminalLine(output, '', 'blank');

        // Test each service
        for (const targetNf of sameSubnetServices) {
            const statusInfo = targetNf.status === 'stable' ? 'STABLE' : targetNf.status.toUpperCase();
            this.addTerminalLine(output, `Testing ${targetNf.name} (${targetNf.config.ipAddress}) [${statusInfo}]`, 'info');
            await this.executeWindowsPing(nf, targetNf.config.ipAddress, output);
            this.addTerminalLine(output, '', 'blank');
            await this.delay(200);
        }

        // Summary
        this.addTerminalLine(output, '═══════════════════════════════════════', 'info');
        this.addTerminalLine(output, `Subnet scan completed for ${sourceNetwork}.0/24`, 'success');
        this.addTerminalLine(output, `Total services tested: ${sameSubnetServices.length}`, 'info');
        this.addTerminalLine(output, `Stable services: ${sameSubnetServices.filter(nf => nf.status === 'stable').length}`, 'info');
        this.addTerminalLine(output, `Unstable services: ${sameSubnetServices.filter(nf => nf.status !== 'stable').length}`, 'info');
        this.addTerminalLine(output, '═══════════════════════════════════════', 'info');
    }

    /**
     * Show ping statistics
     * @param {string} target - Target IP
     * @param {Array} results - Ping results
     * @param {HTMLElement} output - Output element
     */
    showPingStatistics(target, results, output) {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        const lossPercentage = Math.round((failed.length / results.length) * 100);

        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, `Ping statistics for ${target}:`, 'info');
        this.addTerminalLine(output, 
            `    Packets: Sent = ${results.length}, Received = ${successful.length}, Lost = ${failed.length} (${lossPercentage}% loss),`, 
            'info'
        );

        if (successful.length > 0) {
            const times = successful.map(r => r.time);
            const min = Math.min(...times);
            const max = Math.max(...times);
            const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

            this.addTerminalLine(output, 'Approximate round trip times in milli-seconds:', 'info');
            this.addTerminalLine(output, 
                `    Minimum = ${min}ms, Maximum = ${max}ms, Average = ${avg}ms`, 
                'info'
            );
        }
    }

    /**
     * Show directory listing
     * @param {HTMLElement} output - Output element
     */
   

    /**
     * Show system information
     * @param {Object} nf - Network Function
     * @param {HTMLElement} output - Output element
     */
    showSystemInfo(nf, output) {
        const uptime = window.nfManager?.getServiceUptime(nf) || 'Unknown';
        const lines = [
            'Host Name:                 ' + nf.name,
            'Network Card:              5G Service Interface',
            '                          Connection Name: Local Area Connection',
            `                          IP Address:      ${nf.config.ipAddress}`,
            `                          Port:            ${nf.config.port}`,
            `                          Protocol:        ${nf.config.httpProtocol}`,
            `System Up Time:            ${uptime}`,
            `Service Status:            ${nf.status.toUpperCase()}`,
            ''
        ];

        lines.forEach(line => {
            this.addTerminalLine(output, line, 'info');
        });
    }

    /**
     * Show network statistics
     * @param {Object} nf - Network Function
     * @param {HTMLElement} output - Output element
     */
    showNetstat(nf, output) {
        const connections = window.dataStore?.getConnectionsForNF(nf.id) || [];
        const busConnections = window.dataStore?.getBusConnectionsForNF(nf.id) || [];
        
        this.addTerminalLine(output, 'Active Connections', 'info');
        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, '  Proto  Local Address          Foreign Address        State', 'info');

        // Show direct connections
        connections.forEach(conn => {
            const otherNfId = conn.sourceId === nf.id ? conn.targetId : conn.sourceId;
            const otherNf = window.dataStore?.getNFById(otherNfId);
            if (otherNf) {
                this.addTerminalLine(output, 
                    `  TCP    ${nf.config.ipAddress}:${nf.config.port}         ${otherNf.config.ipAddress}:${otherNf.config.port}         ESTABLISHED`, 
                    'info'
                );
            }
        });

        // Show bus connections
        busConnections.forEach(busConn => {
            const bus = window.dataStore?.getBusById(busConn.busId);
            if (bus) {
                this.addTerminalLine(output, 
                    `  TCP    ${nf.config.ipAddress}:${nf.config.port}         ${bus.name}:BUS            ESTABLISHED`, 
                    'info'
                );
            }
        });

        if (connections.length === 0 && busConnections.length === 0) {
            this.addTerminalLine(output, '  No active connections.', 'info');
        }

        this.addTerminalLine(output, '', 'blank');
    }

    /**
     * Helper methods for terminal functionality
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    isTargetReachable(sourceNf, targetIP) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const targetNf = allNFs.find(nf => nf.config.ipAddress === targetIP);
        
        if (!targetNf) {
            return Math.random() < 0.1; // 10% success for unknown IPs
        }

        const sourceNetwork = this.getNetworkFromIP(sourceNf.config.ipAddress);
        const targetNetwork = this.getNetworkFromIP(targetIP);
        
        if (sourceNetwork !== targetNetwork) {
            return Math.random() < 0.2; // 20% success for different networks
        }

        // Check if both services are stable
        if (sourceNf.status !== 'stable' || targetNf.status !== 'stable') {
            return Math.random() < 0.3; // 30% success if not both stable
        }

        return Math.random() < 0.9; // 90% success for stable same-network services
    }

    getNetworkFromIP(ip) {
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
    }

    generateResponseTime() {
        const baseTime = Math.random() * 50 + 1;
        const variation = (Math.random() - 0.5) * 10;
        return Math.max(1, Math.round(baseTime + variation));
    }

    /**
     * Get next available IP address automatically
     * @returns {string} Next available IP address
     */
    getNextAvailableIP() {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const usedIPs = new Set(allNFs.map(nf => nf.config.ipAddress));
        
        // Define subnets in priority order
        const subnets = [
            '192.168.1', // Core network functions
            '192.168.2', // User plane functions  
            '192.168.3', // Edge services
            '192.168.4'  // Additional services
        ];

        // Find next available IP in priority order
        for (const subnet of subnets) {
            for (let host = 10; host <= 254; host++) {
                const ip = `${subnet}.${host}`;
                if (!usedIPs.has(ip)) {
                    console.log(`🌐 Auto-assigned next available IP: ${ip}`);
                    return ip;
                }
            }
        }

        // Fallback if all subnets are full
        const randomSubnet = Math.floor(Math.random() * 254) + 1;
        const randomHost = Math.floor(Math.random() * 244) + 10;
        const fallbackIP = `192.168.${randomSubnet}.${randomHost}`;
        
        console.warn(`⚠️ Using fallback IP: ${fallbackIP}`);
        return fallbackIP;
    }

    /**
     * Get next available port number automatically
     * @returns {number} Next available port number
     */
    getNextAvailablePort() {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const usedPorts = new Set(allNFs.map(nf => nf.config.port));
        
        // Find next available port starting from 8080
        for (let port = 8080; port <= 9999; port++) {
            if (!usedPorts.has(port)) {
                console.log(`🔌 Auto-assigned next available port: ${port}`);
                return port;
            }
        }

        // Fallback if all ports are used
        const randomPort = Math.floor(Math.random() * 1000) + 8000;
        console.warn(`⚠️ Using fallback port: ${randomPort}`);
        return randomPort;
    }

    /**
     * Validate IP address format
     * @param {string} ip - IP address to validate
     * @returns {boolean} True if valid IP
     */
    isValidIP(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }

    /**
     * Process iperf3 command
     * @param {Object} nf - Network Function
     * @param {string} command - Full iperf3 command
     * @param {HTMLElement} output - Output element
     */
    async processIperf3Command(nf, command, output) {
        const args = command.split(' ').filter(arg => arg.trim());
        const cmd = args[0].toLowerCase();
        
        // Server mode: iperf3 -s
        if (args.includes('-s') || args.includes('--server')) {
            if (nf.type !== 'ext-dn') {
                this.addTerminalLine(output, 'Error: iperf3 server can only run on ext-dn terminals', 'error');
                return;
            }
            
            // Check if server is already running
            if (this.iperf3Servers.has(nf.id)) {
                this.addTerminalLine(output, 'iperf3 server is already running on port 5201', 'error');
                this.addTerminalLine(output, 'Use Ctrl+C to stop the server', 'info');
                return;
            }
            
            await this.startIperf3Server(nf, output);
            return;
        }
        
        // Client mode: iperf3 -B <UE_IP> -c <EXT_DN_IP> [-R]
        if (args.includes('-c') || args.includes('--client')) {
            if (nf.type !== 'UE') {
                this.addTerminalLine(output, 'Error: iperf3 client can only run on UE terminals', 'error');
                return;
            }
            
            await this.startIperf3Client(nf, args, output);
            return;
        }
        
        // Help or invalid
        this.addTerminalLine(output, 'iperf3: missing or invalid option', 'error');
        this.addTerminalLine(output, 'Usage:', 'info');
        this.addTerminalLine(output, '  Server: iperf3 -s', 'info');
        this.addTerminalLine(output, '  Client: iperf3 -B <UE_IP> -c <EXT_DN_IP> [-R]', 'info');
    }

    /**
     * Start iperf3 server on ext-dn
     * @param {Object} nf - ext-dn Network Function
     * @param {HTMLElement} output - Output element
     */
    async startIperf3Server(nf, output) {
        this.addTerminalLine(output, '-----------------------------------------------------------', 'info');
        this.addTerminalLine(output, 'Server listening on 5201', 'info');
        this.addTerminalLine(output, '-----------------------------------------------------------', 'info');
        this.addTerminalLine(output, '', 'blank');
        
        // Store server state
        this.iperf3Servers.set(nf.id, {
            nf: nf,
            output: output,
            isRunning: true,
            currentTest: null
        });
        
        // Note: Server runs until Ctrl+C (handled separately)
        // The server will handle incoming connections when client connects
    }

    /**
     * Start iperf3 client on UE
     * @param {Object} nf - UE Network Function
     * @param {Array} args - Command arguments
     * @param {HTMLElement} output - Output element
     */
    async startIperf3Client(nf, args, output) {
        // Parse arguments
        const bindIndex = args.indexOf('-B');
        const clientIndex = args.indexOf('-c');
        const reverseFlag = args.includes('-R') || args.includes('--reverse');
        
        if (bindIndex === -1 || clientIndex === -1) {
            this.addTerminalLine(output, 'Error: Missing required arguments', 'error');
            this.addTerminalLine(output, 'Usage: iperf3 -B <UE_IP> -c <EXT_DN_IP> [-R]', 'error');
            return;
        }
        
        const ueIP = args[bindIndex + 1];
        const extDNIP = args[clientIndex + 1];
        
        if (!ueIP || !extDNIP) {
            this.addTerminalLine(output, 'Error: Missing IP addresses', 'error');
            return;
        }
        
        if (!this.isValidIP(ueIP) || !this.isValidIP(extDNIP)) {
            this.addTerminalLine(output, 'Error: Invalid IP address format', 'error');
            return;
        }
        
        // Find ext-dn NF
        const allNFs = window.dataStore?.getAllNFs() || [];
        const extDN = allNFs.find(n => n.type === 'ext-dn' && n.config.ipAddress === extDNIP);
        
        if (!extDN) {
            this.addTerminalLine(output, `Error: ext-dn with IP ${extDNIP} not found`, 'error');
            return;
        }
        
        // Check if server is running on ext-dn
        if (!this.iperf3Servers.has(extDN.id)) {
            this.addTerminalLine(output, `Error: iperf3 server is not running on ${extDNIP}`, 'error');
            this.addTerminalLine(output, 'Please start the server first: iperf3 -s', 'error');
            return;
        }
        
        // Get UE's tun interface IP if PDU session is established
        const ueTunIP = nf.config.tunInterface?.ipAddress;
        if (!ueTunIP) {
            this.addTerminalLine(output, 'Error: UE does not have PDU session established', 'error');
            this.addTerminalLine(output, 'Please register UE and establish PDU session first', 'error');
            return;
        }
        
        // Validate that provided UE IP matches tun interface IP
        if (ueIP !== ueTunIP) {
            this.addTerminalLine(output, `Warning: Provided UE IP (${ueIP}) does not match tun interface IP (${ueTunIP})`, 'error');
            this.addTerminalLine(output, `Using tun interface IP: ${ueTunIP}`, 'info');
        }
        
        // Start the test
        await this.executeIperf3Test(nf, extDN, ueTunIP, extDNIP, reverseFlag, output);
    }

    /**
     * Execute iperf3 test between UE and ext-dn
     * @param {Object} ue - UE Network Function
     * @param {Object} extDN - ext-dn Network Function
     * @param {string} ueIP - UE IP address (from tun interface)
     * @param {string} extDNIP - ext-dn IP address
     * @param {boolean} reverse - True for downlink test
     * @param {HTMLElement} output - UE terminal output
     */
    async executeIperf3Test(ue, extDN, ueIP, extDNIP, reverse, output) {
        // Get ext-dn terminal output
        const extDNModal = document.getElementById(`windows-terminal-modal-${extDN.id}`);
        const extDNOutput = extDNModal?.querySelector(`#terminal-output-${extDN.id}`);
        
        if (!extDNOutput) {
            this.addTerminalLine(output, 'Error: ext-dn terminal not found', 'error');
            return;
        }
        
        // Update server state
        const serverState = this.iperf3Servers.get(extDN.id);
        serverState.currentTest = { ue, ueIP, extDNIP, reverse, startTime: Date.now() };
        
        // Generate random port for connection
        const clientPort = Math.floor(Math.random() * 50000) + 10000;
        const serverPort = 5201;
        
        // Client output
        this.addTerminalLine(output, `Connecting to host ${extDNIP}, port ${serverPort}`, 'info');
        
        // Server output
        this.addTerminalLine(extDNOutput, `Accepted connection from ${ue.config.ipAddress}, port ${clientPort}`, 'info');
        
        // Simulate connection delay
        await this.delay(300);
        
        // Client connection established
        this.addTerminalLine(output, `[  5] local ${ueIP} port ${clientPort} connected to ${extDNIP} port ${serverPort}`, 'info');
        
        if (reverse) {
            this.addTerminalLine(output, 'Reverse mode, remote host ' + extDNIP + ' is sending', 'info');
        }
        
        // Server connection established
        this.addTerminalLine(extDNOutput, `[  5] local ${extDNIP} port ${serverPort} connected to ${ue.config.ipAddress} port ${clientPort}`, 'info');
        
        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(extDNOutput, '', 'blank');
        
        // Header
        if (reverse) {
            // Server sends in reverse mode
            this.addTerminalLine(extDNOutput, '[ ID] Interval           Transfer     Bitrate         Retr  Cwnd', 'info');
            this.addTerminalLine(output, '[ ID] Interval           Transfer     Bitrate', 'info');
        } else {
            // Client sends in normal mode
            this.addTerminalLine(extDNOutput, '[ ID] Interval           Transfer     Bitrate', 'info');
            this.addTerminalLine(output, '[ ID] Interval           Transfer     Bitrate         Retr  Cwnd', 'info');
        }
        
        // Run test for 10 seconds with 1-second intervals
        const testDuration = 10;
        let totalTransfer = 0;
        let totalBitrate = 0;
        
        for (let i = 0; i < testDuration; i++) {
            await this.delay(1000); // 1 second delay per interval
            
            // Generate realistic throughput values
            const baseBitrate = reverse ? 45 : 20; // Downlink typically higher
            const variance = Math.random() * 10 - 5; // ±5 Mbits/sec variance
            const bitrate = Math.max(5, baseBitrate + variance); // Minimum 5 Mbits/sec
            
            const transfer = (bitrate * 1.0) / 8; // MBytes for 1 second
            totalTransfer += transfer;
            totalBitrate += bitrate;
            
            const transferStr = transfer >= 1 ? `${transfer.toFixed(2)} MBytes` : `${(transfer * 1024).toFixed(0)} KBytes`;
            const bitrateStr = `${bitrate.toFixed(1)} Mbits/sec`;
            
            const interval = `[  5]   ${i.toFixed(2)}-${(i + 1).toFixed(2)}  sec`;
            
            if (reverse) {
                // Server sends
                const cwnd = `${(100 + i * 20 + Math.random() * 50).toFixed(0)} KBytes`;
                this.addTerminalLine(extDNOutput, `${interval}  ${transferStr.padStart(10)}  ${bitrateStr.padStart(12)}    0    ${cwnd}`, 'info');
                // Client receives
                this.addTerminalLine(output, `${interval}  ${transferStr.padStart(10)}  ${bitrateStr.padStart(12)}`, 'info');
            } else {
                // Client sends
                const cwnd = `${(100 + i * 20 + Math.random() * 50).toFixed(0)} KBytes`;
                this.addTerminalLine(output, `${interval}  ${transferStr.padStart(10)}  ${bitrateStr.padStart(12)}    0    ${cwnd}`, 'info');
                // Server receives
                this.addTerminalLine(extDNOutput, `${interval}  ${transferStr.padStart(10)}  ${bitrateStr.padStart(12)}`, 'info');
            }
        }
        
        // Final summary line
        await this.delay(500);
        
        const avgBitrate = totalBitrate / testDuration;
        const totalTransferStr = `${totalTransfer.toFixed(1)} MBytes`;
        const avgBitrateStr = `${avgBitrate.toFixed(1)} Mbits/sec`;
        
        this.addTerminalLine(output, '- - - - - - - - - - - - - - - - - - - - - - - - -', 'info');
        this.addTerminalLine(extDNOutput, '- - - - - - - - - - - - - - - - - - - - - - - - -', 'info');
        
        if (reverse) {
            // Server summary (sender)
            this.addTerminalLine(extDNOutput, `[  5]   0.00-${testDuration.toFixed(2)}  sec  ${totalTransferStr.padStart(10)}  ${avgBitrateStr.padStart(12)}    0             sender`, 'info');
            // Client summary (receiver)
            this.addTerminalLine(output, `[  5]   0.00-${testDuration.toFixed(2)}  sec  ${totalTransferStr.padStart(10)}  ${avgBitrateStr.padStart(12)}    0             sender`, 'info');
            this.addTerminalLine(output, `[  5]   0.00-${testDuration.toFixed(2)}  sec  ${(totalTransfer * 0.95).toFixed(1)} MBytes  ${(avgBitrate * 0.95).toFixed(1)} Mbits/sec                  receiver`, 'info');
            // Server also shows receiver stats
            this.addTerminalLine(extDNOutput, `[  5]   0.00-${testDuration.toFixed(2)}  sec  ${(totalTransfer * 0.95).toFixed(1)} MBytes  ${(avgBitrate * 0.95).toFixed(1)} Mbits/sec                  receiver`, 'info');
        } else {
            // Client summary (sender)
            this.addTerminalLine(output, `[  5]   0.00-${testDuration.toFixed(2)}  sec  ${totalTransferStr.padStart(10)}  ${avgBitrateStr.padStart(12)}    0             sender`, 'info');
            this.addTerminalLine(output, `[  5]   0.00-${testDuration.toFixed(2)}  sec  ${(totalTransfer * 0.95).toFixed(1)} MBytes  ${(avgBitrate * 0.95).toFixed(1)} Mbits/sec                  receiver`, 'info');
            // Server summary (receiver)
            this.addTerminalLine(extDNOutput, `[  5]   0.00-${testDuration.toFixed(2)}  sec  ${totalTransferStr.padStart(10)}  ${avgBitrateStr.padStart(12)}                  receiver`, 'info');
        }
        
        // Server returns to listening
        await this.delay(500);
        this.addTerminalLine(extDNOutput, '', 'blank');
        this.addTerminalLine(extDNOutput, '-----------------------------------------------------------', 'info');
        this.addTerminalLine(extDNOutput, 'Server listening on 5201', 'info');
        this.addTerminalLine(extDNOutput, '-----------------------------------------------------------', 'info');
        
        // Client done
        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, 'iperf Done.', 'info');
        
        // Clear current test
        serverState.currentTest = null;
    }

    /**
     * Stop iperf3 server
     * @param {Object} nf - Network Function (ext-dn)
     * @param {HTMLElement} output - Output element
     */
    stopIperf3Server(nf, output) {
        if (!this.iperf3Servers.has(nf.id)) {
            this.addTerminalLine(output, 'No iperf3 server is running', 'error');
            return;
        }
        
        const serverState = this.iperf3Servers.get(nf.id);
        
        // If test is running, wait for it to complete
        if (serverState.currentTest) {
            this.addTerminalLine(output, 'Test in progress. Please wait for test to complete.', 'info');
            return;
        }
        
        // Stop server
        this.iperf3Servers.delete(nf.id);
        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, '^C', 'info');
        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, 'iperf3 server stopped', 'info');
    }

    /**
     * Validate UE against UDR subscriber information
     * @param {string} ueId - UE ID
     */
    validateUEAgainstUDR(ueId) {
        const ue = window.dataStore?.getNFById(ueId);
        if (!ue || ue.type !== 'UE') {
            alert('Error: UE not found');
            return;
        }

        // Get subscriber information from UDR
        const subscribers = window.dataStore?.getSubscribers() || [];
        const ueImsi = ue.config.subscriberImsi;

        if (!ueImsi) {
            alert('❌ Validation Failed!\n\nUE does not have IMSI configured.\n\nPlease configure subscriber information first.');
            return;
        }

        // Find matching subscriber in UDR
        const subscriber = subscribers.find(s => s.imsi === ueImsi);

        if (!subscriber) {
            alert('❌ Validation Failed!\n\n' +
                  `UE IMSI: ${ueImsi}\n` +
                  'Status: Not found in UDR/MySQL subscriber database\n\n' +
                  'Please ensure the subscriber is registered in UDR.');
            
            if (window.logEngine) {
                window.logEngine.addLog(ueId, 'ERROR',
                    'UE validation failed: Subscriber not found in UDR', {
                    ueImsi: ueImsi,
                    reason: 'Subscriber not registered in UDR/MySQL'
                });
            }
            return;
        }

        // Validate all parameters
        const mismatches = [];
        
        if (ue.config.subscriberKey && ue.config.subscriberKey !== subscriber.key) {
            mismatches.push('Key');
        }
        
        if (ue.config.subscriberOpc && ue.config.subscriberOpc !== subscriber.opc) {
            mismatches.push('OPc');
        }
        
        if (ue.config.subscriberDnn && ue.config.subscriberDnn !== subscriber.dnn) {
            mismatches.push('DNN');
        }
        
        if (ue.config.subscriberSst && ue.config.subscriberSst !== subscriber.nssai_sst) {
            mismatches.push('NSSAI SST');
        }

        if (mismatches.length > 0) {
            alert('⚠️ Validation Warning!\n\n' +
                  `UE IMSI: ${ueImsi}\n` +
                  `Status: Found in UDR but parameters mismatch\n\n` +
                  `Mismatched parameters: ${mismatches.join(', ')}\n\n` +
                  'Please update UE configuration to match UDR subscriber data.');
            
            if (window.logEngine) {
                window.logEngine.addLog(ueId, 'WARNING',
                    'UE validation warning: Parameter mismatches detected', {
                    ueImsi: ueImsi,
                    mismatches: mismatches,
                    udrSubscriber: {
                        key: subscriber.key.substring(0, 8) + '...',
                        opc: subscriber.opc.substring(0, 8) + '...',
                        dnn: subscriber.dnn,
                        nssai_sst: subscriber.nssai_sst
                    }
                });
            }
            return;
        }

        // Validation successful
        alert('✅ Validation Successful!\n\n' +
              `UE IMSI: ${ueImsi}\n` +
              `Status: All parameters match UDR subscriber data\n\n` +
              `DNN: ${subscriber.dnn}\n` +
              `NSSAI SST: ${subscriber.nssai_sst}\n\n` +
              'UE is ready for network registration and testing.');
        
        if (window.logEngine) {
            window.logEngine.addLog(ueId, 'SUCCESS',
                'UE validation successful: All parameters match UDR', {
                ueImsi: ueImsi,
                dnn: subscriber.dnn,
                nssai_sst: subscriber.nssai_sst,
                validationStatus: 'PASSED'
            });
        }
    }

    /**
     * Collect network logs (NGAP, NAS, GTP-U, PDU Session)
     * @param {string} ueId - UE ID
     */
    collectNetworkLogs(ueId) {
        const ue = window.dataStore?.getNFById(ueId);
        if (!ue || ue.type !== 'UE') {
            alert('Error: UE not found');
            return;
        }

        // Check if UE is registered and has PDU session
        if (!ue.config.pduSession) {
            alert('⚠️ Log Collection Unavailable!\n\n' +
                  'UE must be registered and have an active PDU session to collect logs.\n\n' +
                  'Please:\n' +
                  '1. Register UE with AMF (NAS registration)\n' +
                  '2. Establish PDU session\n' +
                  '3. Ensure GTP tunnel is active');
            return;
        }

        // Collect logs from log engine
        const allLogs = [];
        const allNFs = window.dataStore?.getAllNFs() || [];
        
        // Find related NFs
        const gNB = allNFs.find(n => n.type === 'gNB');
        const amf = allNFs.find(n => n.type === 'AMF');
        const upf = allNFs.find(n => n.type === 'UPF' && n.id === ue.config.pduSession?.upfId);
        const smf = allNFs.find(n => n.type === 'SMF');

        // Collect NGAP logs (gNB <-> AMF)
        if (gNB && amf && window.logEngine) {
            const ngapLogs = window.logEngine.logs.get(gNB.id) || [];
            const amfLogs = window.logEngine.logs.get(amf.id) || [];
            
            ngapLogs.forEach(log => {
                if (log.message.includes('NGAP') || log.message.includes('NG Setup')) {
                    allLogs.push({ ...log, category: 'NGAP', source: gNB.name });
                }
            });
            
            amfLogs.forEach(log => {
                if (log.message.includes('NGAP') || log.message.includes('NG Setup')) {
                    allLogs.push({ ...log, category: 'NGAP', source: amf.name });
                }
            });
        }

        // Collect NAS logs (UE <-> AMF)
        if (window.logEngine) {
            const ueLogs = window.logEngine.logs.get(ueId) || [];
            const amfLogs = amf ? (window.logEngine.logs.get(amf.id) || []) : [];
            
            ueLogs.forEach(log => {
                if (log.message.includes('NAS') || log.message.includes('Registration') || 
                    log.message.includes('SUCI') || log.message.includes('Authentication')) {
                    allLogs.push({ ...log, category: 'NAS', source: ue.name });
                }
            });
            
            amfLogs.forEach(log => {
                if (log.message.includes('NAS') || log.message.includes('Registration') || 
                    log.message.includes('SUCI') || log.message.includes('Authentication')) {
                    allLogs.push({ ...log, category: 'NAS', source: amf.name });
                }
            });
        }

        // Collect GTP-U logs (gNB <-> UPF)
        if (gNB && upf && window.logEngine) {
            const gnbLogs = window.logEngine.logs.get(gNB.id) || [];
            const upfLogs = window.logEngine.logs.get(upf.id) || [];
            
            gnbLogs.forEach(log => {
                if (log.message.includes('GTP-U') || log.message.includes('GTP') || 
                    log.message.includes('tunnel') || log.message.includes('N3')) {
                    allLogs.push({ ...log, category: 'GTP-U', source: gNB.name });
                }
            });
            
            upfLogs.forEach(log => {
                if (log.message.includes('GTP-U') || log.message.includes('GTP') || 
                    log.message.includes('tunnel') || log.message.includes('N3')) {
                    allLogs.push({ ...log, category: 'GTP-U', source: upf.name });
                }
            });
        }

        // Collect PDU Session logs
        if (window.logEngine) {
            const ueLogs = window.logEngine.logs.get(ueId) || [];
            const smfLogs = smf ? (window.logEngine.logs.get(smf.id) || []) : [];
            const upfLogs = upf ? (window.logEngine.logs.get(upf.id) || []) : [];
            
            ueLogs.forEach(log => {
                if (log.message.includes('PDU') || log.message.includes('session') || 
                    log.message.includes('tun_ue') || log.message.includes('10.0.0.')) {
                    allLogs.push({ ...log, category: 'PDU Session', source: ue.name });
                }
            });
            
            smfLogs.forEach(log => {
                if (log.message.includes('PDU') || log.message.includes('session')) {
                    allLogs.push({ ...log, category: 'PDU Session', source: smf.name });
                }
            });
            
            upfLogs.forEach(log => {
                if (log.message.includes('PDU') || log.message.includes('session') || 
                    log.message.includes('tun0') || log.message.includes('ogstun')) {
                    allLogs.push({ ...log, category: 'PDU Session', source: upf.name });
                }
            });
        }

        // Sort logs by timestamp
        allLogs.sort((a, b) => a.timestamp - b.timestamp);

        if (allLogs.length === 0) {
            alert('⚠️ No Logs Available!\n\n' +
                  'No network logs found for this UE.\n\n' +
                  'Please ensure:\n' +
                  '1. UE is registered with AMF\n' +
                  '2. PDU session is established\n' +
                  '3. Network functions are connected and operational');
            return;
        }

        // Format and display logs
        let logReport = '═══════════════════════════════════════════════════════\n';
        logReport += `NETWORK LOG COLLECTION REPORT\n`;
        logReport += `UE: ${ue.name} (${ue.config.subscriberImsi || 'N/A'})\n`;
        logReport += `Timestamp: ${new Date().toLocaleString()}\n`;
        logReport += `═══════════════════════════════════════════════════════\n\n`;

        // Group by category
        const categories = ['NGAP', 'NAS', 'GTP-U', 'PDU Session'];
        categories.forEach(category => {
            const categoryLogs = allLogs.filter(log => log.category === category);
            if (categoryLogs.length > 0) {
                logReport += `\n[${category} LOGS] (${categoryLogs.length} entries)\n`;
                logReport += '─────────────────────────────────────────────────────\n';
                categoryLogs.forEach(log => {
                    const time = new Date(log.timestamp).toLocaleTimeString();
                    logReport += `[${time}] ${log.source} | ${log.level} | ${log.message}\n`;
                    if (log.details && Object.keys(log.details).length > 0) {
                        Object.entries(log.details).forEach(([key, value]) => {
                            logReport += `  └─ ${key}: ${value}\n`;
                        });
                    }
                });
                logReport += '\n';
            }
        });

        logReport += '═══════════════════════════════════════════════════════\n';
        logReport += `Total Logs Collected: ${allLogs.length}\n`;
        logReport += '═══════════════════════════════════════════════════════\n';

        // Display in alert (or could be exported to file)
        const logWindow = window.open('', '_blank', 'width=800,height=600');
        if (logWindow) {
            logWindow.document.write(`<pre style="font-family: monospace; padding: 20px;">${logReport}</pre>`);
            logWindow.document.close();
        } else {
            // Fallback to alert if popup blocked
            alert(logReport.substring(0, 2000) + (logReport.length > 2000 ? '\n\n... (truncated, see console for full report)' : ''));
            console.log('═══════════════════════════════════════════════════════');
            console.log('NETWORK LOG COLLECTION REPORT');
            console.log('═══════════════════════════════════════════════════════');
            console.log(logReport);
        }

        // Log the collection event
        if (window.logEngine) {
            window.logEngine.addLog(ueId, 'SUCCESS',
                'Network logs collected successfully', {
                totalLogs: allLogs.length,
                categories: categories.filter(cat => allLogs.some(log => log.category === cat)),
                reportGenerated: true
            });
        }
    }

    /**
     * Get bus at position (for clicking)
     */
    getBusAtPosition(x, y) {
        const allBuses = window.dataStore?.getAllBuses() || [];

        for (const bus of allBuses) {
            const tolerance = 30; // Increased for easier clicking

            if (bus.orientation === 'horizontal') {
                if (x >= bus.position.x &&
                    x <= bus.position.x + bus.length &&
                    Math.abs(y - bus.position.y) <= tolerance) {
                    return bus;
                }
            } else {
                if (y >= bus.position.y &&
                    y <= bus.position.y + bus.length &&
                    Math.abs(x - bus.position.x) <= tolerance) {
                    return bus;
                }
            }
        }

        return null;
    }
}