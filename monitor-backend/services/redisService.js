// redisService.js
const { Redis } = require('ioredis');

const redis = new Redis({
  host: "127.0.0.1",
  port: 6379,
});

redis.on("connect", () => console.log("[Redis] Conectado com sucesso!"));
redis.on("error", (err) => console.error("[Redis] Erro:", err));

// ------------ Helpers de chave -----------

function keyFor(url) {
  return `category:${url}`;
}

// ------------ Funções exportadas -----------

async function cacheCategory(url, category) {
  const key = keyFor(url);
  await redis.set(key, category, "EX", 60 * 60 * 12); // expira em 12h
  return true;
}

async function getCachedCategory(url) {
  const key = keyFor(url);
  return await redis.get(key);
}


module.exports = {cacheCategory, getCachedCategory}


