/**
 * ============================================
 * NETWORK FUNCTION MANAGER
 * ============================================
 * Manages creation, deletion, and lifecycle of Network Functions
 * 
 * Responsibilities:
 * - Create new NF instances
 * - Generate unique IDs
 * - Assign default configurations
 * - Handle NF positioning on canvas
 * - Track NF counters for naming
 */

class NFManager {
    constructor() {
        // Counter for each NF type for unique naming
        this.nfCounters = {
            'NRF': 0,
            'AMF': 0,
            'SMF': 0,
            'UPF': 0,
            'AUSF': 0,
            'UDM': 0,
            'PCF': 0,
            'NSSF': 0,
            'UDR': 0,
            'gNB': 0,
            'UE': 0,
            'MySQL': 0,
            'ext-dn': 0
        };

        console.log('✅ NFManager initialized');
    }

    /**
     * Create a new Network Function
     * @param {string} type - Type of NF (AMF, SMF, etc.)
     * @param {Object} position - {x, y} coordinates on canvas (optional)
     * @returns {Object} Created NF object
     */

    createNetworkFunction(type, position = null) {
        console.log('🔧 NFManager: Creating NF of type:', type);

        // Get all existing NFs
        const allNFs = window.dataStore?.getAllNFs() || [];
        
        // Check UE limit - only allow 2 UEs maximum
        if (type === 'UE') {
            const existingUEs = allNFs.filter(nf => nf.type === 'UE');
            if (existingUEs.length >= 2) {
                const ueNames = existingUEs.map(ue => ue.name).join(', ');
                console.warn(`❌ UE limit reached (${existingUEs.length}/2): ${ueNames}. Delete one first.`);
                return null;
            } else {
                console.log(`✅ UE creation allowed: ${existingUEs.length}/2 UEs currently exist`);
            }
        } else {
            // For all other NF types - only allow ONE instance
            const existingNF = allNFs.find(nf => nf.type === type);
            if (existingNF) {
                console.warn(`❌ ${type} already exists (${existingNF.name} @ ${existingNF.config.ipAddress}). Skipping silently.`);
                return null;
            } else {
                console.log(`✅ ${type} creation allowed: No existing instance found`);
            }
        }

        this.nfCounters[type]++;
        const count = this.nfCounters[type];

        if (!position) {
            position = this.calculateAutoPosition(type, count);
        }

        const nfDef = this.getNFDefinition(type);

        // Get global protocol (default HTTP/2)
        const globalProtocol = window.globalHTTPProtocol || 'HTTP/2';

        // Generate unique IP address to prevent conflicts
        const uniqueIP = this.generateUniqueIPAddress();
        const uniquePort = this.generateUniquePort();

        // Create NF object
        const nf = {
            id: this.generateUniqueId(type),
            type: type,
            name: `${type}-${count}`,
            position: position,
            color: nfDef.color,
            icon: nfDef.icon,
            iconImage: null, // Will store loaded Image object
            status: 'starting', // NEW: Start with 'starting' status
            statusTimestamp: Date.now(), // NEW: Track when status was set
            config: {
                ipAddress: uniqueIP,
                port: uniquePort,
                capacity: 1000,
                load: 0,
                httpProtocol: globalProtocol  // NEW: Add protocol property
            }
        };

        // SPECIAL CASE: UPF gets additional tun0 network interface
        if (type === 'UPF') {
            nf.config.tun0Interface = {
                interfaceName: 'tun0',
                network: '10.0.0.0/28',
                gatewayIP: '10.0.0.1',
                assignedIPs: [], // Track IPs assigned to UEs
                nextAvailableIP: 2 // Next IP to assign (10.0.0.2)
            };
            
            console.log(`🌐 UPF ${nf.name} created with tun0 interface: ${nf.config.tun0Interface.gatewayIP} (${nf.config.tun0Interface.network})`);
        }

        // SPECIAL CASE: UE gets default subscriber configuration
        if (type === 'UE') {
            // Initialize default subscribers if not already present
            const subscribers = window.dataStore?.getSubscribers() || [];
            if (subscribers.length === 0) {
                // Set default subscribers
                if (window.dataStore?.setSubscribers) {
                    window.dataStore.setSubscribers([
                        { imsi: '001010000000101', key: 'fec86ba6eb707ed08905757b1bb44b8f', opc: 'C42449363BBAD02B66D16BC975D77CC1', dnn: '5G-Lab', nssai_sst: 1 },
                        { imsi: '001010000000102', key: 'fec86ba6eb707ed08905757b1bb44b8f', opc: 'C42449363BBAD02B66D16BC975D77CC1', dnn: '5G-Lab', nssai_sst: 1 }
                    ]);
                    console.log('📋 Default subscribers initialized in UDR store');
                }
            }

            // Get updated subscribers list
            const updatedSubscribers = window.dataStore?.getSubscribers() || [];
            
            // Find all existing UEs and their IMSIs
            const allUEs = window.dataStore?.getAllNFs().filter(n => n.type === 'UE') || [];
            const usedIMSI = new Set(allUEs.map(ue => ue.config.subscriberImsi).filter(Boolean));
            
            // Find first available subscriber that's not assigned to any UE
            const availableSubscriber = updatedSubscribers.find(sub => !usedIMSI.has(sub.imsi));
            
            if (availableSubscriber) {
                // Assign default subscriber configuration matching the subscriber profile
                nf.config.subscriberImsi = availableSubscriber.imsi;
                nf.config.subscriberKey = availableSubscriber.key;
                nf.config.subscriberOpc = availableSubscriber.opc;
                nf.config.subscriberDnn = availableSubscriber.dnn;
                nf.config.subscriberSst = availableSubscriber.nssai_sst;
                
                console.log(`📱 UE ${nf.name} assigned default subscriber configuration: IMSI=${availableSubscriber.imsi}, DNN=${availableSubscriber.dnn}, SST=${availableSubscriber.nssai_sst}`);
            } else {
                // No available subscriber, use first default values
                nf.config.subscriberImsi = '001010000000101';
                nf.config.subscriberKey = 'fec86ba6eb707ed08905757b1bb44b8f';
                nf.config.subscriberOpc = 'C42449363BBAD02B66D16BC975D77CC1';
                nf.config.subscriberDnn = '5G-Lab';
                nf.config.subscriberSst = 1;
                
                console.log(`⚠️ UE ${nf.name} assigned fallback default subscriber configuration (no available subscriber found)`);
            }
        }

        // =========================================
        // LOAD ICON IMAGE FROM SVG FILE
        // =========================================
        if (nf.icon) {
            console.log('🔄 Attempting to load icon for', nf.name + ':', nf.icon);
            console.log('🔍 Current location:', window.location.href);

            // Ensure the path is resolved correctly relative to the current page
            const iconPath = nf.icon.startsWith('http') ? nf.icon : nf.icon;
            const fullIconURL = new URL(iconPath, window.location.href).href;
            console.log('🔍 Full icon URL will be:', fullIconURL);

            const img = new Image();

            // Don't set CORS for local files as it can cause issues
            // img.crossOrigin = 'anonymous';

            img.onload = () => {
                console.log('✅ Icon loaded successfully for', nf.name + ':', nf.icon);
                console.log('✅ Image dimensions:', img.width, 'x', img.height);
                nf.iconImage = img;
                // Re-render to show the loaded icon
                if (window.canvasRenderer) {
                    console.log('🎨 Re-rendering canvas to show loaded icon');
                    window.canvasRenderer.render();
                }
            };

            img.onerror = (error) => {
                console.error('❌ Failed to load icon for', nf.name + ':', nf.icon);
                console.error('❌ Error event:', error);
                console.error('❌ Attempted URL:', img.src);

                // Try alternative paths
                const alternativePaths = [
                    `./${nf.icon}`,
                    `../${nf.icon}`,
                    nf.icon.replace('images/', './images/'),
                    nf.icon.replace('images/', '../images/')
                ];

                let pathIndex = 0;

                function tryNextPath() {
                    if (pathIndex >= alternativePaths.length) {
                        console.error('❌ All alternative paths failed for', nf.name);
                        nf.iconImage = null; // Will show fallback
                        return;
                    }

                    const altPath = alternativePaths[pathIndex++];
                    console.log('🔄 Trying alternative path:', altPath);

                    const alternativeImg = new Image();
                    alternativeImg.onload = () => {
                        console.log('✅ Alternative icon loaded for', nf.name, 'using path:', altPath);
                        nf.iconImage = alternativeImg;
                        if (window.canvasRenderer) {
                            window.canvasRenderer.render();
                        }
                    };
                    alternativeImg.onerror = () => {
                        console.log('❌ Alternative path failed:', altPath);
                        tryNextPath();
                    };
                    alternativeImg.src = altPath;
                }

                tryNextPath();
            };

            // Add a timeout to detect hanging loads
            setTimeout(() => {
                if (!img.complete && !nf.iconImage) {
                    console.warn('⏰ Icon loading timeout for', nf.name + ':', nf.icon);
                }
            }, 5000);

            img.src = iconPath; // This triggers the load
        } else {
            console.warn('⚠️ No icon path defined for NF type:', type);
        }

        console.log('✅ NF created:', nf);

        // Add to data store
        if (window.dataStore) {
            window.dataStore.addNF(nf);
        } else {
            console.error('❌ DataStore not available!');
            return null;
        }

        // Trigger log engine
        if (window.logEngine) {
            window.logEngine.onNFAdded(nf);
            
            // Special logging for UPF tun0 interface
            if (nf.type === 'UPF' && nf.config.tun0Interface) {
                window.logEngine.addLog(nf.id, 'INFO',
                    `tun0 network interface created: ${nf.config.tun0Interface.network}`, {
                    interfaceName: nf.config.tun0Interface.interfaceName,
                    network: nf.config.tun0Interface.network,
                    gatewayIP: nf.config.tun0Interface.gatewayIP,
                    availableIPs: '10.0.0.2 - 10.0.0.14 (13 IPs for UEs)',
                    purpose: 'User plane data network for UE PDU sessions'
                });
            }
        }

        // Force canvas re-render
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }

