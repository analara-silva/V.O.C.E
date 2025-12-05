// ================================================================
//                    API DE MONITORAMENTO - V.O.C.E.
// ================================================================
// Arquivo: monitor-backend/routes/monitoring-api.js
// Descrição: Endpoints para dashboard de monitoramento do Redis

const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/auth');

// Instâncias globais (serão injetadas pelo app.js)
let redisMonitor = null;
let alertManager = null;

// ================================================================
//                    CONFIGURAÇÃO
// ================================================================

function setupMonitoring(monitor, alerts) {
    redisMonitor = monitor;
    alertManager = alerts;
}

// ================================================================
//                    ENDPOINTS DE MÉTRICAS
// ================================================================

// GET /api/monitoring/metrics - Métricas atuais
router.get('/metrics', requireLogin, async (req, res) => {
    try {
        if (!redisMonitor) {
            return res.status(503).json({ error: 'Monitor não inicializado' });
        }
        
        const metrics = redisMonitor.getLastMetrics();
        
        if (!metrics) {
            return res.status(404).json({ error: 'Nenhuma métrica disponível ainda' });
        }
        
        // Formata resposta para o frontend
        const response = {
            timestamp: metrics.timestamp,
            
            // Métricas de Cache
            cache: {
                hitRate: metrics.application.hitRate.toFixed(2),
                hits: metrics.application.hits,
                misses: metrics.application.misses,
                total: metrics.application.total,
                aiCalls: metrics.application.aiCalls,
                aiReduction: metrics.application.aiReduction.toFixed(2)
            },
            
            // Métricas de Performance
            performance: {
                commandsPerSec: metrics.derived?.commandsPerSecond || 0,
                avgLatency: metrics.derived?.avgCommandLatency || 0,
                evictionRate: metrics.derived?.evictionRate || 0
            },
            
            // Métricas de Memória
            memory: {
                used: metrics.memory.used_memory_human,
                usedBytes: metrics.memory.used_memory,
                maxmemory: metrics.memory.maxmemory,
                usagePercent: metrics.derived?.memoryUsagePercent || 0,
                fragmentation: metrics.derived?.memoryFragmentation || 1.0,
                evictedKeys: metrics.stats.evicted_keys || 0
            },
            
            // Métricas de Conexão
            connections: {
                connected: metrics.clients.connected_clients || 0,
                blocked: metrics.clients.blocked_clients || 0,
                rejected: metrics.stats.rejected_connections || 0
            },
            
            // Informações do Servidor
            server: {
                version: metrics.server.redis_version,
                uptime: metrics.server.uptime_in_seconds,
                uptimeHuman: this.formatUptime(metrics.server.uptime_in_seconds)
            },
            
            // Status de Saúde
            health: redisMonitor.getHealthStatus()
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('Erro ao obter métricas:', error);
        res.status(500).json({ error: 'Erro ao obter métricas' });
    }
});

// GET /api/monitoring/metrics/history - Histórico de métricas
router.get('/metrics/history', requireLogin, async (req, res) => {
    try {
        if (!redisMonitor) {
            return res.status(503).json({ error: 'Monitor não inicializado' });
        }
        
        const minutes = parseInt(req.query.minutes) || 60;
        const history = redisMonitor.getMetricsHistory(minutes);
        
        // Formata para gráficos (séries temporais)
        const timeSeries = {
            timestamps: [],
            hitRate: [],
            latency: [],
            memory: [],
            commandsPerSec: []
        };
        
        for (const m of history) {
            timeSeries.timestamps.push(m.timestamp);
            timeSeries.hitRate.push(m.application.hitRate);
            timeSeries.latency.push(parseFloat(m.derived?.avgCommandLatency || 0));
            timeSeries.memory.push(parseFloat(m.derived?.memoryUsagePercent || 0));
            timeSeries.commandsPerSec.push(parseFloat(m.derived?.commandsPerSecond || 0));
        }
        
        res.json(timeSeries);
        
    } catch (error) {
        console.error('Erro ao obter histórico:', error);
        res.status(500).json({ error: 'Erro ao obter histórico' });
    }
});

// GET /api/monitoring/baseline - Baseline aprendido
router.get('/baseline', requireLogin, async (req, res) => {
    try {
        if (!redisMonitor) {
            return res.status(503).json({ error: 'Monitor não inicializado' });
        }
        
        const baseline = redisMonitor.getBaseline();
        
        res.json({
            hitRate: {
                avg: baseline.hitRate.avg.toFixed(2),
                stddev: baseline.hitRate.stddev.toFixed(2),
                samples: baseline.hitRate.samples.length
            },
            latency: {
                avg: baseline.latency.avg.toFixed(2),
                stddev: baseline.latency.stddev.toFixed(2),
                samples: baseline.latency.samples.length
            },
            memory: {
                avg: (baseline.memory.avg / (1024 * 1024)).toFixed(2) + ' MB',
                stddev: (baseline.memory.stddev / (1024 * 1024)).toFixed(2) + ' MB',
                samples: baseline.memory.samples.length
            }
        });
        
    } catch (error) {
        console.error('Erro ao obter baseline:', error);
        res.status(500).json({ error: 'Erro ao obter baseline' });
    }
});

// ================================================================
//                    ENDPOINTS DE ALERTAS
// ================================================================

// GET /api/monitoring/alerts - Histórico de alertas
router.get('/alerts', requireLogin, async (req, res) => {
    try {
        if (!alertManager) {
            return res.status(503).json({ error: 'Alert manager não inicializado' });
        }
        
        const limit = parseInt(req.query.limit) || 100;
        const alerts = alertManager.getAlertHistory(limit);
        
        res.json({
            total: alerts.length,
            alerts: alerts.reverse() // Mais recentes primeiro
        });
        
    } catch (error) {
        console.error('Erro ao obter alertas:', error);
        res.status(500).json({ error: 'Erro ao obter alertas' });
    }
});

// GET /api/monitoring/alerts/stats - Estatísticas de alertas
router.get('/alerts/stats', requireLogin, async (req, res) => {
    try {
        if (!alertManager) {
            return res.status(503).json({ error: 'Alert manager não inicializado' });
        }
        
        const stats = alertManager.getAlertStats();
        res.json(stats);
        
    } catch (error) {
        console.error('Erro ao obter estatísticas de alertas:', error);
        res.status(500).json({ error: 'Erro ao obter estatísticas' });
    }
});

// DELETE /api/monitoring/alerts - Limpar histórico de alertas
router.delete('/alerts', requireLogin, async (req, res) => {
    try {
        if (!alertManager) {
            return res.status(503).json({ error: 'Alert manager não inicializado' });
        }
        
        alertManager.clearHistory();
        res.json({ success: true, message: 'Histórico de alertas limpo' });
        
    } catch (error) {
        console.error('Erro ao limpar alertas:', error);
        res.status(500).json({ error: 'Erro ao limpar alertas' });
    }
});

// ================================================================
//                    ENDPOINTS DE CONTROLE
// ================================================================

// POST /api/monitoring/start - Iniciar monitoramento
router.post('/start', requireLogin, async (req, res) => {
    try {
        if (!redisMonitor) {
            return res.status(503).json({ error: 'Monitor não inicializado' });
        }
        
        redisMonitor.start();
        res.json({ success: true, message: 'Monitoramento iniciado' });
        
    } catch (error) {
        console.error('Erro ao iniciar monitoramento:', error);
        res.status(500).json({ error: 'Erro ao iniciar monitoramento' });
    }
});

// POST /api/monitoring/stop - Parar monitoramento
router.post('/stop', requireLogin, async (req, res) => {
    try {
        if (!redisMonitor) {
            return res.status(503).json({ error: 'Monitor não inicializado' });
        }
        
        redisMonitor.stop();
        res.json({ success: true, message: 'Monitoramento parado' });
        
    } catch (error) {
        console.error('Erro ao parar monitoramento:', error);
        res.status(500).json({ error: 'Erro ao parar monitoramento' });
    }
});

// GET /api/monitoring/status - Status do sistema de monitoramento
router.get('/status', requireLogin, async (req, res) => {
    try {
        const status = {
            monitor: {
                initialized: !!redisMonitor,
                running: redisMonitor ? redisMonitor.isMonitoring : false
            },
            alertManager: {
                initialized: !!alertManager,
                emailEnabled: alertManager ? alertManager.config.email.enabled : false,
                webhookEnabled: alertManager ? alertManager.config.webhook.enabled : false
            }
        };
        
        res.json(status);
        
    } catch (error) {
        console.error('Erro ao obter status:', error);
        res.status(500).json({ error: 'Erro ao obter status' });
    }
});

// ================================================================
//                    HELPERS
// ================================================================

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.join(' ') || '< 1m';
}

// ================================================================
//                    EXPORTS
// ================================================================

module.exports = {
    router,
    setupMonitoring
};
