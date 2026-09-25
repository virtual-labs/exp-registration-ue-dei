/**
 * ============================================
 * SERVICE MANAGER
 * ============================================
 * Manages generic services instead of Network Functions
 * 
 * Responsibilities:
 * - Create and manage services
 * - Handle service configuration
 * - Generate service IDs
 * - Manage service lifecycle
 */

class ServiceManager {
    constructor() {
        this.serviceCount = 0;
        this.services = new Map();

        console.log('✅ ServiceManager initialized');
    }

    /**
     * Create a new service
     * @param {Object} position - {x, y} position on canvas
     * @param {Object} config - Service configuration
     * @returns {Object} Created service
     */
    createService(position, config) {
        this.serviceCount++;

        const serviceId = `service-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        const service = {
            id: serviceId,
            name: config.name || `Service${this.serviceCount}`,
            type: 'Service', // Generic type
            color: '#3498db', // Default blue color for services
            position: position,
            config: {
                ipAddress: config.ipAddress || '192.168.1.10',
                port: config.port || 8080,
                protocol: config.protocol || 'HTTP/2',
                description: config.description || '',
                endpoint: this.generateEndpoint(config)
            },
            status: 'STARTING',
            createdAt: Date.now()
        };

        // Schedule service to become stable after 5 seconds
        setTimeout(() => {
            this.makeServiceStable(serviceId);
        }, 5000);

        // Schedule auto-connections after 8-10 seconds (random delay)
        const connectionDelay = 8000 + Math.random() * 2000; // 8-10 seconds
        setTimeout(() => {
            this.createAutoConnections(serviceId);
        }, connectionDelay);

        // Store service
        this.services.set(serviceId, service);

        // Add to data store (reusing NF structure)
        if (window.dataStore) {
            window.dataStore.addNF(service);
        }

        // Generate startup logs
        if (window.logEngine) {
            window.logEngine.onServiceAdded(service);
        }

        // Auto-connect to first available bus line
        if (window.busManager) {
            // Find the first bus line (main bus)
            const allBuses = window.dataStore?.getAllBuses() || [];
            const mainBus = allBuses[0]; // Use first bus as main bus

            if (mainBus) {
                // Auto-connect service to main bus
                setTimeout(() => {
                    window.busManager.connectNFToBus(service.id, mainBus.id);

                    // Auto-connect to existing services through bus
                    const allServices = window.dataStore?.getAllNFs() || [];
                    const existingServices = allServices.filter(s => s.id !== service.id);

                    if (existingServices.length > 0) {
                        setTimeout(() => {
                            if (window.logEngine) {
                                window.logEngine.addLog(service.id, 'SUCCESS',
                                    `Connected to ${existingServices.length} existing services via bus line`, {
                                    busId: mainBus.id,
                                    connectedServices: existingServices.map(s => s.name).join(', ')
                                });
                            }
                        }, 1000);
                    }
                }, 500);
            }
        }

        console.log('✅ Service created:', service.name, service.config.endpoint);

        return service;
    }

    /**
     * Generate endpoint URL for service
     * @param {Object} config - Service configuration
     * @returns {string} Endpoint URL
     */
    generateEndpoint(config) {
        // Convert HTTP/1 and HTTP/2 to proper URL protocols
        let protocol = 'https'; // Default to HTTPS
        if (config.protocol === 'HTTP/1' || config.protocol === 'HTTP/2') {
            protocol = 'https'; // Both HTTP/1 and HTTP/2 can use HTTPS
        }

        const ip = config.ipAddress || '192.168.1.10';
        const port = config.port || 8080;
        const servicePath = config.name ? `/${config.name.toLowerCase().replace(/\s+/g, '')}` : '/api';

        return `${protocol}://${ip}:${port}${servicePath}`;
    }

    /**
     * Update service configuration
     * @param {string} serviceId - Service ID
     * @param {Object} newConfig - New configuration
     */
    updateServiceConfig(serviceId, newConfig) {
        const service = this.services.get(serviceId);
        if (!service) return false;

        // Update configuration
        Object.assign(service.config, newConfig);

        // Regenerate endpoint
        service.config.endpoint = this.generateEndpoint(service.config);

        // Update in data store
        if (window.dataStore) {
            window.dataStore.updateNF(serviceId, service);
        }

        console.log('✅ Service config updated:', service.name);
        return true;
    }

    /**
     * Delete service
     * @param {string} serviceId - Service ID
     */
    deleteService(serviceId) {
        const service = this.services.get(serviceId);
        if (!service) return false;

        // Remove from data store
        if (window.dataStore) {
            window.dataStore.removeNF(serviceId);
        }

        // Remove from local storage
        this.services.delete(serviceId);

        // Log deletion
        if (window.logEngine) {
            window.logEngine.addLog(serviceId, 'INFO', `${service.name} service stopped and removed`);
        }

        console.log('✅ Service deleted:', service.name);
        return true;
    }

    /**
     * Get service by ID
     * @param {string} serviceId - Service ID
     * @returns {Object|null} Service object
     */
    getService(serviceId) {
        return this.services.get(serviceId) || null;
    }

    /**
     * Get all services
     * @returns {Array} Array of services
     */
    getAllServices() {
        return Array.from(this.services.values());
    }

