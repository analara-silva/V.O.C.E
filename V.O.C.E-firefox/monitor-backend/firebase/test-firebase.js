// ================================================================
//          SCRIPT DE TESTE: Verificar Configuração do Firebase
// ================================================================
// Este script testa a conexão com o Firebase e verifica se as
// operações básicas estão funcionando corretamente.
//
// INSTRUÇÕES DE USO:
// 1. Configure as credenciais do Firebase no arquivo .env
// 2. Execute: node test-firebase.js
//
// ================================================================

require('dotenv').config();
const admin = require('firebase-admin');

console.log('\n🧪 TESTE DE CONFIGURAÇÃO DO FIREBASE\n');
console.log('=' .repeat(60));

// ================================================================
//                  CONFIGURAÇÃO DO FIREBASE
// ================================================================
console.log('\n1️⃣  Testando configuração do Firebase...');

try {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            })
        });
        console.log('   ✅ Firebase inicializado com sucesso!');
        console.log(`   📦 Projeto: ${process.env.FIREBASE_PROJECT_ID}`);
    } else {
        console.error('   ❌ Credenciais do Firebase não encontradas no .env');
        console.log('\n   Por favor, configure as seguintes variáveis:');
        console.log('     - FIREBASE_PROJECT_ID');
        console.log('     - FIREBASE_CLIENT_EMAIL');
        console.log('     - FIREBASE_PRIVATE_KEY');
        process.exit(1);
    }
} catch (error) {
    console.error('   ❌ Erro ao inicializar Firebase:', error.message);
    process.exit(1);
}

const db = admin.firestore();

// ================================================================
//                  TESTES DE OPERAÇÕES
// ================================================================

async function testWrite() {
    console.log('\n2️⃣  Testando escrita no Firestore...');
    
    try {
        const testRef = await db.collection('_test').add({
            message: 'Teste de escrita',
            timestamp: new Date().toISOString(),
            random: Math.random()
        });
        
        console.log('   ✅ Escrita bem-sucedida!');
        console.log(`   📝 ID do documento: ${testRef.id}`);
        return testRef.id;
    } catch (error) {
        console.error('   ❌ Erro na escrita:', error.message);
        throw error;
    }
}

async function testRead(docId) {
    console.log('\n3️⃣  Testando leitura no Firestore...');
    
    try {
        const docRef = db.collection('_test').doc(docId);
        const doc = await docRef.get();
        
        if (doc.exists) {
            console.log('   ✅ Leitura bem-sucedida!');
            console.log('   📄 Dados:', doc.data());
        } else {
            console.error('   ❌ Documento não encontrado');
        }
    } catch (error) {
        console.error('   ❌ Erro na leitura:', error.message);
        throw error;
    }
}

async function testQuery() {
    console.log('\n4️⃣  Testando consulta no Firestore...');
    
    try {
        const snapshot = await db.collection('_test').limit(5).get();
        console.log('   ✅ Consulta bem-sucedida!');
        console.log(`   📊 Documentos encontrados: ${snapshot.size}`);
        
        if (snapshot.size > 0) {
            console.log('   📋 Primeiros documentos:');
            snapshot.docs.slice(0, 3).forEach(doc => {
                console.log(`      - ${doc.id}: ${JSON.stringify(doc.data()).substring(0, 50)}...`);
            });
        }
    } catch (error) {
        console.error('   ❌ Erro na consulta:', error.message);
        throw error;
    }
}

async function testUpdate(docId) {
    console.log('\n5️⃣  Testando atualização no Firestore...');
    
    try {
        const docRef = db.collection('_test').doc(docId);
        await docRef.update({
            updated: true,
            updated_at: new Date().toISOString()
        });
        
        console.log('   ✅ Atualização bem-sucedida!');
    } catch (error) {
        console.error('   ❌ Erro na atualização:', error.message);
        throw error;
    }
}

async function testDelete(docId) {
    console.log('\n6️⃣  Testando exclusão no Firestore...');
    
    try {
        await db.collection('_test').doc(docId).delete();
        console.log('   ✅ Exclusão bem-sucedida!');
    } catch (error) {
        console.error('   ❌ Erro na exclusão:', error.message);
        throw error;
    }
}

async function testBatchOperations() {
    console.log('\n7️⃣  Testando operações em lote...');
    
    try {
        const batch = db.batch();
        
        // Criar 3 documentos em lote
        for (let i = 0; i < 3; i++) {
            const docRef = db.collection('_test').doc();
            batch.set(docRef, {
                batch_test: true,
                index: i,
                timestamp: new Date().toISOString()
            });
        }
        
        await batch.commit();
        console.log('   ✅ Operações em lote bem-sucedidas!');
        console.log('   📦 3 documentos criados');
        
        // Limpar documentos de teste
        const snapshot = await db.collection('_test').where('batch_test', '==', true).get();
        const deleteBatch = db.batch();
        snapshot.docs.forEach(doc => {
            deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();
        console.log('   🧹 Documentos de teste limpos');
        
    } catch (error) {
        console.error('   ❌ Erro nas operações em lote:', error.message);
        throw error;
    }
}

async function checkCollections() {
    console.log('\n8️⃣  Verificando coleções existentes...');
    
    try {
        const collections = await db.listCollections();
        
        if (collections.length === 0) {
            console.log('   ℹ️  Nenhuma coleção encontrada (banco vazio)');
        } else {
            console.log(`   📚 Coleções encontradas: ${collections.length}`);
            collections.forEach(col => {
                console.log(`      - ${col.id}`);
            });
        }
        
        // Verificar coleções esperadas do V.O.C.E
        const expectedCollections = ['professors', 'students', 'classes', 'class_students', 'logs'];
        const existingCollectionIds = collections.map(c => c.id);
        
        console.log('\n   📋 Status das coleções do V.O.C.E:');
        for (const colName of expectedCollections) {
            if (existingCollectionIds.includes(colName)) {
                const snapshot = await db.collection(colName).limit(1).get();
                console.log(`      ✅ ${colName} (${snapshot.size > 0 ? 'com dados' : 'vazia'})`);
            } else {
                console.log(`      ⚪ ${colName} (não criada ainda)`);
            }
        }
        
    } catch (error) {
        console.error('   ❌ Erro ao verificar coleções:', error.message);
        throw error;
    }
}

// ================================================================
//                  EXECUTAR TODOS OS TESTES
// ================================================================

async function runAllTests() {
    let docId;
    
    try {
        docId = await testWrite();
        await testRead(docId);
        await testQuery();
        await testUpdate(docId);
        await testDelete(docId);
        await testBatchOperations();
        await checkCollections();
        
        console.log('\n' + '=' .repeat(60));
        console.log('✅ TODOS OS TESTES PASSARAM COM SUCESSO! 🎉');
        console.log('=' .repeat(60));
        console.log('\n✨ Seu Firebase está configurado corretamente!');
        console.log('📝 Próximos passos:');
        console.log('   1. Execute o servidor: npm start');
        console.log('   2. Ou migre dados do MySQL: node migrate-to-firebase.js\n');
        
    } catch (error) {
        console.log('\n' + '=' .repeat(60));
        console.log('❌ ALGUNS TESTES FALHARAM');
        console.log('=' .repeat(60));
        console.error('\n⚠️  Erro:', error.message);
        console.log('\n💡 Dicas:');
        console.log('   - Verifique as credenciais no arquivo .env');
        console.log('   - Verifique se o Firestore está ativado no Console');
        console.log('   - Verifique sua conexão com a internet\n');
        process.exit(1);
    }
}

// Executar testes
runAllTests();
