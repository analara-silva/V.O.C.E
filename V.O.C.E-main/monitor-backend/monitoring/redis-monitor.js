// ================================================================
//                    MÓDULO DE MONITORAMENTO REDIS - V.O.C.E.
// ================================================================

const EventEmitter = require('events');

// ================================================================
//                    CLASSE DE MONITORAMENTO
// ================================================================

class RedisMonitor extends EventEmitter {
    constructor(redisClient, options = {}) {
        super();
        
        this.redisClient = redisClient;
        this.isMonitoring = false;
        this.monitoringInterval = null;
        
        // Configurações
        this.config = {
            interval: options.interval || 30000, // 30 segundos
            slowlogThreshold: options.slowlogThreshold || 10, // 10ms
            historySize: options.historySize || 120, // 120 amostras = 1h (com 30s)
            ...options
        };
        
        // Histórico de métricas
        this.metricsHistory = [];
        
        // Última coleta
        this.lastMetrics = null;
        
        // Baseline (aprende durante 7 dias)
        this.baseline = {
            hitRate: { avg: 0, stddev: 0, samples: [] },
            latency: { avg: 0, stddev: 0, samples: [] },
            memory: { avg: 0, stddev: 0, samples: [] }
        };
        
        // Contadores internos (complementam os do Redis)
        this.internalCounters = {
            cacheHits: 0,
            cacheMisses: 0,
            aiCalls: 0,
            errors: 0,
            slowCommands: 0
        };
    }
    
    // ================================================================
    //                    INICIALIZAÇÃO
    // ================================================================
    
