/**
 * ============================================
 * CANVAS RENDERER
 * ============================================
 * Handles all canvas drawing operations
 * 
 * Responsibilities:
 * - Draw NFs on canvas
 * - Draw connections between NFs
 * - Handle canvas interactions (click, hover)
 * - Manage canvas sizing and scaling
 * - Draw grid background
 */

class CanvasRenderer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.selectedNF = null;
        this.hoveredNF = null;
        this.isDragging = false;
        this.draggedNF = null;
        this.draggedBus = null;
        this.dragOffset = { x: 0, y: 0 };

        this.init();
    }

    /**
     * Initialize canvas and event listeners
     */
    init() {
        this.canvas = document.getElementById('main-canvas');

        if (!this.canvas) {
            console.error('❌ Canvas element not found!');
            return;
        }

        this.ctx = this.canvas.getContext('2d');

        // Set canvas size
        this.resizeCanvas();

        // Add event listeners
        window.addEventListener('resize', () => this.resizeCanvas());
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // Add ResizeObserver to handle container size changes
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(() => {
                this.resizeCanvas();
            });
            resizeObserver.observe(this.canvas.parentElement);
        }

        console.log('✅ CanvasRenderer initialized');

        // Initial render
        this.render();
    }

    /**
     * Resize canvas to fit container
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();

        // Set canvas size to match container's actual dimensions
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        // Also set CSS size to prevent stretching
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.render();
    }

    /**
     * Main render function - draws everything
     */
    render() {
        if (!this.canvas || !this.ctx) {
            console.error('❌ Canvas not initialized');
            return;
        }

        console.log('🎨 Rendering canvas...');

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid background
        this.drawGrid();

        // Get data
        const allNFs = window.dataStore?.getAllNFs() || [];
        const allConnections = window.dataStore?.getAllConnections() || [];
        const allBuses = window.dataStore?.getAllBuses() || [];              // NEW
        const allBusConnections = window.dataStore?.getAllBusConnections() || []; // NEW

        console.log(`📊 Drawing ${allNFs.length} NFs, ${allConnections.length} connections, ${allBuses.length} buses`);
        
        // DEBUG: Log NF details
        if (allNFs.length > 0) {
            console.log('🔍 NF Details:', allNFs.map(nf => ({
                name: nf.name,
                type: nf.type,
                position: nf.position,
                color: nf.color
            })));
        }

        // Draw buses first (behind everything)
        if (allBuses.length > 0) {
            console.log('🚌 Drawing buses:', allBuses);
        }
        allBuses.forEach(bus => this.drawBus(bus));
        allBusConnections.forEach(conn => this.drawBusConnection(conn));

        // Draw regular connections
        allConnections.forEach(conn => this.drawConnection(conn));

        // Draw NFs on top
        allNFs.forEach(nf => this.drawNF(nf));

        console.log('✅ Render complete');
    }

    /**
     * Draw grid background
     */
    drawGrid() {
        const gridSize = 50;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;

        // Vertical lines
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    /**
 * Draw a Network Function with SVG icon
 * @param {Object} nf - Network Function object
 */
    drawNF(nf) {
        const x = nf.position.x;
        const y = nf.position.y;
        const width = 40;  // NF box width
        const height = 40; // NF box height

        // Draw background box with transparency
        this.ctx.fillStyle = nf.color + '20'; // 20 = 12.5% opacity
        this.ctx.fillRect(x, y, width, height);

        // Draw border - set default style first
        this.ctx.strokeStyle = nf.color;
        this.ctx.lineWidth = 2;

        // Highlight if selected
        if (this.selectedNF === nf.id) {
            this.ctx.lineWidth = 4;
            this.ctx.strokeStyle = '#f39c12';
        }

        // Highlight if hovered
        if (this.hoveredNF === nf.id) {
            this.ctx.lineWidth = 3;
            this.ctx.strokeStyle = '#3498db';
        }

        this.ctx.strokeRect(x, y, width, height);

        // =========================================
        // DRAW SVG ICON (if available and loaded)
        // =========================================
        if (nf.iconImage && nf.iconImage.complete) {
            // Icon loaded successfully - draw it
            const iconSize = 30; // ⚙️ CHANGE THIS TO ADJUST ICON SIZE
            const iconX = x + (width - iconSize) / 2;
            const iconY = y + 7;

            try {
                this.ctx.drawImage(nf.iconImage, iconX, iconY, iconSize, iconSize);
                // Only log success occasionally to avoid spam
                if (Math.random() < 0.1) {
                    console.log('🎨 Successfully drew icon for', nf.name);
                }
            } catch (error) {
                console.error('❌ Error drawing icon for', nf.name + ':', error);
                // Fall back to text icon
                this.drawFallbackIcon(nf, x, y, width, height);
            }
        } else {
            // Icon not loaded - draw fallback circle with letter
            if (nf.icon && !nf.iconImage) {
                console.log('🔄 Using fallback for NF:', nf.name, 'Icon path:', nf.icon, 'iconImage:', nf.iconImage);
            } else if (nf.iconImage && !nf.iconImage.complete) {
                console.log('🔄 Icon still loading for NF:', nf.name);
            }
            
            this.drawFallbackIcon(nf, x, y, width, height);
        }

        // Draw NF name below icon
        this.ctx.fillStyle = '#ecf0f1';
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(nf.name, x + width / 2, y + 50);

        // HTTP Protocol Badge removed for cleaner visual - protocol info available in logs only

        // Enhanced status indicator with better visibility
        const statusColor = window.nfManager?.getStatusColor(nf.status) || '#95a5a6';
        
        // Draw status indicator with glow effect
        this.ctx.shadowColor = statusColor;
        this.ctx.shadowBlur = 8;
        this.ctx.fillStyle = statusColor;
        this.ctx.beginPath();
        this.ctx.arc(x + width - 8, y + 8, 6, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Add white border for better visibility
        this.ctx.shadowBlur = 0;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Add status text
        if (nf.status === 'starting') {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 8px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('●', x + width - 8, y + 8);
        }
    }
    /**
     * Draw a Network Function
     * @param {Object} nf - Network Function object
     */
    // drawNF(nf) {
    //     const x = nf.position.x;
    //     const y = nf.position.y;
    //     const width = 120;
    //     const height = 120;

    //     // Draw background box with transparency
    //     this.ctx.fillStyle = nf.color + '20'; // Add 20 for 12.5% opacity
    //     this.ctx.fillRect(x, y, width, height);

    //     // Draw border
    //     this.ctx.strokeStyle = nf.color;
    //     this.ctx.lineWidth = 3;

    //     // Highlight if selected
    //     if (this.selectedNF === nf.id) {
    //         this.ctx.lineWidth = 5;
    //         this.ctx.strokeStyle = '#f39c12';
    //     }

    //     // Highlight if hovered
    //     if (this.hoveredNF === nf.id) {
    //         this.ctx.lineWidth = 4;
    //         this.ctx.strokeStyle = '#3498db';
    //     }

    //     this.ctx.strokeRect(x, y, width, height);

    //     // Draw icon circle
    //     const iconSize = 48;
    //     const iconX = x + (width - iconSize) / 2;
    //     const iconY = y + 15;

    //     this.ctx.beginPath();
    //     this.ctx.arc(iconX + iconSize/2, iconY + iconSize/2, iconSize/2, 0, Math.PI * 2);
    //     this.ctx.fillStyle = nf.color;
    //     this.ctx.fill();

    //     // Draw first letter of NF type in icon
    //     this.ctx.fillStyle = '#fff';
    //     this.ctx.font = 'bold 24px Arial';
    //     this.ctx.textAlign = 'center';
    //     this.ctx.textBaseline = 'middle';
    //     this.ctx.fillText(nf.type[0], iconX + iconSize/2, iconY + iconSize/2);

    //     // Draw NF name
    //     this.ctx.fillStyle = '#ecf0f1';
    //     this.ctx.font = '14px Arial';
    //     this.ctx.textAlign = 'center';
    //     this.ctx.fillText(nf.name, x + width/2, y + 80);

    //     // Draw NF type
    //     this.ctx.font = '11px Arial';
    //     this.ctx.fillStyle = '#95a5a6';
    //     this.ctx.fillText(nf.type, x + width/2, y + 100);

    //     // Draw status indicator
    //     const statusColor = nf.status === 'active' ? '#4caf50' : '#e74c3c';
    //     this.ctx.fillStyle = statusColor;
    //     this.ctx.beginPath();
    //     this.ctx.arc(x + width - 10, y + 10, 5, 0, Math.PI * 2);
    //     this.ctx.fill();
    // }

    /**
     * Draw fallback icon (circle with letter)
     * @param {Object} nf - Network Function object
     * @param {number} x - X position
     * @param {number} y - Y position  
     * @param {number} width - Width of NF box
     * @param {number} height - Height of NF box
     */
    drawFallbackIcon(nf, x, y, width, height) {
        const iconSize = 32; // Reduced to fit within 40px box
        const iconX = x + (width - iconSize) / 2;
        const iconY = y + (height - iconSize) / 2;

        this.ctx.beginPath();
        this.ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
        this.ctx.fillStyle = nf.color;
        this.ctx.fill();

        // Draw first letter of NF type
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 16px Arial'; // Reduced font size
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(nf.type[0], iconX + iconSize / 2, iconY + iconSize / 2);
    }

    /**
     * Draw a connection between two NFs (only if showVisual is true)
     * @param {Object} conn - Connection object
     */
    drawConnection(conn) {
        // Only draw visual connections (manual connections)
        if (!conn.showVisual) {
            return; // Skip auto-connections - they exist only for communication/logs
        }

        const sourceNF = window.dataStore.getNFById(conn.sourceId);
        const targetNF = window.dataStore.getNFById(conn.targetId);

        if (!sourceNF || !targetNF) {
            console.warn('⚠️ Connection references missing NF');
            return;
        }

        // Hide connection line between NRF and UDM
        if ((sourceNF.type === 'NRF' && targetNF.type === 'UDM') || 
            (sourceNF.type === 'UDM' && targetNF.type === 'NRF')) {
            return; // Don't show NRF-UDM connection line
        }

        // Calculate center points of NF boxes (40x40 size)
        const sourceX = sourceNF.position.x + 20;
        const sourceY = sourceNF.position.y + 20;
        const targetX = targetNF.position.x + 20;
        const targetY = targetNF.position.y + 20;

        // Draw connection line
        this.ctx.beginPath();
        this.ctx.moveTo(sourceX, sourceY);
        this.ctx.lineTo(targetX, targetY);
        this.ctx.strokeStyle = '#3498db';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // Draw arrow at target end
        const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
        const arrowSize = 2;

        this.ctx.beginPath();
        this.ctx.moveTo(targetX, targetY);
        this.ctx.lineTo(
            targetX - arrowSize * Math.cos(angle - Math.PI / 6),
            targetY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.moveTo(targetX, targetY);
        this.ctx.lineTo(
            targetX - arrowSize * Math.cos(angle + Math.PI / 6),
            targetY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.strokeStyle = '#3498db';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // Draw interface name label at midpoint
        if (conn.interfaceName) {
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2;

            // Different colors for different interface types
            let bgColor, borderColor;
            if (['N1', 'N2', 'N3', 'N4'].includes(conn.interfaceName)) {
                // Special highlighting for core 5G interfaces
                bgColor = 'rgba(231, 76, 60, 0.95)';  // Red for core interfaces
                borderColor = '#c0392b';
            } else if (conn.interfaceName === 'Radio') {
                // Special color for radio interface
                bgColor = 'rgba(155, 89, 182, 0.95)';  // Purple for radio
                borderColor = '#8e44ad';
            } else if (conn.interfaceName.includes('SQL') || conn.interfaceName.includes('API')) {
                // Database/API interfaces
                bgColor = 'rgba(230, 126, 34, 0.95)';  // Orange for database
                borderColor = '#d35400';
            } else {
                // Default blue for other interfaces
                bgColor = 'rgba(52, 152, 219, 0.95)';
                borderColor = '#2980b9';
            }

            this.ctx.fillStyle = bgColor;
            this.ctx.strokeStyle = borderColor;
            this.ctx.lineWidth = 1;
            this.ctx.font = 'bold 12px Arial';  // Slightly larger font
            const labelWidth = this.ctx.measureText(conn.interfaceName).width + 14;
            const labelHeight = 18;

            const labelRect = {
                x: midX - labelWidth / 2,
                y: midY - labelHeight / 2,
                width: labelWidth,
                height: labelHeight
            };

            this.ctx.fillRect(labelRect.x, labelRect.y, labelRect.width, labelRect.height);
            this.ctx.strokeRect(labelRect.x, labelRect.y, labelRect.width, labelRect.height);

            // Label text
            this.ctx.fillStyle = '#ffffff';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(conn.interfaceName, midX, midY);
        }
    }

    /**
     * Handle canvas click events
     * @param {MouseEvent} e - Mouse event
     */
    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        console.log('🖱️ Canvas clicked at:', x, y);

        // Check if clicked on an NF
        const allNFs = window.dataStore?.getAllNFs() || [];
        let clickedNF = null;

        for (const nf of allNFs) {
            if (this.isPointInNF(x, y, nf)) {
                clickedNF = nf;
                break;
            }
        }

        if (clickedNF) {
            console.log('✅ Clicked on NF:', clickedNF.name);
            this.selectedNF = clickedNF.id;
            this.render();

            // Open config panel
            if (window.uiController) {
                window.uiController.showNFConfigPanel(clickedNF);
            }
        } else {
            // Clicked on empty space
            this.selectedNF = null;
            this.render();

            // Close config panel
            if (window.uiController) {
                window.uiController.hideNFConfigPanel();
            }
        }
    }

    /**
     * Handle mouse move events
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Handle dragging
        if (this.isDragging && this.draggedNF) {
            const newX = x - this.dragOffset.x;
            const newY = y - this.dragOffset.y;

            // Update NF position
            window.nfManager.moveNF(this.draggedNF.id, { x: newX, y: newY });
            return;
        }

        // Handle bus dragging
        if (this.isDragging && this.draggedBus) {
            const newX = x - this.dragOffset.x;
            const newY = y - this.dragOffset.y;

            // Update bus position
            window.busManager.updateBus(this.draggedBus.id, { 
                position: { x: newX, y: newY } 
            });
            return;
        }

        // Check hover
        const allNFs = window.dataStore?.getAllNFs() || [];
        let hoveredNF = null;

        for (const nf of allNFs) {
            if (this.isPointInNF(x, y, nf)) {
                hoveredNF = nf;
                break;
            }
        }

        if (hoveredNF) {
            this.hoveredNF = hoveredNF.id;
            this.canvas.style.cursor = 'pointer';
        } else {
            this.hoveredNF = null;
            this.canvas.style.cursor = 'default';
        }

        this.render();
    }

    /**
     * Handle mouse down events (start dragging)
     * @param {MouseEvent} e - Mouse event
     */
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const allNFs = window.dataStore?.getAllNFs() || [];
        const allBuses = window.dataStore?.getAllBuses() || [];

        // Check for NF dragging first
        for (const nf of allNFs) {
            if (this.isPointInNF(x, y, nf)) {
                this.isDragging = true;
                this.draggedNF = nf;
                this.dragOffset = {
                    x: x - nf.position.x,
                    y: y - nf.position.y
                };
                this.canvas.style.cursor = 'grabbing';
                return;
            }
        }

        // Check for bus dragging
        for (const bus of allBuses) {
            if (this.isPointInBus(x, y, bus)) {
                this.isDragging = true;
                this.draggedBus = bus;
                this.dragOffset = {
                    x: x - bus.position.x,
                    y: y - bus.position.y
                };
                this.canvas.style.cursor = 'grabbing';
                return;
            }
        }
    }
    /**
     * Handle mouse up events (stop dragging)
     * @param {MouseEvent} e - Mouse event
         */
    handleMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this.draggedNF = null;
            this.draggedBus = null;
            this.canvas.style.cursor = 'default';
        }
    }

    /**
     * Check if point is inside NF box
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} nf - Network Function object
     * @returns {boolean} True if point is inside NF
     */
    isPointInNF(x, y, nf) {
        const width = 40;  // Match the drawing width
        const height = 40; // Match the drawing height
        return x >= nf.position.x &&
            x <= nf.position.x + width &&
            y >= nf.position.y &&
            y <= nf.position.y + height;
    }

    /**
     * Check if point is inside a bus line
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {Object} bus - Bus object
     * @returns {boolean} True if point is inside bus
     */
    isPointInBus(x, y, bus) {
        if (bus.orientation === 'horizontal') {
            return x >= bus.position.x &&
                x <= bus.position.x + bus.length &&
                y >= bus.position.y - bus.thickness / 2 &&
                y <= bus.position.y + bus.thickness / 2;
        } else {
            return x >= bus.position.x - bus.thickness / 2 &&
                x <= bus.position.x + bus.thickness / 2 &&
                y >= bus.position.y &&
                y <= bus.position.y + bus.length;
        }
    }

    /**
     * Get NF at specific position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {Object|null} NF at position or null
     */
    getNFAtPosition(x, y) {
        const allNFs = window.dataStore?.getAllNFs() || [];

        for (const nf of allNFs) {
            if (this.isPointInNF(x, y, nf)) {
                return nf;
            }
        }

        return null;
    }

    /**
 * Draw a bus line
 */
    drawBus(bus) {
        console.log('🎨 Drawing bus:', bus.name, 'at position:', bus.position);

        const x = bus.position.x;
        const y = bus.position.y;
        const length = bus.length;
        const thickness = bus.thickness;

        // Draw bus line with enhanced visibility
        this.ctx.strokeStyle = bus.color;
        this.ctx.lineWidth = thickness + 2; // Make it thicker for better visibility
        this.ctx.lineCap = 'round';

        // Add glow effect for better visibility
        this.ctx.shadowColor = bus.color;
        this.ctx.shadowBlur = 10;

        this.ctx.beginPath();
        if (bus.orientation === 'horizontal') {
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x + length, y);
        } else {
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x, y + length);
        }
        this.ctx.stroke();

        // Reset shadow
        this.ctx.shadowBlur = 0;

        // Draw bus label
        this.ctx.fillStyle = '#ecf0f1';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'bottom';

        if (bus.orientation === 'horizontal') {
            this.ctx.fillText(bus.name, x + 10, y - 10);
        } else {
            this.ctx.save();
            this.ctx.translate(x - 10, y + 10);
            this.ctx.rotate(-Math.PI / 2);
            this.ctx.fillText(bus.name, 0, 0);
            this.ctx.restore();
        }

        // Draw connection points (clickable indicators)
        const numPoints = Math.floor(length / 100);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = bus.color;
        this.ctx.lineWidth = 2;

        for (let i = 0; i <= numPoints; i++) {
            const pointPos = (length / numPoints) * i;
            if (bus.orientation === 'horizontal') {
                // Draw white circle with colored border
                this.ctx.beginPath();
                this.ctx.arc(x + pointPos, y, 6, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            } else {
                // Draw white circle with colored border
                this.ctx.beginPath();
                this.ctx.arc(x, y + pointPos, 6, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            }
        }


    }

    /**
     * Draw connection from NF to bus
     */
    drawBusConnection(connection) {
        if (connection.type === 'bus-connection' || connection.type === 'bus-to-nf-connection') {
            // NF-to-Bus or Bus-to-NF connection
            this.drawNFBusConnection(connection);
        } else if (connection.type === 'bus-to-bus-connection') {
            // Bus-to-Bus connection
            this.drawBusToBusConnection(connection);
        }
    }

    /**
     * Draw NF-to-Bus or Bus-to-NF connection
     */
    drawNFBusConnection(connection) {
        const nf = window.dataStore?.getNFById(connection.nfId);
        const bus = window.dataStore?.getBusById(connection.busId);

        if (!nf || !bus) {
            console.warn('⚠️ Bus connection references missing NF or Bus');
            return;
        }

        // NF center point (using 40x40 size)
        const nfCenterX = nf.position.x + 20;
        const nfCenterY = nf.position.y + 20;

        // Find closest point on bus
        let busX, busY;
        if (bus.orientation === 'horizontal') {
            busX = Math.max(bus.position.x, Math.min(nfCenterX, bus.position.x + bus.length));
            busY = bus.position.y;
        } else {
            busX = bus.position.x;
            busY = Math.max(bus.position.y, Math.min(nfCenterY, bus.position.y + bus.length));
        }

        // Draw connection line
        this.ctx.beginPath();
        this.ctx.moveTo(nfCenterX, nfCenterY);
        this.ctx.lineTo(busX, busY);
        this.ctx.strokeStyle = '#2ecc71';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]); // Dashed line
        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset to solid line

        // Draw connection point on bus
        this.ctx.fillStyle = '#2ecc71';
        this.ctx.beginPath();
        this.ctx.arc(busX, busY, 5, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw interface name label at midpoint
        if (connection.interfaceName) {
            const midX = (nfCenterX + busX) / 2;
            const midY = (nfCenterY + busY) / 2;

            // Background for label with border
            this.ctx.fillStyle = 'rgba(46, 204, 113, 0.95)';
            this.ctx.strokeStyle = '#27ae60';
            this.ctx.lineWidth = 1;
            this.ctx.font = 'bold 11px Arial';
            const labelWidth = this.ctx.measureText(connection.interfaceName).width + 12;
            const labelHeight = 16;

            const labelRect = {
                x: midX - labelWidth / 2,
                y: midY - labelHeight / 2,
                width: labelWidth,
                height: labelHeight
            };

            this.ctx.fillRect(labelRect.x, labelRect.y, labelRect.width, labelRect.height);
            this.ctx.strokeRect(labelRect.x, labelRect.y, labelRect.width, labelRect.height);

            // Label text
            this.ctx.fillStyle = '#ffffff';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(connection.interfaceName, midX, midY);
        }
    }

    /**
     * Draw Bus-to-Bus connection
     */
    drawBusToBusConnection(connection) {
        const sourceBus = window.dataStore?.getBusById(connection.sourceBusId);
        const targetBus = window.dataStore?.getBusById(connection.targetBusId);

        if (!sourceBus || !targetBus) {
            console.warn('⚠️ Bus-to-Bus connection references missing buses');
            return;
        }

        // Calculate connection points (center of each bus)
        let sourceX, sourceY, targetX, targetY;

        if (sourceBus.orientation === 'horizontal') {
            sourceX = sourceBus.position.x + sourceBus.length / 2;
            sourceY = sourceBus.position.y;
        } else {
            sourceX = sourceBus.position.x;
            sourceY = sourceBus.position.y + sourceBus.length / 2;
        }

        if (targetBus.orientation === 'horizontal') {
            targetX = targetBus.position.x + targetBus.length / 2;
            targetY = targetBus.position.y;
        } else {
            targetX = targetBus.position.x;
            targetY = targetBus.position.y + targetBus.length / 2;
        }

        // Draw connection line (thicker for bus-to-bus)
        this.ctx.beginPath();
        this.ctx.moveTo(sourceX, sourceY);
        this.ctx.lineTo(targetX, targetY);
        this.ctx.strokeStyle = '#ff9800'; // Orange for bus-to-bus
        this.ctx.lineWidth = 4;
        this.ctx.setLineDash([10, 5]); // Different dash pattern
        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset to solid line

        // Draw connection points on both buses
        this.ctx.fillStyle = '#ff9800';
        this.ctx.beginPath();
        this.ctx.arc(sourceX, sourceY, 6, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.arc(targetX, targetY, 6, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw interface name label at midpoint
        const midX = (sourceX + targetX) / 2;
        const midY = (sourceY + targetY) / 2;

        // Background for label with border
        this.ctx.fillStyle = 'rgba(255, 152, 0, 0.95)';
        this.ctx.strokeStyle = '#e67e22';
        this.ctx.lineWidth = 1;
        this.ctx.font = 'bold 11px Arial';
        const labelText = connection.interfaceName || 'BUS BRIDGE';
        const labelWidth = this.ctx.measureText(labelText).width + 12;
        const labelHeight = 16;

        const labelRect = {
            x: midX - labelWidth / 2,
            y: midY - labelHeight / 2,
            width: labelWidth,
            height: labelHeight
        };

        this.ctx.fillRect(labelRect.x, labelRect.y, labelRect.width, labelRect.height);
        this.ctx.strokeRect(labelRect.x, labelRect.y, labelRect.width, labelRect.height);

        // Label text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(labelText, midX, midY);
    }
}