    /**
     * Move service to new position
     * @param {string} serviceId - Service ID
     * @param {Object} position - New {x, y} position
     */
    moveService(serviceId, position) {
        const service = this.services.get(serviceId);
        if (!service) return false;

        // Update position
        service.position = position;

        // Update in data store
        if (window.dataStore) {
            window.dataStore.updateNF(serviceId, service);
        }

        console.log('✅ Service moved:', service.name, 'to', position);
        return true;
    }

    /**
     * Make service stable (called after 5 seconds)
     * @param {string} serviceId - Service ID
     */
    makeServiceStable(serviceId) {
        const service = this.services.get(serviceId);
        if (!service) return;

        // Update status to STABLE
        service.status = 'STABLE';

        // Update in data store
        if (window.dataStore) {
            window.dataStore.updateNF(serviceId, service);
        }

        // Log the status change
        if (window.logEngine) {
            window.logEngine.addLog(serviceId, 'SUCCESS',
                `${service.name} is now stable and ready for connections`, {
                status: 'STABLE',
                uptime: '5 seconds',
                endpoint: service.config.endpoint
            });
        }

        // Re-render canvas to show green status indicator
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }

        console.log('✅ Service is now stable:', service.name);
    }

    /**
     * Create automatic connections between services (called after 8-10 seconds)
     * @param {string} serviceId - Service ID of the newly created service
     */
    createAutoConnections(serviceId) {
        const service = this.services.get(serviceId);
        if (!service) return;

        // Only create connections if service is stable
        if (service.status !== 'STABLE') {
            console.log('⏳ Service not stable yet, skipping auto-connections:', service.name);
            return;
        }

        // Get all other stable services
        const allServices = window.dataStore?.getAllNFs() || [];
        const stableServices = allServices.filter(s => 
            s.id !== serviceId && s.status === 'STABLE'
        );

        if (stableServices.length === 0) {
            console.log('📡 No other stable services found for auto-connection');
            return;
        }

        // Create connections to 1-3 random stable services
        const maxConnections = Math.min(3, stableServices.length);
        const numConnections = Math.floor(Math.random() * maxConnections) + 1;
        
        // Shuffle and select random services
        const shuffledServices = stableServices.sort(() => Math.random() - 0.5);
        const selectedServices = shuffledServices.slice(0, numConnections);

        selectedServices.forEach((targetService, index) => {
            // Add small delay between connections for visual effect
            setTimeout(() => {
                this.createServiceConnection(serviceId, targetService.id);
            }, index * 500);
        });

        console.log(`🔗 Creating ${numConnections} auto-connections for ${service.name}`);
    }

    /**
     * Create a connection between two services
     * @param {string} sourceId - Source service ID
     * @param {string} targetId - Target service ID
     */
    createServiceConnection(sourceId, targetId) {
        if (window.connectionManager) {
            const connection = window.connectionManager.createConnection(sourceId, targetId);
            
            if (connection) {
                const sourceService = this.getService(sourceId);
                const targetService = this.getService(targetId);
                
                if (window.logEngine && sourceService && targetService) {
                    window.logEngine.addLog(sourceId, 'SUCCESS',
                        `Auto-connection established with ${targetService.name}`, {
                        connectionId: connection.id,
                        targetEndpoint: targetService.config.endpoint,
                        connectionType: 'auto-generated'
                    });
                }

                // Re-render canvas to show new connection
                if (window.canvasRenderer) {
                    window.canvasRenderer.render();
                }
            }
        }
    }

    /**
     * Simulate service communication
     * @param {string} sourceId - Source service ID
     * @param {string} targetId - Target service ID
     */
    simulateServiceCommunication(sourceId, targetId) {
        const sourceService = this.getService(sourceId);
        const targetService = this.getService(targetId);

        if (!sourceService || !targetService) {
            console.error('❌ Invalid service IDs for communication');
            return;
        }

        // Generate request/response logs
        if (window.logEngine) {
            const requestId = Math.random().toString(36).substring(2, 10);
            const responseTime = Math.floor(Math.random() * 200) + 50; // 50-250ms

            // Outgoing request log
            window.logEngine.addLog(sourceId, 'INFO',
                `Sending request to ${targetService.name}`, {
                method: 'GET',
                endpoint: targetService.config.endpoint,
                requestId: requestId
            });

            // Incoming request log (delayed)
            setTimeout(() => {
                window.logEngine.addLog(targetId, 'INFO',
                    `Received request from ${sourceService.name}`, {
                    method: 'GET',
                    endpoint: targetService.config.endpoint,
                    requestId: requestId
                });
            }, 50);

            // Response sent log (delayed)
            setTimeout(() => {
                window.logEngine.addLog(targetId, 'SUCCESS',
                    `Response sent to ${sourceService.name}`, {
                    statusCode: 200,
                    responseTime: `${responseTime}ms`,
                    requestId: requestId
                });
            }, 100);

            // Response received log (delayed)
            setTimeout(() => {
                window.logEngine.addLog(sourceId, 'SUCCESS',
                    `Response received from ${targetService.name}`, {
                    statusCode: 200,
                    responseTime: `${responseTime}ms`,
                    requestId: requestId
                });
            }, 150);
        }
    }
}

// Initialize ServiceManager
window.serviceManager = new ServiceManager();