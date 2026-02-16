/**
 * ============================================
 * PING MANAGER
 * ============================================
 * Manages ping functionality with progressive display and troubleshooting
 * 
 * Responsibilities:
 * - Execute ping commands with realistic timing
 * - Display progressive ping results
 * - Network troubleshooting between services
 * - Simulate realistic ping behavior
 */

class PingManager {
    constructor() {
        this.activePings = new Map(); // Track active ping processes
        this.pingHistory = new Map(); // Store ping history per NF
        
        console.log('✅ PingManager initialized');
    }

    /**
     * Execute ping command with progressive display (Linux-style for UE)
     * @param {string} sourceNfId - Source NF ID
     * @param {string} targetIP - Target IP address
     * @param {number} count - Number of ping packets (default 4, 0 for continuous)
     * @param {string} interfaceName - Interface name (e.g., 'oaitun_ue1')
     * @returns {Promise} Promise that resolves when ping completes
     */
    async executePing(sourceNfId, targetIP, count = 4, interfaceName = null) {
        const sourceNf = window.dataStore?.getNFById(sourceNfId);
        if (!sourceNf) {
            console.error('❌ Source NF not found:', sourceNfId);
            return;
        }

        const pingId = `ping-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        
        // Determine source IP based on interface
        let sourceIP = sourceNf.config.ipAddress;
        if (interfaceName && sourceNf.config.tunInterface) {
            sourceIP = sourceNf.config.tunInterface.ipAddress;
        }
        
        // Check if target is reachable
        const isReachable = this.isTargetReachable(sourceNf, targetIP, interfaceName);
        
        console.log(`🏓 Starting ping from ${sourceNf.name} to ${targetIP} (interface: ${interfaceName || 'default'})`);
        
        // Store active ping
        this.activePings.set(pingId, {
            sourceNfId,
            targetIP,
            count,
            isReachable,
            startTime: Date.now(),
            interfaceName
        });

        // Initial message - Linux style
        if (window.logEngine) {
            const iface = interfaceName || 'eth0';
            window.logEngine.addLog(sourceNfId, 'INFO', 
                `PING ${targetIP} (${targetIP}) from ${sourceIP} ${iface}: 56(84) bytes of data.`, {
                command: `ping -I ${iface} ${targetIP}${count > 0 ? ` -c${count}` : ''}`,
                packets: count > 0 ? count : 'continuous',
                interface: iface,
                sourceIP: sourceIP
            });
        }

        // Progressive ping replies
        const results = [];
        const maxCount = count > 0 ? count : 999; // Limit continuous to 999 for safety
        
        for (let i = 1; i <= maxCount; i++) {
            await this.delay(1000); // 1 second delay between pings (Linux standard)
            
            if (isReachable) {
                // Successful ping - Linux format
                const responseTime = this.generateLinuxResponseTime(targetIP);
                const ttl = this.getTTLForTarget(targetIP);
                
                results.push({
                    sequence: i,
                    time: responseTime,
                    ttl: ttl,
                    success: true
                });

                if (window.logEngine) {
                    window.logEngine.addLog(sourceNfId, 'SUCCESS',
                        `64 bytes from ${targetIP}: icmp_seq=${i} ttl=${ttl} time=${responseTime} ms`, {
                        sequence: i,
                        responseTime: `${responseTime} ms`,
                        ttl: ttl,
                        status: 'SUCCESS',
                        format: 'linux'
                    });
                }
            } else {
                // Timeout
                results.push({
                    sequence: i,
                    success: false,
                    timeout: true
                });

                if (window.logEngine) {
                    window.logEngine.addLog(sourceNfId, 'ERROR',
                        `Request timeout for icmp_seq ${i}`, {
                        sequence: i,
                        status: 'TIMEOUT',
                        format: 'linux'
                    });
                }
            }
        }

        // Final statistics
        await this.delay(500);
        this.displayLinuxPingStatistics(sourceNfId, targetIP, results);
        
        // Store in history
        this.storePingHistory(sourceNfId, targetIP, results);
        
        // Remove from active pings
        this.activePings.delete(pingId);
        
        return results;
    }

    /**
     * Generate Linux-style response time based on target
     * @param {string} targetIP - Target IP address
     * @returns {string} Response time with decimal (e.g., "34.7")
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
     * Get TTL value based on target type
     * @param {string} targetIP - Target IP address
     * @returns {number} TTL value
     */
    getTTLForTarget(targetIP) {
        // Internet - TTL 111 (typical for Google DNS)
        if (targetIP === '8.8.8.8' || targetIP === '8.8.4.4') {
            return 111;
        }
        // Gateway - TTL 64 (typical for local gateway)
        if (targetIP === '10.0.0.1') {
            return 64;
        }
        // UPF or local network - TTL 63
        return 63;
    }

    /**
     * Display Linux-style ping statistics
     * @param {string} sourceNfId - Source NF ID
     * @param {string} targetIP - Target IP
     * @param {Array} results - Ping results
     */
    displayLinuxPingStatistics(sourceNfId, targetIP, results) {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        const lossPercentage = Math.round((failed.length / results.length) * 100);

        let statisticsMessage = `--- ${targetIP} ping statistics ---\n`;
        statisticsMessage += `${results.length} packets transmitted, ${successful.length} received, ${lossPercentage}% packet loss, time ${results.length * 1000}ms`;

        const details = {
            transmitted: results.length,
            received: successful.length,
            lost: failed.length,
            lossPercentage: `${lossPercentage}%`,
            format: 'linux'
        };

        if (successful.length > 0) {
            const times = successful.map(r => parseFloat(r.time));
            const min = Math.min(...times).toFixed(3);
            const max = Math.max(...times).toFixed(3);
            const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3);
            const mdev = this.calculateMdev(times, parseFloat(avg)).toFixed(3);

            statisticsMessage += `\nrtt min/avg/max/mdev = ${min}/${avg}/${max}/${mdev} ms`;

            details.roundTripTimes = {
                minimum: `${min} ms`,
                maximum: `${max} ms`,
                average: `${avg} ms`,
                mdev: `${mdev} ms`
            };
        }

        if (window.logEngine) {
            window.logEngine.addLog(sourceNfId, 'INFO', statisticsMessage, details);
        }
    }

    /**
     * Calculate mean deviation for ping statistics
     * @param {Array} times - Array of response times
     * @param {number} avg - Average time
     * @returns {number} Mean deviation
     */
    calculateMdev(times, avg) {
        const squaredDiffs = times.map(t => Math.pow(t - avg, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / times.length;
        return Math.sqrt(variance);
    }

    /**
     * Check if target IP is reachable from source NF (SUBNET-BASED RESTRICTION)
     * @param {Object} sourceNf - Source Network Function
     * @param {string} targetIP - Target IP address
     * @param {string} interfaceName - Interface name (optional)
     * @returns {boolean} True if reachable
     */
    isTargetReachable(sourceNf, targetIP, interfaceName = null) {
        // SPECIAL CASE: Internet connectivity (8.8.8.8) via tun interface
        if (sourceNf.type === 'UE' && interfaceName && sourceNf.config?.tunInterface) {
            // UE can reach internet through tun interface if PDU session is established
            if (targetIP === '8.8.8.8' || targetIP === '8.8.4.4') {
                return sourceNf.config.pduSession ? true : false;
            }
            // UE can reach gateway (10.0.0.1) through tun interface
            if (targetIP === '10.0.0.1') {
                return sourceNf.config.pduSession ? true : false;
            }
            // UE can reach UPF IP through tun interface
            if (sourceNf.config.pduSession) {
                const upf = window.dataStore?.getNFById(sourceNf.config.pduSession.upfId);
                if (upf && targetIP === upf.config.ipAddress) {
                    return true;
                }
            }
        }

        // SPECIAL CASE: tun0 network reachability (UE ↔ UPF user-plane)
        if (sourceNf.type === 'UE' && sourceNf.config?.pduSession?.assignedIP) {
            const uetun0IP = sourceNf.config.pduSession.assignedIP;
            // Find UPF associated with this PDU session
            const upf = window.dataStore?.getNFById(sourceNf.config.pduSession.upfId);
            const upfGw = upf?.config?.tun0Interface?.gatewayIP;
            if ((targetIP === uetun0IP) || (upfGw && targetIP === upfGw)) {
                // Consider this path reachable with very high probability
                return Math.random() < 0.98;
            }
        }

        // RULE 1: Check if both IPs are in the same subnet
        const sourceNetwork = this.getNetworkFromIP(sourceNf.config.ipAddress);
        const targetNetwork = this.getNetworkFromIP(targetIP);
        
        if (sourceNetwork !== targetNetwork) {
            console.log(`🚫 SUBNET RESTRICTION: ${sourceNf.config.ipAddress} (${sourceNetwork}.0/24) cannot ping ${targetIP} (${targetNetwork}.0/24) - Different subnets`);
            return false; // STRICT: Different subnets cannot ping each other
        }

        // Find target NF by IP
        const allNFs = window.dataStore?.getAllNFs() || [];
        const targetNf = allNFs.find(nf => nf.config.ipAddress === targetIP);
        
        if (!targetNf) {
            // IP not found in topology but in same subnet - simulate 20% success for unknown IPs in same subnet
            console.log(`⚠️ Target IP ${targetIP} not found in topology but in same subnet - 20% success rate`);
            return Math.random() < 0.2;
        }

        // RULE 2: Both services must be stable for reliable communication
        if (sourceNf.status !== 'stable' || targetNf.status !== 'stable') {
            console.log(`⚠️ Service status check: ${sourceNf.name}(${sourceNf.status}) → ${targetNf.name}(${targetNf.status}) - 30% success rate`);
            return Math.random() < 0.3; // 30% success if not both stable
        }

        // RULE 3: Same subnet and both stable - check connectivity
        const connected = this.areNFsConnected(sourceNf, targetNf);
        if (connected) {
            console.log(`✅ Connected services in same subnet: ${sourceNf.name} → ${targetNf.name} - 95% success rate`);
            return Math.random() < 0.95; // High success rate for connected services
        } else {
            console.log(`⚠️ Unconnected services in same subnet: ${sourceNf.name} → ${targetNf.name} - 70% success rate`);
            return Math.random() < 0.7; // Lower success rate for unconnected services in same subnet
        }
    }

    /**
     * Check if two NFs are connected (directly or via bus)
     * @param {Object} sourceNf - Source NF
     * @param {Object} targetNf - Target NF
     * @returns {boolean} True if connected
     */
    areNFsConnected(sourceNf, targetNf) {
        // Check direct connections
        const connections = window.dataStore?.getConnectionsForNF(sourceNf.id) || [];
        const hasDirectConnection = connections.some(conn => {
            const otherNfId = conn.sourceId === sourceNf.id ? conn.targetId : conn.sourceId;
            return otherNfId === targetNf.id;
        });

        if (hasDirectConnection) {
            return true;
        }

        // Check bus connections
        const sourceBusConnections = window.dataStore?.getBusConnectionsForNF(sourceNf.id) || [];
        const targetBusConnections = window.dataStore?.getBusConnectionsForNF(targetNf.id) || [];

        // Check if both NFs are on the same bus
        for (const sourceBusConn of sourceBusConnections) {
            for (const targetBusConn of targetBusConnections) {
                if (sourceBusConn.busId === targetBusConn.busId) {
                    return true;
                }
            }
        }

        // If no connection found, simulate 90% success rate for same network stable services
        return Math.random() < 0.9;
    }

    /**
     * Get network from IP address (assumes /24 network)
     * @param {string} ip - IP address
     * @returns {string} Network address
     */
    getNetworkFromIP(ip) {
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
    }

    /**
     * Generate realistic response time
     * @returns {number} Response time in milliseconds
     */
    generateResponseTime() {
        // Generate response times between 1-60ms with realistic distribution
        const baseTime = Math.random() * 50 + 1; // 1-51ms
        const variation = (Math.random() - 0.5) * 10; // ±5ms variation
        return Math.max(1, Math.round(baseTime + variation));
    }

    /**
     * Display Windows-style ping statistics
     * @param {string} sourceNfId - Source NF ID
     * @param {string} targetIP - Target IP
     * @param {Array} results - Ping results
     */
    displayWindowsPingStatistics(sourceNfId, targetIP, results) {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        const lossPercentage = Math.round((failed.length / results.length) * 100);

        let statisticsMessage = `Ping statistics for ${targetIP}:\n`;
        statisticsMessage += `    Packets: Sent = ${results.length}, Received = ${successful.length}, Lost = ${failed.length} (${lossPercentage}% loss),`;

        const details = {
            sent: results.length,
            received: successful.length,
            lost: failed.length,
            lossPercentage: `${lossPercentage}%`,
            format: 'windows'
        };

        if (successful.length > 0) {
            const times = successful.map(r => r.time);
            const min = Math.min(...times);
            const max = Math.max(...times);
            const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

            statisticsMessage += `\nApproximate round trip times in milli-seconds:\n`;
            statisticsMessage += `    Minimum = ${min}ms, Maximum = ${max}ms, Average = ${avg}ms`;

            details.roundTripTimes = {
                minimum: `${min}ms`,
                maximum: `${max}ms`,
                average: `${avg}ms`
            };
        }

        if (window.logEngine) {
            window.logEngine.addLog(sourceNfId, 'INFO', statisticsMessage, details);
        }
    }

    /**
     * Ping all services in the same subnet (SUBNET-RESTRICTED)
     * @param {string} sourceNfId - Source NF ID
     * @returns {Promise} Promise that resolves when all pings complete
     */
    async pingNetworkServices(sourceNfId) {
        const sourceNf = window.dataStore?.getNFById(sourceNfId);
        if (!sourceNf) {
            console.error('❌ Source NF not found:', sourceNfId);
            return;
        }

        const sourceNetwork = this.getNetworkFromIP(sourceNf.config.ipAddress);
        const allNFs = window.dataStore?.getAllNFs() || [];
        
        // SUBNET RESTRICTION: Only find NFs in the SAME subnet
        const sameSubnetServices = allNFs.filter(nf => 
            nf.id !== sourceNfId && 
            this.getNetworkFromIP(nf.config.ipAddress) === sourceNetwork
        );

        // Separate by status for better reporting
        const stableServices = sameSubnetServices.filter(nf => nf.status === 'stable');
        const unstableServices = sameSubnetServices.filter(nf => nf.status !== 'stable');

        if (sameSubnetServices.length === 0) {
            if (window.logEngine) {
                window.logEngine.addLog(sourceNfId, 'WARNING',
                    `No other services found in subnet ${sourceNetwork}.0/24`, {
                    sourceIP: sourceNf.config.ipAddress,
                    sourceNetwork: sourceNetwork + '.0/24',
                    restriction: 'Only services in the same subnet can be pinged',
                    suggestion: 'Add more services with IPs in the same subnet range'
                });
            }
            return;
        }

        if (window.logEngine) {
            window.logEngine.addLog(sourceNfId, 'INFO',
                `🔧 Subnet Scan: Scanning ${sourceNetwork}.0/24 network...`, {
                sourceIP: sourceNf.config.ipAddress,
                subnetRange: sourceNetwork + '.0/24',
                totalServicesFound: sameSubnetServices.length,
                stableServices: stableServices.length,
                unstableServices: unstableServices.length,
                restriction: 'Subnet-based ping restriction enforced'
            });
        }

        // Ping each service in the same subnet (regardless of status)
        for (const targetNf of sameSubnetServices) {
            await this.delay(200); // Small delay between pings
            
            const statusInfo = targetNf.status === 'stable' ? '✅ STABLE' : `⚠️ ${targetNf.status.toUpperCase()}`;
            
            if (window.logEngine) {
                window.logEngine.addLog(sourceNfId, 'INFO',
                    `📡 Testing ${targetNf.name} (${targetNf.config.ipAddress}) [${statusInfo}]...`);
            }

            await this.executePing(sourceNfId, targetNf.config.ipAddress, 1); // Single ping for troubleshooting
        }

        // Summary with subnet restriction info
        await this.delay(500);
        if (window.logEngine) {
            window.logEngine.addLog(sourceNfId, 'SUCCESS',
                `🔧 Subnet scan completed for ${sameSubnetServices.length} services in ${sourceNetwork}.0/24`, {
                subnetRange: sourceNetwork + '.0/24',
                totalTested: sameSubnetServices.length,
                stableServices: stableServices.length,
                unstableServices: unstableServices.length,
                restriction: 'Only same-subnet services can be pinged',
                testedServices: sameSubnetServices.map(nf => ({
                    name: nf.name,
                    ip: nf.config.ipAddress,
                    type: nf.type,
                    status: nf.status,
                    subnet: this.getNetworkFromIP(nf.config.ipAddress) + '.0/24'
                }))
            });
        }
    }

    /**
     * Store ping history
     * @param {string} sourceNfId - Source NF ID
     * @param {string} targetIP - Target IP
     * @param {Array} results - Ping results
     */
    storePingHistory(sourceNfId, targetIP, results) {
        if (!this.pingHistory.has(sourceNfId)) {
            this.pingHistory.set(sourceNfId, []);
        }

        const history = this.pingHistory.get(sourceNfId);
        history.push({
            timestamp: Date.now(),
            targetIP,
            results,
            summary: {
                sent: results.length,
                received: results.filter(r => r.success).length,
                lossPercentage: Math.round((results.filter(r => !r.success).length / results.length) * 100)
            }
        });

        // Keep only last 50 ping sessions per NF
        if (history.length > 50) {
            history.shift();
        }
    }

    /**
     * Get ping history for an NF
     * @param {string} nfId - NF ID
     * @returns {Array} Ping history
     */
    getPingHistory(nfId) {
        return this.pingHistory.get(nfId) || [];
    }

    /**
     * Clear ping history for an NF
     * @param {string} nfId - NF ID
     */
    clearPingHistory(nfId) {
        this.pingHistory.delete(nfId);
    }

    /**
     * Utility function to create delays
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if ping is currently active for an NF
     * @param {string} nfId - NF ID
     * @returns {boolean} True if ping is active
     */
    isPingActive(nfId) {
        for (const [pingId, pingInfo] of this.activePings) {
            if (pingInfo.sourceNfId === nfId) {
                return true;
            }
        }
        return false;
    }

    /**
     * Cancel active ping for an NF
     * @param {string} nfId - NF ID
     */
    cancelPing(nfId) {
        for (const [pingId, pingInfo] of this.activePings) {
            if (pingInfo.sourceNfId === nfId) {
                this.activePings.delete(pingId);
                
                if (window.logEngine) {
                    window.logEngine.addLog(nfId, 'WARNING', 'Ping operation cancelled by user');
                }
                break;
            }
        }
    }
}