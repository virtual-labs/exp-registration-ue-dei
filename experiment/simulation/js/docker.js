/**
 * ============================================
 * DOCKER TERMINAL MANAGER
 * ============================================
 * Manages Docker terminal functionality for managing Network Functions
 * 
 * Responsibilities:
 * - Docker compose commands (up, down, ps)
 * - Start/stop individual NFs
 * - Display service status with health indicators
 * - Watch mode for real-time status updates
 */

class DockerTerminal {
    constructor() {
        this.watchInterval = null;
        this.isWatching = false;
        this.dockerServices = new Map(); // Map of service name to status
        this.promptText = 'docker@main>';
        
        // Terminal window state
        this.terminalState = {
            x: null,
            y: null,
            width: 900,
            height: 700,
            isMaximized: false,
            isMinimized: false
        };
        
        // Network state
        this.oaiWorkshopNetworkExists = false;
        this.oaiWorkshopNetworkId = this.generateNetworkId();
        this.oaiWorkshopCreatedTime = null;
        
        console.log('✅ DockerTerminal initialized');
    }

    /**
     * Initialize Docker terminal button
     */
    init() {
        // Button is added in HTML, just setup click handler if needed
        console.log('✅ Docker terminal ready');
    }

    /**
     * Open Docker terminal modal
     */
    openTerminal() {
        // Remove existing terminal if any
        const existingTerminal = document.getElementById('docker-terminal-modal');
        if (existingTerminal) {
            existingTerminal.remove();
        }

        // Create terminal modal
        const terminalModal = document.createElement('div');
        terminalModal.id = 'docker-terminal-modal';
        terminalModal.className = 'docker-terminal-modal';
        
        terminalModal.innerHTML = `
            <div class="docker-terminal-window" id="docker-terminal-window">
                <div class="docker-terminal-titlebar" id="docker-terminal-titlebar">
                    <div class="docker-terminal-title">
                        <span class="docker-terminal-icon">🐳</span>
                        Docker Terminal - Main Terminal
                    </div>
                    <div class="docker-terminal-controls">
                        <button class="docker-terminal-btn close" id="docker-terminal-close" title="Close">×</button>
                    </div>
                </div>
                <div class="docker-terminal-content" id="docker-terminal-content">
                    <div class="docker-terminal-output" id="docker-terminal-output"></div>
                </div>
                <div class="docker-terminal-resize-handle" id="docker-terminal-resize-handle"></div>
            </div>
        `;

        document.body.appendChild(terminalModal);

        // Setup terminal functionality
        this.setupTerminal(terminalModal);
        
        // Setup dragging, resizing, and window controls
        this.setupWindowControls(terminalModal);

        // Apply saved position and size
        this.applyTerminalState();

        // Show terminal with animation
        setTimeout(() => {
            terminalModal.classList.add('show');
        }, 10);

        this.focusPromptInput();
    }

    /**
     * Setup Docker terminal functionality
     * @param {HTMLElement} terminalModal - Terminal modal element
     */
    setupTerminal(terminalModal) {
        const output = document.getElementById('docker-terminal-output');
        const closeBtn = document.getElementById('docker-terminal-close');
        
        let commandHistory = [];
        let historyIndex = -1;

        // Close button
        closeBtn.addEventListener('click', () => {
            // Stop watch cleanly without restoring prompt (terminal is closing)
            if (this.watchInterval) {
                clearInterval(this.watchInterval);
                this.watchInterval = null;
            }
            this.isWatching = false;
            const terminalContent = document.getElementById('docker-terminal-content');
            if (terminalContent && this._watchCtrlCHandler) {
                terminalContent.removeEventListener('keydown', this._watchCtrlCHandler);
                this._watchCtrlCHandler = null;
            }
            terminalModal.classList.remove('show');
            setTimeout(() => {
                terminalModal.remove();
            }, 300);
        });

        // Click outside to close
        terminalModal.addEventListener('click', (e) => {
            if (e.target === terminalModal) {
                closeBtn.click();
            }
        });

        // Focus prompt input when clicking output area
        output.addEventListener('click', () => {
            this.focusPromptInput();
        });

        // Initial welcome message
        this.addTerminalLine(output, '5G WIRELESS LAB', 'info');
        this.addTerminalLine(output, 'Type "help" for available commands.', 'info');
        this.addTerminalLine(output, '', 'blank');
        this.createPromptLine(output, commandHistory, historyIndex);
    }

    /**
     * Create interactive prompt line inside output stream
     * @param {HTMLElement} output - Output element
     * @param {string[]} commandHistory - Command history
     * @param {number} historyIndex - Current history index
     */
    createPromptLine(output, commandHistory, historyIndex) {
        const promptLine = document.createElement('div');
        promptLine.className = 'docker-terminal-line docker-terminal-input-line';
        promptLine.innerHTML = `
            <span class="docker-terminal-prompt">${this.promptText}</span>
            <input type="text" class="docker-terminal-input" autocomplete="off" spellcheck="false">
        `;
        output.appendChild(promptLine);

        const input = promptLine.querySelector('.docker-terminal-input');
        if (!input) return;

        this.activePromptInput = input;
        this.activePromptLine = promptLine;
        input.focus();
        output.scrollTop = output.scrollHeight;

        // Tab completion state — cycles through matches on repeated Tab presses
        let tabMatches = [];
        let tabIndex = -1;
        let tabBase = '';

        const resetTab = () => { tabMatches = []; tabIndex = -1; tabBase = ''; };

        // Input handling
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const val = input.value;

                // On first Tab press for this position, build match list
                if (tabMatches.length === 0) {
                    tabBase = val;
                    tabMatches = this.getTabCompletions(val);
                    tabIndex = -1;
                }

                if (tabMatches.length === 0) return;

                // Cycle through matches
                tabIndex = (tabIndex + 1) % tabMatches.length;
                input.value = tabMatches[tabIndex];
                return;
            }

            // Any non-Tab key resets tab state
            if (e.key !== 'Tab') resetTab();

