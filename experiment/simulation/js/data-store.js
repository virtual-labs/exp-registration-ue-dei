/**
 * ============================================
 * DATA STORE
 * ============================================
 * Central storage for all NFs and connections
 * Acts as the single source of truth
 * 
 * Responsibilities:
 * - Store all Network Functions (NFs)
 * - Store all Connections between NFs
 * - Provide CRUD operations
 * - Notify listeners of changes
 */

class DataStore {
    constructor() {
        // Storage arrays
        this.nfs = [];           // All Network Functions
        this.connections = [];   // All Connections
        this.buses = [];         // NEW: Store bus lines
        this.busConnections = []; // NEW: Store NF-to-bus connections
        this.listeners = [];     // Event listeners for changes
        this.subscribers = [];   // Initialize subscribers array to prevent undefined issues

        console.log('✅ DataStore initialized');
    }

    // ==========================================
    // NF OPERATIONS
    // ==========================================

    /**
     * Add a new Network Function
     * @param {Object} nf - Network Function object
     */
    addNF(nf) {
        this.nfs.push(nf);
        this.notifyListeners('nf-added', nf);
        console.log('📦 DataStore: NF added:', nf.name);
    }

    /**
     * Get NF by ID
     * @param {string} id - NF unique ID
     * @returns {Object|null} NF object or null if not found
     */
    getNFById(id) {
        return this.nfs.find(nf => nf.id === id) || null;
    }

    /**
     * Get all NFs
     * @returns {Array} Array of all NFs
     */
    getAllNFs() {
        return this.nfs;
    }

    /**
     * Update an existing NF
     * @param {string} id - NF ID
     * @param {Object} updates - Properties to update
     */
    updateNF(id, updates) {
        const nf = this.getNFById(id);
        if (nf) {
            Object.assign(nf, updates);
            this.notifyListeners('nf-updated', nf);
            console.log('📦 DataStore: NF updated:', nf.name);
        }
    }

    /**
     * Remove an NF
     * @param {string} id - NF ID to remove
     */
    removeNF(id) {
        const index = this.nfs.findIndex(nf => nf.id === id);
        if (index !== -1) {
            const nf = this.nfs[index];
            this.nfs.splice(index, 1);

            // Also remove all connections involving this NF
            this.connections = this.connections.filter(
                conn => conn.sourceId !== id && conn.targetId !== id
            );

            this.notifyListeners('nf-removed', nf);
            console.log('📦 DataStore: NF removed:', nf.name);
        }
    }

    // ==========================================
    // CONNECTION OPERATIONS
    // ==========================================

    /**
     * Add a new connection
     * @param {Object} connection - Connection object
     */
    addConnection(connection) {
        this.connections.push(connection);
        this.notifyListeners('connection-added', connection);
        console.log('📦 DataStore: Connection added:', connection.id);
    }

    /**
     * Get connection by ID
     * @param {string} id - Connection ID
     * @returns {Object|null} Connection object or null
     */
    getConnectionById(id) {
        return this.connections.find(conn => conn.id === id) || null;
    }

    /**
     * Get all connections
     * @returns {Array} Array of all connections
     */
    getAllConnections() {
        return this.connections;
    }

    /**
     * Get all connections for a specific NF
     * @param {string} nfId - NF ID
     * @returns {Array} Array of connections involving this NF
     */
    getConnectionsForNF(nfId) {
        return this.connections.filter(
            conn => conn.sourceId === nfId || conn.targetId === nfId
        );
    }

    /**
     * Check if connection already exists between two NFs
     * @param {string} sourceId - Source NF ID
     * @param {string} targetId - Target NF ID
     * @returns {boolean} True if connection exists
     */
    connectionExists(sourceId, targetId) {
        return this.connections.some(
            conn =>
                (conn.sourceId === sourceId && conn.targetId === targetId) ||
                (conn.sourceId === targetId && conn.targetId === sourceId)
        );
    }

    /**
     * Remove a connection
     * @param {string} id - Connection ID
     */
    removeConnection(id) {
        const index = this.connections.findIndex(conn => conn.id === id);
        if (index !== -1) {
            const conn = this.connections[index];
            this.connections.splice(index, 1);
            this.notifyListeners('connection-removed', conn);
            console.log('📦 DataStore: Connection removed:', conn.id);
        }
    }

    // ==========================================
    // UTILITY OPERATIONS
    // ==========================================

