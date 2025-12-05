// ================================================================
//                    MÓDULO DE CACHE REDIS - V.O.C.E.
// ================================================================
// Arquivo: monitor-backend/cache/redis-cache.js
// Descrição: Gerenciamento de cache de categorias de URLs

const redis = require('redis');

// ================================================================
//                    CONFIGURAÇÃO DO CLIENTE REDIS
// ================================================================

let redisClient = null;
let isRedisAvailable = false;

// Configuração do cliente
const redisConfig = {
    socket: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    reconnectStrategy: (retries) => { if (retries > 10) {
                console.error('❌ Redis: Máximo de tentativas de reconexão atingido');
                return new Error('Redis indisponível após 10 tentativas');
            }
            // Reconecta com backoff exponencial (max 3s)
            return Math.min(retries * 100, 3000); 
        }
},
    password: process.env.REDIS_PASSWORD,
    database: Number(process.env.REDIS_DB || 0)
    
    
};

// ================================================================
//                    INICIALIZAÇÃO DO REDIS
// ================================================================

async function initRedis() {
    try {
        redisClient = redis.createClient(redisConfig);

        // Event handlers
        redisClient.on('error', (err) => {
            console.error('❌ Redis Error:', err.message);
            isRedisAvailable = false;
        });

        redisClient.on('connect', () => {
            console.log('🔄 Redis: Conectando...');
        });

        redisClient.on('ready', () => {
            console.log('✅ Redis: Pronto e operacional');
            isRedisAvailable = true;
        });

        redisClient.on('reconnecting', () => {
            console.log('🔄 Redis: Tentando reconectar...');
            isRedisAvailable = false;
        });

        redisClient.on('end', () => {
            console.log('⚠️  Redis: Conexão encerrada');
            isRedisAvailable = false;
        });

        // Conecta ao Redis
        await redisClient.connect();
        
        // Testa a conexão
        await redisClient.ping();
        console.log('✅ Redis Cache inicializado com sucesso');

    } catch (error) {
        console.error('❌ Falha ao conectar ao Redis:', error.message);
        console.warn('⚠️  Sistema continuará sem cache (modo degradado)');
        isRedisAvailable = false;
    }
}

// ================================================================
//                    FUNÇÕES DE CACHE
// ================================================================

/**
 * Busca a categoria de uma URL no cache
 * @param {string} hostname - Hostname da URL (ex: "www.google.com")
 * @returns {Promise<string|null>} - Categoria ou null se não estiver no cache
 */
async function getCachedCategory(hostname) {
    if (!isRedisAvailable || !redisClient) {
        return null; // Cache indisponível, retorna null
    }

    try {
        const key = `category:hostname:${hostname.toLowerCase()}`;
        const category = await redisClient.get(key);
        
        if (category) {
            // Incrementa contador de hits (opcional - para estatísticas)
            await redisClient.incr('cache:stats:hits').catch(() => {});
            console.log(`✅ Cache HIT: ${hostname} -> ${category}`);
        } else {
            // Incrementa contador de misses (opcional)
            await redisClient.incr('cache:stats:misses').catch(() => {});
            console.log(`❌ Cache MISS: ${hostname}`);
        }
        
        return category;
    } catch (error) {
        console.error('Erro ao buscar no cache:', error.message);
        return null; // Em caso de erro, retorna null (sistema continua)
    }
}

/**
 * Salva a categoria de uma URL no cache
 * @param {string} hostname - Hostname da URL
 * @param {string} category - Categoria classificada
 * @param {number} ttl - Tempo de vida em segundos (padrão: 30 dias)
 * @returns {Promise<boolean>} - true se salvou com sucesso
 */
async function setCachedCategory(hostname, category, ttl = 2592000) {
    if (!isRedisAvailable || !redisClient) {
        return false; // Cache indisponível
    }

    try {
        const key = `category:hostname:${hostname.toLowerCase()}`;
        
        // Salva com TTL (EX = expira em X segundos)
        await redisClient.set(key, category, { EX: ttl });
        
        console.log(`💾 Cache SET: ${hostname} -> ${category} (TTL: ${ttl}s)`);
        return true;
    } catch (error) {
        console.error('Erro ao salvar no cache:', error.message);
        return false;
    }
}

