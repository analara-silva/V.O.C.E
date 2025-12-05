// ================================================================
//                       IMPORTS E CONFIGURAÇÃO INICIAL
// ================================================================
const compression = require('compression')
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');

const { requireLogin } = require('./middlewares/auth.js')

// Módulos de Rotas
const apiRoutes = require('./routes/api.js');
const publicApiRoutes = require('./routes/public_api.js')
const viewRoutes = require('./routes/views.js'); 

// ================================================================
//      IMPORTAÇÃO DO CACHE REDIS E SISTEMA DE MONITORAMENTO
// ================================================================
const cache = require('./cache/redis-cache');
const RedisMonitor = require('./monitoring/redis-monitor');
const AlertManager = require('./monitoring/alert-manager');
const { router: monitoringRouter, setupMonitoring } = require('./routes/monitoring-api');

const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
const port = process.env.PORT || 8081;

// Instâncias de monitoramento (globais)
let redisMonitor = null;
let alertManager = null;

// ================================================================
//                       CONFIGURAÇÃO DO EXPRESS
// ================================================================
app.set('view engine', 'ejs');
app.set('views', path.resolve(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(compression())
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'chave-secreta-para-a-versao-oficial-do-tcc',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// ================================================================
//                       APLICAÇÃO DAS ROTAS
// ================================================================
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Rotas públicas
app.use('/api/public', publicApiRoutes);

// Rotas protegidas
app.use(['/api', '/dashboard'], requireLogin);

// Rotas privadas de API
app.use('/api', apiRoutes);

// ================================================================
//      ROTAS DE MONITORAMENTO
// ================================================================
app.use('/api/monitoring', monitoringRouter);

// Rota para o dashboard de monitoramento (EJS)
app.get('/monitoring', requireLogin, (req, res) => {
    res.render('monitoring', {
        pageTitle: 'Monitoramento Redis - V.O.C.E.',
        professorName: req.session.user.name || 'Professor'
    });
});

// Registra as rotas normais
app.use('/', viewRoutes);  

// ================================================================
//                       TRATAMENTO DE ERROS E INICIALIZAÇÃO
// ================================================================

app.use((req, res) => res.status(404).render('error404'));

app.use((err, req, res, next) => {
    console.error('ERRO CENTRALIZADO NO BACKEND:', err.stack);
    if (req.originalUrl.startsWith('/api')) {
        res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
    } else {
        res.status(500).send("Erro interno ao processar a requisição.");
    }
});

app.set('socketio', io);

io.on('connection', (socket) => {
    console.log("🔥 Socket conectado!", socket.id);
    
    // Envia status inicial do monitoramento
    if (redisMonitor && redisMonitor.isMonitoring) {
        const lastMetrics = redisMonitor.getLastMetrics();
        if (lastMetrics) {
            socket.emit('redis:metrics', {
                timestamp: lastMetrics.timestamp,
                hitRate: lastMetrics.application.hitRate,
                latency: parseFloat(lastMetrics.derived?.avgCommandLatency || 0),
                memory: parseFloat(lastMetrics.derived?.memoryUsagePercent || 0)
            });
        }
    }
});

// ================================================================
//      INICIALIZAÇÃO DO SISTEMA DE MONITORAMENTO
// ================================================================

async function setupMonitoringSystem(redisClient) {
    try {
        console.log('\n📊 Configurando sistema de monitoramento...');
        
        // 1. Configurar Alert Manager (SEM EMAIL)
        alertManager = new AlertManager({
            // Webhook (opcional - Slack/Discord)
            webhookEnabled: process.env.ALERT_WEBHOOK_ENABLED === 'true',
            webhookUrl: process.env.ALERT_WEBHOOK_URL,
            
            // Log de alertas
            logEnabled: true,
            logPath: './logs/alerts.log',
            
            // Deduplicação
            deduplicationEnabled: true,
            deduplicationWindow: 300000, // 5 minutos
            
            // Níveis que disparam notificações
            notificationLevels: ['WARNING', 'ERROR', 'CRITICAL']
        });
        
        console.log('✅ Alert Manager configurado (Console + Log + Webhook)');
        
        // 2. Configurar Redis Monitor
        redisMonitor = new RedisMonitor(redisClient, {
            interval: 30000, // Coleta a cada 30 segundos
            slowlogThreshold: 10, // Comandos > 10ms são considerados lentos
            historySize: 120 // Mantém 1 hora de histórico (120 * 30s)
        });
        
        console.log('✅ Redis Monitor configurado');
        
        // 3. Conectar eventos do monitor aos alertas
        redisMonitor.on('alerts:triggered', (alerts) => {
            alertManager.processAlerts(alerts);
        });
        
        // 4. SOCKET.IO: Emitir métricas em tempo real
        redisMonitor.on('metrics:collected', (metrics) => {
            // Emite métricas via Socket.IO para todos os clientes conectados
            io.emit('redis:metrics', {
                timestamp: metrics.timestamp,
                hitRate: metrics.application.hitRate,
                latency: parseFloat(metrics.derived?.avgCommandLatency || 0),
                memory: parseFloat(metrics.derived?.memoryUsagePercent || 0)
            });
        });
        
        redisMonitor.on('error', (error) => {
            console.error('❌ Erro no monitor:', error);
        });
        
        // 5. SOCKET.IO: Emitir alertas em tempo real
        alertManager.on('alert:processed', (alert) => {
            // Emite alertas via Socket.IO
            io.emit('redis:alert', alert);
        });
        
        // 6. Injetar instâncias nas rotas de monitoramento
        setupMonitoring(redisMonitor, alertManager);
        
        // 7. Iniciar monitoramento
        redisMonitor.start();
        
        console.log('✅ Sistema de monitoramento iniciado');
        console.log('📡 Socket.IO configurado para atualizações em tempo real\n');
        
    } catch (error) {
        console.error('❌ Erro ao configurar monitoramento:', error);
        console.warn('⚠️  Sistema continuará sem monitoramento avançado');
    }
}

// ================================================================
//      INICIALIZAÇÃO DO SERVIDOR
// ================================================================

async function startServer() {
    try {
        // 1. Inicializa o Redis
        await cache.initRedis();
        
        // 2. Configura sistema de monitoramento (se Redis estiver disponível)
        if (cache.isAvailable) {
            // Obtém o cliente Redis interno para passar ao monitor
            const redisClient = cache.redisClient || require('./cache/redis-cache').redisClient;
            await setupMonitoringSystem(redisClient);
        } else {
            console.warn('⚠️  Redis indisponível - monitoramento desabilitado');
        }
        
        // 3. Inicia o servidor HTTP
        server.listen(port, '0.0.0.0', () => {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ Servidor V.O.C.E. rodando em http://${getLocalIP()}:${port}`);
            console.log(`📊 Cache Redis: ${cache.isAvailable ? 'ATIVO ✅' : 'INATIVO ⚠️'}`);
            console.log(`📈 Monitoramento: ${redisMonitor ? 'ATIVO ✅' : 'INATIVO ⚠️'}`);
            if (redisMonitor) {
                console.log(`📊 Dashboard: http://${getLocalIP()}:${port}/monitoring`);
                console.log(`📡 Atualizações: Socket.IO (tempo real)`);
            }
            console.log(`${'='.repeat(60)}\n`);
        });
        
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

// ================================================================
//      SHUTDOWN GRACIOSO
// ================================================================

async function gracefulShutdown(signal) {
    console.log(`\n⚠️  Recebido sinal: ${signal}`);
    console.log('🔄 Encerrando servidor graciosamente...');
    
    // Para o monitoramento
    if (redisMonitor) {
        redisMonitor.stop();
        console.log('✅ Monitor parado');
    }
    
    // Fecha o Redis
    await cache.closeRedis();
    
    // Fecha o servidor HTTP
    server.close(() => {
        console.log('✅ Servidor HTTP encerrado');
        console.log('👋 Até logo!\n');
        process.exit(0);
    });
    
    // Força encerramento após 10 segundos
    setTimeout(() => {
        console.error('⚠️  Forçando encerramento...');
        process.exit(1);
    }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Trata erros não capturados
process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada não tratada:', reason);
});

// Inicia o servidor
startServer();

function getLocalIP() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (let iface in interfaces) {
      for (let i of interfaces[iface]) {
        if (i.family === 'IPv4' && !i.internal) return i.address;
      }
    }
    return 'localhost';
}