    /**
     * Clear all data
     */
    clearAll() {
        this.nfs = [];
        this.connections = [];
        this.buses = [];              // NEW
        this.busConnections = [];     // NEW
        this.notifyListeners('data-cleared', null);
        console.log('📦 DataStore: All data cleared');
    }

    /**
     * Export all data as JSON
     * @returns {Object} Complete data snapshot
     */
    exportData() {
        const cleanNFs = this.nfs.map(nf => {
            const cleanNF = { ...nf };
            delete cleanNF.iconImage;
            return cleanNF;
        });

        return {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            nfs: cleanNFs,
            connections: this.connections,
            buses: this.buses,                    // NEW
            busConnections: this.busConnections   // NEW
        };
    }

    /**
     * Import data from JSON
     * @param {Object} data - Data to import
     */
    importData(data) {
        if (data.nfs && Array.isArray(data.nfs)) {
            this.nfs = data.nfs.map(nf => {
                nf.iconImage = null;
                if (!nf.icon && window.nfDefinitions && window.nfDefinitions[nf.type]) {
                    nf.icon = window.nfDefinitions[nf.type].icon;
                }
                return nf;
            });
        }

        if (data.connections && Array.isArray(data.connections)) {
            this.connections = data.connections;
        }

        // ADD THESE LINES
        if (data.buses && Array.isArray(data.buses)) {
            this.buses = data.buses;
        }

        if (data.busConnections && Array.isArray(data.busConnections)) {
            this.busConnections = data.busConnections;
        }

        this.notifyListeners('data-imported', data);
        console.log('📦 DataStore: Data imported');
    }

    // ==========================================
    // EVENT SYSTEM
    // ==========================================

    /**
     * Subscribe to data changes
     * @param {Function} callback - Function to call on changes
     */
    subscribe(callback) {
        this.listeners.push(callback);
    }

    /**
     * Notify all listeners of changes
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Error in listener:', error);
            }
        });
    }



    // Add these methods at the end of the DataStore class (before the closing })

    // ==========================================
    // BUS OPERATIONS
    // ==========================================

    addBus(bus) {
        this.buses.push(bus);
        this.notifyListeners('bus-added', bus);
        console.log('📦 DataStore: Bus added:', bus.name);
    }

    getBusById(id) {
        return this.buses.find(bus => bus.id === id) || null;
    }

    getAllBuses() {
        return this.buses;
    }

    removeBus(id) {
        const index = this.buses.findIndex(bus => bus.id === id);
        if (index !== -1) {
            const bus = this.buses[index];
            this.buses.splice(index, 1);
            this.notifyListeners('bus-removed', bus);
            console.log('📦 DataStore: Bus removed:', bus.name);
        }
    }

    // ==========================================
    // BUS CONNECTION OPERATIONS
    // ==========================================

    addBusConnection(connection) {
        this.busConnections.push(connection);
        this.notifyListeners('bus-connection-added', connection);
        console.log('📦 DataStore: Bus connection added');
    }

    getAllBusConnections() {
        return this.busConnections;
    }

    getBusConnectionsForNF(nfId) {
        return this.busConnections.filter(conn => conn.nfId === nfId);
    }

    getBusConnectionsForBus(busId) {
        return this.busConnections.filter(conn => conn.busId === busId);
    }

    removeBusConnections(busId) {
        this.busConnections = this.busConnections.filter(conn => conn.busId !== busId);
        console.log('📦 DataStore: Bus connections removed for bus:', busId);
    }

    removeBusConnection(connectionId) {
        const index = this.busConnections.findIndex(conn => conn.id === connectionId);
        if (index !== -1) {
            this.busConnections.splice(index, 1);
            console.log('📦 DataStore: Bus connection removed');
        }
    }

    // ==========================================
    // SUBSCRIBER (UDR/MySQL) STORE - In-memory mock
    // ==========================================
    setSubscribers(list) {
        this.subscribers = Array.isArray(list) ? list : [];
        this.notifyListeners('subscribers-updated', this.subscribers);
    }

    getSubscribers() {
        return this.subscribers || [];
    }

    upsertSubscriber(imsi, data) {
        if (!this.subscribers) this.subscribers = [];
        const idx = this.subscribers.findIndex(s => s.imsi === imsi);
        if (idx >= 0) {
            this.subscribers[idx] = { ...this.subscribers[idx], ...data, imsi };
        } else {
            this.subscribers.push({ imsi, ...data });
        }
        this.notifyListeners('subscribers-updated', this.subscribers);
    }
}