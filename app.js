class ClaudeLogViewer {
    constructor() {
        this.logData = [];
        this.filteredData = [];
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.stats = {
            total: 0,
            assistant: 0,
            system: 0,
            tool: 0,
            user: 0
        };
        
        this.init();
    }

    async init() {
        this.bindEvents();
        this.showDataInput();
        this.showWelcome();
    }

    async loadData() {
        try {
            const response = await fetch('report.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.logData = await response.json();
            this.filteredData = [...this.logData];
        } catch (error) {
            // Fallback: Try to load from a script tag if fetch fails
            if (window.reportData) {
                this.logData = window.reportData;
                this.filteredData = [...this.logData];
            } else {
                throw new Error('Could not load report data. Please serve this from a web server or use the included server script.');
            }
        }
    }

    bindEvents() {
        // Data input controls
        const loadDataBtn = document.getElementById('loadDataBtn');
        const clearDataBtn = document.getElementById('clearDataBtn');
        const jsonInput = document.getElementById('jsonInput');

        loadDataBtn.addEventListener('click', () => {
            this.loadDataFromInput();
        });

        clearDataBtn.addEventListener('click', () => {
            jsonInput.value = '';
            this.setLoadStatus('');
        });

        // Auto-load on paste
        jsonInput.addEventListener('paste', () => {
            setTimeout(() => {
                if (jsonInput.value.trim()) {
                    this.loadDataFromInput();
                }
            }, 100);
        });

        // Search functionality
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.applyFilters();
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.applyFilters();
            });
        });

        // Show input button
        const showInputBtn = document.getElementById('showInputBtn');
        showInputBtn.addEventListener('click', () => {
            this.showDataInput();
            document.getElementById('jsonInput').focus();
        });
    }

    applyFilters() {
        this.filteredData = this.logData.filter(entry => {
            // Type filter
            const matchesFilter = this.currentFilter === 'all' || 
                                this.getEntryType(entry) === this.currentFilter;

            // Search filter
            const matchesSearch = this.searchTerm === '' || 
                                this.entryMatchesSearch(entry, this.searchTerm);

            return matchesFilter && matchesSearch;
        });

        this.renderEntries();
    }

    entryMatchesSearch(entry, searchTerm) {
        const searchableText = JSON.stringify(entry).toLowerCase();
        return searchableText.includes(searchTerm);
    }

    findOriginalToolCall(toolUseId) {
        // Search backwards through log data to find the assistant entry with matching tool call
        for (let i = this.logData.length - 1; i >= 0; i--) {
            const entry = this.logData[i];
            if (entry.type === 'assistant' && entry.message?.content) {
                const toolCall = entry.message.content.find(item => 
                    item.type === 'tool_use' && item.id === toolUseId
                );
                if (toolCall) {
                    return toolCall;
                }
            }
        }
        return null;
    }

    getEntryType(entry) {
        if (entry.type === 'system') return 'system';
        if (entry.type === 'assistant') return 'assistant';
        if (entry.type === 'tool') return 'tool';
        
        // Check if this is actually a tool result disguised as user
        if (entry.type === 'user' && entry.message?.content) {
            const hasToolResult = entry.message.content.some(item => item.type === 'tool_result');
            if (hasToolResult) {
                // Check if any tool result has an error
                const hasFailedTool = entry.message.content.some(item => {
                    if (item.type === 'tool_result') {
                        const content = item.content;
                        let output = '';
                        
                        if (Array.isArray(content)) {
                            output = content.map(c => c.text || JSON.stringify(c)).join('\n');
                        } else if (typeof content === 'string') {
                            output = content;
                        } else {
                            output = JSON.stringify(content, null, 2);
                        }
                        
                        return item.is_error === true || 
                               (item.error !== undefined && item.error !== null) ||
                               (typeof output === 'string' && output.toLowerCase().startsWith('error:'));
                    }
                    return false;
                });
                
                return hasFailedTool ? 'failed-tool' : 'tool';
            }
        }
        
        if (entry.type === 'user') return 'user';
        return 'system'; // default
    }

    updateStats() {
        this.stats.total = this.logData.length;
        this.stats.assistant = this.logData.filter(e => e.type === 'assistant').length;
        this.stats.system = this.logData.filter(e => e.type === 'system').length;
        this.stats.tool = this.logData.filter(e => e.type === 'tool').length;
        this.stats.user = this.logData.filter(e => e.type === 'user').length;

        document.getElementById('totalEntries').textContent = this.stats.total;
        document.getElementById('assistantMessages').textContent = this.stats.assistant;
        document.getElementById('toolCalls').textContent = this.stats.tool;
        document.getElementById('systemMessages').textContent = this.stats.system;
    }

    renderEntries() {
        const container = document.getElementById('logEntries');
        
        if (this.filteredData.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">🔍</div>
                    <h3>No entries found</h3>
                    <p>Try adjusting your search or filter criteria</p>
                </div>
            `;
            return;
        }

        const entriesHtml = this.filteredData.map((entry, index) => 
            this.renderEntry(entry, index)
        ).join('');

        container.innerHTML = entriesHtml;

        // Bind click events for expanding entries
        container.querySelectorAll('.log-header').forEach(header => {
            header.addEventListener('click', () => {
                const entry = header.parentElement;
                entry.classList.toggle('expanded');
            });
        });

        // Bind click events for expanding tool results
        container.querySelectorAll('.tool-expand').forEach(expandBtn => {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetId = expandBtn.dataset.target;
                const moreLines = expandBtn.dataset.moreLines;
                const preview = expandBtn.parentElement.querySelector('.tool-preview');
                const full = document.getElementById(targetId);
                const btn = expandBtn.querySelector('.expand-btn');
                
                if (full.classList.contains('hidden')) {
                    preview.classList.add('hidden');
                    full.classList.remove('hidden');
                    btn.textContent = '▲ collapse';
                } else {
                    preview.classList.remove('hidden');
                    full.classList.add('hidden');
                    btn.textContent = `▼ ${moreLines} more lines`;
                }
            });
        });
    }

    renderEntry(entry, index) {
        const type = this.getEntryType(entry);
        const meta = this.getEntryMeta(entry);
        const content = this.getEntryContent(entry);
        
        return `
            <div class="log-entry expanded" data-index="${index}">
                <div class="log-header">
                    <div>
                        <span class="log-type ${type}">${type}</span>
                        <span class="log-meta">${meta}</span>
                    </div>
                    <span class="log-toggle">▲</span>
                </div>
                <div class="log-content">
                    <div class="log-content-inner">
                        ${content}
                    </div>
                </div>
            </div>
        `;
    }

    getEntryMeta(entry) {
        const parts = [];
        const entryType = this.getEntryType(entry);
        
        // For assistant messages, look for tool calls
        if (entryType === 'assistant' && entry.message?.content) {
            const toolCalls = entry.message.content.filter(item => item.type === 'tool_use');
            if (toolCalls.length > 0) {
                const toolNames = toolCalls.map(tool => tool.name);
                parts.push(`→ ${toolNames.join(', ')}`);
            }
        }
        
        // For tool results, try to identify which tool
        if ((entryType === 'tool' || entryType === 'failed-tool') && entry.type === 'user' && entry.message?.content) {
            const toolResult = entry.message.content.find(item => item.type === 'tool_result');
            if (toolResult?.tool_use_id) {
                parts.push(`← result`);
            }
        }
        
        if (entry.tool_name) {
            parts.push(`${entry.tool_name}`);
        }

        if (entry.message?.usage?.output_tokens) {
            parts.push(`${entry.message.usage.output_tokens} tokens`);
        }

        return parts.join(' • ') || '';
    }

    getEntryContent(entry) {
        const entryType = this.getEntryType(entry);
        
        if (entryType === 'system') {
            return this.renderSystemContent(entry);
        } else if (entryType === 'assistant') {
            return this.renderAssistantContent(entry);
        } else if (entryType === 'tool' || entryType === 'failed-tool') {
            return this.renderToolResultContent(entry);
        } else if (entry.type === 'user') {
            return this.renderUserContent(entry);
        } else {
            return this.renderJsonContent(entry);
        }
    }

    renderSystemContent(entry) {
        if (entry.subtype === 'init') {
            const tools = entry.tools || [];
            const mcpServers = entry.mcp_servers || [];
            
            return `
                <div>
                    <h4>System Initialization</h4>
                    <p><strong>Working Directory:</strong> ${entry.cwd || 'N/A'}</p>
                    <p><strong>Model:</strong> ${entry.model || 'N/A'}</p>
                    <p><strong>Permission Mode:</strong> ${entry.permissionMode || 'N/A'}</p>
                    
                    ${tools.length > 0 ? `
                        <div style="margin-top: 15px;">
                            <strong>Available Tools (${tools.length}):</strong>
                            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                                ${tools.map(tool => `<span style="background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 6px; font-size: 12px;">${tool}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${mcpServers.length > 0 ? `
                        <div style="margin-top: 15px;">
                            <strong>MCP Servers:</strong>
                            ${mcpServers.map(server => `
                                <div style="margin-top: 5px;">
                                    <span style="font-weight: 500;">${server.name}</span>: 
                                    <span style="color: ${server.status === 'connected' ? '#4caf50' : '#f44336'};">${server.status}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        } else if (entry.subtype === 'success' && entry.result) {
            // Format session result nicely
            const duration = entry.duration_ms ? `${(entry.duration_ms / 1000).toFixed(1)}s` : 'N/A';
            const cost = entry.total_cost_usd ? `$${entry.total_cost_usd.toFixed(4)}` : 'N/A';
            const turns = entry.num_turns || 'N/A';
            
            return `
                <div class="system-result">
                    <div class="result-header">✅ Session Complete</div>
                    <div class="result-content">
                        ${this.formatText(entry.result)}
                    </div>
                    <div class="result-metadata">
                        <div class="metadata-grid">
                            <div class="metadata-item">
                                <span class="metadata-label">Duration:</span>
                                <span class="metadata-value">${duration}</span>
                            </div>
                            <div class="metadata-item">
                                <span class="metadata-label">Turns:</span>
                                <span class="metadata-value">${turns}</span>
                            </div>
                            <div class="metadata-item">
                                <span class="metadata-label">Cost:</span>
                                <span class="metadata-value">${cost}</span>
                            </div>
                            ${entry.usage?.input_tokens ? `
                                <div class="metadata-item">
                                    <span class="metadata-label">Input Tokens:</span>
                                    <span class="metadata-value">${entry.usage.input_tokens.toLocaleString()}</span>
                                </div>
                            ` : ''}
                            ${entry.usage?.output_tokens ? `
                                <div class="metadata-item">
                                    <span class="metadata-label">Output Tokens:</span>
                                    <span class="metadata-value">${entry.usage.output_tokens.toLocaleString()}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        return this.renderJsonContent(entry);
    }

    renderAssistantContent(entry) {
        if (!entry.message?.content) {
            return this.renderJsonContent(entry);
        }

        const content = entry.message.content;
        let html = '';

        content.forEach(item => {
            if (item.type === 'text') {
                html += `
                    <div class="terminal-text">
                        ${this.formatText(item.text)}
                    </div>
                `;
            } else if (item.type === 'tool_use') {
                html += `
                    <div class="terminal-tool-call">
                        <div class="tool-header"># ${item.name}</div>
                        <pre class="tool-params">${JSON.stringify(item.input, null, 2)}</pre>
                    </div>
                `;
            } else if (item.type === 'thinking') {
                html += `
                    <div class="terminal-thinking">
                        <details open>
                            <summary># thinking</summary>
                            <div class="thinking-content">
                                ${this.formatText(item.thinking)}
                            </div>
                        </details>
                    </div>
                `;
            }
        });

        return html;
    }

    renderToolResultContent(entry) {
        // Handle tool results that come as user messages
        if (entry.type === 'user' && entry.message?.content) {
            const toolResults = entry.message.content.filter(item => item.type === 'tool_result');
            if (toolResults.length > 0) {
                return toolResults.map((result, index) => {
                    const content = result.content;
                    let output = '';
                    
                    if (Array.isArray(content)) {
                        output = content.map(c => c.text || JSON.stringify(c)).join('\n');
                    } else if (typeof content === 'string') {
                        output = content;
                    } else {
                        output = JSON.stringify(content, null, 2);
                    }
                    
                    // More specific error detection
                    const isError = result.is_error === true || 
                                   (result.error !== undefined && result.error !== null) ||
                                   (typeof output === 'string' && output.toLowerCase().startsWith('error:'));
                    
                    const lines = output.split('\n');
                    const preview = lines.slice(0, 2).join('\n');
                    const hasMore = lines.length > 2;
                    const moreLineCount = Math.max(0, lines.length - 2);
                    
                    // Generate truly unique ID using entry index, result index, and random
                    const entryIndex = this.filteredData.indexOf(entry);
                    const uniqueId = `tool-result-${entryIndex}-${index}-${Math.random().toString(36).substr(2, 9)}`;
                    
                    // For failed tools, try to find and show the original tool call
                    let originalToolCallHtml = '';
                    if (isError && result.tool_use_id) {
                        const originalToolCall = this.findOriginalToolCall(result.tool_use_id);
                        if (originalToolCall) {
                            originalToolCallHtml = `
                                <div class="original-tool-call">
                                    <div class="original-tool-header"># Original Tool Call: ${originalToolCall.name}</div>
                                    <pre class="original-tool-params">${JSON.stringify(originalToolCall.input, null, 2)}</pre>
                                </div>
                            `;
                        }
                    }
                    
                    return `
                        <div class="terminal-tool-result">
                            ${originalToolCallHtml}
                            <div class="tool-output ${isError ? 'error' : 'success'}">
                                <pre class="tool-preview">${preview}</pre>
                                ${hasMore ? `
                                    <pre class="tool-full hidden" id="${uniqueId}">${output}</pre>
                                    <div class="tool-expand" data-target="${uniqueId}" data-more-lines="${moreLineCount}">
                                        <span class="expand-btn">▼ ${moreLineCount} more lines</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
        
        // Legacy tool content handling
        const result = entry.tool_result;
        const isError = result && (result.is_error || result.error);
        
        return `
            <div class="terminal-tool-result">
                ${result ? `
                    <div class="tool-output ${isError ? 'error' : 'success'}">
                        ${isError ? 
                            `Error: ${result.error || result.content}` :
                            `<pre>${typeof result.content === 'string' ? result.content : JSON.stringify(result, null, 2)}</pre>`
                        }
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderUserContent(entry) {
        if (entry.message?.content) {
            const content = entry.message.content;
            let html = '';
            
            content.forEach(item => {
                if (item.type === 'text') {
                    html += `
                        <div class="terminal-text user-message">
                            ${this.formatText(item.text)}
                        </div>
                    `;
                }
            });
            
            return html;
        }
        
        return this.renderJsonContent(entry);
    }

    renderJsonContent(entry) {
        return `
            <div class="json-viewer">
                ${this.syntaxHighlightJson(JSON.stringify(entry, null, 2))}
            </div>
        `;
    }

    formatText(text) {
        if (!text) return '';
        
        // Convert newlines to <br> and preserve formatting
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background: #f1f3f4; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
    }

    syntaxHighlightJson(json) {
        return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        });
    }

    loadDataFromInput() {
        const jsonInput = document.getElementById('jsonInput');
        const jsonText = jsonInput.value.trim();

        if (!jsonText) {
            this.setLoadStatus('Please paste JSON data first', 'error');
            return;
        }

        try {
            this.setLoadStatus('Parsing JSON...', '');
            const data = JSON.parse(jsonText);
            
            // Validate that it's an array
            if (!Array.isArray(data)) {
                throw new Error('JSON must be an array of log entries');
            }

            this.logData = data;
            this.filteredData = [...this.logData];
            this.updateStats();
            this.renderEntries();
            this.hideDataInput();
            this.setLoadStatus(`Successfully loaded ${data.length} entries!`, 'success');
            
            // Clear the success message after 3 seconds
            setTimeout(() => {
                this.setLoadStatus('', '');
            }, 3000);

        } catch (error) {
            console.error('JSON Parse Error:', error);
            this.setLoadStatus(`Invalid JSON: ${error.message}`, 'error');
        }
    }

    setLoadStatus(message, type = '') {
        const statusEl = document.getElementById('loadStatus');
        statusEl.textContent = message;
        statusEl.className = `load-status ${type}`;
    }

    showDataInput() {
        document.getElementById('dataInputSection').classList.remove('hidden');
        document.getElementById('showInputBtn').classList.add('hidden');
    }

    hideDataInput() {
        document.getElementById('dataInputSection').classList.add('hidden');
        document.getElementById('showInputBtn').classList.remove('hidden');
    }

    showWelcome() {
        document.getElementById('logEntries').innerHTML = `
            <div style="text-align: center; padding: 60px 40px; color: #4a5568;">
                <div style="font-size: 4rem; margin-bottom: 24px; opacity: 0.7;">📋</div>
                <h3 style="color: #2d3748; margin-bottom: 12px; font-size: 1.5rem;">Ready to view your Claude Code logs</h3>
                <p style="color: #666; font-size: 1.1rem; margin-bottom: 8px;">Paste your JSON log data in the textarea above</p>
                <p style="color: #888; font-size: 0.9rem;">Supports large files and provides a clean, terminal-like view</p>
            </div>
        `;
    }

    showError(message) {
        document.getElementById('logEntries').innerHTML = `
            <div style="text-align: center; padding: 40px; color: #d32f2f;">
                <div style="font-size: 3rem; margin-bottom: 20px;">⚠️</div>
                <h3>Error Loading Log</h3>
                <p>${message}</p>
            </div>
        `;
    }
}

// Initialize the viewer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ClaudeLogViewer();
});