            if (e.key === 'Enter') {
                const command = input.value.trim();
                if (this.activePromptLine) this.activePromptLine.remove();
                if (command) {
                    commandHistory.push(command);
                    historyIndex = commandHistory.length;
                    this.addTerminalLine(output, `${this.promptText}${command}`, 'command');
                    await this.processCommand(command, output, commandHistory, historyIndex);
                }
                // Don't create a new prompt if watch mode just started
                if (!this.isWatching) {
                    this.createPromptLine(output, commandHistory, historyIndex);
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
    }

    /**
     * Word-by-word Tab completion for main terminal.
     *
     * Rules (like a real bash terminal):
     *  - Tab completes only the CURRENT partial word, one word at a time.
     *  - If the input ends with a space, suggest the NEXT word.
     *  - Multiple matches cycle on repeated Tab presses.
     *
     * @param {string} typed - Current input value
     * @returns {string[]} Possible completions (full input strings up to next word)
     */
    getTabCompletions(typed) {
        const commands = [
            'docker compose -f docker-compose.yml up -d',
            'docker compose -f docker-compose.yml up -d oai-nrf',
            'docker compose -f docker-compose.yml up -d oai-amf',
            'docker compose -f docker-compose.yml up -d oai-smf',
            'docker compose -f docker-compose.yml up -d oai-upf',
            'docker compose -f docker-compose.yml up -d oai-ausf',
            'docker compose -f docker-compose.yml up -d oai-udm',
            'docker compose -f docker-compose.yml up -d oai-udr',
            'docker compose -f docker-compose.yml up -d mysql',
            'docker compose -f docker-compose.yml down',
            'docker compose -f docker-compose.yml down oai-nrf',
            'docker compose -f docker-compose.yml down oai-amf',
            'docker compose -f docker-compose-gnb.yml up -d',
            'docker compose -f docker-compose-gnb.yml down',
            'docker compose -f docker-compose-ue.yml up -d',
            'docker compose -f docker-compose-ue.yml up -d oai-ue1',
            'docker compose -f docker-compose-ue.yml up -d oai-ue2',
            'docker compose -f docker-compose-ue.yml down',
            'docker ps',
            'docker network ls',
            'docker network inspect oaiworkshop',
            'docker network inspect bridge',
            'docker version',
            'watch docker compose -f docker-compose.yml ps -a',
            'ls',
            'vi docker-compose.yml',
            'status',
            'check',
            'cls',
            'clear',
            'exit',
            'help',
        ];

        if (!typed) return [];

        const endsWithSpace = typed.endsWith(' ');
        // Words already confirmed (all words if trailing space, else all but last)
        const allTypedWords = typed.trimEnd().split(' ');
        const confirmedWords = endsWithSpace ? allTypedWords : allTypedWords.slice(0, -1);
        const partialWord   = endsWithSpace ? '' : allTypedWords[allTypedWords.length - 1];
        const confirmedStr  = confirmedWords.join(' ');

        // Filter commands that match the confirmed prefix
        const matching = commands.filter(cmd => {
            const cmdLower = cmd.toLowerCase();
            if (confirmedStr) {
                // Must start with the confirmed words
                if (!cmdLower.startsWith(confirmedStr.toLowerCase())) return false;
                // The character right after the confirmed prefix must be a space (or end)
                const after = cmd[confirmedStr.length];
                if (after !== undefined && after !== ' ') return false;
            }
            // The next word must start with the partial word
            const cmdWords = cmd.split(' ');
            const nextWordIdx = confirmedWords.length;
            if (nextWordIdx >= cmdWords.length) return false;
            return cmdWords[nextWordIdx].toLowerCase().startsWith(partialWord.toLowerCase());
        });

        if (matching.length === 0) return [];

        // Build completions: confirmed words + next word only (one word at a time)
        const completions = new Set();
        matching.forEach(cmd => {
            const cmdWords = cmd.split(' ');
            const nextWord = cmdWords[confirmedWords.length];
            const result = confirmedStr
                ? confirmedStr + ' ' + nextWord
                : nextWord;
            completions.add(result);
        });

        return [...completions];
    }

    focusPromptInput() {
        if (this.activePromptInput) {
            this.activePromptInput.focus();
        }
    }

    /**
     * Process Docker command
     * @param {string} command - Command to process
     * @param {HTMLElement} output - Output element
     */
    async processCommand(command, output, commandHistory, historyIndex) {
        const cmd = command.toLowerCase().trim();
        const args = command.split(' ');

        if (cmd === 'help' || cmd === '?') {
            this.showHelp(output);
        } else if (cmd === 'status' || cmd === 'check') {
            this.checkSystemStatus(output);
        } else if (cmd === 'docker compose -f docker-compose.yml up -d' || 
                   cmd === 'docker-compose -f docker-compose.yml up -d' ||
                   cmd === 'docker compose up -d' ||
                   cmd === 'docker-compose up -d') {
            await this.dockerComposeUp(output);
        } else if (cmd === 'docker compose -f docker-compose-gnb.yml up -d' || 
                   cmd === 'docker-compose -f docker-compose-gnb.yml up -d') {
            await this.dockerComposeGnbUp(output);
        } else if (cmd === 'docker compose -f docker-compose-ue.yml up -d oai-ue1' || 
                   cmd === 'docker-compose -f docker-compose-ue.yml up -d oai-ue1') {
            await this.dockerComposeUe1Up(output);
        } else if (cmd === 'docker compose -f docker-compose-ue.yml up -d oai-ue2' || 
                   cmd === 'docker-compose -f docker-compose-ue.yml up -d oai-ue2') {
            await this.dockerComposeUe2Up(output);
        } else if (cmd === 'docker compose -f docker-compose-ue.yml up -d' || 
                   cmd === 'docker-compose -f docker-compose-ue.yml up -d') {
            await this.dockerComposeUeUp(output);
        } else if (cmd === 'docker ps') {
            await this.dockerPS(output);
        } else if (cmd === 'docker network ls') {
            this.dockerNetworkLS(output);
        } else if (cmd.startsWith('docker network inspect ')) {
            const networkName = args.slice(3).join(' ');
            this.dockerNetworkInspect(networkName, output);
        } else if (cmd === 'docker version') {
            this.dockerVersion(output);
        } else if (cmd.startsWith('watch docker compose -f docker-compose.yml ps -a') ||
                   cmd.startsWith('watch docker-compose -f docker-compose.yml ps -a') ||
                   cmd.startsWith('watch docker compose ps -a')) {
            this.startWatch(output, commandHistory || [], historyIndex || 0);
        } else if (cmd === 'docker compose -f docker-compose.yml down' ||
                   cmd === 'docker-compose -f docker-compose.yml down' ||
                   cmd === 'docker compose down' ||
                   cmd === 'docker-compose down') {
            await this.dockerComposeDown(output);
        } else if (cmd === 'docker compose -f docker-compose-gnb.yml down' ||
                   cmd === 'docker-compose -f docker-compose-gnb.yml down') {
            await this.dockerComposeGnbDown(output);
        } else if (cmd === 'docker compose -f docker-compose-ue.yml down' ||
                   cmd === 'docker-compose -f docker-compose-ue.yml down') {
            await this.dockerComposeUeDown(output);
        } else if (this._isSingleNFUp(cmd)) {
            // docker compose -f docker-compose.yml up -d <service>
            const serviceName = this._extractSingleNFService(cmd);
            await this.dockerComposeSingleUp(serviceName, output);
        } else if (this._isSingleNFDown(cmd)) {
            // docker compose -f docker-compose.yml down <service>  OR  docker compose -f docker-compose.yml rm -s -f <service>
            const serviceName = this._extractSingleNFServiceDown(cmd);
            await this.dockerComposeSingleDown(serviceName, output);
        } else if (cmd.startsWith('docker start ')) {
            const serviceName = args.slice(2).join(' ');
            await this.dockerStart(serviceName, output);
        } else if (cmd.startsWith('docker stop ')) {
            const serviceName = args.slice(2).join(' ');
            await this.dockerStop(serviceName, output);
        } else if (cmd === 'cls' || cmd === 'clear') {
            output.innerHTML = '';
        } else if (cmd === 'exit') {
            const closeBtn = document.getElementById('docker-terminal-close');
            if (closeBtn) closeBtn.click();
        } else if (cmd === 'ls') {
            this.showLS(output);
        } else if (cmd === 'vi docker-compose.yml' || cmd === 'cat docker-compose.yml') {
            this.showDockerComposeFile(output);
        } else {
            this.addTerminalLine(output, `Command not found: ${command}`, 'error');
            this.addTerminalLine(output, 'Type "help" for available commands.', 'info');
        }

        this.addTerminalLine(output, '', 'blank');
    }

    /**
     * Check system status
     * @param {HTMLElement} output - Output element
     */
    checkSystemStatus(output) {
        this.addTerminalLine(output, 'System Status Check:', 'info');
        this.addTerminalLine(output, '', 'blank');
        
        // Check dataStore
        if (window.dataStore) {
            this.addTerminalLine(output, '✅ DataStore: Available', 'success');
            const allNFs = window.dataStore.getAllNFs() || [];
            this.addTerminalLine(output, `   Found ${allNFs.length} Network Function(s)`, 'info');
            
            if (allNFs.length > 0) {
                this.addTerminalLine(output, '', 'blank');
                this.addTerminalLine(output, 'Network Functions:', 'info');
                allNFs.forEach(nf => {
                    const status = nf.status || 'unknown';
                    const statusColor = status === 'stable' ? 'success' : (status === 'starting' ? 'warning' : 'info');
                    this.addTerminalLine(output, `  - ${nf.name} (${nf.type}): ${status}`, statusColor);
                });
            }
        } else {
            this.addTerminalLine(output, '❌ DataStore: Not available', 'error');
        }
        
        this.addTerminalLine(output, '', 'blank');
        
        // Check other managers
        if (window.nfManager) {
            this.addTerminalLine(output, '✅ NFManager: Available', 'success');
        } else {
            this.addTerminalLine(output, '❌ NFManager: Not available', 'error');
        }
        
        if (window.canvasRenderer) {
            this.addTerminalLine(output, '✅ CanvasRenderer: Available', 'success');
        } else {
            this.addTerminalLine(output, '❌ CanvasRenderer: Not available', 'error');
        }
    }

    /**
     * Show help
     * @param {HTMLElement} output - Output element
     */
    showHelp(output) {
        const helpText = [
            'Available Docker Commands:',
            '',
            '  docker compose -f docker-compose.yml up -d',
            '    Start all Network Functions (one-click deployment)',
            '',
            '  docker compose -f docker-compose.yml up -d <service>',
            '    Start a single NF (e.g. oai-nrf, oai-amf, oai-smf, oai-upf)',
            '',
            '  docker compose -f docker-compose.yml down <service>',
            '    Stop and remove a single NF',
            '    Example: docker compose -f docker-compose.yml down oai-nrf',
            '',
            '  docker compose -f docker-compose-gnb.yml up -d',
            '    Start gNB (5G Base Station)',
            '',
            '  docker compose -f docker-compose-ue.yml up -d',
            '    Start both UE1 and UE2 (User Equipment)',
            '',
            '  docker compose -f docker-compose-ue.yml up -d oai-ue1',
            '    Start only UE1',
            '',
            '  docker compose -f docker-compose-ue.yml up -d oai-ue2',
            '    Start only UE2',
            '',
            '  docker ps',
            '    Show running Docker containers',
            '',
            '  docker network ls',
            '    List all Docker networks',
            '',
            '  docker network inspect <network-name>',
            '    Inspect a specific Docker network (bridge, host, none, oaiworkshop)',
            '',
            '  docker version',
            '    Show Docker version information',
            '',
            '  watch docker compose -f docker-compose.yml ps -a',
            '    Watch service status with auto-refresh (every 1 second)',
            '',
            '  docker compose -f docker-compose.yml down',
            '    Stop and remove all core network services',
            '',
            '  docker compose -f docker-compose-gnb.yml down',
            '    Stop and remove gNB',
            '',
            '  docker compose -f docker-compose-ue.yml down',
            '    Stop and remove all UEs',
            '',
            '  docker start <service-name>',
            '    Start a specific Network Function',
            '',
            '  docker stop <service-name>',
            '    Stop a specific Network Function',
            '',
            '  cls / clear',
            '    Clear the terminal screen',
            '',
            '  status / check',
            '    Check system status and list available NFs',
            '',
            '  ls',
            '    List files in the project directory',
            '',
            '  vi docker-compose.yml',
            '    View the docker-compose.yml file',
            '',
            '  exit',
            '    Close the terminal',
            ''
        ];

        helpText.forEach(line => {
            this.addTerminalLine(output, line, 'info');
        });
    }

    /**
     * Show ls output (list files in project directory)
     * @param {HTMLElement} output - Output element
     */
    showLS(output) {
        const files = [
            'docker-compose.yml',

        ];
        files.forEach(line => this.addTerminalLine(output, line, 'info'));
    }

    /**
     * Show docker-compose.yml file content (vi/cat)
     * @param {HTMLElement} output - Output element
     */
    showDockerComposeFile(output) {
        // Find the terminal window container to overlay the vi panel on
        const terminalWindow = document.getElementById('docker-terminal-window');
        if (!terminalWindow) return;

        const fileLines = [
            'services:',
            '  mysql:',
            '    container_name: "mysql"',
            '    image: ghcr.io/openairinterface/mysql:8.0',
            '    volumes:',
            '      - ./database/oai_db.sql:/docker-entrypoint-initdb.d/oai_db.sql',
            '      - ./healthscripts/mysql-healthcheck.sh:/tmp/mysql-healthcheck.sh',
            '    environment:',
            '      - TZ=Europe/Paris',
            '      - MYSQL_DATABASE=oai_db',
            '      - MYSQL_USER=test',
            '      - MYSQL_PASSWORD=test',
            '      - MYSQL_ROOT_PASSWORD=linux',
            '    healthcheck:',
            '      test: /bin/bash -c "/tmp/mysql-healthcheck.sh"',
            '      interval: 10s',
            '      timeout: 5s',
            '      retries: 30',
            '    networks:',
            '      public_net:',
            '        ipv4_address: 192.168.70.131',
            '  oai-udr:',
            '    container_name: "oai-udr"',
            '    image: ghcr.io/openairinterface/oai-udr:develop',
            '    expose:',
            '      - 80/tcp',
            '      - 8080/tcp',
            '    volumes:',
            '      - ./conf/config.yaml:/openair-udr/etc/config.yaml',
            '    environment:',
            '      - TZ=Europe/Paris',
            '    depends_on:',
            '      - mysql',
            '      - oai-nrf',
            '    networks:',
            '      public_net:',
            '        ipv4_address: 192.168.70.136',
            '  oai-udm:',
            '    container_name: "oai-udm"',
            '    image: ghcr.io/openairinterface/oai-udm:develop',
            '    expose:',
            '      - 80/tcp',
            '      - 8080/tcp',
            '    volumes:',
            '      - ./conf/config.yaml:/openair-udm/etc/config.yaml',
            '    environment:',
            '      - TZ=Europe/Paris',
            '    depends_on:',
            '      - oai-udr',
            '    networks:',
            '      public_net:',
            '        ipv4_address: 192.168.70.137',
            '  oai-ausf:',
            '    container_name: "oai-ausf"',
            '    image: ghcr.io/openairinterface/oai-ausf:develop',
            '    expose:',
            '      - 80/tcp',
            '      - 8080/tcp',
            '    volumes:',
            '      - ./conf/config.yaml:/openair-ausf/etc/config.yaml',
            '    environment:',
            '      - TZ=Europe/Paris',
            '    depends_on:',
            '      - oai-udm',
            '    networks:',
            '      public_net:',
            '        ipv4_address: 192.168.70.138',
            '  oai-nrf:',
            '    container_name: "oai-nrf"',
            '    image: ghcr.io/openairinterface/oai-nrf:develop',
            '    expose:',
            '      - 80/tcp',
            '      - 8080/tcp',
            '    volumes:',
            '      - ./conf/config.yaml:/openair-nrf/etc/config.yaml',
            '    environment:',
            '      - TZ=Europe/Paris',
            '    networks:',
            '      public_net:',
            '        ipv4_address: 192.168.70.130',
            '  oai-amf:',
            '    container_name: "oai-amf"',
            '    image: ghcr.io/openairinterface/oai-amf:develop',
            '    expose:',
            '      - 80/tcp',
            '      - 8080/tcp',
            '      - 38412/sctp',
            '    volumes:',
            '      - ./conf/config.yaml:/openair-amf/etc/config.yaml',
            '    environment:',
            '      - TZ=Europe/Paris',
            '    depends_on:',
            '      - mysql',
            '      - oai-nrf',
            '      - oai-ausf',
            '    networks:',
            '      public_net:',
            '        ipv4_address: 192.168.70.132',
            '  oai-smf:',
            '    container_name: "oai-smf"',
            '    image: ghcr.io/openairinterface/oai-smf:develop',
            '    expose:',
            '      - 80/tcp',
            '      - 8080/tcp',
            '      - 8805/udp',
            '    volumes:',
            '      - ./conf/config.yaml:/openair-smf/etc/config.yaml',
            '    environment:',
            '      - TZ=Europe/Paris',
            '    depends_on:',
            '      - oai-nrf',
            '      - oai-amf',
            '    networks:',
            '      public_net:',
            '        ipv4_address: 192.168.70.133',
            '  oai-upf:',
            '    container_name: "oai-upf"',
            '    image: ghcr.io/openairinterface/oai-upf:develop',
            '    expose:',
            '      - 80/tcp',
            '      - 2152/udp',
            '      - 8805/udp',
            '    volumes:',
            '      - ./conf/config.yaml:/openair-upf/etc/config.yaml',
            '    environment:',
            '      - TZ=Europe/Paris',
            '    depends_on:',
            '      - oai-nrf',
            '      - oai-smf',
            '    cap_add:',
            '      - NET_ADMIN',
            '      - SYS_ADMIN',
            '    cap_drop:',
            '      - ALL',
            '    privileged: true',
            '    networks:',
            '      public_net:',
            '        ipv4_address: 192.168.70.134',
            '  oai-traffic-server:',
            '    privileged: true',
            '    init: true',
            '    container_name: oai-ext-dn',
            '    image: ghcr.io/openairinterface/trf-gen-cn5g:latest',
            '    environment:',
            '      - UPF_FQDN=oai-upf',
            '      - UE_NETWORK=10.0.0.0/24',
            '      - USE_FQDN=yes',
            '    healthcheck:',
            '      test: /bin/bash -c "ip r | grep 12.1.1"',
            '      interval: 10s',
            '      timeout: 5s',
            '      retries: 5',
            '    networks:',
            '      public_net:',
            '        ipv4_address: 192.168.70.135',
            'networks:',
            '  public_net:',
            '    driver: bridge',
            '    name: oaiworkshop',
            '    ipam:',
            '      config:',
            '        - subnet: 192.168.70.128/26',
            '    driver_opts:',
            '      com.docker.network.bridge.name: "oaiworkshop"',
        ];

        // Build vi panel overlay
        const viPanel = document.createElement('div');
        viPanel.className = 'vi-panel';
        viPanel.id = 'vi-panel-overlay';

        // Content area with line numbers
        const contentArea = document.createElement('div');
        contentArea.className = 'vi-panel-content';

        fileLines.forEach((line, i) => {
            const row = document.createElement('div');
            row.className = 'vi-panel-line';
            row.innerHTML = `<span class="vi-line-number">${i + 1}</span><span class="vi-line-text">${this.escapeHtml(line)}</span>`;
            contentArea.appendChild(row);
        });

        // Status bar with a real input for vi commands
        const statusBar = document.createElement('div');
        statusBar.className = 'vi-panel-statusbar';
        statusBar.innerHTML = `
            <span class="vi-filename">"docker-compose.yml" [readonly] ${fileLines.length}L</span>
            <span class="vi-cmd-area">
                <input class="vi-cmd-input" type="text" spellcheck="false" autocomplete="off" placeholder=":q to quit">
                
            </span>
        `;

        viPanel.appendChild(contentArea);
        viPanel.appendChild(statusBar);
        terminalWindow.appendChild(viPanel);

        const cmdInput = statusBar.querySelector('.vi-cmd-input');
        const hintSpan = statusBar.querySelector('.vi-hint');

        const closeVi = () => {
            viPanel.remove();
            this.focusPromptInput();
        };

        // Focus the command input immediately
        setTimeout(() => cmdInput.focus(), 30);

        cmdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeVi();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = cmdInput.value.trim().replace(/^:+/, '');
                if (val === 'q' || val === 'q!' || val === 'wq' || val === 'wq!') {
                    closeVi();
                } else if (val) {
                    hintSpan.textContent = `E492: Not an editor command: ${val}`;
                    cmdInput.value = '';
                    setTimeout(() => { hintSpan.textContent = 'Esc to close'; }, 1500);
                }
                return;
            }
            // Scroll content with arrow keys while in command input
            if (e.key === 'ArrowDown') { contentArea.scrollTop += 20; }
            else if (e.key === 'ArrowUp') { contentArea.scrollTop -= 20; }
            else if (e.key === 'PageDown') { e.preventDefault(); contentArea.scrollTop += contentArea.clientHeight; }
            else if (e.key === 'PageUp') { e.preventDefault(); contentArea.scrollTop -= contentArea.clientHeight; }
        });

        // Also close on Escape from the panel itself (in case input loses focus)
        viPanel.setAttribute('tabindex', '-1');
        viPanel.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); closeVi(); }
        });
    }

    /**
     * Escape HTML entities
     */
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/ /g, '&nbsp;');
    }

/**
 * Normalize icon path to absolute URL
 * @param {string} iconPath - Icon path from JSON
 * @returns {string} Normalized absolute path
 */
normalizeIconPath(iconPath) {
    if (!iconPath) return null;
    if (iconPath.startsWith('http')) return iconPath;
    if (iconPath.startsWith('/')) return iconPath;
    return new URL(iconPath, window.location.href).href;
}



/**
 * Execute docker compose up -d (start all NFs)
 * @param {HTMLElement} output - Output element
 */