        // NEW: Start service lifecycle management
        this.startServiceLifecycle(nf);

        // SPECIAL CASE: When UDR is created, auto-start MySQL in same subnet
        if (type === 'UDR') {
            console.log(`🔄 UDR created - will auto-start MySQL in same subnet`);
            setTimeout(() => {
                this.autoStartMySQLForUDR(nf);
            }, 1000); // Wait 1 second before creating MySQL
        }

        return nf;
    }

    /**
     * Auto-start MySQL when UDR is created
     * @param {Object} udr - UDR network function
     */
    autoStartMySQLForUDR(udr) {
        // Check if UDR still exists
        if (!window.dataStore?.getNFById(udr.id)) {
            return;
        }

        // Check if MySQL already exists in same subnet
        const allNFs = window.dataStore.getAllNFs();
        const udrNetwork = this.getNetworkFromIP(udr.config.ipAddress);
        const existingMySQL = allNFs.find(nf => 
            nf.type === 'MySQL' && 
            this.getNetworkFromIP(nf.config.ipAddress) === udrNetwork
        );

        if (existingMySQL) {
            console.log(`ℹ️ MySQL already exists in same subnet as UDR: ${existingMySQL.name}`);
            // Try to connect if not already connected
            setTimeout(() => {
                if (existingMySQL.status === 'stable') {
                    this.attemptAutoConnections(existingMySQL);
                }
            }, 6000); // Wait for MySQL to be stable if it's still starting
            return;
        }

        // Create MySQL in same subnet as UDR
        const mysqlIP = this.generateUniqueIPAddressInSubnet(udrNetwork);
        const mysqlPort = 3306; // Standard MySQL port
        
        // Calculate position near UDR
        const mysqlPosition = {
            x: udr.position.x + 100,
            y: udr.position.y
        };

        console.log(`🔄 Auto-creating MySQL for UDR ${udr.name} at IP ${mysqlIP} in subnet ${udrNetwork}.0/24`);

        // Create MySQL NF
        const mysql = this.createNetworkFunction('MySQL', mysqlPosition);
        
        if (mysql) {
            // Override IP to be in same subnet as UDR
            mysql.config.ipAddress = mysqlIP;
            mysql.config.port = mysqlPort;
            
            // Update in data store
            window.dataStore.updateNF(mysql.id, mysql);

            console.log(`✅ MySQL auto-created for UDR: ${mysql.name} at ${mysqlIP}`);

            // Log the auto-creation
            if (window.logEngine) {
                window.logEngine.addLog(udr.id, 'INFO',
                    `MySQL database auto-started for UDR data repository`, {
                    mysqlName: mysql.name,
                    mysqlIP: mysqlIP,
                    subnet: udrNetwork + '.0/24',
                    purpose: 'UDR data repository backend',
                    note: 'MySQL will auto-connect to UDR when stable'
                });
            }

            // Re-render canvas
            if (window.canvasRenderer) {
                window.canvasRenderer.render();
            }
        }
    }

    /**
     * Generate unique IP address in a specific subnet
     * @param {string} subnet - Subnet prefix (e.g., "192.168.1")
     * @returns {string} Unique IP address in that subnet
     */
    generateUniqueIPAddressInSubnet(subnet) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const usedIPs = new Set(allNFs.map(nf => nf.config.ipAddress));
        
        // Try to find available IP in the specified subnet
        for (let host = 10; host <= 254; host++) {
            const ip = `${subnet}.${host}`;
            if (!usedIPs.has(ip)) {
                return ip;
            }
        }
        
        // Fallback: use a random IP in the subnet
        const randomHost = Math.floor(Math.random() * 244) + 10;
        return `${subnet}.${randomHost}`;
    }

    // createNetworkFunction(type, position = null) {
    //     console.log('🔧 NFManager: Creating NF of type:', type);

    //     // Increment counter for this NF type
    //     this.nfCounters[type]++;
    //     const count = this.nfCounters[type];

    //     // Auto-position if not provided
    //     if (!position) {
    //         position = this.calculateAutoPosition(type, count);
    //     }

    //     // Get NF definition (color, icon, etc.)
    //     const nfDef = this.getNFDefinition(type);

    //     // Create NF object
    //     const nf = {
    //         id: this.generateUniqueId(type),
    //         type: type,
    //         name: `${type}-${count}`,
    //         position: position,
    //         color: nfDef.color,
    //         icon: nfDef.icon,
    //         status: 'active',
    //         config: {
    //             ipAddress: `192.168.1.${10 + count}`,
    //             port: 8080 + count,
    //             capacity: 1000,
    //             load: 0
    //         }
    //     };

    //     console.log('✅ NF created:', nf);

    //     // Add to data store
    //     if (window.dataStore) {
    //         window.dataStore.addNF(nf);
    //     } else {
    //         console.error('❌ DataStore not available!');
    //         return null;
    //     }

    //     // Trigger log engine
    //     if (window.logEngine) {
    //         window.logEngine.onNFAdded(nf);
    //     }

    //     // Force canvas re-render
    //     if (window.canvasRenderer) {
    //         window.canvasRenderer.render();
    //     }

    //     return nf;
    // }

    /**
     * Generate unique ID for NF
     * @param {string} type - NF type
     * @returns {string} Unique ID
     */
    generateUniqueId(type) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 7);
        return `${type.toLowerCase()}-${timestamp}-${random}`;
    }

    /**
     * Generate unique IP address to prevent conflicts (UPDATED for real-time availability)
     * @returns {string} Unique IP address
     */
    generateUniqueIPAddress() {
        // Get fresh list of used IPs every time
        const allNFs = window.dataStore?.getAllNFs() || [];
        const usedIPs = new Set(allNFs.map(nf => nf.config.ipAddress));
        
        console.log(`🔍 Checking IP availability. Currently used IPs:`, Array.from(usedIPs));
        
        // Define different subnets for different types of services
        const subnets = [
            '192.168.1', // Core network functions
            '192.168.2', // User plane functions
            '192.168.3', // Edge services
            '192.168.4'  // Additional services
        ];

        // Try to find available IP in each subnet
        for (const subnet of subnets) {
            for (let host = 10; host <= 254; host++) {
                const ip = `${subnet}.${host}`;
                if (!usedIPs.has(ip)) {
                    console.log(`🌐 Generated unique IP: ${ip} (subnet: ${subnet}.0/24)`);
                    return ip;
                }
            }
        }

        // Fallback: generate random IP if all subnets are full
        const randomSubnet = Math.floor(Math.random() * 254) + 1;
        const randomHost = Math.floor(Math.random() * 244) + 10;
        const fallbackIP = `192.168.${randomSubnet}.${randomHost}`;
        
        console.warn(`⚠️ All predefined subnets full, using fallback IP: ${fallbackIP}`);
        return fallbackIP;
    }

    /**
     * Generate unique port number to prevent conflicts (UPDATED for real-time availability)
     * @returns {number} Unique port number
     */
    generateUniquePort() {
        // Get fresh list of used ports every time
        const allNFs = window.dataStore?.getAllNFs() || [];
        const usedPorts = new Set(allNFs.map(nf => nf.config.port));
        
        console.log(`🔍 Checking port availability. Currently used ports:`, Array.from(usedPorts));
        
        // Start from port 8080 and find next available
        for (let port = 8080; port <= 9999; port++) {
            if (!usedPorts.has(port)) {
                console.log(`🔌 Generated unique port: ${port}`);
                return port;
            }
        }

        // Fallback: random port if all are used
        const randomPort = Math.floor(Math.random() * 1000) + 8000;
        console.warn(`⚠️ All standard ports (8080-9999) used, using fallback port: ${randomPort}`);
        return randomPort;
    }

    /**
     * Check if IP address is valid and available
     * @param {string} ipAddress - IP address to check
     * @returns {boolean} True if IP is available
     */
    isIPAddressAvailable(ipAddress) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        return !allNFs.some(nf => nf.config.ipAddress === ipAddress);
    }

    /**
     * Check if port is available
     * @param {number} port - Port number to check
     * @returns {boolean} True if port is available
     */
    isPortAvailable(port) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        return !allNFs.some(nf => nf.config.port === port);
    }

    /**
     * Get network from IP address (for subnet checking)
     * @param {string} ip - IP address
     * @returns {string} Network address (e.g., "192.168.1")
     */
    getNetworkFromIP(ip) {
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
    }

    /**
     * Check if two IPs are in the same subnet
     * @param {string} ip1 - First IP address
     * @param {string} ip2 - Second IP address
     * @returns {boolean} True if in same subnet
     */
    areIPsInSameSubnet(ip1, ip2) {
        return this.getNetworkFromIP(ip1) === this.getNetworkFromIP(ip2);
    }

    /**
     * Get all NFs in the same subnet as given IP
     * @param {string} ipAddress - IP address to check
     * @returns {Array} Array of NFs in same subnet
     */
    getNFsInSameSubnet(ipAddress) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const targetNetwork = this.getNetworkFromIP(ipAddress);
        
        return allNFs.filter(nf => 
            this.getNetworkFromIP(nf.config.ipAddress) === targetNetwork
        );
    }

    /**
     * Calculate automatic position for NF on canvas
     * @param {string} type - NF type
     * @param {number} count - Current count of this NF type
     * @returns {Object} {x, y} position
     */
    calculateAutoPosition(type, count) {
        // NEW: Better grid layout with proper spacing
        const nfsPerRow = 6;  // More NFs per row for better utilization
        const nfWidth = 60;   // Smaller width to fit more NFs
        const nfHeight = 80;  // Height including label space
        const marginX = 40;   // Horizontal spacing between NFs
        const marginY = 60;   // Vertical spacing between rows
        const startX = 120;   // Start position X
        const startY = 120;   // Start position Y

        const row = Math.floor((count - 1) / nfsPerRow);
        const col = (count - 1) % nfsPerRow;

        return {
            x: startX + col * (nfWidth + marginX),
            y: startY + row * (nfHeight + marginY)
        };
    }

    /**
     * Get NF definition from global definitions (PUBLIC METHOD)
     * @param {string} type - NF type
     * @returns {Object} NF definition with color, icon, etc.
     */
    getNFDefinition(type) {
        // Try to get from loaded definitions
        if (window.nfDefinitions && window.nfDefinitions[type]) {
            return window.nfDefinitions[type];
        }

        // Fallback default definitions
        const defaultDefs = {
            'NRF': { color: '#9b59b6', icon: null, name: 'Network Repository Function' },
            'AMF': { color: '#3498db', icon: null, name: 'Access and Mobility Management' },
            'SMF': { color: '#00bcd4', icon: null, name: 'Session Management Function' },
            'UPF': { color: '#4caf50', icon: null, name: 'User Plane Function' },
            'AUSF': { color: '#ff9800', icon: null, name: 'Authentication Server Function' },
            'UDM': { color: '#ff5722', icon: null, name: 'Unified Data Management' },
            'PCF': { color: '#e91e63', icon: null, name: 'Policy Control Function' },
            'NSSF': { color: '#ffc107', icon: null, name: 'Network Slice Selection' },
            'UDR': { color: '#009688', icon: null, name: 'Unified Data Repository' },
            'gNB': { color: '#8e44ad', icon: null, name: 'gNodeB (5G Base Station)' },
            'UE': { color: '#16a085', icon: null, name: 'User Equipment' },
            'MySQL': { color: '#d35400', icon: null, name: 'MySQL Database' },
            'ext-dn': { color: '#27ae60', icon: null, name: 'External Data Network' }
        };

        return defaultDefs[type] || { color: '#95a5a6', icon: null, name: type };
    }

    /**
     * Delete a Network Function
     * @param {string} nfId - ID of NF to delete
     */
    deleteNetworkFunction(nfId) {
        const nf = window.dataStore.getNFById(nfId);

        if (!nf) {
            console.warn('⚠️ NF not found:', nfId);
            return;
        }

        console.log('🗑️ Deleting NF:', nf.name);

        // SPECIAL CASE: When UDR is deleted, auto-delete MySQL in same subnet
        if (nf.type === 'UDR') {
            this.autoDeleteMySQLForUDR(nf);
        }

        // SPECIAL CASE: When UPF is deleted, auto-delete ext-dn in same subnet
        if (nf.type === 'UPF') {
            this.autoDeleteExtDNForUPF(nf);
        }

        // Trigger log engine before deletion
        if (window.logEngine) {
            window.logEngine.onNFRemoved(nf);
        }

        // Remove from data store (this also removes connections)
        window.dataStore.removeNF(nfId);

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Auto-delete MySQL when UDR is deleted
     * @param {Object} udr - UDR network function being deleted
     */
    autoDeleteMySQLForUDR(udr) {
        const allNFs = window.dataStore.getAllNFs();
        const udrNetwork = this.getNetworkFromIP(udr.config.ipAddress);

        // Find MySQL in same subnet as UDR
        const mysqlInSameSubnet = allNFs.find(nf => 
            nf.id !== udr.id &&
            nf.type === 'MySQL' && 
            this.getNetworkFromIP(nf.config.ipAddress) === udrNetwork
        );

        if (mysqlInSameSubnet) {
            console.log(`🗑️ Auto-deleting MySQL ${mysqlInSameSubnet.name} (associated with UDR ${udr.name})`);

            // Log before deletion
            if (window.logEngine) {
                window.logEngine.addLog(udr.id, 'INFO',
                    `MySQL database auto-deleted with UDR`, {
                    mysqlName: mysqlInSameSubnet.name,
                    mysqlIP: mysqlInSameSubnet.config.ipAddress,
                    reason: 'UDR deletion - MySQL is dependent on UDR',
                    subnet: udrNetwork + '.0/24'
                });
            }

            // Delete MySQL (this will also remove its connections)
            window.dataStore.removeNF(mysqlInSameSubnet.id);

            // Trigger log engine for MySQL deletion
            if (window.logEngine) {
                window.logEngine.onNFRemoved(mysqlInSameSubnet);
            }

            console.log(`✅ MySQL ${mysqlInSameSubnet.name} deleted successfully`);
        } else {
            console.log(`ℹ️ No MySQL found in same subnet (${udrNetwork}.0/24) to delete with UDR ${udr.name}`);
        }
    }

    /**
     * Auto-delete ext-dn when UPF is deleted
     * @param {Object} upf - UPF network function being deleted
     */
    autoDeleteExtDNForUPF(upf) {
        const allNFs = window.dataStore.getAllNFs();
        const upfNetwork = this.getNetworkFromIP(upf.config.ipAddress);

        // Find ext-dn in same subnet as UPF
        const extDNInSameSubnet = allNFs.find(nf => 
            nf.id !== upf.id &&
            nf.type === 'ext-dn' && 
            this.getNetworkFromIP(nf.config.ipAddress) === upfNetwork
        );

        if (extDNInSameSubnet) {
            console.log(`🗑️ Auto-deleting ext-dn ${extDNInSameSubnet.name} (associated with UPF ${upf.name})`);
            console.log(`🛑 Data flow stopped - ext-dn removed with UPF`);

            // Log before deletion
            if (window.logEngine) {
                window.logEngine.addLog(upf.id, 'INFO',
                    `External data network (ext-dn) auto-deleted with UPF`, {
                    extDNName: extDNInSameSubnet.name,
                    extDNIP: extDNInSameSubnet.config.ipAddress,
                    reason: 'UPF deletion - ext-dn is dependent on UPF',
                    subnet: upfNetwork + '.0/24',
                    impact: 'Data flow stopped - internet connectivity removed'
                });
            }

            // Delete ext-dn (this will also remove its connections)
            window.dataStore.removeNF(extDNInSameSubnet.id);

            // Trigger log engine for ext-dn deletion
            if (window.logEngine) {
                window.logEngine.onNFRemoved(extDNInSameSubnet);
            }

            console.log(`✅ ext-dn ${extDNInSameSubnet.name} deleted successfully`);
            console.log(`🛑 Data flow stopped - no internet connectivity through UPF`);
        } else {
            console.log(`ℹ️ No ext-dn found in same subnet (${upfNetwork}.0/24) to delete with UPF ${upf.name}`);
        }
    }

    /**
     * Update NF configuration
     * @param {string} nfId - NF ID
     * @param {Object} config - New configuration values
     */
    updateNFConfig(nfId, config) {
        const nf = window.dataStore.getNFById(nfId);

        if (!nf) {
            console.warn('⚠️ NF not found:', nfId);
            return;
        }

        // Update config
        Object.assign(nf.config, config);

        // Update in data store
        window.dataStore.updateNF(nfId, { config: nf.config });

        console.log('✅ NF config updated:', nf.name);

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Move NF to new position
     * @param {string} nfId - NF ID
     * @param {Object} position - New {x, y} position
     */
    moveNF(nfId, position) {
        const nf = window.dataStore.getNFById(nfId);

        if (!nf) return;

        nf.position = position;
        window.dataStore.updateNF(nfId, { position });

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Get count of NFs by type
     * @param {string} type - NF type
     * @returns {number} Count of NFs of this type
     */
    getNFCountByType(type) {
        const allNFs = window.dataStore.getAllNFs();
        return allNFs.filter(nf => nf.type === type).length;
    }

    /**
     * Get all NF types that exist in topology
     * @returns {Array} Array of unique NF types
     */
    getExistingNFTypes() {
        const allNFs = window.dataStore.getAllNFs();
        const types = allNFs.map(nf => nf.type);
        return [...new Set(types)]; // Unique types only
    }

    /**
     * Update ALL NFs to use new HTTP protocol
     * @param {string} newProtocol - 'HTTP/1' or 'HTTP/2'
     */
    updateGlobalProtocol(newProtocol) {
        console.log('🔄 Updating global HTTP protocol to:', newProtocol);

        // Update global variable
        window.globalHTTPProtocol = newProtocol;

        // Update all existing NFs
        const allNFs = window.dataStore?.getAllNFs() || [];
        let updateCount = 0;

        allNFs.forEach(nf => {
            if (nf.config.httpProtocol !== newProtocol) {
                const previousProtocol = nf.config.httpProtocol;
                nf.config.httpProtocol = newProtocol;
                window.dataStore.updateNF(nf.id, { config: nf.config });
                updateCount++;

                // Add log for protocol change
                if (window.logEngine) {
                    window.logEngine.addLog(nf.id, 'INFO',
                        `HTTP protocol updated to ${newProtocol}`, {
                        previousProtocol: previousProtocol || 'Unknown',
                        newProtocol: newProtocol,
                        reason: 'Global protocol synchronization'
                    });
                }
            }
        });

        console.log(`✅ Updated ${updateCount} NFs to ${newProtocol}`);

        // Update all connections
        const allConnections = window.dataStore?.getAllConnections() || [];
        allConnections.forEach(conn => {
            conn.protocol = newProtocol;
        });

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }

        return updateCount;
    }

    /**
     * Start service lifecycle management
     * @param {Object} nf - Network Function
     */
    startServiceLifecycle(nf) {
        console.log(`🔄 Starting lifecycle for ${nf.name}`);

        // After 5 seconds, change status to stable
        setTimeout(() => {
            if (window.dataStore?.getNFById(nf.id)) { // Check if NF still exists
                nf.status = 'stable';
                nf.statusTimestamp = Date.now();
                
                // Update in data store
                window.dataStore.updateNF(nf.id, nf);
                
                // Log status change
                if (window.logEngine) {
                    window.logEngine.addLog(nf.id, 'SUCCESS', 
                        `${nf.name} is now STABLE and ready for connections`, {
                        Status: 'stable',
                        uptime: '5 seconds',
                    });
                }

                // Re-render canvas to show green status
                if (window.canvasRenderer) {
                    window.canvasRenderer.render();
                }

                console.log(`✅ ${nf.name} is now STABLE`);

                // AUTO-CONNECTIONS: Enabled for MySQL, gNB, UE, UPF, ext-dn, and UDM
                if (nf.type === 'MySQL' || nf.type === 'gNB' || nf.type === 'UE' || nf.type === 'UPF' || nf.type === 'ext-dn' || nf.type === 'UDM') {
                    // Schedule auto-connections after 8-10 seconds total
                    const autoConnectDelay = 3000 + Math.random() * 2000; // 3-5 more seconds
                    setTimeout(() => {
                        this.attemptAutoConnections(nf);
                    }, autoConnectDelay);
                    
                    if (nf.type === 'MySQL') {
                        console.log(`🔗 Auto-connections enabled for ${nf.name} - will connect to UDR automatically`);
                    } else if (nf.type === 'gNB') {
                        console.log(`🔗 Auto-connections enabled for ${nf.name} - will connect to AMF and UPF automatically`);
                    } else if (nf.type === 'UE') {
                        console.log(`🔗 Auto-connections enabled for ${nf.name} - will connect to gNB and AMF automatically (no direct UPF connection)`);
                    } else if (nf.type === 'UPF') {
                        console.log(`🔗 Auto-connections enabled for ${nf.name} - will connect to SMF automatically (gNB and ext-dn will connect to UPF)`);
                        // Auto-start ext-dn when UPF is stable
                        setTimeout(() => {
                            this.autoStartExtDNForUPF(nf);
                        }, 3000); // Wait 3 seconds before creating ext-dn
                    } else if (nf.type === 'ext-dn') {
                        console.log(`🔗 Auto-connections enabled for ${nf.name} - will connect to UPF automatically`);
                    } else if (nf.type === 'UDM') {
                        console.log(`🔗 Auto-connections enabled for ${nf.name} - will connect to UDR automatically`);
                    }
                }
                
                // Special handling for UE: Also start registration process
                if (nf.type === 'UE') {
                    console.log(`📱 UE registration will begin for ${nf.name}`);
                    this.simulateUERegistration(nf);
                }
                
                // Log for NFs without auto-connections
                if (!['MySQL', 'gNB', 'UE', 'UPF', 'ext-dn', 'UDM'].includes(nf.type)) {
                    console.log(`ℹ️ Auto-connections disabled for ${nf.name} - manual connections required`);
                }
            }
        }, 5000);
    }

    /**
     * Attempt to auto-create connections between stable services (SAME SUBNET ONLY)
     * @param {Object} nf - Network Function that just became stable
     */
    attemptAutoConnections(nf) {
        if (!window.dataStore?.getNFById(nf.id) || nf.status !== 'stable') {
            return; // NF was deleted or not stable
        }

        // SPECIAL CASE: MySQL only connects to UDR, nothing else
        if (nf.type === 'MySQL') {
            console.log(`🔗 MySQL auto-connection: Looking for UDR in same subnet`);
            
            const allNFs = window.dataStore.getAllNFs();
            const sourceNetwork = this.getNetworkFromIP(nf.config.ipAddress);
            
            // Find UDR in same subnet
            const udrInSameSubnet = allNFs.find(otherNf => 
                otherNf.id !== nf.id && 
                otherNf.status === 'stable' &&
                otherNf.type === 'UDR' &&
                this.getNetworkFromIP(otherNf.config.ipAddress) === sourceNetwork
            );

            if (udrInSameSubnet) {
                // Check if connection already exists
                const existingConnections = window.dataStore.getConnectionsForNF(nf.id);
                const alreadyConnected = existingConnections.some(conn => 
                    conn.sourceId === udrInSameSubnet.id || conn.targetId === udrInSameSubnet.id
                );

                if (!alreadyConnected && window.connectionManager) {
                    const connection = window.connectionManager.createManualConnection(nf.id, udrInSameSubnet.id);
                    if (connection) {
                        console.log(`✅ MySQL connected to UDR: ${nf.name} → ${udrInSameSubnet.name}`);
                        
                        if (window.logEngine) {
                            window.logEngine.addLog(nf.id, 'SUCCESS',
                                `Database connection established with ${udrInSameSubnet.name} (interface: ${connection.interfaceName})`, {
                                targetIP: udrInSameSubnet.config.ipAddress,
                            });
                        }

                        // Re-render canvas
                        if (window.canvasRenderer) {
                            window.canvasRenderer.render();
                        }
                    }
                } else {
                    console.log(`ℹ️ MySQL already connected to UDR or connection failed`);
                }
            } else {
                console.log(`⚠️ No UDR found in same subnet (${sourceNetwork}.0/24) for MySQL ${nf.name}`);
                
                if (window.logEngine) {
                    window.logEngine.addLog(nf.id, 'WARNING',
                        `No UDR available in same subnet for database connection`, {
                        sourceSubnet: sourceNetwork + '.0/24',
                        sourceIP: nf.config.ipAddress,
                        restriction: 'MySQL only connects to UDR in same subnet',
                        suggestion: 'Deploy UDR in the same subnet range'
                    });
                }
            }
            return; // MySQL only connects to UDR, exit here
        }

        // SPECIAL CASE: ext-dn only connects to UPF
        if (nf.type === 'ext-dn') {
            console.log(`🔗 ext-dn auto-connection: Looking for UPF in same subnet`);
            
            const allNFs = window.dataStore.getAllNFs();
            const sourceNetwork = this.getNetworkFromIP(nf.config.ipAddress);
            
            // Find UPF in same subnet
            const upfInSameSubnet = allNFs.find(otherNf => 
                otherNf.id !== nf.id && 
                otherNf.status === 'stable' &&
                otherNf.type === 'UPF' &&
                this.getNetworkFromIP(otherNf.config.ipAddress) === sourceNetwork
            );

            if (upfInSameSubnet) {
                // Check if connection already exists
                const existingConnections = window.dataStore.getConnectionsForNF(nf.id);
                const alreadyConnected = existingConnections.some(conn => 
                    conn.sourceId === upfInSameSubnet.id || conn.targetId === upfInSameSubnet.id
                );

                if (!alreadyConnected && window.connectionManager) {
                    const connection = window.connectionManager.createManualConnection(nf.id, upfInSameSubnet.id);
                    if (connection) {
                        console.log(`✅ ext-dn connected to UPF: ${nf.name} → ${upfInSameSubnet.name}`);
                        
                        if (window.logEngine) {
                            window.logEngine.addLog(nf.id, 'SUCCESS',
                                `External data network connected to ${upfInSameSubnet.name} (interface: ${connection.interfaceName})`, {
                                targetIP: upfInSameSubnet.config.ipAddress,
                                purpose: 'Internet traffic flow through UPF'
                            });
                        }

                        // Re-render canvas
                        if (window.canvasRenderer) {
                            window.canvasRenderer.render();
                        }
                    }
                } else {
                    console.log(`ℹ️ ext-dn already connected to UPF or connection failed`);
                }
            } else {
                console.log(`⚠️ No UPF found in same subnet (${sourceNetwork}.0/24) for ext-dn ${nf.name}`);
                
                if (window.logEngine) {
                    window.logEngine.addLog(nf.id, 'WARNING',
                        `No UPF available in same subnet for external data network connection`, {
                        sourceSubnet: sourceNetwork + '.0/24',
                        sourceIP: nf.config.ipAddress,
                        restriction: 'ext-dn only connects to UPF in same subnet',
                        suggestion: 'Deploy UPF in the same subnet range'
                    });
                }
            }
            return; // ext-dn only connects to UPF, exit here
        }

        console.log(`🔗 Attempting auto-connections for ${nf.name} in subnet ${this.getNetworkFromIP(nf.config.ipAddress)}.0/24`);

        const allNFs = window.dataStore.getAllNFs();
        const sourceNetwork = this.getNetworkFromIP(nf.config.ipAddress);
        
        // SUBNET RESTRICTION: Only consider stable NFs in the SAME subnet
        const sameSubnetStableNFs = allNFs.filter(otherNf => 
            otherNf.id !== nf.id && 
            otherNf.status === 'stable' &&
            this.getNetworkFromIP(otherNf.config.ipAddress) === sourceNetwork
        );

        if (sameSubnetStableNFs.length === 0) {
            console.log(`ℹ️ No other stable services found in subnet ${sourceNetwork}.0/24 for ${nf.name}`);
            
            if (window.logEngine) {
                window.logEngine.addLog(nf.id, 'WARNING',
                    `No stable services in same subnet for auto-connection`, {
                    sourceSubnet: sourceNetwork + '.0/24',
                    sourceIP: nf.config.ipAddress,
                    restriction: 'Auto-connections only within same subnet',
                    suggestion: 'Add more services in the same subnet range'
                });
            }
            return;
        }

        // Auto-connection logic based on 5G architecture
        const autoConnectionRules = this.getAutoConnectionRules();
        const rulesToApply = autoConnectionRules[nf.type] || [];

        let connectionsCreated = 0;
        let connectionsBlocked = 0;

        rulesToApply.forEach(targetType => {
            // Only look for targets in the same subnet
            const targetNFs = sameSubnetStableNFs.filter(target => target.type === targetType);
            
            if (targetNFs.length > 0) {
                // Connect to the first available target of this type in same subnet
                const targetNF = targetNFs[0];
                
                // Check if connection already exists
                const existingConnections = window.dataStore.getConnectionsForNF(nf.id);
                const alreadyConnected = existingConnections.some(conn => 
                    conn.sourceId === targetNF.id || conn.targetId === targetNF.id
                );

                if (!alreadyConnected && window.connectionManager) {
                    // Create visual auto-connection (with visible interface line)
                    const connection = window.connectionManager.createManualConnection(nf.id, targetNF.id);
                    if (connection) {
                        connectionsCreated++;
                        console.log(`✅ Auto-connected ${nf.name} → ${targetNF.name} (same subnet: ${sourceNetwork}.0/24)`);
                        
                        // Log auto-connection with subnet info
                        if (window.logEngine) {
                            window.logEngine.addLog(nf.id, 'SUCCESS',
                                `Auto-connected to ${targetNF.name} (interface: ${connection.interfaceName})`, {
                                targetType: targetNF.type,
                                interface: connection.interfaceName,
                                autoConnection: true,
                                visualConnection: true,
                                subnet: sourceNetwork + '.0/24',
                                sourceIP: nf.config.ipAddress,
                                targetIP: targetNF.config.ipAddress,
                                reason: '5G architecture requirement + subnet restriction',
                                note: 'Visual interface connection established and shown on canvas'
                            });
                        }
                    }
                }
            } else {
                // Target type exists but not in same subnet
                const allTargetsOfType = allNFs.filter(otherNf => 
                    otherNf.id !== nf.id && 
                    otherNf.status === 'stable' &&
                    otherNf.type === targetType
                );
                
                if (allTargetsOfType.length > 0) {
                    connectionsBlocked++;
                    console.log(`Auto-connection blocked: ${targetType} exists but not in same subnet as ${nf.name}`);
                }
            }
        });

        // Log results
        if (connectionsCreated > 0) {
           

            // Re-render canvas to show new connections
            if (window.canvasRenderer) {
                window.canvasRenderer.render();
            }
        } else {
            console.log(`ℹ️ No auto-connections created for ${nf.name} in subnet ${sourceNetwork}.0/24`);
            
            if (connectionsBlocked > 0 && window.logEngine) {
                window.logEngine.addLog(nf.id, 'WARNING',
                    `Auto-connections blocked due to subnet restrictions`, {
                    connectionsBlocked: connectionsBlocked,
                    sourceSubnet: sourceNetwork + '.0/24',
                    reason: 'Required services exist but in different subnets',
                    solution: 'Move services to same subnet for auto-connection'
                });
            }
        }
    }

    /**
     * Auto-start ext-dn when UPF becomes stable and auto-connect it
     * @param {Object} upf - UPF network function that just became stable
     */
    autoStartExtDNForUPF(upf) {
        // Check if UPF still exists
        if (!window.dataStore?.getNFById(upf.id) || upf.status !== 'stable') {
            return;
        }

        // Check if ext-dn already exists in same subnet
        const allNFs = window.dataStore.getAllNFs();
        const upfNetwork = this.getNetworkFromIP(upf.config.ipAddress);
        const existingExtDN = allNFs.find(nf => 
            nf.type === 'ext-dn' && 
            this.getNetworkFromIP(nf.config.ipAddress) === upfNetwork
        );

        if (existingExtDN) {
            console.log(`ℹ️ ext-dn already exists in same subnet as UPF: ${existingExtDN.name}`);
            // Try to connect if not already connected
            setTimeout(() => {
                if (existingExtDN.status === 'stable') {
                    this.attemptAutoConnections(existingExtDN);
                }
            }, 6000); // Wait for ext-dn to be stable if it's still starting
            return;
        }

        // Create ext-dn in same subnet as UPF
        const extDNIP = this.generateUniqueIPAddressInSubnet(upfNetwork);
        const extDNPort = 80; // Standard HTTP port for external network
        
        // Calculate position near UPF
        const extDNPosition = {
            x: upf.position.x + 100,
            y: upf.position.y
        };

        console.log(`🔄 Auto-creating ext-dn for UPF ${upf.name} at IP ${extDNIP} in subnet ${upfNetwork}.0/24`);

        // Create ext-dn NF
        const extDN = this.createNetworkFunction('ext-dn', extDNPosition);
        
        if (extDN) {
            // Set IP and port to be in same subnet as UPF
            extDN.config.ipAddress = extDNIP;
            extDN.config.port = extDNPort;
            
            // Update in data store
            window.dataStore.updateNF(extDN.id, extDN);

            console.log(`✅ ext-dn auto-created: ${extDN.name} at ${extDNIP} (subnet: ${upfNetwork}.0/24)`);
            console.log(`⏳ ext-dn status: ${extDN.status} - will become stable in 5 seconds`);
            console.log(`🔗 ext-dn will auto-connect to UPF ${upf.name} when stable`);

            // Log the auto-creation
            if (window.logEngine) {
                window.logEngine.addLog(upf.id, 'INFO',
                    `External data network (ext-dn) auto-started for UPF`, {
                    extDNName: extDN.name,
                    extDNId: extDN.id,
                    extDNIP: extDNIP,
                    extDNPort: extDNPort,
                    subnet: upfNetwork + '.0/24',
                    purpose: 'Internet traffic flow through UPF',
                    note: 'ext-dn will auto-connect to UPF when stable (in ~5 seconds)',
                    lifecycle: 'ext-dn created → starting → stable (5s) → auto-connect to UPF'
                });
            }

            // Re-render canvas to show ext-dn
            if (window.canvasRenderer) {
                window.canvasRenderer.render();
            }
        } else {
            console.error(`❌ Failed to create ext-dn for UPF ${upf.name}`);
            
            if (window.logEngine) {
                window.logEngine.addLog(upf.id, 'ERROR',
                    `Failed to auto-create ext-dn for UPF`, {
                    reason: 'createNetworkFunction returned null',
                    suggestion: 'Check if ext-dn type is properly defined'
                });
            }
        }
    }

    /**
     * Get auto-connection rules based on 5G architecture
     * @returns {Object} Connection rules for each NF type
     */
    getAutoConnectionRules() {
        return {
            'AMF': [],       // AMF doesn't initiate connections (gNB connects to AMF)
            'SMF': ['NRF', 'UPF', 'PCF'],
            'UPF': ['SMF'],  // UPF connects to SMF when available (gNB will connect to UPF)
            'AUSF': ['NRF', 'UDM'],
            'UDM': ['NRF', 'UDR'],  // UDM connects to UDR for subscriber profile management
            'PCF': ['NRF'],
            'NSSF': ['NRF'],
            'UDR': ['NRF', 'UDM'],  // UDR connects to UDM and MySQL
            'gNB': ['AMF', 'UPF'],  // gNB connects to AMF and UPF when available
            'UE': ['gNB', 'AMF'], // UE connects to gNB and AMF when available (no direct UPF connection)
            'MySQL': ['UDR'], // MySQL connects to UDR (database backend)
            'ext-dn': ['UPF'] // ext-dn connects to UPF for internet traffic
        };
    }

    /**
     * Get service status color
     * @param {string} status - Service status
     * @returns {string} Color code
     */
    getStatusColor(status) {
        switch (status) {
            case 'starting': return '#f39c12'; // Orange — booting
            case 'stable':   return '#2ecc71'; // Green  — healthy
            case 'stopped':  return '#e74c3c'; // Red    — stopped
            case 'error':    return '#e67e22'; // Amber  — error
            default:         return '#3498db'; // Blue   — unknown
        }
    }

    /**
     * Get all stable services
     * @returns {Array} Array of stable NFs
     */
    getStableServices() {
        const allNFs = window.dataStore?.getAllNFs() || [];
        return allNFs.filter(nf => nf.status === 'stable');
    }

    /**
     * Get service uptime
     * @param {Object} nf - Network Function
     * @returns {string} Formatted uptime
     */
    getServiceUptime(nf) {
        if (!nf.statusTimestamp) return 'Unknown';
        
        const uptimeMs = Date.now() - nf.statusTimestamp;
        const uptimeSeconds = Math.floor(uptimeMs / 1000);
        
        if (uptimeSeconds < 60) {
            return `${uptimeSeconds} seconds`;
        } else if (uptimeSeconds < 3600) {
            const minutes = Math.floor(uptimeSeconds / 60);
            return `${minutes} minutes`;
        } else {
            const hours = Math.floor(uptimeSeconds / 3600);
            const minutes = Math.floor((uptimeSeconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }

    /**
     * Register UE and establish PDU session with IP assignment
     * @param {string} ueId - UE ID
     * @param {string} upfId - UPF ID (optional, will find automatically)
     */
    registerUEAndEstablishPDU(ueId, upfId = null, retryCount = 0) {
        const ue = window.dataStore?.getNFById(ueId);
        if (!ue || ue.type !== 'UE') {
            console.error('❌ UE not found:', ueId);
            return false;
        }

        // Check if subscriberImsi is missing
        if (!ue.config.subscriberImsi) {
            console.error('❌ UE initialization blocked: Subscriber information missing or not matching');
            if (window.logEngine) {
                window.logEngine.addLog(ue.id, 'ERROR',
                    `UE initialization blocked: Subscriber info mismatch`, {
                    reason: 'UE does not have subscriberImsi configured',
                    requiredField: 'subscriberImsi'
                });
            }
            return false;
        }

        // Gate on subscriber info match (UE must have subscriberImsi present in UDR store)
        const subs = window.dataStore?.getSubscribers ? window.dataStore.getSubscribers() : [];
        const subscriber = subs.find(s => s.imsi === ue.config.subscriberImsi);
        
        // If subscriberImsi is configured but not found, retry with increasing delays
        // This handles the case where subscribers might not be loaded yet
        if (!subscriber) {
            // Retry up to 3 times with increasing delays (1s, 2s, 3s)
            if (retryCount < 3) {
                const delays = [1000, 2000, 3000];
                const delay = delays[retryCount];
                console.log(`ℹ️ Subscriber ${ue.config.subscriberImsi} not found in UDR store (attempt ${retryCount + 1}/4), retrying in ${delay}ms...`);
                setTimeout(() => {
                    this.registerUEAndEstablishPDU(ueId, upfId, retryCount + 1);
                }, delay);
                return false;
            }
            
            // If still not found after all retries, show error
            console.error(`❌ UE initialization blocked: Subscriber IMSI ${ue.config.subscriberImsi} not found in UDR/MySQL store after ${retryCount + 1} attempts`);
            if (window.logEngine) {
                window.logEngine.addLog(ue.id, 'ERROR',
                    `UE initialization blocked: Subscriber info mismatch`, {
                    reason: `No matching IMSI (${ue.config.subscriberImsi}) in UDR/MySQL store`,
                    requiredField: 'subscriberImsi',
                    attempts: retryCount + 1
                });
            }
            return false;
        }

        // Validate that UE configuration matches subscriber profile
        if (subscriber.dnn && ue.config.subscriberDnn && subscriber.dnn !== ue.config.subscriberDnn) {
            console.error(`❌ UE configuration mismatch: DNN ${ue.config.subscriberDnn} does not match subscriber profile DNN ${subscriber.dnn}`);
            if (window.logEngine) {
                window.logEngine.addLog(ue.id, 'ERROR',
                    `UE initialization blocked: Configuration mismatch`, {
                    reason: `DNN mismatch: UE has ${ue.config.subscriberDnn}, subscriber profile has ${subscriber.dnn}`,
                    field: 'DNN'
                });
            }
            return false;
        }

        if (subscriber.nssai_sst && ue.config.subscriberSst && subscriber.nssai_sst !== ue.config.subscriberSst) {
            console.error(`❌ UE configuration mismatch: SST ${ue.config.subscriberSst} does not match subscriber profile SST ${subscriber.nssai_sst}`);
            if (window.logEngine) {
                window.logEngine.addLog(ue.id, 'ERROR',
                    `UE initialization blocked: Configuration mismatch`, {
                    reason: `NSSAI SST mismatch: UE has ${ue.config.subscriberSst}, subscriber profile has ${subscriber.nssai_sst}`,
                    field: 'NSSAI_SST'
                });
            }
            return false;
        }

        // Find UPF if not provided
        let upf = null;
        if (upfId) {
            upf = window.dataStore?.getNFById(upfId);
        } else {
            // Find UPF in same subnet as UE
            const allNFs = window.dataStore?.getAllNFs() || [];
            const ueNetwork = this.getNetworkFromIP(ue.config.ipAddress);
            upf = allNFs.find(nf => 
                nf.type === 'UPF' && 
                nf.status === 'stable' &&
                this.getNetworkFromIP(nf.config.ipAddress) === ueNetwork
            );
        }

       

        // Check if UE already has PDU session
        if (ue.config.pduSession) {
            console.log(`ℹ️ UE ${ue.name} already has PDU session with IP: ${ue.config.pduSession.assignedIP}`);
            return true;
        }

        // Assign IP from tun0 network
        const assignedIP = this.assigntun0IPToUE(upf, ue);
        if (!assignedIP) {
            console.error('❌ Failed to assign tun0 IP to UE:', ue.name);
            return false;
        }

        // Create PDU session
        ue.config.pduSession = {
            sessionId: this.generateUniqueId('pdu'),
            upfId: upf.id,
            assignedIP: assignedIP,
            status: 'established',
            establishedAt: Date.now()
        };

        // Create tun_ue interface for UE (e.g., tun_ue1, tun_ue2)
        const ueNum = ue.name.match(/\d+/)?.[0] || '1';
        const ueInterfaceName = `tun_ue${ueNum}`;
        const gatewayIP = upf.config.tun0Interface?.gatewayIP || '10.0.0.1';
        ue.config.tunInterface = {
            name: ueInterfaceName,
            ipAddress: assignedIP,
            netmask: '255.255.255.0',
            destination: assignedIP,
            gateway: gatewayIP,
            mtu: 1500,
            flags: 'UP,POINTOPOINT,RUNNING,NOARP,MULTICAST',
            ipv6: `fe80::${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}:${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}:${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}:${Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')}`,
            createdAt: Date.now()
        };

        // Update UE in data store
        window.dataStore.updateNF(ueId, ue);

        console.log(`✅ PDU session established for ${ue.name}: IP ${assignedIP} via ${upf.name}`);
        console.log(`✅ TUN interface ${ueInterfaceName} created with IP ${assignedIP}`);

        // Log PDU session establishment
        if (window.logEngine) {
            window.logEngine.addLog(ueId, 'SUCCESS',
                `PDU session established`, {
                sessionId: ue.config.pduSession.sessionId,
                upfName: upf.name,
                upfId: upf.id,
                assignedIP: assignedIP,
                tun0Network: upf.config.tun0Interface.network,
                upfGateway: upf.config.tun0Interface.gatewayIP,
                sessionStatus: 'established'
            });

            // Log TUN interface creation
            window.logEngine.addLog(ueId, 'SUCCESS',
                `Network interface ${ueInterfaceName} created`, {
                interface: ueInterfaceName,
                ipAddress: assignedIP,
                netmask: '255.255.255.0',
                gateway: upf.config.tun0Interface.gatewayIP,
                network: '10.0.0.0/24',
                mtu: 1500,
                purpose: 'User plane data connection to UPF',
                note: `Can ping gateway ${upf.config.tun0Interface.gatewayIP} and access internet via UPF`
            });
        }

        return true;
    }

    /**
     * Assign tun0 IP to UE from UPF's tun0 interface
     * @param {Object} upf - UPF network function
     * @param {Object} ue - UE network function
     * @returns {string|null} Assigned IP or null if failed
     */
    assigntun0IPToUE(upf, ue) {
        if (!upf.config.tun0Interface) {
            console.error('❌ UPF does not have tun0 interface:', upf.name);
            return null;
        }

        const tun0 = upf.config.tun0Interface;
        
        // Check if UE already has an IP assigned
        const existingAssignment = tun0.assignedIPs.find(assignment => assignment.ueId === ue.id);
        if (existingAssignment) {
            console.log(`ℹ️ UE ${ue.name} already has tun0 IP: ${existingAssignment.ip}`);
            return existingAssignment.ip;
        }

        // Generate next available IP (10.0.0.2, 10.0.0.3, etc.)
        // Network 10.0.0.0/28 has IPs 10.0.0.1-10.0.0.14 (10.0.0.1 is gateway)
        while (tun0.nextAvailableIP <= 14) {
            const candidateIP = `10.0.0.${tun0.nextAvailableIP}`;
            
            // Check if IP is already assigned
            const isAssigned = tun0.assignedIPs.some(assignment => assignment.ip === candidateIP);
            
            if (!isAssigned) {
                // Assign IP to UE
                tun0.assignedIPs.push({
                    ueId: ue.id,
                    ueName: ue.name,
                    ip: candidateIP,
                    assignedAt: Date.now()
                });
                
                tun0.nextAvailableIP++;
                
                // Update UPF in data store
                window.dataStore.updateNF(upf.id, upf);
                
                console.log(`🌐 Assigned tun0 IP ${candidateIP} to UE ${ue.name} via UPF ${upf.name}`);
                return candidateIP;
            }
            
            tun0.nextAvailableIP++;
        }

        console.error('❌ No more tun0 IPs available in network 10.0.0.0/28');
        return null;
    }

    /**
     * Simulate UE registration process (called automatically after UE becomes stable)
     * @param {Object} ue - UE network function
     */
    simulateUERegistration(ue) {
        if (ue.type !== 'UE') return;

        // Only attempt automatic registration if subscriberImsi is already set
        // Otherwise, wait for manual registration via GUI
        if (!ue.config.subscriberImsi) {
            console.log(`ℹ️ UE ${ue.name} does not have subscriberImsi set - skipping automatic registration. User must trigger registration manually.`);
            return;
        }

        console.log(`📱 Starting UE registration simulation for ${ue.name}`);

        // Simulate registration delay (15-20 seconds after UE becomes stable)
        const registrationDelay = 15000 + Math.random() * 5000;
        
        setTimeout(() => {
            if (!window.dataStore?.getNFById(ue.id)) {
                console.log(`⚠️ UE ${ue.name} was deleted before registration completed`);
                return;
            }

            // Re-check subscriberImsi before attempting registration
            const currentUE = window.dataStore.getNFById(ue.id);
            if (!currentUE.config.subscriberImsi) {
                console.log(`ℹ️ UE ${ue.name} subscriberImsi was cleared - skipping automatic registration`);
                return;
            }

            // Attempt to register UE and establish PDU session
            const success = this.registerUEAndEstablishPDU(ue.id);
            
            if (success) {
                console.log(`✅ UE registration completed for ${ue.name}`);
                
                // Re-render canvas to show updated status
                if (window.canvasRenderer) {
                    window.canvasRenderer.render();
                }
            } else {
                console.error(`❌ UE registration failed for ${ue.name}`);
                
            }
        }, registrationDelay);
    }
}