/**
 * Invalida (remove) a categoria de uma URL do cache
 * Útil quando professor faz override manual
 * @param {string} hostname - Hostname da URL
 * @returns {Promise<boolean>} - true se removeu com sucesso
 */
async function invalidateCachedCategory(hostname) {
    if (!isRedisAvailable || !redisClient) {
        return false;
    }

    try {
        const key = `category:hostname:${hostname.toLowerCase()}`;
        const deleted = await redisClient.del(key);
        
        if (deleted > 0) {
            console.log(`🗑️  Cache INVALIDADO: ${hostname}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Erro ao invalidar cache:', error.message);
        return false;
    }
}

/**
 * Busca múltiplas categorias de uma vez (otimização)
 * @param {string[]} hostnames - Array de hostnames
 * @returns {Promise<Object>} - Objeto {hostname: categoria}
 */
async function getCachedCategoriesBulk(hostnames) {
    if (!isRedisAvailable || !redisClient || hostnames.length === 0) {
        return {};
    }

    try {
        const keys = hostnames.map(h => `category:hostname:${h.toLowerCase()}`);
        const values = await redisClient.mGet(keys);
        
        const result = {};
        hostnames.forEach((hostname, index) => {
            if (values[index]) {
                result[hostname] = values[index];
            }
        });
        
        console.log(`📦 Cache BULK: ${Object.keys(result).length}/${hostnames.length} encontrados`);
        return result;
    } catch (error) {
        console.error('Erro ao buscar múltiplas categorias:', error.message);
        return {};
    }
}

/**
 * Obtém estatísticas do cache
 * @returns {Promise<Object>} - Estatísticas de uso do cache
 */
async function getCacheStats() {
    if (!isRedisAvailable || !redisClient) {
        return { available: false };
    }

    try {
        const [hits, misses, aiCalls, info] = await Promise.all([
            redisClient.get('cache:stats:hits').then(v => parseInt(v) || 0),
            redisClient.get('cache:stats:misses').then(v => parseInt(v) || 0),
            redisClient.get('cache:stats:ai_calls').then(v => parseInt(v) || 0),
            redisClient.info('memory')
        ]);

        const total = hits + misses;
        const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : 0;

        // Extrai uso de memória do Redis
        const memoryMatch = info.match(/used_memory_human:(.+)/);
        const memory = memoryMatch ? memoryMatch[1].trim() : 'N/A';

        return {
            available: true,
            hits,
            misses,
            total,
            hitRate: `${hitRate}%`,
            aiCalls,
            aiReduction: total > 0 ? `${(100 - (aiCalls / total * 100)).toFixed(2)}%` : 'N/A',
            memory
        };
    } catch (error) {
        console.error('Erro ao obter estatísticas:', error.message);
        return { available: false, error: error.message };
    }
}

/**
 * Incrementa contador de chamadas à IA (para estatísticas)
 */
async function incrementAICalls() {
    if (!isRedisAvailable || !redisClient) return;
    try {
        await redisClient.incr('cache:stats:ai_calls');
    } catch (error) {
        // Silencioso - estatísticas são opcionais
    }
}

/**
 * Limpa todas as estatísticas (útil para testes)
 */
async function resetStats() {
    if (!isRedisAvailable || !redisClient) return false;
    try {
        await redisClient.del(['cache:stats:hits', 'cache:stats:misses', 'cache:stats:ai_calls']);
        console.log('📊 Estatísticas do cache resetadas');
        return true;
    } catch (error) {
        console.error('Erro ao resetar estatísticas:', error.message);
        return false;
    }
}

/**
 * Encerra a conexão com o Redis (para shutdown gracioso)
 */
async function closeRedis() {
    if (redisClient) {
        try {
            await redisClient.quit();
            console.log('👋 Redis: Conexão encerrada graciosamente');
        } catch (error) {
            console.error('Erro ao encerrar Redis:', error.message);
        }
    }
}

// ================================================================
//                    EXPORTS
// ================================================================

module.exports = {
    initRedis,
    getCachedCategory,
    setCachedCategory,
    invalidateCachedCategory,
    getCachedCategoriesBulk,
    getCacheStats,
    incrementAICalls,
    resetStats,
    closeRedis,
    // Getter para verificar disponibilidade
    get isAvailable() { return isRedisAvailable; }
};
