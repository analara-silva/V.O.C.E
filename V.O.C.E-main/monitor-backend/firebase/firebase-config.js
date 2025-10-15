const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const serviceAccount = require('./firebase-credentials.json');

// Inicialização do Firebase Admin
initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();

// Exportamos para que as rotas possam usar
module.exports.db = db;
module.exports.auth = auth;