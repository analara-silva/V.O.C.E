// ================================================================
//                  CONFIGURAÇÃO DO FIREBASE
// ================================================================
const admin = require('firebase-admin');

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
    });
} else {
    console.warn('⚠️  Credenciais do Firebase não configuradas. Configure as variáveis de ambiente ou use um arquivo de credenciais.');
    // Inicialização padrão para desenvolvimento local (sem credenciais)
    // Você pode usar o Firebase Emulator Suite para testes locais
    admin.initializeApp();
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