    start() {
        if (this.isMonitoring) {
            console.warn('⚠️  Monitor já está em execução');
            return;
        }
        
        console.log(`📊 Iniciando monitoramento do Redis (intervalo: ${this.config.interval}ms)`);
        this.isMonitoring = true;
        
        // Coleta inicial
        this.collectMetrics();
        
        // Coleta periódica
        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
        }, this.config.interval);
        
        this.emit('monitoring:started');
    }
    
    stop() {
        if (!this.isMonitoring) return;
        
        console.log('🛑 Parando monitoramento do Redis');
        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        this.emit('monitoring:stopped');
    }
    
    // ================================================================
    //                    COLETA DE MÉTRICAS
    // ================================================================
    
    async collectMetrics() {
        if (!this.redisClient || !this.redisClient.isOpen) {
            console.error('❌ Redis não está conectado');
            this.emit('error', new Error('Redis não conectado'));
            return null;
        }
        
        try {
            const startTime = Date.now();
            
            // Coleta informações do Redis
            const [info, slowlog, stats] = await Promise.all([
                this.redisClient.info(),
                this.redisClient.slowlogGet(10).catch(() => []),
                this.getApplicationStats()
            ]);
            
            const collectionLatency = Date.now() - startTime;
            
            // Parse das informações
            const metrics = this.parseRedisInfo(info);
            
            // Adiciona métricas da aplicação
            metrics.application = stats;
            
            // Adiciona slowlog
            metrics.slowlog = slowlog;
            
            // Adiciona timestamp e latência de coleta
            metrics.timestamp = Date.now();
            metrics.collectionLatency = collectionLatency;
            
            // Calcula métricas derivadas
            this.calculateDerivedMetrics(metrics);
            
            // Armazena no histórico
            this.addToHistory(metrics);
            
            // Atualiza baseline
            this.updateBaseline(metrics);
            
            // Verifica alertas
            this.checkAlerts(metrics);
            
            // Emite evento com as métricas
            this.emit('metrics:collected', metrics);
            
            this.lastMetrics = metrics;
            return metrics;
            
        } catch (error) {
            console.error('❌ Erro ao coletar métricas:', error);
            this.emit('error', error);
            return null;
        }
    }
    
    // ================================================================
    //                    PARSE DE INFORMAÇÕES DO REDIS
    // ================================================================
    
    parseRedisInfo(infoString) {
        const metrics = {
            server: {},
            clients: {},
            memory: {},
            persistence: {},
            stats: {},
            replication: {},
            cpu: {},
            keyspace: {}
        };
        
        const lines = infoString.split('\r\n');
        let currentSection = 'server';
        
        for (const line of lines) {
            if (line.startsWith('#')) {
                // Nova seção
                const match = line.match(/# (.+)/);
                if (match) {
                    currentSection = match[1].toLowerCase();
                }
            } else if (line.includes(':')) {
                // Par chave:valor
                const [key, value] = line.split(':');
                if (key && value !== undefined) {
                    metrics[currentSection][key] = this.parseValue(value);
                }
            }
        }
        
        return metrics;
    }
    
    parseValue(value) {
        // Tenta converter para número
        if (/^\d+$/.test(value)) return parseInt(value);
        if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
        return value;
    }
    
    // ================================================================
    //                    MÉTRICAS DA APLICAÇÃO
    // ================================================================
    
    async getApplicationStats() {
        try {
            const [hits, misses, aiCalls] = await Promise.all([
                this.redisClient.get('cache:stats:hits').then(v => parseInt(v) || 0),
                this.redisClient.get('cache:stats:misses').then(v => parseInt(v) || 0),
                this.redisClient.get('cache:stats:ai_calls').then(v => parseInt(v) || 0)
            ]);
            
            const total = hits + misses;
            const hitRate = total > 0 ? (hits / total * 100) : 0;
            const aiReduction = total > 0 ? (100 - (aiCalls / total * 100)) : 0;
            
            return {
                hits,
                misses,
                total,
                hitRate,
                aiCalls,
                aiReduction,
                errors: this.internalCounters.errors,
                slowCommands: this.internalCounters.slowCommands
            };
        } catch (error) {
            console.error('Erro ao obter estatísticas da aplicação:', error);
            return {
                hits: 0,
                misses: 0,
                total: 0,
                hitRate: 0,
                aiCalls: 0,
                aiReduction: 0,
                errors: 0,
                slowCommands: 0
            };
        }
    }
    
    // ================================================================
    //                    MÉTRICAS DERIVADAS
    // ================================================================
    
    calculateDerivedMetrics(metrics) {
        // Latência média de comandos
        if (metrics.stats.instantaneous_ops_per_sec) {
            metrics.derived = metrics.derived || {};
            metrics.derived.avgCommandLatency = 
                (1000 / metrics.stats.instantaneous_ops_per_sec).toFixed(2);
        }
        
        // Fragmentação de memória
        if (metrics.memory.used_memory && metrics.memory.used_memory_rss) {
            metrics.derived = metrics.derived || {};
            metrics.derived.memoryFragmentation = 
                (metrics.memory.used_memory_rss / metrics.memory.used_memory).toFixed(2);
        }
        
        // Uso de memória em percentual
        if (metrics.memory.used_memory && metrics.memory.maxmemory) {
            metrics.derived = metrics.derived || {};
            metrics.derived.memoryUsagePercent = 
                (metrics.memory.used_memory / metrics.memory.maxmemory * 100).toFixed(2);
        }
        
        // Taxa de eviction
        if (this.lastMetrics && metrics.stats.evicted_keys) {
            const evictedDiff = metrics.stats.evicted_keys - 
                (this.lastMetrics.stats.evicted_keys || 0);
            const timeDiff = (metrics.timestamp - this.lastMetrics.timestamp) / 1000;
            
            metrics.derived = metrics.derived || {};
            metrics.derived.evictionRate = (evictedDiff / timeDiff).toFixed(2);
        }
        
        // Comandos por segundo (média do intervalo)
        if (this.lastMetrics && metrics.stats.total_commands_processed) {
            const cmdDiff = metrics.stats.total_commands_processed - 
                (this.lastMetrics.stats.total_commands_processed || 0);
            const timeDiff = (metrics.timestamp - this.lastMetrics.timestamp) / 1000;
            
            metrics.derived = metrics.derived || {};
            metrics.derived.commandsPerSecond = (cmdDiff / timeDiff).toFixed(2);
        }
    }
    
    // ================================================================
    //                    HISTÓRICO E BASELINE
    // ================================================================
    
    addToHistory(metrics) {
        this.metricsHistory.push(metrics);
        
        // Mantém apenas as últimas N amostras
        if (this.metricsHistory.length > this.config.historySize) {
            this.metricsHistory.shift();
        }
    }
    
    updateBaseline(metrics) {
        // Atualiza baseline com as novas métricas
        if (metrics.application.hitRate > 0) {
            this.baseline.hitRate.samples.push(metrics.application.hitRate);
            if (this.baseline.hitRate.samples.length > 1000) {
                this.baseline.hitRate.samples.shift();
            }
            this.baseline.hitRate.avg = this.calculateAverage(this.baseline.hitRate.samples);
            this.baseline.hitRate.stddev = this.calculateStdDev(this.baseline.hitRate.samples);
        }
        
        if (metrics.derived && metrics.derived.avgCommandLatency) {
            const latency = parseFloat(metrics.derived.avgCommandLatency);
            this.baseline.latency.samples.push(latency);
            if (this.baseline.latency.samples.length > 1000) {
                this.baseline.latency.samples.shift();
            }
            this.baseline.latency.avg = this.calculateAverage(this.baseline.latency.samples);
            this.baseline.latency.stddev = this.calculateStdDev(this.baseline.latency.samples);
        }
        
        if (metrics.memory.used_memory) {
            this.baseline.memory.samples.push(metrics.memory.used_memory);
            if (this.baseline.memory.samples.length > 1000) {
                this.baseline.memory.samples.shift();
            }
            this.baseline.memory.avg = this.calculateAverage(this.baseline.memory.samples);
            this.baseline.memory.stddev = this.calculateStdDev(this.baseline.memory.samples);
        }
    }
    
    calculateAverage(samples) {
        if (samples.length === 0) return 0;
        return samples.reduce((a, b) => a + b, 0) / samples.length;
    }
    
    calculateStdDev(samples) {
        if (samples.length === 0) return 0;
        const avg = this.calculateAverage(samples);
        const squareDiffs = samples.map(value => Math.pow(value - avg, 2));
        const avgSquareDiff = this.calculateAverage(squareDiffs);
        return Math.sqrt(avgSquareDiff);
    }
    
    // ================================================================
    //                    VERIFICAÇÃO DE ALERTAS
    // ================================================================
    
    checkAlerts(metrics) {
        const alerts = [];
        
        // Alerta: Hit Rate Baixo
        if (metrics.application.hitRate < 70) {
            alerts.push({
                level: 'CRITICAL',
                metric: 'hit_rate',
                value: metrics.application.hitRate,
                threshold: 70,
                message: `Hit rate crítico: ${metrics.application.hitRate.toFixed(2)}% (esperado > 70%)`
            });
        } else if (metrics.application.hitRate < 80) {
            alerts.push({
                level: 'WARNING',
                metric: 'hit_rate',
                value: metrics.application.hitRate,
                threshold: 80,
                message: `Hit rate abaixo do esperado: ${metrics.application.hitRate.toFixed(2)}% (esperado > 80%)`
            });
        }
        
        // Alerta: Latência Alta
        if (metrics.derived && metrics.derived.avgCommandLatency) {
            const latency = parseFloat(metrics.derived.avgCommandLatency);
            if (latency > 200) {
                alerts.push({
                    level: 'CRITICAL',
                    metric: 'latency',
                    value: latency,
                    threshold: 200,
                    message: `Latência crítica: ${latency}ms (esperado < 200ms)`
                });
            } else if (latency > 100) {
                alerts.push({
                    level: 'WARNING',
                    metric: 'latency',
                    value: latency,
                    threshold: 100,
                    message: `Latência elevada: ${latency}ms (esperado < 100ms)`
                });
            }
        }
        
        // Alerta: Uso de Memória
        if (metrics.derived && metrics.derived.memoryUsagePercent) {
            const memUsage = parseFloat(metrics.derived.memoryUsagePercent);
            if (memUsage > 95) {
                alerts.push({
                    level: 'CRITICAL',
                    metric: 'memory',
                    value: memUsage,
                    threshold: 95,
                    message: `Memória crítica: ${memUsage}% (limite: 95%)`
                });
            } else if (memUsage > 90) {
                alerts.push({
                    level: 'WARNING',
                    metric: 'memory',
                    value: memUsage,
                    threshold: 90,
                    message: `Memória elevada: ${memUsage}% (limite: 90%)`
                });
            }
        }
        
        // Alerta: Evictions
        if (metrics.derived && metrics.derived.evictionRate) {
            const evictionRate = parseFloat(metrics.derived.evictionRate);
            if (evictionRate > 100) {
                alerts.push({
                    level: 'CRITICAL',
                    metric: 'evictions',
                    value: evictionRate,
                    threshold: 100,
                    message: `Evictions críticas: ${evictionRate}/s (limite: 100/s)`
                });
            } else if (evictionRate > 10) {
                alerts.push({
                    level: 'WARNING',
                    metric: 'evictions',
                    value: evictionRate,
                    threshold: 10,
                    message: `Evictions elevadas: ${evictionRate}/s (limite: 10/s)`
                });
            }
        }
        
        // Alerta: Conexões Rejeitadas
        if (metrics.stats.rejected_connections && metrics.stats.rejected_connections > 0) {
            alerts.push({
                level: 'ERROR',
                metric: 'rejected_connections',
                value: metrics.stats.rejected_connections,
                threshold: 0,
                message: `Conexões rejeitadas: ${metrics.stats.rejected_connections}`
            });
        }
        
        // Emite alertas
        if (alerts.length > 0) {
            this.emit('alerts:triggered', alerts);
            alerts.forEach(alert => {
                console.warn(`⚠️  [${alert.level}] ${alert.message}`);
            });
        }
    }
    
    // ================================================================
    //                    MÉTODOS PÚBLICOS
    // ================================================================
    
    getLastMetrics() {
        return this.lastMetrics;
    }
    
    getMetricsHistory(minutes = 60) {
        const samplesNeeded = Math.ceil((minutes * 60) / (this.config.interval / 1000));
        return this.metricsHistory.slice(-samplesNeeded);
    }
    
    getBaseline() {
        return this.baseline;
    }
    
    getHealthStatus() {
        if (!this.lastMetrics) return { status: 'UNKNOWN', message: 'Sem métricas disponíveis' };
        
        const m = this.lastMetrics;
        const issues = [];
        
        // Verifica hit rate
        if (m.application.hitRate < 70) issues.push('Hit rate crítico');
        
        // Verifica latência
        if (m.derived && parseFloat(m.derived.avgCommandLatency) > 200) {
            issues.push('Latência crítica');
        }
        
        // Verifica memória
        if (m.derived && parseFloat(m.derived.memoryUsagePercent) > 95) {
            issues.push('Memória crítica');
        }
        
        // Verifica uptime
        if (m.server.uptime_in_seconds < 300) {
            issues.push('Redis reiniciado recentemente');
        }
        
        if (issues.length === 0) {
            return { status: 'HEALTHY', message: 'Sistema operando normalmente' };
        } else if (issues.length <= 2) {
            return { status: 'WARNING', message: issues.join(', ') };
        } else {
            return { status: 'CRITICAL', message: issues.join(', ') };
        }
    }
    
    // Incrementa contadores internos (chamado pela aplicação)
    recordCacheHit() { this.internalCounters.cacheHits++; }
    recordCacheMiss() { this.internalCounters.cacheMisses++; }
    recordAICall() { this.internalCounters.aiCalls++; }
    recordError() { this.internalCounters.errors++; }
    recordSlowCommand() { this.internalCounters.slowCommands++; }
}

// ================================================================
//                    EXPORTS
// ================================================================

module.exports = RedisMonitor;