async dockerComposeUp(output) {
    if (!window.dataStore) {
        this.addTerminalLine(output, 'Error: DataStore not initialized. Please refresh the page.', 'error');
        return;
    }

    if (!window.nfManager) {
        this.addTerminalLine(output, 'Error: NFManager not initialized. Please refresh the page.', 'error');
        return;
    }

    const serviceNameMap = {
        'AMF': 'oai-amf', 'SMF': 'oai-smf', 'UPF': 'oai-upf', 'AUSF': 'oai-ausf',
        'UDM': 'oai-udm', 'UDR': 'oai-udr', 'NRF': 'oai-nrf', 'PCF': 'oai-pcf',
        'NSSF': 'oai-nssf', 'MySQL': 'mysql', 'ext-dn': 'oai-ext-dn'
    };

    // STEP 1: Auto-clean existing topology
    const existingNFs = window.dataStore.getAllNFs() || [];
    const coreNFTypes = ['NRF', 'AMF', 'SMF', 'UPF', 'AUSF', 'UDM', 'UDR', 'PCF', 'NSSF', 'MySQL', 'ext-dn'];
    const coreNFsToRemove = existingNFs.filter(nf => coreNFTypes.includes(nf.type));

    if (coreNFsToRemove.length > 0) {
        this.addTerminalLine(output, `[+] Removing existing services...`, 'warning');
        for (const nf of coreNFsToRemove) {
            const serviceName = serviceNameMap[nf.type] || nf.type.toLowerCase();
            this.addTerminalLine(output, ` ✔ Container ${serviceName.padEnd(16)} Removed${' '.repeat(20)}0.1s`, 'info');
            if (window.nfManager) {
                window.nfManager.deleteNetworkFunction(nf.id, { preserveBuses: false });
            } else {
                window.dataStore.removeNF(nf.id);
            }
            await this.delay(50);
        }

        // Remove buses and network
        if (window.dataStore) {
            const allBuses = window.dataStore.getAllBuses() || [];
            const allBusConnections = window.dataStore.getAllBusConnections() || [];
            allBusConnections.forEach(bc => window.dataStore.removeBusConnection(bc.id));
            allBuses.forEach(bus => window.dataStore.removeBus(bus.id));
        }

        if (this.oaiWorkshopNetworkExists) {
            this.addTerminalLine(output, ` ✔ Network oaiworkshop Removed${' '.repeat(20)}0.2s`, 'success');
            this.oaiWorkshopNetworkExists = false;
            this.oaiWorkshopCreatedTime = null;
            await this.delay(200);
        }

        this.addTerminalLine(output, '', 'blank');
    }

    // STEP 2: Load topology
    let topology = null;
    try {
        const response = await fetch('../one-click.json');
        if (!response.ok) throw new Error(`Failed to load one-click.json: ${response.statusText}`);
        
        topology = await response.json();
        const filteredTopology = this.filterTopology(topology);
        const importTime = Date.now();

        if (filteredTopology.nfs && Array.isArray(filteredTopology.nfs)) {
            filteredTopology.nfs.forEach(nf => {
                nf.createdAt = importTime;
                nf.status = 'stopped';
                nf.statusTimestamp = importTime;
                nf.icon = this.normalizeIconPath(nf.icon) || nf.icon;
            });
        }

        window.dataStore.importData(filteredTopology);
        
        // Load icons
        if (filteredTopology.nfs && Array.isArray(filteredTopology.nfs)) {
            for (const nf of filteredTopology.nfs) {
                if (nf.type === 'gNB' || nf.type === 'UE') continue;
                if (nf.icon && !nf.iconImage) {
                    const img = new Image();
                    img.onload = () => {
                        nf.iconImage = img;
                        if (window.canvasRenderer) window.canvasRenderer.render();
                    };
                    img.src = nf.icon;
                }
            }
        }

        if (window.canvasRenderer) window.canvasRenderer.render();

    } catch (error) {
        this.addTerminalLine(output, `❌ Failed to load topology: ${error.message}`, 'error');
        this.addTerminalLine(output, 'Falling back to default NF creation...', 'warning');
        this.addTerminalLine(output, '', 'blank');
        await this.createDefaultNFs(output);
    }

    let allNFs = window.dataStore.getAllNFs();
    allNFs = allNFs.filter(nf => nf.type !== 'gNB' && nf.type !== 'UE');

    // STEP 3: Create Service Bus
    if (topology && topology.buses && topology.buses.length > 0) {
        const busData = topology.buses[0];
        const existingBuses = window.dataStore.getAllBuses() || [];
        let bus = existingBuses.find(b => b.name === busData.name);

        if (!bus) {
            bus = {
                id: busData.id,
                name: busData.name,
                orientation: busData.orientation,
                position: busData.position,
                length: busData.length,
                thickness: busData.thickness || 8,
                color: busData.color || '#3498db',
                type: busData.type || 'service-bus',
                connections: []
            };
            window.dataStore.addBus(bus);
        }
    }

    const nfMap = {};
    allNFs.forEach(nf => { nfMap[nf.type] = nf; });

    // STEP 4: Inject MySQL DB config
    const mysqlNF = nfMap['MySQL'];
    if (mysqlNF) {
        const dbConfig = {
            MYSQL_IP: mysqlNF.config.ipAddress,
            MYSQL_PORT: mysqlNF.config.port,
            MYSQL_DATABASE: 'oai_db',
            MYSQL_USER: 'test',
            MYSQL_PASSWORD: 'test',
            dbHost: mysqlNF.config.ipAddress,
            dbPort: mysqlNF.config.port,
            dbName: 'oai_db',
            dbUser: 'test',
            dbPassword: 'test'
        };

        ['UDR', 'UDM', 'AUSF'].forEach(type => {
            if (nfMap[type]) {
                if (!nfMap[type].config) nfMap[type].config = {};
                Object.assign(nfMap[type].config, dbConfig);
                window.dataStore.updateNF(nfMap[type].id, nfMap[type]);
            }
        });
    }

    // STEP 5: Create bus connections
    if (topology && topology.busConnections && window.dataStore) {
        for (const busConnData of topology.busConnections) {
            const nf = window.dataStore.getNFById(busConnData.nfId);
            const bus = window.dataStore.getBusById(busConnData.busId);

            if (nf && bus && nf.type !== 'gNB' && nf.type !== 'UE') {
                const exists = (window.dataStore.getAllBusConnections() || []).some(c =>
                    c.nfId === nf.id && c.busId === bus.id
                );
                if (!exists) {
                    const busConnection = {
                        id: busConnData.id,
                        nfId: nf.id,
                        busId: bus.id,
                        type: busConnData.type || 'bus-connection',
                        interfaceName: busConnData.interfaceName,
                        protocol: busConnData.protocol || 'HTTP/2',
                        status: 'connected',
                        createdAt: busConnData.createdAt || Date.now()
                    };
                    window.dataStore.addBusConnection(busConnection);

                    if (!bus.connections.includes(nf.id)) {
                        bus.connections.push(nf.id);
                    }
                }
            }
        }
    }

    if (window.canvasRenderer) window.canvasRenderer.render();

    // STEP 6: Start all services
    const totalServices = allNFs.length + 1;
    this.addTerminalLine(output, `[+] Running ${totalServices}/${totalServices}`, 'info');
    this.addTerminalLine(output, ' ✔ Network oaiworkshop Created' + ' '.repeat(20) + '0.2s', 'success');
    this.oaiWorkshopNetworkExists = true;
    this.oaiWorkshopCreatedTime = Date.now();
    await this.delay(200);

    // Start MySQL FIRST
    if (mysqlNF) {
        await this.startServiceWithHealthCheck(mysqlNF, output, serviceNameMap, async () => {
            this.addTerminalLine(output, ' MySQL: Waiting for port 3306 to be ready...', 'info');
            await this.delay(2500);
            this.addTerminalLine(output, ' MySQL: Database oai_db initialized', 'success');
            await this.delay(1000);
            this.addTerminalLine(output, ' MySQL: Health check passed', 'success');
            return true;
        });
    }

    // Start remaining NFs
    const remainingOrder = ['NRF', 'UDR', 'UDM', 'AUSF', 'PCF', 'NSSF', 'AMF', 'SMF', 'UPF', 'ext-dn'];
    for (const type of remainingOrder) {
        const nf = nfMap[type];
        if (!nf) continue;

        const serviceName = serviceNameMap[nf.type] || nf.type.toLowerCase();
        const randomDelay = (Math.random() * 1.5 + 0.8).toFixed(1);
        this.addTerminalLine(output, ` ✔ Container ${serviceName.padEnd(16)} Started${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        nf.status = 'starting';
        nf.statusTimestamp = Date.now();
        window.dataStore.updateNF(nf.id, nf);

        if (window.logEngine) {
            window.logEngine.addLog(nf.id, 'INFO', `${nf.name} starting via docker compose`, {
                ipAddress: nf.config.ipAddress,
                port: nf.config.port,
                protocol: nf.config.httpProtocol,
                status: 'starting',
                source: 'docker-compose',
                dbHost: nf.config.dbHost
            });
        }

        if (nf.type === 'UDR' && mysqlNF) {
            this.addTerminalLine(output, ` UDR: Connecting to MySQL at ${mysqlNF.config.ipAddress}:3306...`, 'info');
            await this.delay(1500);
            this.addTerminalLine(output, ` UDR: Database connection established`, 'success');
        }

        await this.delay(2000);

        nf.status = 'stable';
        nf.statusTimestamp = Date.now();
        window.dataStore.updateNF(nf.id, nf);

        if (window.logEngine) {
            window.logEngine.addLog(nf.id, 'SUCCESS', `${nf.name} is now STABLE and ready for connections`, {
                previousStatus: 'starting',
                newStatus: 'stable',
                uptime: '2 seconds',
                readyForConnections: true,
                dbConnected: nf.config.dbHost ? true : undefined
            });
        }

        if (window.canvasRenderer) window.canvasRenderer.render();
    }

    this.addTerminalLine(output, '', 'blank');
    this.addTerminalLine(output, `✅ Started ${allNFs.length} Network Function(s)`, 'success');

    // STEP 7: Deploy interfaces - wrap in try/catch so terminal returns even if it fails
    try {
       
    } catch (err) {
        this.addTerminalLine(output, `⚠️ Interface deployment warning: ${err.message}`, 'warning');
        console.error('Interface deployment error:', err);
    }

    if (window.canvasRenderer) window.canvasRenderer.render();
    
    // CRITICAL: Always return so terminal creates new input line
    return;
}


// Helper: Start a service and wait for health check
async startServiceWithHealthCheck(nf, output, serviceNameMap, healthCheckFn = null) {
    const serviceName = serviceNameMap[nf.type] || nf.type.toLowerCase();
    const baseDelay = nf.type === 'MySQL' ? 3.5 : (Math.random() * 1.5 + 0.8);
    const randomDelay = baseDelay.toFixed(1);

    this.addTerminalLine(output, ` ✔ Container ${serviceName.padEnd(16)} Started${' '.repeat(20)}${randomDelay}s`, 'success');
    await this.delay(parseFloat(randomDelay) * 1000);

    nf.status = 'starting';
    nf.statusTimestamp = Date.now();
    window.dataStore.updateNF(nf.id, nf);

    if (window.logEngine) {
        window.logEngine.addLog(nf.id, 'INFO', `${nf.name} starting via docker compose`, {
            ipAddress: nf.config.ipAddress,
            port: nf.config.port,
            protocol: nf.config.httpProtocol,
            status: 'starting',
            source: 'docker-compose',
            dbHost: nf.config.dbHost
        });
    }

    if (healthCheckFn) {
        await healthCheckFn();
    } else {
        await this.delay(2000);
    }

    nf.status = 'stable';
    nf.statusTimestamp = Date.now();
    window.dataStore.updateNF(nf.id, nf);

    if (window.logEngine) {
        window.logEngine.addLog(nf.id, 'SUCCESS', `${nf.name} is now STABLE and ready for connections`, {
            previousStatus: 'starting',
            newStatus: 'stable',
            uptime: `${((Date.now() - nf.createdAt) / 1000).toFixed(0)} seconds`,
            readyForConnections: true,
            dbConnected: nf.config.dbHost ? true : undefined
        });
    }

    if (window.canvasRenderer) window.canvasRenderer.render();
}

// Helper: Start a service and wait for health check
async startServiceWithHealthCheck(nf, output, serviceNameMap, healthCheckFn = null) {
    const serviceName = serviceNameMap[nf.type] || nf.type.toLowerCase();
    const baseDelay = nf.type === 'MySQL' ? 3.5 : (Math.random() * 1.5 + 0.8);
    const randomDelay = baseDelay.toFixed(1);

    this.addTerminalLine(output, ` ✔ Container ${serviceName.padEnd(16)} Started${' '.repeat(20)}${randomDelay}s`, 'success');
    await this.delay(parseFloat(randomDelay) * 1000);

    nf.status = 'starting';
    nf.statusTimestamp = Date.now();
    window.dataStore.updateNF(nf.id, nf);

    if (window.logEngine) {
        window.logEngine.addLog(nf.id, 'INFO', `${nf.name} starting via docker compose`, {
            ipAddress: nf.config.ipAddress,
            port: nf.config.port,
            protocol: nf.config.httpProtocol,
            status: 'starting',
            source: 'docker-compose',
            dbHost: nf.config.dbHost
        });
    }

    if (healthCheckFn) {
        await healthCheckFn();
    } else {
        await this.delay(2000);
    }

    nf.status = 'stable';
    nf.statusTimestamp = Date.now();
    window.dataStore.updateNF(nf.id, nf);

    if (window.logEngine) {
        window.logEngine.addLog(nf.id, 'SUCCESS', `${nf.name} is now STABLE and ready for connections`, {
            previousStatus: 'starting',
            newStatus: 'stable',
            uptime: `${((Date.now() - nf.createdAt) / 1000).toFixed(0)} seconds`,
            readyForConnections: true,
            dbConnected: nf.config.dbHost ? true : undefined
        });
    }

    if (window.canvasRenderer) window.canvasRenderer.render();
}

    /**
     * Execute docker ps (show running containers)
     * @param {HTMLElement} output - Output element
     */
    async dockerPS(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        
        if (allNFs.length === 0) {
            this.addTerminalLine(output, 'No containers running.', 'info');
            return;
        }

        // Header
        this.addTerminalLine(output, 'CONTAINER ID   IMAGE                                          COMMAND                  CREATED       STATUS                 PORTS                                                   NAMES', 'info');
        this.addTerminalLine(output, '────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────', 'info');

        // Map NF types to Docker service names
        const serviceNameMap = {
            'AMF': 'oai-amf',
            'SMF': 'oai-smf',
            'UPF': 'oai-upf',
            'AUSF': 'oai-ausf',
            'UDM': 'oai-udm',
            'UDR': 'oai-udr',
            'NRF': 'oai-nrf',
            'PCF': 'oai-pcf',
            'NSSF': 'oai-nssf',
            'MySQL': 'mysql',
            'ext-dn': 'ext-dn',
            'gNB': 'oai-gnb',
            'UE': 'oai-ue'
        };

        // Image map
        const imageMap = {
            'AMF': 'ghcr.io/openairinterface/oai-amf:develop',
            'SMF': 'ghcr.io/openairinterface/oai-smf:develop',
            'UPF': 'ghcr.io/openairinterface/oai-upf:develop',
            'AUSF': 'ghcr.io/openairinterface/oai-ausf:develop',
            'UDM': 'ghcr.io/openairinterface/oai-udm:develop',
            'UDR': 'ghcr.io/openairinterface/oai-udr:develop',
            'NRF': 'ghcr.io/openairinterface/oai-nrf:develop',
            'PCF': 'ghcr.io/openairinterface/oai-pcf:develop',
            'NSSF': 'ghcr.io/openairinterface/oai-nssf:develop',
            'MySQL': 'ghcr.io/openairinterface/mysql:8.0',
            'ext-dn': 'ghcr.io/openairinterface/trf-gen-cn5g:latest',
            'gNB': 'ghcr.io/openairinterface/oai-gnb:develop',
            'UE': 'ghcr.io/openairinterface/oai-ue:develop'
        };

        allNFs.forEach((nf, index) => {
            const containerId = this.generateContainerId();
            const serviceName = serviceNameMap[nf.type] || `oai-${nf.type.toLowerCase()}`;
            const image = imageMap[nf.type] || `ghcr.io/openairinterface/oai-${nf.type.toLowerCase()}:develop`;
            const status = nf.status === 'stable' ? 'Up (healthy)' : 'Up (starting)';
            const ports = this.getPortsForNF(nf);
            
            // Calculate creation time
            const createdAt = nf.createdAt || nf.statusTimestamp || Date.now();
            const createdTime = this.formatCreationTime(createdAt);
            
            const line = `${containerId}   ${image.padEnd(45)} "${serviceName}"   ${createdTime.padEnd(13)} ${status.padEnd(20)} ${ports.padEnd(55)} ${serviceName}`;
            this.addTerminalLine(output, line, nf.status === 'stable' ? 'success' : 'warning');
        });
    }

    /**
     * Start watch mode for docker compose ps -a
     * @param {HTMLElement} output - Output element
     */
    startWatch(output, commandHistory, historyIndex) {
        if (this.isWatching) {
            this.addTerminalLine(output, 'Watch mode is already running. Use Ctrl+C to stop.', 'warning');
            return;
        }

        this.isWatching = true;

        // Hide the prompt line — real terminals don't show a prompt during watch
        if (this.activePromptLine) {
            this.activePromptLine.style.display = 'none';
        }

        // Attach Ctrl+C listener directly on the terminal content area
        const terminalContent = document.getElementById('docker-terminal-content');
        this._watchCtrlCHandler = (e) => {
            if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                this.stopWatch(output, commandHistory, historyIndex);
            }
        };
        if (terminalContent) {
            terminalContent.setAttribute('tabindex', '0');
            terminalContent.focus();
            terminalContent.addEventListener('keydown', this._watchCtrlCHandler);
        }

        // Render first frame
        this.showDockerComposePS(output);

        // Refresh every 1 second
        this.watchInterval = setInterval(() => {
            output.querySelectorAll('.watch-output-line').forEach(el => el.remove());
            this.showDockerComposePS(output);
            output.scrollTop = output.scrollHeight;
        }, 1000);
    }

    /**
     * Stop watch mode and restore prompt
     */
    stopWatch(output, commandHistory, historyIndex) {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
        }
        this.isWatching = false;

        // Remove Ctrl+C listener
        const terminalContent = document.getElementById('docker-terminal-content');
        if (terminalContent && this._watchCtrlCHandler) {
            terminalContent.removeEventListener('keydown', this._watchCtrlCHandler);
            this._watchCtrlCHandler = null;
        }

        // Only restore prompt if output/history provided (i.e. called from Ctrl+C)
        if (output) {
            // Remove all watch output lines
            output.querySelectorAll('.watch-output-line').forEach(el => el.remove());

            this.addTerminalLine(output, '', 'blank');
            this.addTerminalLine(output, `^C`, 'command');
            this.addTerminalLine(output, '', 'blank');

            // Remove old hidden prompt and create a fresh one
            if (this.activePromptLine) {
                this.activePromptLine.remove();
                this.activePromptLine = null;
            }
            this.createPromptLine(output, commandHistory || [], historyIndex || 0);
        }
    }

    /**
     * Show docker compose ps -a output (all lines tagged as watch-output-line)
     * @param {HTMLElement} output - Output element
     */
    showDockerComposePS(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const timestamp = new Date().toLocaleString();

        const addWatchLine = (text, type) => {
            this.addTerminalLine(output, text, type);
            // Tag the last added line so the interval can remove it
            const lines = output.querySelectorAll('.docker-terminal-line');
            if (lines.length) lines[lines.length - 1].classList.add('watch-output-line');
        };

        // Header with timestamp
        addWatchLine(`Every 1.0s: docker compose -f docker-compose.yml ps -a`, 'info');
        addWatchLine(`Timestamp: ${timestamp}`, 'info');
        addWatchLine('', 'blank');

        if (allNFs.length === 0) {
            addWatchLine('No services found.', 'info');
            return;
        }

        // Table header
        addWatchLine('NAME         IMAGE                                     COMMAND                  SERVICE              CREATED              STATUS                        PORTS', 'info');
        addWatchLine('════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════', 'info');

        // Service name map
        const serviceNameMap = {
            'AMF': 'oai-amf',
            'SMF': 'oai-smf',
            'UPF': 'oai-upf',
            'AUSF': 'oai-ausf',
            'UDM': 'oai-udm',
            'UDR': 'oai-udr',
            'NRF': 'oai-nrf',
            'PCF': 'oai-pcf',
            'NSSF': 'oai-nssf',
            'MySQL': 'mysql',
            'ext-dn': 'ext-dn',
            'gNB': 'oai-gnb',
            'UE': 'oai-ue'
        };

        const imageMap = {
            'AMF': 'oaisoftwarealliance/oai-amf:2024-june',
            'SMF': 'oaisoftwarealliance/oai-smf:2024-june',
            'UPF': 'oaisoftwarealliance/oai-upf:2024-june',
            'AUSF': 'oaisoftwarealliance/oai-ausf:2024-june',
            'UDM': 'oaisoftwarealliance/oai-udm:2024-june',
            'UDR': 'oaisoftwarealliance/oai-udr:2024-june',
            'NRF': 'oaisoftwarealliance/oai-nrf:2024-june',
            'PCF': 'oaisoftwarealliance/oai-pcf:2024-june',
            'NSSF': 'oaisoftwarealliance/oai-nssf:2024-june',
            'MySQL': 'mysql:8.0',
            'ext-dn': 'oaisoftwarealliance/trf-gen-cn5g:latest',
            'gNB': 'oaisoftwarealliance/oai-gnb:2024-june',
            'UE': 'oaisoftwarealliance/oai-ue:2024-june'
        };

        allNFs.forEach(nf => {
            const serviceName = serviceNameMap[nf.type] || `oai-${nf.type.toLowerCase()}`;
            const image = imageMap[nf.type] || `oaisoftwarealliance/oai-${nf.type.toLowerCase()}:2024-june`;
            
            // Calculate creation time
            const createdAt = nf.createdAt || nf.statusTimestamp || Date.now();
            const created = this.formatCreationTimeForWatch(createdAt);
            const status = nf.status === 'stable' 
                ? `Up ${created} (healthy)` 
                : `Up ${created} (starting)`;
            const ports = this.getPortsForNF(nf);

            const statusColor = nf.status === 'stable' ? 'success' : 'warning';
            const statusIcon = nf.status === 'stable' ? '🟢' : '🔴';

            const line = `${serviceName.padEnd(12)} ${image.padEnd(38)} "${serviceName}"   ${serviceName.padEnd(15)} ${created.padEnd(20)} ${status.padEnd(28)} ${ports}`;
            addWatchLine(`${statusIcon} ${line}`, statusColor);
        });
    }

    /**
     * Execute docker compose down (stop and remove all services)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeDown(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];

        if (allNFs.length === 0) {
            this.addTerminalLine(output, 'No services to stop.', 'info');
            return;
        }

        // Collect all NF IDs first (before deletion to avoid iteration issues)
        const nfIds = allNFs.map(nf => ({ id: nf.id, name: nf.name, type: nf.type }));

        // Show Docker Compose style output
        this.addTerminalLine(output, `[+] Running ${nfIds.length + 1}/${nfIds.length + 1}`, 'info');

        // Stop and remove each service
        for (const nfInfo of nfIds) {
            // Get service name
            const serviceNameMap = {
                'AMF': 'oai-amf', 'SMF': 'oai-smf', 'UPF': 'oai-upf', 'AUSF': 'oai-ausf',
                'UDM': 'oai-udm', 'UDR': 'oai-udr', 'NRF': 'oai-nrf', 'PCF': 'oai-pcf',
                'NSSF': 'oai-nssf', 'MySQL': 'mysql', 'ext-dn': 'oai-ext-dn'
            };
            const serviceName = serviceNameMap[nfInfo.type] || nfInfo.type.toLowerCase();
            
            // Random delay between 0.8s and 2.3s
            const randomDelay = (Math.random() * 1.5 + 0.8).toFixed(1); // 0.8s to 2.3s
            
            this.addTerminalLine(output, ` ✔ Container ${serviceName.padEnd(16)} Removed${' '.repeat(20)}${randomDelay}s`, 'success');
            await this.delay(parseFloat(randomDelay) * 1000); // Convert to milliseconds
            
            // Actually remove the NF (this also removes connections)
            if (window.nfManager) {
                window.nfManager.deleteNetworkFunction(nfInfo.id);
            } else if (window.dataStore) {
                // Fallback: use dataStore directly
                window.dataStore.removeNF(nfInfo.id);
            }
        }

        // Clear only bus connections, preserve the service bus line
        if (window.dataStore) {
            const allBusConnections = window.dataStore.getAllBusConnections() || [];
            
            if (allBusConnections.length > 0) {
                const busConnectionIds = allBusConnections.map(bc => bc.id);
                busConnectionIds.forEach(busConnId => {
                    window.dataStore.removeBusConnection(busConnId);
                });
            }
        }

        // Remove network
        this.addTerminalLine(output, ` ✔ Network oaiworkshop Removed${' '.repeat(20)}0.2s`, 'success');
        this.oaiWorkshopNetworkExists = false;
        this.oaiWorkshopCreatedTime = null;
        this.addTerminalLine(output, '', 'blank');

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-gnb.yml up -d (start gNB)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeGnbUp(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        this.addTerminalLine(output, '[+] up 1/1', 'info');

        // Check if gNB already exists
        let allNFs = window.dataStore?.getAllNFs() || [];
        let gnb = allNFs.find(nf => nf.type === 'gNB');

        if (!gnb) {
            // Try to load gNB spec from one-click.json topology
            let gnbSpec = null;
            let topology = null;
            try {
                const response = await fetch('../one-click.json');
                if (response.ok) {
                    topology = await response.json();
                    gnbSpec = topology.nfs?.find(nf => nf.type === 'gNB') || null;
                }
            } catch (error) {
                console.warn('Failed to load gNB from topology:', error);
            }

            const position = gnbSpec?.position
                || (window.nfManager?.calculateAutoPosition('gNB', 1) || { x: 200, y: 200 });

            // Create silently — no alert popup even if canvas already had a gNB
            gnb = this._createNFSilently('gNB', position, gnbSpec);

            if (gnb && gnbSpec) {
                gnb.name = gnbSpec.name;
                window.dataStore.updateNF(gnb.id, gnb);

                // Wire connections from topology
                if (topology?.connections) {
                    topology.connections.forEach(conn => {
                        if (conn.sourceId === gnbSpec.id || conn.targetId === gnbSpec.id) {
                            const currentNFs = window.dataStore.getAllNFs();
                            const sourceNF = conn.sourceId === gnbSpec.id ? gnb
                                : currentNFs.find(nf => nf.name === topology.nfs.find(n => n.id === conn.sourceId)?.name);
                            const targetNF = conn.targetId === gnbSpec.id ? gnb
                                : currentNFs.find(nf => nf.name === topology.nfs.find(n => n.id === conn.targetId)?.name);
                            if (sourceNF && targetNF) {
                                window.dataStore.addConnection({
                                    id: `conn-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
                                    sourceId: sourceNF.id,
                                    targetId: targetNF.id,
                                    interfaceName: conn.interfaceName,
                                    protocol: conn.protocol || 'HTTP/2',
                                    status: 'connected',
                                    isManual: true,
                                    showVisual: true
                                });
                            }
                        }
                    });
                }
            }
        } else {
            // gNB already on canvas — just restart it (no alert)
            this.addTerminalLine(output, ` ↻ Container oai-gnb already exists, restarting...`, 'info');
            gnb.status = 'starting';
            gnb.statusTimestamp = Date.now();
            window.dataStore.updateNF(gnb.id, gnb);
        }

        const randomDelay = (Math.random() * 0.3 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-gnb Created${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        if (gnb) {
            // Set to stable after 5 seconds
            setTimeout(() => {
                const updatedGnb = window.dataStore?.getNFById(gnb.id);
                if (updatedGnb) {
                    updatedGnb.status = 'stable';
                    updatedGnb.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedGnb.id, updatedGnb);
                    
                    if (window.logEngine) {
                        window.logEngine.addLog(updatedGnb.id, 'SUCCESS', 
                            `${updatedGnb.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }
                    
                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ue.yml up -d (start both UEs)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUeUp(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        
        let allNFs = window.dataStore?.getAllNFs() || [];
        const ueNames = ['oai-ue1', 'oai-ue2'];
        const createdUEs = [];
        
        // Try to load UEs from one-click.json topology
        let topologyUEs = [];
        try {
            const response = await fetch('../one-click.json');
            if (response.ok) {
                const topology = await response.json();
                topologyUEs = topology.nfs?.filter(nf => nf.type === 'UE') || [];
            }
        } catch (error) {
            console.warn('Failed to load UEs from topology:', error);
        }
        
        // Determine how many UEs to create (from topology or default 2)
        const ueCount = topologyUEs.length > 0 ? topologyUEs.length : 2;
        this.addTerminalLine(output, `[+] up ${ueCount}/${ueCount}`, 'info');

        // Load topology once for connection wiring
        let ueTopology = null;
        try {
            const topoResp = await fetch('../one-click.json');
            if (topoResp.ok) ueTopology = await topoResp.json();
        } catch (e) { console.warn('Failed to load topology for UE connections:', e); }

        for (let i = 0; i < ueCount; i++) {
            let ue = allNFs.find(nf => nf.type === 'UE' && nf.name === `UE-${i + 1}`);

            if (!ue) {
                const ueSpec = topologyUEs[i] || null;
                const position = ueSpec?.position
                    || (window.nfManager?.calculateAutoPosition('UE', i + 1) || { x: 300 + i * 120, y: 300 });

                // Create silently — no alert popup
                ue = this._createNFSilently('UE', position, ueSpec);

                if (ue) {
                    ue.name = ueSpec?.name || `UE-${i + 1}`;
                    window.dataStore.updateNF(ue.id, ue);
                    createdUEs.push(ue);

                    // Wire topology connections for this UE
                    if (ueSpec && ueTopology?.connections) {
                        ueTopology.connections.forEach(conn => {
                            if (conn.sourceId === ueSpec.id || conn.targetId === ueSpec.id) {
                                const currentNFs = window.dataStore.getAllNFs();
                                const sourceNF = conn.sourceId === ueSpec.id ? ue
                                    : currentNFs.find(nf => nf.name === ueTopology.nfs.find(n => n.id === conn.sourceId)?.name);
                                const targetNF = conn.targetId === ueSpec.id ? ue
                                    : currentNFs.find(nf => nf.name === ueTopology.nfs.find(n => n.id === conn.targetId)?.name);
                                if (sourceNF && targetNF) {
                                    window.dataStore.addConnection({
                                        id: `conn-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
                                        sourceId: sourceNF.id,
                                        targetId: targetNF.id,
                                        interfaceName: conn.interfaceName,
                                        protocol: conn.protocol || 'HTTP/2',
                                        status: 'connected',
                                        isManual: true,
                                        showVisual: true
                                    });
                                }
                            }
                        });
                    }
                }
            } else {
                // UE already on canvas — restart it silently
                this.addTerminalLine(output, ` ↻ Container ${ue.name} already exists, restarting...`, 'info');
                ue.status = 'starting';
                ue.statusTimestamp = Date.now();
                window.dataStore.updateNF(ue.id, ue);
                createdUEs.push(ue);
            }

            const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
            const ueName = i < ueNames.length ? ueNames[i] : `oai-ue${i + 1}`;
            this.addTerminalLine(output, `✔ Container ${ueName} Created${' '.repeat(20)}${randomDelay}s`, 'success');
            await this.delay(parseFloat(randomDelay) * 1000);
        }

        // Set UEs to stable after 5 seconds
        createdUEs.forEach(ue => {
            setTimeout(() => {
                const updatedUe = window.dataStore?.getNFById(ue.id);
                if (updatedUe) {
                    updatedUe.status = 'stable';
                    updatedUe.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedUe.id, updatedUe);
                    
                    if (window.logEngine) {
                        window.logEngine.addLog(updatedUe.id, 'SUCCESS', 
                            `${updatedUe.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }
                    
                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        });

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ran.yml up -d oai-ue1 (start UE1 only)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUe1Up(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        this.addTerminalLine(output, '[+] up 1/1', 'info');

        const allNFs = window.dataStore?.getAllNFs() || [];
        let ue1 = allNFs.find(nf => nf.type === 'UE' && nf.name === 'UE-1');

        if (!ue1) {
            const position = window.nfManager?.calculateAutoPosition('UE', 1) || { x: 300, y: 300 };
            // Silent create — no alert popup
            ue1 = this._createNFSilently('UE', position, null);
            if (ue1) {
                ue1.name = 'UE-1';
                window.dataStore.updateNF(ue1.id, ue1);
            }
        } else {
            // Already exists — restart silently
            this.addTerminalLine(output, ` ↻ Container oai-ue1 already exists, restarting...`, 'info');
            ue1.status = 'starting';
            ue1.statusTimestamp = Date.now();
            window.dataStore.updateNF(ue1.id, ue1);
        }

        const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-ue1 Created${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        if (ue1) {
            setTimeout(() => {
                const updatedUe = window.dataStore?.getNFById(ue1.id);
                if (updatedUe) {
                    updatedUe.status = 'stable';
                    updatedUe.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedUe.id, updatedUe);
                    
                    if (window.logEngine) {
                        window.logEngine.addLog(updatedUe.id, 'SUCCESS', 
                            `${updatedUe.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }
                    
                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ran.yml up -d oai-ue2 (start UE2 only)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUe2Up(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        this.addTerminalLine(output, '[+] up 1/1', 'info');

        const allNFs = window.dataStore?.getAllNFs() || [];
        let ue2 = allNFs.find(nf => nf.type === 'UE' && nf.name === 'UE-2');

        if (!ue2) {
            const position = window.nfManager?.calculateAutoPosition('UE', 2) || { x: 420, y: 300 };
            // Silent create — no alert popup
            ue2 = this._createNFSilently('UE', position, null);
            if (ue2) {
                ue2.name = 'UE-2';
                window.dataStore.updateNF(ue2.id, ue2);
            }
        } else {
            // Already exists — restart silently
            this.addTerminalLine(output, ` ↻ Container oai-ue2 already exists, restarting...`, 'info');
            ue2.status = 'starting';
            ue2.statusTimestamp = Date.now();
            window.dataStore.updateNF(ue2.id, ue2);
        }

        const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-ue2 Created${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        if (ue2) {
            setTimeout(() => {
                const updatedUe = window.dataStore?.getNFById(ue2.id);
                if (updatedUe) {
                    updatedUe.status = 'stable';
                    updatedUe.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedUe.id, updatedUe);
                    
                    if (window.logEngine) {
                        window.logEngine.addLog(updatedUe.id, 'SUCCESS', 
                            `${updatedUe.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }
                    
                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-gnb.yml down (stop gNB)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeGnbDown(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const gnb = allNFs.find(nf => nf.type === 'gNB');

        if (!gnb) {
            this.addTerminalLine(output, 'No gNB container to stop.', 'info');
            return;
        }

        this.addTerminalLine(output, '[+] Running 1/1', 'info');
        const randomDelay = (Math.random() * 0.3 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-gnb Removed${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        // Remove gNB
        if (window.nfManager) {
            window.nfManager.deleteNetworkFunction(gnb.id);
        } else if (window.dataStore) {
            window.dataStore.removeNF(gnb.id);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ue.yml down (stop all UEs)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUeDown(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const ues = allNFs.filter(nf => nf.type === 'UE');

        if (ues.length === 0) {
            this.addTerminalLine(output, 'No UE containers to stop.', 'info');
            return;
        }

        this.addTerminalLine(output, `[+] Running ${ues.length}/${ues.length}`, 'info');

        for (let i = 0; i < ues.length; i++) {
            const ue = ues[i];
            const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
            this.addTerminalLine(output, `✔ Container oai-ue${i + 1} Removed${' '.repeat(20)}${randomDelay}s`, 'success');
            await this.delay(parseFloat(randomDelay) * 1000);

            // Remove UE
            if (window.nfManager) {
                window.nfManager.deleteNetworkFunction(ue.id);
            } else if (window.dataStore) {
                window.dataStore.removeNF(ue.id);
            }
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Start a specific service
     * @param {string} serviceName - Service name to start
     * @param {HTMLElement} output - Output element
     */
    // ============================================
    // SINGLE NF COMMAND HELPERS
    // ============================================

    // Known service names for matching
    get _serviceNames() {
        return ['oai-nrf','oai-amf','oai-smf','oai-upf','oai-ausf','oai-udm','oai-udr',
                'oai-pcf','oai-nssf','mysql','oai-ext-dn','ext-dn','oai-gnb','oai-ue'];
    }

    _isSingleNFUp(cmd) {
        // Matches: docker compose -f <file>.yml up -d <service>
        // Must have a service name at the end (not just "up -d")
        const match = cmd.match(/^docker[\s-]compose\s+(?:-f\s+\S+\s+)?up\s+-d\s+(\S+)$/);
        if (!match) return false;
        const service = match[1];
        // Exclude the bare "up -d" (no service) — already handled above
        // Also exclude ue1/ue2 which have their own handlers
        return service !== '' && service !== 'oai-ue1' && service !== 'oai-ue2';
    }

    _extractSingleNFService(cmd) {
        // last token is the service name
        return cmd.trim().split(/\s+/).pop();
    }

    _isSingleNFDown(cmd) {
        // docker compose -f <any>.yml down <service>
        // docker compose -f <any>.yml rm -s -f <service>
        return /^docker[\s-]compose\s+(-f\s+\S+\s+)?(down|rm\s+-s\s+-f)\s+\S+$/.test(cmd);
    }

    _extractSingleNFServiceDown(cmd) {
        return cmd.trim().split(/\s+/).pop();
    }

    _serviceToNFType(serviceName) {
        const map = {
            'oai-nrf': 'NRF', 'oai-amf': 'AMF', 'oai-smf': 'SMF', 'oai-upf': 'UPF',
            'oai-ausf': 'AUSF', 'oai-udm': 'UDM', 'oai-udr': 'UDR', 'oai-pcf': 'PCF',
            'oai-nssf': 'NSSF', 'mysql': 'MySQL', 'oai-ext-dn': 'ext-dn', 'ext-dn': 'ext-dn',
            'oai-gnb': 'gNB', 'oai-ue': 'UE'
        };
        return map[serviceName.toLowerCase()] || null;
    }

    /**
     * Create an NF silently (no alert/popup) for use inside terminal commands.
     * Directly constructs the NF object and adds it to dataStore, bypassing
     * the duplicate-check alert inside nfManager.createNetworkFunction().
     *
     * @param {string} type      - NF type string (e.g. 'gNB', 'UE')
     * @param {Object} position  - {x, y} canvas position
     * @param {Object} [nfSpec]  - Optional topology spec to inherit config/name/icon from
     * @returns {Object|null} Created NF object, or null on failure
     */
    _createNFSilently(type, position, nfSpec = null) {
        if (!window.dataStore || !window.nfManager) return null;

        const nfDef = window.nfManager.getNFDefinition(type);
        const counter = (window.nfManager.nfCounters[type] || 0) + 1;
        window.nfManager.nfCounters[type] = counter;

        const nf = {
            id: `${type.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            type: type,
            name: nfSpec?.name || `${type}-${counter}`,
            position: position || { x: 200, y: 200 },
            color: nfSpec?.color || nfDef.color,
            icon: nfSpec?.icon || nfDef.icon || null,
            iconImage: null,
            status: 'starting',
            statusTimestamp: Date.now(),
            createdAt: Date.now(),
            config: nfSpec?.config
                ? { ...(nfSpec.config) }
                : {
                    ipAddress: window.nfManager.generateUniqueIPAddress(),
                    port: window.nfManager.generateUniquePort(),
                    capacity: 1000,
                    load: 0,
                    httpProtocol: window.globalHTTPProtocol || 'HTTP/2'
                }
        };

        // Load icon image asynchronously
        if (nf.icon) {
            const img = new Image();
            img.onload = () => { nf.iconImage = img; window.canvasRenderer?.render(); };
            img.src = nf.icon;
        }

        window.dataStore.addNF(nf);
        window.canvasRenderer?.render();

        // Trigger log engine startup logs
        if (window.logEngine) window.logEngine.onNFAdded(nf);

        return nf;
    }

    /**
     * Start a single NF via docker compose up -d <service>
     */
    async dockerComposeSingleUp(serviceName, output) {
        const nfType = this._serviceToNFType(serviceName);
        if (!nfType) {
            this.addTerminalLine(output, `Unknown service: ${serviceName}`, 'error');
            this.addTerminalLine(output, `Known services: oai-nrf, oai-amf, oai-smf, oai-upf, oai-ausf, oai-udm, oai-udr, oai-pcf, oai-nssf, mysql, oai-ext-dn, oai-gnb, oai-ue`, 'info');
            return;
        }

        const allNFs = window.dataStore?.getAllNFs() || [];
        let nf = allNFs.find(n => n.type === nfType);

        // If NF doesn't exist on canvas yet, create it from one-click.json topology
        if (!nf) {
            try {
                const resp = await fetch('../one-click.json');
                const topology = await resp.json();
                const nfSpec = topology.nfs.find(n => n.type === nfType);
                if (!nfSpec) {
                    this.addTerminalLine(output, `No topology definition found for ${nfType}`, 'error');
                    return;
                }
                nf = {
                    id: `${nfType.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
                    type: nfSpec.type,
                    name: nfSpec.name,
                    position: { ...nfSpec.position },
                    color: nfSpec.color,
                    icon: nfSpec.icon,
                    iconImage: null,
                    status: 'starting',
                    statusTimestamp: Date.now(),
                    createdAt: Date.now(),
                    config: { ...nfSpec.config }
                };
                if (nf.icon) {
                    const img = new Image();
                    img.onload = () => { nf.iconImage = img; window.canvasRenderer?.render(); };
                    img.src = nf.icon;
                }
                window.dataStore.addNF(nf);
                window.canvasRenderer?.render();
            } catch (e) {
                this.addTerminalLine(output, `Failed to load topology: ${e.message}`, 'error');
                return;
            }
        } else if (nf.status === 'stable') {
            this.addTerminalLine(output, `Container ${serviceName} is already running (healthy).`, 'warning');
            return;
        }

        // Create network first if it doesn't exist (like real docker compose)
        const networkCount = this.oaiWorkshopNetworkExists ? 1 : 2;
        this.addTerminalLine(output, `[+] Running ${networkCount}/${networkCount}`, 'info');

        if (!this.oaiWorkshopNetworkExists) {
            await this.delay(200);
            this.addTerminalLine(output, ` ✔ Network oaiworkshop Created` + ' '.repeat(20) + '0.2s', 'success');
            this.oaiWorkshopNetworkExists = true;
            this.oaiWorkshopCreatedTime = Date.now();
        }

        const delay = (Math.random() * 1.5 + 0.8).toFixed(1);
        this.addTerminalLine(output, ` ✔ Container ${serviceName.padEnd(16)} Started${' '.repeat(20)}${delay}s`, 'success');
        await this.delay(parseFloat(delay) * 1000);

        nf.status = 'starting';
        nf.statusTimestamp = Date.now();
        window.dataStore.updateNF(nf.id, nf);

        if (window.logEngine) {
            window.logEngine.addLog(nf.id, 'INFO', `${nf.name} starting via docker compose`, {
                service: serviceName, status: 'starting', source: 'docker-compose'
            });
        }

        setTimeout(() => {
            const fresh = window.dataStore?.getNFById(nf.id);
            if (fresh) {
                fresh.status = 'stable';
                fresh.statusTimestamp = Date.now();
                window.dataStore.updateNF(fresh.id, fresh);
                if (window.logEngine) {
                    window.logEngine.addLog(fresh.id, 'SUCCESS',
                        `${fresh.name} is now STABLE and ready for connections`, {
                        status: 'stable', uptime: '5 seconds'
                    });
                }
                window.canvasRenderer?.render();
            }
        }, 5000);

        window.canvasRenderer?.render();
    }

    /**
     * Stop/remove a single NF via docker compose down <service>
     */
    async dockerComposeSingleDown(serviceName, output) {
        const nfType = this._serviceToNFType(serviceName);
        if (!nfType) {
            this.addTerminalLine(output, `Unknown service: ${serviceName}`, 'error');
            return;
        }

        const allNFs = window.dataStore?.getAllNFs() || [];
        const nf = allNFs.find(n => n.type === nfType);

        if (!nf) {
            this.addTerminalLine(output, `Service '${serviceName}' is not running.`, 'warning');
            return;
        }

        this.addTerminalLine(output, `[+] Running 1/1`, 'info');
        const delay = (Math.random() * 0.8 + 0.3).toFixed(1);
        this.addTerminalLine(output, ` ✔ Container ${serviceName.padEnd(16)} Removed${' '.repeat(20)}${delay}s`, 'success');
        await this.delay(parseFloat(delay) * 1000);

        if (window.logEngine) {
            window.logEngine.addLog(nf.id, 'INFO', `${nf.name} stopped via docker compose`, {
                service: serviceName, source: 'docker-compose'
            });
        }

        window.dataStore.removeNF(nf.id);
        window.canvasRenderer?.render();
    }

    /**
     * Start a specific service
     * @param {string} serviceName - Service name to start
     * @param {HTMLElement} output - Output element
     */
    async dockerStart(serviceName, output) {
        if (!serviceName) {
            this.addTerminalLine(output, 'Usage: docker start <service-name>', 'error');
            return;
        }

        // Find NF by service name
        const allNFs = window.dataStore?.getAllNFs() || [];
        const serviceNameMap = {
            'oai-amf': 'AMF',
            'oai-smf': 'SMF',
            'oai-upf': 'UPF',
            'oai-ausf': 'AUSF',
            'oai-udm': 'UDM',
            'oai-udr': 'UDR',
            'oai-nrf': 'NRF',
            'oai-pcf': 'PCF',
            'oai-nssf': 'NSSF',
            'mysql': 'MySQL',
            'ext-dn': 'ext-dn',
            'oai-gnb': 'gNB',
            'oai-ue': 'UE'
        };

        const nfType = serviceNameMap[serviceName.toLowerCase()];
        const nf = allNFs.find(n => n.type === nfType);

        if (!nf) {
            this.addTerminalLine(output, `Service '${serviceName}' not found.`, 'error');
            return;
        }

        this.addTerminalLine(output, `Starting ${nf.name}...`, 'info');

        // Set creation timestamp if not already set
        if (!nf.createdAt) {
            nf.createdAt = Date.now();
        }

        nf.status = 'starting';
        nf.statusTimestamp = Date.now();
        window.dataStore.updateNF(nf.id, nf);

        // Log the start event immediately
        if (window.logEngine) {
            window.logEngine.addLog(nf.id, 'INFO',
                `▶ ${nf.name} is STARTING up`,
                {
                    previousStatus: 'stopped',
                    newStatus: 'starting',
                    startedBy: 'docker start',
                    service: serviceName,
                    timestamp: new Date().toISOString()
                }
            );
        }

        // Render immediately to show orange dot
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }

        this.addTerminalLine(output, `${nf.name} starting... (will be stable in ~5 seconds)`, 'success');

        // After 5 seconds, transition to stable
        setTimeout(() => {
            const fresh = window.dataStore?.getNFById(nf.id);
            if (fresh) {
                fresh.status = 'stable';
                fresh.statusTimestamp = Date.now();
                window.dataStore.updateNF(fresh.id, fresh);

                // Log the stable event
                if (window.logEngine) {
                    window.logEngine.addLog(fresh.id, 'SUCCESS',
                        `✅ ${fresh.name} is now STABLE and ready for connections`,
                        {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds',
                            readyForConnections: true
                        }
                    );
                }

                if (window.canvasRenderer) {
                    window.canvasRenderer.render();
                }
            }
        }, 5000);
    }

    /**
     * Stop a specific service
     * @param {string} serviceName - Service name to stop
     * @param {HTMLElement} output - Output element
     */
    async dockerStop(serviceName, output) {
        if (!serviceName) {
            this.addTerminalLine(output, 'Usage: docker stop <service-name>', 'error');
            return;
        }

        // Find NF by service name
        const allNFs = window.dataStore?.getAllNFs() || [];
        const serviceNameMap = {
            'oai-amf': 'AMF',
            'oai-smf': 'SMF',
            'oai-upf': 'UPF',
            'oai-ausf': 'AUSF',
            'oai-udm': 'UDM',
            'oai-udr': 'UDR',
            'oai-nrf': 'NRF',
            'oai-pcf': 'PCF',
            'oai-nssf': 'NSSF',
            'mysql': 'MySQL',
            'ext-dn': 'ext-dn',
            'oai-gnb': 'gNB',
            'oai-ue': 'UE'
        };

        const nfType = serviceNameMap[serviceName.toLowerCase()];
        const nf = allNFs.find(n => n.type === nfType);

        if (!nf) {
            this.addTerminalLine(output, `Service '${serviceName}' not found.`, 'error');
            return;
        }

        this.addTerminalLine(output, `Stopping ${nf.name}...`, 'info');

        nf.status = 'stopped';
        nf.statusTimestamp = Date.now();
        window.dataStore.updateNF(nf.id, nf);

        // Log the stop event so it appears in the NF log panel
        if (window.logEngine) {
            window.logEngine.addLog(nf.id, 'ERROR',
                `⏹ ${nf.name} has been STOPPED`,
                {
                    previousStatus: 'stable',
                    newStatus: 'stopped',
                    stoppedBy: 'docker stop',
                    service: serviceName,
                    timestamp: new Date().toISOString()
                }
            );
        }

        this.addTerminalLine(output, `${nf.name} stopped`, 'success');

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Add line to terminal output
     * @param {HTMLElement} output - Output element
     * @param {string} text - Text to add
     * @param {string} type - Line type (command, info, error, success, warning, blank)
     */
    addTerminalLine(output, text, type = 'normal') {
        const line = document.createElement('div');
        line.className = `docker-terminal-line docker-terminal-${type}`;
        line.innerHTML = text || '&nbsp;';
        output.appendChild(line);
        
        // Auto-scroll to bottom
        output.scrollTop = output.scrollHeight;
    }

    /**
     * Generate container ID
     * @returns {string} Random container ID
     */
    generateContainerId() {
        const chars = '0123456789abcdef';
        let id = '';
        for (let i = 0; i < 12; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

    /**
     * Get ports for NF
     * @param {Object} nf - Network Function
     * @returns {string} Ports string
     */
    getPortsForNF(nf) {
        const portMap = {
            'AMF': '80/tcp, 8080/tcp, 9090/tcp, 38412/sctp',
            'SMF': '80/tcp, 8080/tcp, 8805/udp',
            'UPF': '2152/udp, 8805/udp',
            'AUSF': '80/tcp, 8080/tcp',
            'UDM': '80/tcp, 8080/tcp',
            'UDR': '80/tcp, 8080/tcp',
            'NRF': '80/tcp, 8080/tcp, 9090/tcp',
            'PCF': '80/tcp, 8080/tcp',
            'NSSF': '80/tcp, 8080/tcp',
            'MySQL': '3306/tcp, 33060/tcp',
            'gNB': '2152/udp, 38412/sctp',
            'UE': '2152/udp'
        };

        return portMap[nf.type] || `${nf.config.port}/tcp`;
    }

    /**
     * Create default NFs as fallback
     * @param {HTMLElement} output - Output element
     */
    async createDefaultNFs(output) {
        const defaultNFs = this.getDefaultNFConfigurations();
        const creationTime = Date.now();
        
        for (const nfConfig of defaultNFs) {
            // Calculate position for the NF
            const position = window.nfManager.calculateAutoPosition(nfConfig.type, 1);
            
            // Create NF using NFManager
            const nf = window.nfManager.createNetworkFunction(nfConfig.type, position);
            
            if (nf) {
                // Override with default configuration
                nf.config.ipAddress = nfConfig.ipAddress;
                nf.config.port = nfConfig.port;
                nf.config.httpProtocol = nfConfig.httpProtocol || 'HTTP/2';
                
                // Set creation timestamp
                nf.createdAt = creationTime;
                
                // Update in data store
                window.dataStore.updateNF(nf.id, nf);
                
                await this.delay(200); // Small delay between creations
            }
        }
    }

    /**
     * Filter topology to exclude gNB and UE, and remove direct connections between Service Bus NFs
     * @param {Object} topology - Topology object
     * @returns {Object} Filtered topology
     */
    filterTopology(topology) {
        const filtered = JSON.parse(JSON.stringify(topology)); // Deep clone
        
        // Filter NFs - exclude gNB and UE
        if (filtered.nfs && Array.isArray(filtered.nfs)) {
            filtered.nfs = filtered.nfs.filter(nf => 
                nf.type !== 'gNB' && nf.type !== 'UE'
            );
        }
        
        // Get all NF IDs connected to Service Bus
        const serviceBusNFIds = new Set();
        if (filtered.buses && Array.isArray(filtered.buses)) {
            filtered.buses.forEach(bus => {
                if (bus.connections && Array.isArray(bus.connections)) {
                    bus.connections.forEach(nfId => {
                        serviceBusNFIds.add(nfId);
                    });
                }
            });
        }
        
        // Also get from busConnections
        if (filtered.busConnections && Array.isArray(filtered.busConnections)) {
            filtered.busConnections.forEach(busConn => {
                serviceBusNFIds.add(busConn.nfId);
            });
        }
        
        // Filter connections - remove:
        // 1. Connections involving gNB or UE
        // 2. Direct connections between NFs that are both on the Service Bus
        if (filtered.connections && Array.isArray(filtered.connections)) {
            const excludedNFIds = new Set();
            if (topology.nfs) {
                topology.nfs.forEach(nf => {
                    if (nf.type === 'gNB' || nf.type === 'UE') {
                        excludedNFIds.add(nf.id);
                    }
                });
            }
            
            filtered.connections = filtered.connections.filter(conn => {
                // Remove connections involving gNB or UE
                if (excludedNFIds.has(conn.sourceId) || excludedNFIds.has(conn.targetId)) {
                    return false;
                }
                
                // Remove direct connections between NFs that are both on Service Bus
                // Keep connections like N4 (UPF-SMF), N6 (ext-dn-UPF), MySQL-UDR
                // These are not Service Bus connections or are different interface types
                const bothOnServiceBus = serviceBusNFIds.has(conn.sourceId) && 
                                        serviceBusNFIds.has(conn.targetId);
                
                if (bothOnServiceBus) {
                    // Check if it's a Service Bus interface (Nnrf, Namf, etc.)
                    const serviceBusInterfaces = [
                        'Nnrf_NFManagement', 'Nnrf_NFDiscovery', 'Nnrf',
                        'Namf', 'Nsmf', 'Nausf', 'Nudm', 'Npcf', 'Nnssf', 'Nudr'
                    ];
                    
                    const isServiceBusInterface = serviceBusInterfaces.some(iface => 
                        conn.interfaceName?.includes(iface) || conn.interfaceName === iface
                    );
                    
                    // Remove if it's a Service Bus interface connection
                    if (isServiceBusInterface) {
                        return false;
                    }
                }
                
                return true;
            });
        }
        
        // Filter bus connections - remove bus connections for gNB and UE
        if (filtered.busConnections && Array.isArray(filtered.busConnections)) {
            const excludedNFIds = new Set();
            if (topology.nfs) {
                topology.nfs.forEach(nf => {
                    if (nf.type === 'gNB' || nf.type === 'UE') {
                        excludedNFIds.add(nf.id);
                    }
                });
            }
            
            filtered.busConnections = filtered.busConnections.filter(busConn => 
                !excludedNFIds.has(busConn.nfId)
            );
        }
        
        // Update bus connections list
        if (filtered.buses && Array.isArray(filtered.buses)) {
            filtered.buses.forEach(bus => {
                if (bus.connections && Array.isArray(bus.connections)) {
                    const excludedNFIds = new Set();
                    if (topology.nfs) {
                        topology.nfs.forEach(nf => {
                            if (nf.type === 'gNB' || nf.type === 'UE') {
                                excludedNFIds.add(nf.id);
                            }
                        });
                    }
                    bus.connections = bus.connections.filter(nfId => !excludedNFIds.has(nfId));
                }
            });
        }
        
        return filtered;
    }

    /**
     * Get default NF configurations for one-click deployment
     * @returns {Array} Array of default NF configurations
     */
    getDefaultNFConfigurations() {
        return [
            { type: 'NRF', ipAddress: '192.168.1.10', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'AMF', ipAddress: '192.168.1.20', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'SMF', ipAddress: '192.168.1.30', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'UPF', ipAddress: '192.168.1.40', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'AUSF', ipAddress: '192.168.1.50', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'UDM', ipAddress: '192.168.1.60', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'UDR', ipAddress: '192.168.1.70', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'PCF', ipAddress: '192.168.1.80', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'NSSF', ipAddress: '192.168.1.90', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'MySQL', ipAddress: '192.168.1.100', port: 3306, httpProtocol: 'HTTP/2' }
        ];
    }

    /**
     * Format creation time for docker ps command
     * @param {number} timestamp - Creation timestamp
     * @returns {string} Formatted time string
     */
    formatCreationTime(timestamp) {
        if (!timestamp) return '3 weeks ago';
        
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (seconds < 60) {
            return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
        } else if (minutes < 60) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (hours < 24) {
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else if (days < 7) {
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        } else if (days < 30) {
            const weeks = Math.floor(days / 7);
            return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
        } else {
            const months = Math.floor(days / 30);
            return `${months} month${months !== 1 ? 's' : ''} ago`;
        }
    }

    /**
     * Format creation time for watch command (docker compose ps -a)
     * @param {number} timestamp - Creation timestamp
     * @returns {string} Formatted time string
     */
    formatCreationTimeForWatch(timestamp) {
        if (!timestamp) return 'About a minute ago';
        
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        
        if (seconds < 30) {
            return 'Just now';
        } else if (seconds < 60) {
            return 'About a minute ago';
        } else if (minutes === 1) {
            return 'About a minute ago';
        } else if (minutes < 60) {
            return `About ${minutes} minutes ago`;
        } else {
            const hours = Math.floor(minutes / 60);
            if (hours === 1) {
                return 'About an hour ago';
            } else if (hours < 24) {
                return `About ${hours} hours ago`;
            } else {
                const days = Math.floor(hours / 24);
                if (days === 1) {
                    return 'About a day ago';
                } else {
                    return `About ${days} days ago`;
                }
            }
        }
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Setup window controls (drag, resize, minimize, maximize)
     * @param {HTMLElement} terminalModal - Terminal modal element
     */
    setupWindowControls(terminalModal) {
        const terminalWindow = document.getElementById('docker-terminal-window');
        const titlebar = document.getElementById('docker-terminal-titlebar');
        const minimizeBtn = document.getElementById('docker-terminal-minimize');
        const maximizeBtn = document.getElementById('docker-terminal-maximize');
        const resizeHandle = document.getElementById('docker-terminal-resize-handle');

        if (!terminalWindow || !titlebar) return;

        // Dragging functionality
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let windowStartX = 0;
        let windowStartY = 0;

        titlebar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.docker-terminal-btn')) return; // Don't drag when clicking buttons
            if (this.terminalState.isMaximized) return; // Don't drag when maximized

            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = terminalWindow.getBoundingClientRect();
            windowStartX = rect.left;
            windowStartY = rect.top;

            titlebar.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            const newX = windowStartX + deltaX;
            const newY = windowStartY + deltaY;

            // Keep window within viewport bounds
            const maxX = window.innerWidth - terminalWindow.offsetWidth;
            const maxY = window.innerHeight - terminalWindow.offsetHeight;

            this.terminalState.x = Math.max(0, Math.min(newX, maxX));
            this.terminalState.y = Math.max(0, Math.min(newY, maxY));

            terminalWindow.style.left = this.terminalState.x + 'px';
            terminalWindow.style.top = this.terminalState.y + 'px';
            terminalWindow.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                titlebar.style.cursor = 'grab';
                this.saveTerminalState();
            }
        });

        // Resizing functionality
        let isResizing = false;
        let resizeStartX = 0;
        let resizeStartY = 0;
        let startWidth = 0;
        let startHeight = 0;

        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', (e) => {
                if (this.terminalState.isMaximized) return;

                isResizing = true;
                resizeStartX = e.clientX;
                resizeStartY = e.clientY;
                startWidth = terminalWindow.offsetWidth;
                startHeight = terminalWindow.offsetHeight;

                e.preventDefault();
                e.stopPropagation();
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const deltaX = e.clientX - resizeStartX;
            const deltaY = e.clientY - resizeStartY;

            const newWidth = Math.max(400, Math.min(startWidth + deltaX, window.innerWidth - 100));
            const newHeight = Math.max(300, Math.min(startHeight + deltaY, window.innerHeight - 100));

            this.terminalState.width = newWidth;
            this.terminalState.height = newHeight;

            terminalWindow.style.width = newWidth + 'px';
            terminalWindow.style.height = newHeight + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                this.saveTerminalState();
            }
        });

        // Minimize button
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                this.minimizeTerminal(terminalWindow);
            });
        }

        // Maximize button
        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', () => {
                this.toggleMaximize(terminalWindow);
            });
        }

        // Double-click titlebar to maximize/restore
        titlebar.addEventListener('dblclick', (e) => {
            if (e.target.closest('.docker-terminal-btn')) return;
            this.toggleMaximize(terminalWindow);
        });

        // Set cursor for titlebar
        titlebar.style.cursor = 'grab';
    }

    /**
     * Minimize terminal window
     * @param {HTMLElement} terminalWindow - Terminal window element
     */
    minimizeTerminal(terminalWindow) {
        this.terminalState.isMinimized = !this.terminalState.isMinimized;

        if (this.terminalState.isMinimized) {
            // Just hide the content, don't remove it
            terminalWindow.style.height = '35px';
            const content = document.getElementById('docker-terminal-content');
            if (content) content.style.display = 'none';
            const resizeHandle = document.getElementById('docker-terminal-resize-handle');
            if (resizeHandle) resizeHandle.style.display = 'none';
        } else {
            // Restore the content
            terminalWindow.style.height = this.terminalState.height + 'px';
            const content = document.getElementById('docker-terminal-content');
            if (content) content.style.display = 'flex';
            const resizeHandle = document.getElementById('docker-terminal-resize-handle');
            if (resizeHandle) resizeHandle.style.display = 'block';
        }

        this.saveTerminalState();
    }

    /**
     * Toggle maximize/restore terminal window
     * @param {HTMLElement} terminalWindow - Terminal window element
     */
    toggleMaximize(terminalWindow) {
        this.terminalState.isMaximized = !this.terminalState.isMaximized;
        const maximizeBtn = document.getElementById('docker-terminal-maximize');

        if (this.terminalState.isMaximized) {
            // Save current position before maximizing
            if (!terminalWindow.style.left) {
                const rect = terminalWindow.getBoundingClientRect();
                this.terminalState.x = rect.left;
                this.terminalState.y = rect.top;
            }

            terminalWindow.style.left = '0';
            terminalWindow.style.top = '0';
            terminalWindow.style.width = '100vw';
            terminalWindow.style.height = '100vh';
            terminalWindow.style.transform = 'none';
            terminalWindow.style.borderRadius = '0';

            if (maximizeBtn) maximizeBtn.textContent = '❐';
        } else {
            // Restore previous position and size
            terminalWindow.style.width = this.terminalState.width + 'px';
            terminalWindow.style.height = this.terminalState.height + 'px';
            terminalWindow.style.borderRadius = '8px 8px 0 0';

            if (this.terminalState.x !== null && this.terminalState.y !== null) {
                terminalWindow.style.left = this.terminalState.x + 'px';
                terminalWindow.style.top = this.terminalState.y + 'px';
                terminalWindow.style.transform = 'none';
            } else {
                terminalWindow.style.left = '';
                terminalWindow.style.top = '';
                terminalWindow.style.transform = '';
            }

            if (maximizeBtn) maximizeBtn.textContent = '□';
        }

        this.saveTerminalState();
    }

    /**
     * Apply saved terminal state
     */
    applyTerminalState() {
        const terminalWindow = document.getElementById('docker-terminal-window');
        if (!terminalWindow) return;

        // Load saved state from localStorage
        const savedState = localStorage.getItem('dockerTerminalState');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                this.terminalState = { ...this.terminalState, ...state };
            } catch (e) {
                console.warn('Failed to load terminal state:', e);
            }
        }

        // Apply size
        terminalWindow.style.width = this.terminalState.width + 'px';
        terminalWindow.style.height = this.terminalState.height + 'px';

        // Apply position if saved
        if (this.terminalState.x !== null && this.terminalState.y !== null) {
            terminalWindow.style.left = this.terminalState.x + 'px';
            terminalWindow.style.top = this.terminalState.y + 'px';
            terminalWindow.style.transform = 'none';
        }

        // Apply maximized state
        if (this.terminalState.isMaximized) {
            this.toggleMaximize(terminalWindow);
        }

        // Apply minimized state
        if (this.terminalState.isMinimized) {
            this.minimizeTerminal(terminalWindow);
        }
    }

    /**
     * Save terminal state to localStorage
     */
    saveTerminalState() {
        try {
            localStorage.setItem('dockerTerminalState', JSON.stringify(this.terminalState));
        } catch (e) {
            console.warn('Failed to save terminal state:', e);
        }
    }

    /**
     * Docker network ls command
     * @param {HTMLElement} output - Output element
     */
    dockerNetworkLS(output) {
        this.addTerminalLine(output, 'NETWORK ID     NAME          DRIVER    SCOPE', 'info');
        
        // Default networks
        this.addTerminalLine(output, 'df33e4a6502d   bridge        bridge    local', 'info');
        this.addTerminalLine(output, '902c1fcc4369   host          host      local', 'info');
        this.addTerminalLine(output, '0c712814bbb0   none          null      local', 'info');
        
        // OAI workshop network (if exists)
        if (this.oaiWorkshopNetworkExists) {
            this.addTerminalLine(output, `${this.oaiWorkshopNetworkId}   oaiworkshop   bridge    local`, 'success');
        }
    }

    /**
     * Docker network inspect command
     * @param {string} networkName - Network name to inspect
     * @param {HTMLElement} output - Output element
     */
    dockerNetworkInspect(networkName, output) {
        if (networkName === 'bridge') {
            this.inspectBridgeNetwork(output);
        } else if (networkName === 'host') {
            this.inspectHostNetwork(output);
        } else if (networkName === 'none') {
            this.inspectNoneNetwork(output);
        } else if (networkName === 'oaiworkshop') {
            if (this.oaiWorkshopNetworkExists) {
                this.inspectOAIWorkshopNetwork(output);
            } else {
                this.addTerminalLine(output, `Error: No such network: ${networkName}`, 'error');
            }
        } else {
            this.addTerminalLine(output, `Error: No such network: ${networkName}`, 'error');
        }
    }

    /**
     * Inspect bridge network
     * @param {HTMLElement} output - Output element
     */
    inspectBridgeNetwork(output) {
        const json = {
            "Name": "bridge",
            "Id": "df33e4a6502d1229e87fbd225ce8cc4b95fd4553fcaadee50fd5a70a4a021f3d",
            "Created": "2026-01-30T15:26:16.417604705+05:30",
            "Scope": "local",
            "Driver": "bridge",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": {
                "Driver": "default",
                "Options": null,
                "Config": [
                    {
                        "Subnet": "172.17.0.0/16",
                        "Gateway": "172.17.0.1"
                    }
                ]
            },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": {
                "Network": ""
            },
            "ConfigOnly": false,
            "Containers": {},
            "Options": {
                "com.docker.network.bridge.default_bridge": "true",
                "com.docker.network.bridge.enable_icc": "true",
                "com.docker.network.bridge.enable_ip_masquerade": "true",
                "com.docker.network.bridge.host_binding_ipv4": "0.0.0.0",
                "com.docker.network.bridge.name": "docker0",
                "com.docker.network.driver.mtu": "1500"
            },
            "Labels": {}
        };
        
        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Inspect host network
     * @param {HTMLElement} output - Output element
     */
    inspectHostNetwork(output) {
        const json = {
            "Name": "host",
            "Id": "902c1fcc436950abba5007bd8b39b65ab96fd9c72b3873519ebc55bc14315b74",
            "Created": "2026-01-20T15:04:16.397276602+05:30",
            "Scope": "local",
            "Driver": "host",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": {
                "Driver": "default",
                "Options": null,
                "Config": null
            },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": {
                "Network": ""
            },
            "ConfigOnly": false,
            "Containers": {},
            "Options": {},
            "Labels": {}
        };
        
        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Inspect none network
     * @param {HTMLElement} output - Output element
     */
    inspectNoneNetwork(output) {
        const json = {
            "Name": "none",
            "Id": "0c712814bbb0c32a4d2846f885d90534121f472d0c71d0c34330ad6da8327020",
            "Created": "2026-01-20T15:04:16.389588497+05:30",
            "Scope": "local",
            "Driver": "null",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": {
                "Driver": "default",
                "Options": null,
                "Config": null
            },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": {
                "Network": ""
            },
            "ConfigOnly": false,
            "Containers": {},
            "Options": {},
            "Labels": {}
        };
        
        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Inspect OAI workshop network
     * @param {HTMLElement} output - Output element
     */
    inspectOAIWorkshopNetwork(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const containers = {};
        
        // Build containers object with actual NF IPs
        allNFs.forEach(nf => {
            const serviceNameMap = {
                'AMF': 'oai-amf', 'SMF': 'oai-smf', 'UPF': 'oai-upf', 'AUSF': 'oai-ausf',
                'UDM': 'oai-udm', 'UDR': 'oai-udr', 'NRF': 'oai-nrf', 'PCF': 'oai-pcf',
                'NSSF': 'oai-nssf', 'MySQL': 'mysql', 'ext-dn': 'oai-ext-dn'
            };
            const serviceName = serviceNameMap[nf.type] || nf.type.toLowerCase();
            const containerId = this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + 'abcd';
            
            containers[containerId] = {
                "Name": serviceName,
                "EndpointID": this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + 'ef01',
                "MacAddress": this.generateMacAddress(),
                "IPv4Address": nf.config.ipAddress + "/26",
                "IPv6Address": ""
            };
        });
        
        const createdTime = this.oaiWorkshopCreatedTime ? new Date(this.oaiWorkshopCreatedTime).toISOString() : new Date().toISOString();
        
        const json = {
            "Name": "oaiworkshop",
            "Id": this.oaiWorkshopNetworkId + "d0a87f40b563d8172b3f54045b0da9d9b859ed25522c2aaa8b86",
            "Created": createdTime,
            "Scope": "local",
            "Driver": "bridge",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": {
                "Driver": "default",
                "Options": null,
                "Config": [
                    {
                        "Subnet": "192.168.70.128/26"
                    }
                ]
            },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": {
                "Network": ""
            },
            "ConfigOnly": false,
            "Containers": containers,
            "Options": {
                "com.docker.network.bridge.name": "oaiworkshop"
            },
            "Labels": {
                "com.docker.compose.config-hash": "dca0e19cf413805e199db52df7a818f82ffd4a571265d5f722c8e2198676da59",
                "com.docker.compose.network": "public_net",
                "com.docker.compose.project": "cn",
                "com.docker.compose.version": "5.0.1"
            }
        };
        
        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Generate network ID
     * @returns {string} Random network ID
     */
    generateNetworkId() {
        const chars = '0123456789abcdef';
        let id = '';
        for (let i = 0; i < 12; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

    /**
     * Generate MAC address
     * @returns {string} Random MAC address
     */
    generateMacAddress() {
        const chars = '0123456789abcdef';
        let mac = '';
        for (let i = 0; i < 6; i++) {
            if (i > 0) mac += ':';
            mac += chars[Math.floor(Math.random() * chars.length)];
            mac += chars[Math.floor(Math.random() * chars.length)];
        }
        return mac;
    }

    /**
     * Docker version command
     * @param {HTMLElement} output - Output element
     */
    dockerVersion(output) {
        this.addTerminalLine(output, 'Client: Docker Engine - Community', 'info');
        this.addTerminalLine(output, ' Version:           28.0.4', 'info');
        this.addTerminalLine(output, ' API version:       1.48', 'info');
        this.addTerminalLine(output, ' Go version:        go1.23.7', 'info');
        this.addTerminalLine(output, ' Git commit:        b8034c0', 'info');
        this.addTerminalLine(output, ' Built:             Tue Mar 25 15:07:11 2025', 'info');
        this.addTerminalLine(output, ' OS/Arch:           linux/amd64', 'info');
        this.addTerminalLine(output, ' Context:           default', 'info');
        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, 'Server: Docker Engine - Community', 'info');
        this.addTerminalLine(output, ' Engine:', 'info');
        this.addTerminalLine(output, '  Version:          28.0.4', 'info');
        this.addTerminalLine(output, '  API version:      1.48 (minimum version 1.24)', 'info');
        this.addTerminalLine(output, '  Go version:       go1.23.7', 'info');
        this.addTerminalLine(output, '  Git commit:       6430e49', 'info');
        this.addTerminalLine(output, '  Built:            Tue Mar 25 15:07:11 2025', 'info');
        this.addTerminalLine(output, '  OS/Arch:          linux/amd64', 'info');
        this.addTerminalLine(output, '  Experimental:     false', 'info');
        this.addTerminalLine(output, ' containerd:', 'info');
        this.addTerminalLine(output, '  Version:          v2.2.1', 'info');
        this.addTerminalLine(output, '  GitCommit:        dea7da592f5d1d2b7755e3a161be07f43fad8f75', 'info');
        this.addTerminalLine(output, ' runc:', 'info');
        this.addTerminalLine(output, '  Version:          1.3.4', 'info');
        this.addTerminalLine(output, '  GitCommit:        v1.3.4-0-gd6d73eb8', 'info');
        this.addTerminalLine(output, ' docker-init:', 'info');
        this.addTerminalLine(output, '  Version:          0.19.0', 'info');
        this.addTerminalLine(output, '  GitCommit:        de40ad0', 'info');
    }

    /**
     * Add gNB to the network
     * @param {HTMLElement} output - Output element
     */
    async addGNB(output) {
        // Check if gNB already exists
        const allNFs = window.dataStore?.getAllNFs() || [];
        const existingGNB = allNFs.find(nf => nf.type === 'gNB');
        
        if (existingGNB) {
            this.addTerminalLine(output, '❌ Error: gNB already exists in the network', 'error');
            this.addTerminalLine(output, `   Existing gNB: ${existingGNB.name} (${existingGNB.config.ipAddress})`, 'info');
            this.addTerminalLine(output, '   Use "remove gnb" to delete it first', 'info');
            return;
        }

        this.addTerminalLine(output, '🚀 Creating gNB (5G Base Station)...', 'info');
        await this.delay(500);

        // Calculate position for gNB
        const position = this.calculatePositionForNewNF('gNB');

        // Create gNB using NFManager
        if (window.nfManager) {
            const gnb = window.nfManager.createNetworkFunction('gNB', position);
            
            if (gnb) {
                // Set creation timestamp
                gnb.createdAt = Date.now();
                gnb.status = 'starting';
                gnb.statusTimestamp = Date.now();
                window.dataStore.updateNF(gnb.id, gnb);

                this.addTerminalLine(output, `✅ gNB created successfully`, 'success');
                this.addTerminalLine(output, `   Name: ${gnb.name}`, 'info');
                this.addTerminalLine(output, `   IP Address: ${gnb.config.ipAddress}`, 'info');
                this.addTerminalLine(output, `   Port: ${gnb.config.port}`, 'info');
                this.addTerminalLine(output, `   Status: starting → will be stable in 5 seconds`, 'info');

                // Generate startup log
                if (window.logEngine) {
                    window.logEngine.addLog(gnb.id, 'INFO', 
                        `${gnb.name} created via Docker terminal`, {
                        ipAddress: gnb.config.ipAddress,
                        port: gnb.config.port,
                        status: 'starting',
                        source: 'docker-terminal'
                    });
                }

                // After 5 seconds, set to stable
                setTimeout(() => {
                    const updatedGNB = window.dataStore?.getNFById(gnb.id);
                    if (updatedGNB) {
                        updatedGNB.status = 'stable';
                        updatedGNB.statusTimestamp = Date.now();
                        window.dataStore.updateNF(updatedGNB.id, updatedGNB);
                        
                        if (window.logEngine) {
                            window.logEngine.addLog(updatedGNB.id, 'SUCCESS', 
                                `${updatedGNB.name} is now STABLE and ready`, {
                                previousStatus: 'starting',
                                newStatus: 'stable',
                                uptime: '5 seconds'
                            });
                        }
                        
                        if (window.canvasRenderer) {
                            window.canvasRenderer.render();
                        }
                    }
                }, 5000);

                // Re-render canvas
                if (window.canvasRenderer) {
                    window.canvasRenderer.render();
                }
            } else {
                this.addTerminalLine(output, '❌ Failed to create gNB', 'error');
            }
        } else {
            this.addTerminalLine(output, '❌ NFManager not available', 'error');
        }
    }

    /**
     * Add UE to the network
     * @param {HTMLElement} output - Output element
     */
    async addUE(output) {
        // Check UE limit (max 2 UEs)
        const allNFs = window.dataStore?.getAllNFs() || [];
        const existingUEs = allNFs.filter(nf => nf.type === 'UE');
        
        if (existingUEs.length >= 2) {
            this.addTerminalLine(output, '❌ Error: Maximum UE limit reached (2 UEs)', 'error');
            this.addTerminalLine(output, '   Existing UEs:', 'info');
            existingUEs.forEach((ue, index) => {
                this.addTerminalLine(output, `   ${index + 1}. ${ue.name} (${ue.config.ipAddress})`, 'info');
            });
            this.addTerminalLine(output, '   Use "remove ue <number>" to delete one first', 'info');
            return;
        }

        this.addTerminalLine(output, '📱 Creating UE (User Equipment)...', 'info');
        await this.delay(500);

        // Get available subscriber from UDR
        const subscribers = window.dataStore?.getSubscribers() || [];
        
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
        const usedIMSI = new Set(existingUEs.map(ue => ue.config.subscriberImsi).filter(Boolean));
        const availableSubscriber = updatedSubscribers.find(sub => !usedIMSI.has(sub.imsi));
        
        if (!availableSubscriber) {
            this.addTerminalLine(output, '❌ Error: No available subscriber profiles in UDR', 'error');
            this.addTerminalLine(output, '   Please add subscriber profiles to UDR first', 'info');
            return;
        }

        // Calculate position for UE
        const position = this.calculatePositionForNewNF('UE');

        // Create UE using NFManager
        if (window.nfManager) {
            const ue = window.nfManager.createNetworkFunction('UE', position);
            
            if (ue) {
                // Set subscriber configuration
                ue.config.subscriberImsi = availableSubscriber.imsi;
                ue.config.subscriberKey = availableSubscriber.key;
                ue.config.subscriberOpc = availableSubscriber.opc;
                ue.config.subscriberDnn = availableSubscriber.dnn;
                ue.config.subscriberSst = availableSubscriber.nssai_sst;

                // Set creation timestamp
                ue.createdAt = Date.now();
                ue.status = 'starting';
                ue.statusTimestamp = Date.now();
                window.dataStore.updateNF(ue.id, ue);

                this.addTerminalLine(output, `✅ UE created successfully`, 'success');
                this.addTerminalLine(output, `   Name: ${ue.name}`, 'info');
                this.addTerminalLine(output, `   IP Address: ${ue.config.ipAddress}`, 'info');
                this.addTerminalLine(output, `   IMSI: ${availableSubscriber.imsi}`, 'info');
                this.addTerminalLine(output, `   DNN: ${availableSubscriber.dnn}`, 'info');
                this.addTerminalLine(output, `   Status: starting → will be stable in 5 seconds`, 'info');

                // Generate startup log
                if (window.logEngine) {
                    window.logEngine.addLog(ue.id, 'SUCCESS', 
                        `${ue.name} created with subscriber profile`, {
                        IMSI: availableSubscriber.imsi,
                        DNN: availableSubscriber.dnn,
                        NSSAI_SST: availableSubscriber.nssai_sst,
                        IP: ue.config.ipAddress,
                        source: 'docker-terminal'
                    });
                }

                // After 5 seconds, set to stable
                setTimeout(() => {
                    const updatedUE = window.dataStore?.getNFById(ue.id);
                    if (updatedUE) {
                        updatedUE.status = 'stable';
                        updatedUE.statusTimestamp = Date.now();
                        window.dataStore.updateNF(updatedUE.id, updatedUE);
                        
                        if (window.logEngine) {
                            window.logEngine.addLog(updatedUE.id, 'SUCCESS', 
                                `${updatedUE.name} is now STABLE and ready`, {
                                previousStatus: 'starting',
                                newStatus: 'stable',
                                uptime: '5 seconds'
                            });
                        }
                        
                        if (window.canvasRenderer) {
                            window.canvasRenderer.render();
                        }
                    }
                }, 5000);

                // Re-render canvas
                if (window.canvasRenderer) {
                    window.canvasRenderer.render();
                }
            } else {
                this.addTerminalLine(output, '❌ Failed to create UE', 'error');
            }
        } else {
            this.addTerminalLine(output, '❌ NFManager not available', 'error');
        }
    }

    /**
     * Remove gNB from the network
     * @param {HTMLElement} output - Output element
     */
    async removeGNB(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const gnb = allNFs.find(nf => nf.type === 'gNB');
        
        if (!gnb) {
            this.addTerminalLine(output, '❌ Error: No gNB found in the network', 'error');
            return;
        }

        this.addTerminalLine(output, `🗑️ Removing ${gnb.name}...`, 'info');
        await this.delay(500);

        // Remove gNB using NFManager
        if (window.nfManager) {
            window.nfManager.deleteNetworkFunction(gnb.id);
            this.addTerminalLine(output, `✅ ${gnb.name} removed successfully`, 'success');
            
            // Re-render canvas
            if (window.canvasRenderer) {
                window.canvasRenderer.render();
            }
        } else {
            this.addTerminalLine(output, '❌ NFManager not available', 'error');
        }
    }

    /**
     * Remove UE from the network
     * @param {string} ueNumber - UE number to remove (1 or 2)
     * @param {HTMLElement} output - Output element
     */
    async removeUE(ueNumber, output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const allUEs = allNFs.filter(nf => nf.type === 'UE');
        
        if (allUEs.length === 0) {
            this.addTerminalLine(output, '❌ Error: No UE found in the network', 'error');
            return;
        }

        // If no number specified, show list
        if (!ueNumber || isNaN(parseInt(ueNumber))) {
            this.addTerminalLine(output, '❌ Error: Please specify UE number', 'error');
            this.addTerminalLine(output, '   Usage: remove ue <number>', 'info');
            this.addTerminalLine(output, '   Available UEs:', 'info');
            allUEs.forEach((ue, index) => {
                this.addTerminalLine(output, `   ${index + 1}. ${ue.name} (${ue.config.ipAddress})`, 'info');
            });
            return;
        }

        const index = parseInt(ueNumber) - 1;
        
        if (index < 0 || index >= allUEs.length) {
            this.addTerminalLine(output, `❌ Error: Invalid UE number ${ueNumber}`, 'error');
            this.addTerminalLine(output, `   Valid range: 1-${allUEs.length}`, 'info');
            return;
        }

        const ue = allUEs[index];
        this.addTerminalLine(output, `🗑️ Removing ${ue.name}...`, 'info');
        await this.delay(500);

        // Remove UE using NFManager
        if (window.nfManager) {
            window.nfManager.deleteNetworkFunction(ue.id);
            this.addTerminalLine(output, `✅ ${ue.name} removed successfully`, 'success');
            
            // Re-render canvas
            if (window.canvasRenderer) {
                window.canvasRenderer.render();
            }
        } else {
            this.addTerminalLine(output, '❌ NFManager not available', 'error');
        }
    }

    /**
     * List gNB information
     * @param {HTMLElement} output - Output element
     */
    listGNB(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const gnb = allNFs.find(nf => nf.type === 'gNB');
        
        if (!gnb) {
            this.addTerminalLine(output, 'No gNB found in the network', 'info');
            this.addTerminalLine(output, 'Use "add gnb" to create one', 'info');
            return;
        }

        this.addTerminalLine(output, '═══════════════════════════════════', 'info');
        this.addTerminalLine(output, 'gNB (5G Base Station) Information', 'info');
        this.addTerminalLine(output, '═══════════════════════════════════', 'info');
        this.addTerminalLine(output, `Name:        ${gnb.name}`, 'info');
        this.addTerminalLine(output, `Type:        ${gnb.type}`, 'info');
        this.addTerminalLine(output, `IP Address:  ${gnb.config.ipAddress}`, 'info');
        this.addTerminalLine(output, `Port:        ${gnb.config.port}`, 'info');
        this.addTerminalLine(output, `Status:      ${gnb.status || 'unknown'}`, gnb.status === 'stable' ? 'success' : 'warning');
        
        // Show connections
        const connections = window.dataStore?.getConnectionsForNF(gnb.id) || [];
        this.addTerminalLine(output, `Connections: ${connections.length}`, 'info');
        
        if (connections.length > 0) {
            connections.forEach(conn => {
                const targetNF = window.dataStore?.getNFById(conn.targetId === gnb.id ? conn.sourceId : conn.targetId);
                if (targetNF) {
                    this.addTerminalLine(output, `  → ${targetNF.name} (${conn.interfaceName || 'N/A'})`, 'info');
                }
            });
        }
        
        this.addTerminalLine(output, '═══════════════════════════════════', 'info');
    }

    /**
     * List all UE devices
     * @param {HTMLElement} output - Output element
     */
    listUE(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const allUEs = allNFs.filter(nf => nf.type === 'UE');
        
        if (allUEs.length === 0) {
            this.addTerminalLine(output, 'No UE devices found in the network', 'info');
            this.addTerminalLine(output, 'Use "add ue" to create one (max 2 UEs)', 'info');
            return;
        }

        this.addTerminalLine(output, '═══════════════════════════════════', 'info');
        this.addTerminalLine(output, `UE Devices (${allUEs.length}/2)`, 'info');
        this.addTerminalLine(output, '═══════════════════════════════════', 'info');
        
        allUEs.forEach((ue, index) => {
            this.addTerminalLine(output, `${index + 1}. ${ue.name}`, 'info');
            this.addTerminalLine(output, `   IP Address:  ${ue.config.ipAddress}`, 'info');
            this.addTerminalLine(output, `   IMSI:        ${ue.config.subscriberImsi || 'Not configured'}`, 'info');
            this.addTerminalLine(output, `   DNN:         ${ue.config.subscriberDnn || 'Not configured'}`, 'info');
            this.addTerminalLine(output, `   Status:      ${ue.status || 'unknown'}`, ue.status === 'stable' ? 'success' : 'warning');
            
            // Show connections
            const connections = window.dataStore?.getConnectionsForNF(ue.id) || [];
            this.addTerminalLine(output, `   Connections: ${connections.length}`, 'info');
            
            if (index < allUEs.length - 1) {
                this.addTerminalLine(output, '', 'blank');
            }
        });
        
        this.addTerminalLine(output, '═══════════════════════════════════', 'info');
    }

    /**
     * Calculate position for new NF
     * @param {string} nfType - NF type
     * @returns {Object} {x, y} position
     */
    calculatePositionForNewNF(nfType) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const canvas = document.getElementById('main-canvas');
        
        if (!canvas) {
            return { x: 200, y: 200 };
        }

        // Place gNB and UE in specific areas
        if (nfType === 'gNB') {
            // Place gNB in bottom-left area
            return {
                x: 150,
                y: canvas.height - 150
            };
        } else if (nfType === 'UE') {
            // Place UEs in bottom-right area, stacked vertically
            const existingUEs = allNFs.filter(nf => nf.type === 'UE');
            return {
                x: canvas.width - 150,
                y: canvas.height - 150 - (existingUEs.length * 100)
            };
        }

        // Default position
        return {
            x: 200 + (allNFs.length * 80) % (canvas.width - 200),
            y: 200 + Math.floor((allNFs.length * 80) / (canvas.width - 200)) * 100
        };
    }
}

// Initialize global instance
window.dockerTerminal = new DockerTerminal();
