// ================================================================
//                    SISTEMA DE ALERTAS SIMPLIFICADO
// ================================================================

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

// ================================================================
//                    CLASSE DE GERENCIAMENTO DE ALERTAS
// ================================================================

class AlertManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Configurações de log
            log: {
                enabled: options.logEnabled !== false, // Habilitado por padrão
                path: options.logPath || './logs/alerts.log'
            },
            
            // Configurações de webhook (Slack, Discord, etc)
            webhook: {
                enabled: options.webhookEnabled || false,
                url: options.webhookUrl || ''
            },
            
            // Configurações de deduplicação
            deduplication: {
                enabled: options.deduplicationEnabled !== false,
                window: options.deduplicationWindow || 300000 // 5 minutos
            },
            
            // Níveis de severidade que disparam notificações
            notificationLevels: options.notificationLevels || ['WARNING', 'ERROR', 'CRITICAL']
        };
        
        // Cache de alertas recentes (para deduplicação)
        this.recentAlerts = new Map();
        
        // Histórico de alertas
        this.alertHistory = [];
        
        // Limpeza periódica do cache de deduplicação
        setInterval(() => this.cleanupRecentAlerts(), 60000); // A cada 1 minuto
    }
    
    // ================================================================
    //                    PROCESSAMENTO DE ALERTAS
    // ================================================================
    
    async processAlerts(alerts) {
        if (!Array.isArray(alerts) || alerts.length === 0) return;
        
        for (const alert of alerts) {
            await this.processAlert(alert);
        }
    }
    
    async processAlert(alert) {
        // Adiciona timestamp se não existir
        if (!alert.timestamp) {
            alert.timestamp = new Date().toISOString();
        }
        
        // Adiciona ID único
        alert.id = this.generateAlertId(alert);
        
        // Verifica deduplicação
        if (this.config.deduplication.enabled && this.isDuplicate(alert)) {
            console.log(`🔄 Alerta duplicado ignorado: ${alert.id}`);
            return;
        }
        
        // Adiciona ao histórico
        this.alertHistory.push(alert);
        if (this.alertHistory.length > 1000) {
            this.alertHistory.shift();
        }
        
        // Registra no cache de deduplicação
        if (this.config.deduplication.enabled) {
            this.recentAlerts.set(alert.id, Date.now());
        }
        
        // Emite evento
        this.emit('alert:processed', alert);
        
        // Verifica se deve notificar
        if (this.shouldNotify(alert)) {
            await this.sendNotifications(alert);
        }
        
        // Sempre loga
        if (this.config.log.enabled) {
            await this.logAlert(alert);
        }
    }
    
    // ================================================================
    //                    DEDUPLICAÇÃO
    // ================================================================
    
    generateAlertId(alert) {
        // Gera ID baseado em métrica + nível
        return `${alert.metric}_${alert.level}_${Math.floor(Date.now() / 60000)}`;
    }
    
    isDuplicate(alert) {
        const lastSeen = this.recentAlerts.get(alert.id);
        if (!lastSeen) return false;
        
        const elapsed = Date.now() - lastSeen;
        return elapsed < this.config.deduplication.window;
    }
    
    cleanupRecentAlerts() {
        const now = Date.now();
        for (const [id, timestamp] of this.recentAlerts.entries()) {
            if (now - timestamp > this.config.deduplication.window) {
                this.recentAlerts.delete(id);
            }
        }
    }
    
    // ================================================================
    //                    NOTIFICAÇÕES
    // ================================================================
    
    shouldNotify(alert) {
        return this.config.notificationLevels.includes(alert.level);
    }
    
    async sendNotifications(alert) {
        const notifications = [];
        
        // Webhook (Slack, Discord, etc)
        if (this.config.webhook.enabled && this.config.webhook.url) {
            notifications.push(this.sendWebhookNotification(alert));
        }
        
        // Console (sempre habilitado)
        notifications.push(this.sendConsoleNotification(alert));
        
        await Promise.allSettled(notifications);
    }
    
    async sendWebhookNotification(alert) {
        try {
            const payload = this.generateWebhookPayload(alert);
            
            const response = await fetch(this.config.webhook.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                console.log(`🔔 Webhook enviado com sucesso`);
                this.emit('notification:sent', { type: 'webhook', alert });
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('❌ Erro ao enviar webhook:', error);
            this.emit('notification:error', { type: 'webhook', alert, error });
        }
    }
    
    sendConsoleNotification(alert) {
        const icon = this.getAlertIcon(alert.level);
        
        console.log(`\n${icon} ${'='.repeat(60)}`);
        console.log(`${icon} [${alert.level}] ALERTA REDIS`);
        console.log(`${icon} ${'='.repeat(60)}`);
        console.log(`${icon} Métrica: ${alert.metric}`);
        console.log(`${icon} Valor: ${alert.value}`);
        console.log(`${icon} Threshold: ${alert.threshold}`);
        console.log(`${icon} Mensagem: ${alert.message}`);
        console.log(`${icon} Timestamp: ${alert.timestamp}`);
        console.log(`${icon} ${'='.repeat(60)}\n`);
        
        this.emit('notification:sent', { type: 'console', alert });
    }
    
    // ================================================================
    //                    GERAÇÃO DE CONTEÚDO
    // ================================================================
    
    generateWebhookPayload(alert) {
        // Formato compatível com Slack/Discord
        const icon = this.getAlertIcon(alert.level);
        const color = this.getAlertColorHex(alert.level);
        
        return {
            username: 'Redis Monitor - V.O.C.E.',
            embeds: [{
                title: `${icon} Alerta Redis: ${alert.metric}`,
                description: alert.message,
                color: parseInt(color.replace('#', ''), 16),
                fields: [
                    { name: 'Nível', value: alert.level, inline: true },
                    { name: 'Valor', value: String(alert.value), inline: true },
                    { name: 'Threshold', value: String(alert.threshold), inline: true },
                    { name: 'Timestamp', value: alert.timestamp, inline: false }
                ],
                footer: { text: 'V.O.C.E. Redis Monitor' },
                timestamp: new Date(alert.timestamp).toISOString()
            }]
        };
    }
    
    // ================================================================
    //                    HELPERS
    // ================================================================
    
    getAlertIcon(level) {
        const icons = {
            INFO: 'ℹ️',
            WARNING: '⚠️',
            ERROR: '❌',
            CRITICAL: '🚨'
        };
        return icons[level] || '📊';
    }
    
    getAlertColorHex(level) {
        const colors = {
            INFO: '#17a2b8',
            WARNING: '#ffc107',
            ERROR: '#dc3545',
            CRITICAL: '#6f42c1'
        };
        return colors[level] || '#6c757d';
    }
    
    // ================================================================
    //                    LOG DE ALERTAS
    // ================================================================
    
    async logAlert(alert) {
        try {
            const logEntry = JSON.stringify({
                timestamp: alert.timestamp,
                level: alert.level,
                metric: alert.metric,
                value: alert.value,
                threshold: alert.threshold,
                message: alert.message
            }) + '\n';
            
            // Garante que o diretório existe
            const logDir = path.dirname(this.config.log.path);
            await fs.mkdir(logDir, { recursive: true });
            
            // Append ao arquivo de log
            await fs.appendFile(this.config.log.path, logEntry);
            
        } catch (error) {
            console.error('❌ Erro ao escrever log de alerta:', error);
        }
    }
    
    // ================================================================
    //                    MÉTODOS PÚBLICOS
    // ================================================================
    
    getAlertHistory(limit = 100) {
        return this.alertHistory.slice(-limit);
    }
    
    getAlertStats() {
        const stats = {
            total: this.alertHistory.length,
            byLevel: {},
            byMetric: {},
            last24h: 0
        };
        
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        
        for (const alert of this.alertHistory) {
            // Por nível
            stats.byLevel[alert.level] = (stats.byLevel[alert.level] || 0) + 1;
            
            // Por métrica
            stats.byMetric[alert.metric] = (stats.byMetric[alert.metric] || 0) + 1;
            
            // Últimas 24h
            const alertTime = new Date(alert.timestamp).getTime();
            if (alertTime > oneDayAgo) {
                stats.last24h++;
            }
        }
        
        return stats;
    }
    
    clearHistory() {
        this.alertHistory = [];
        console.log('🗑️  Histórico de alertas limpo');
    }
}

// ================================================================
//                    EXPORTS
// ================================================================

module.exports = AlertManager;
