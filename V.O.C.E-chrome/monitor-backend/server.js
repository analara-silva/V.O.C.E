// ================================================================
// 						IMPORTS E CONFIGURAÇÃO INICIAL
// ================================================================
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { db } = require('./firebase/firebase-config.js');
const classifier = require('./classifier/python_classifier.js');

const app = express();
const port = process.env.PORT || 3000;

// ================================================================
// 						CONFIGURAÇÃO DO EXPRESS
// ================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
	secret: process.env.SESSION_SECRET || 'segredo-muito-forte-aqui',
	resave: false,
	saveUninitialized: false,
	cookie: {
		secure: false, // Em produção, use 'true' com HTTPS
		maxAge: 24 * 60 * 60 * 1000
	}
}));

// ================================================================
// 						MIDDLEWARE DE AUTENTICAÇÃO
// ================================================================
const requireLogin = (req, res, next) => {
	if (req.session && req.session.professorId) {
		return next();
	} else {
		res.redirect('/login');
	}
};

app.use((req, res, next) => {
	console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
	next();
});

// ================================================================
// 						ROTAS PÚBLICAS
// ================================================================

app.get('/', (req, res) => res.render(
	'landpage', { pageTitle: 'V.O.C.E - Monitorização Inteligente' }
));

app.get('/login', (req, res) => res.render(
	'login', { error: null, message: req.query.message || null, pageTitle: 'Login - V.O.C.E' }
));

app.get('/cadastro', (req, res) => res.render(
	'cadastro', { error: null, pageTitle: 'Cadastro - V.O.C.E' }
));

app.post('/login', async (req, res) => {
	const { username, password } = req.body;
	try {
		if (!username || !password) {
			return res.render('login', { 
				error: 'Todos os campos são obrigatórios.', 
				message: null, 
				pageTitle: 'Login - V.O.C.E' 
			});
		}

		// Buscar professor no Firestore
		const professorsRef = db.collection('professors');
		const snapshot = await professorsRef.where('username', '==', username).limit(1).get();
		
		if (snapshot.empty) {
			return res.render('login', { 
				error: 'Nome de utilizador ou senha inválidos.', 
				message: null, 
				pageTitle: 'Login - V.O.C.E' 
			});
		}

		const professorDoc = snapshot.docs[0];
		const professor = { id: professorDoc.id, ...professorDoc.data() };
		
		const isMatch = await bcrypt.compare(password, professor.password_hash);
		
		if (isMatch) {
			req.session.professorId = professor.id;
			req.session.professorName = professor.full_name;
			res.redirect('/dashboard');
		} else {
			res.render('login', { 
				error: 'Nome de utilizador ou senha inválidos.', 
				message: null, 
				pageTitle: 'Login - V.O.C.E' 
			});
		}
	} catch (error) {
		console.error('Erro no login:', error);
		res.status(500).render('login', { 
			error: 'Erro no servidor.', 
			message: null, 
			pageTitle: 'Login - V.O.C.E' 
		});
	}
});

app.post('/cadastro', async (req, res) => {
	const { fullName, username, password } = req.body;
	try {
		if (!fullName || !username || !password) {
			return res.render('cadastro', { 
				error: 'Todos os campos são obrigatórios.', 
				pageTitle: 'Cadastro - V.O.C.E' 
			});
		}

		// Verificar se o username já existe
		const professorsRef = db.collection('professors');
		const existingUser = await professorsRef.where('username', '==', username).limit(1).get();
		
		if (!existingUser.empty) {
			return res.render('cadastro', { 
				error: 'Este nome de utilizador já está em uso.', 
				pageTitle: 'Cadastro - V.O.C.E' 
			});
		}

		// Criar novo professor
		const hashedPassword = await bcrypt.hash(password, 10);
		await professorsRef.add({
			username: username,
			password_hash: hashedPassword,
			full_name: fullName,
			created_at: new Date().toISOString()
		});

		res.redirect('/login?message=Cadastro realizado com sucesso! Pode fazer o login.');
	} catch (error) {
		console.error('Erro no cadastro:', error);
		res.render('cadastro', { 
			error: 'Erro ao criar conta.', 
			pageTitle: 'Cadastro - V.O.C.E' 
		});
	}
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// ================================================================
// 						ROTAS PROTEGIDAS
// ================================================================

app.get('/dashboard', requireLogin, async (req, res) => {
    try {
		const { professorId, professorName } = req.session;
		
		// Buscar turmas do professor
		const classesSnapshot = await db.collection('classes')
			.where('professor_id', '==', professorId)
			.orderBy('name', 'asc')
			.get();
		
		const classes = classesSnapshot.docs.map(doc => ({
			id: doc.id,
			name: doc.data().name
		}));

		// Buscar categorias distintas dos logs
		const logsSnapshot = await db.collection('logs')
			.where('categoria', '!=', null)
			.get();
		
		const categoriesSet = new Set();
		logsSnapshot.docs.forEach(doc => {
			const categoria = doc.data().categoria;
			if (categoria && categoria !== '') {
				categoriesSet.add(categoria);
			}
		});
		
		const categories = Array.from(categoriesSet).sort();

		res.render('dashboard', { 
			pageTitle: 'Dashboard', 
			professorName, 
			classes, 
			categories 
		});
	} catch (error) {
		console.error("Erro ao carregar o dashboard:", error);
		res.status(500).send("Erro ao carregar o dashboard.");
	}
});

// --- APIs DE GESTÃO ---
app.post('/api/classes', requireLogin, async (req, res) => {
    const { name } = req.body;
    const { professorId } = req.session;
    
    if (!name) {
		return res.status(400).json({ error: 'Nome da turma é obrigatório' });
	}
    
    try {
        const classRef = await db.collection('classes').add({
			name: name,
			professor_id: professorId,
			created_at: new Date().toISOString()
		});
		
        res.json({ 
			success: true, 
			message: 'Turma criada com sucesso!', 
			classId: classRef.id 
		});
    } catch (error) {
        console.error('Erro ao criar turma:', error);
        res.status(500).json({ error: 'Erro ao criar turma' });
    }
});

app.put('/api/classes/:classId', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { name } = req.body;
    const { professorId } = req.session;
    
    if (!name) {
		return res.status(400).json({ error: 'O novo nome da turma é obrigatório.' });
	}
    
    try {
		const classRef = db.collection('classes').doc(classId);
		const classDoc = await classRef.get();
		
		if (!classDoc.exists || classDoc.data().professor_id !== professorId) {
			return res.status(404).json({ error: 'Turma não encontrada ou sem permissão.' });
		}
		
		await classRef.update({ name: name });
        res.json({ success: true, message: 'Nome da turma atualizado!' });
    } catch (error) {
        console.error('Erro ao atualizar turma:', error);
        res.status(500).json({ error: 'Erro ao atualizar a turma.' });
    }
});

app.delete('/api/classes/:classId', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { professorId } = req.session;
    
    try {
		const classRef = db.collection('classes').doc(classId);
		const classDoc = await classRef.get();
		
		if (!classDoc.exists || classDoc.data().professor_id !== professorId) {
			return res.status(404).json({ error: 'Turma não encontrada ou sem permissão.' });
		}
		
		// Deletar associações de alunos
		const classStudentsSnapshot = await db.collection('class_students')
			.where('class_id', '==', classId)
			.get();
		
		const batch = db.batch();
		classStudentsSnapshot.docs.forEach(doc => {
			batch.delete(doc.ref);
		});
		batch.delete(classRef);
		await batch.commit();
		
        res.json({ success: true, message: 'Turma removida com sucesso!' });
    } catch (error) {
        console.error('Erro ao remover turma:', error);
        res.status(500).json({ error: 'Erro ao remover a turma.' });
    }
});

app.post('/api/students', requireLogin, async (req, res) => {
    const { fullName, cpf, pc_id } = req.body;
    
    if (!fullName) {
		return res.status(400).json({ error: 'Nome do aluno é obrigatório' });
	}
    
    try {
		// Verificar se CPF ou PC_ID já existem
		if (cpf) {
			const cpfCheck = await db.collection('students').where('cpf', '==', cpf).limit(1).get();
			if (!cpfCheck.empty) {
				return res.status(400).json({ error: 'CPF já cadastrado' });
			}
		}
		
		if (pc_id) {
			const pcIdCheck = await db.collection('students').where('pc_id', '==', pc_id).limit(1).get();
			if (!pcIdCheck.empty) {
				return res.status(400).json({ error: 'PC ID já cadastrado' });
			}
		}
		
        const studentRef = await db.collection('students').add({
			full_name: fullName,
			cpf: cpf || null,
			pc_id: pc_id || null,
			created_at: new Date().toISOString()
		});
		
        res.json({ 
			success: true, 
			message: 'Aluno criado com sucesso!', 
			student: { 
				id: studentRef.id, 
				full_name: fullName, 
				cpf, 
				pc_id 
			} 
		});
    } catch (error) {
        console.error('Erro ao criar aluno:', error);
        res.status(500).json({ error: 'Erro ao criar aluno' });
    }
});

app.put('/api/students/:studentId', requireLogin, async (req, res) => {
	const { studentId } = req.params;
	const { fullName, cpf, pc_id } = req.body;
	
	if (!fullName) {
		return res.status(400).json({ error: 'O nome do aluno é obrigatório.' });
	}
	
	try {
		const studentRef = db.collection('students').doc(studentId);
		const studentDoc = await studentRef.get();
		
		if (!studentDoc.exists) {
			return res.status(404).json({ error: 'Aluno não encontrado.' });
		}
		
		await studentRef.update({
			full_name: fullName,
			cpf: cpf || null,
			pc_id: pc_id || null
		});
		
		res.json({ success: true, message: 'Dados do aluno atualizados!' });
	} catch (error) {
		console.error('Erro ao atualizar aluno:', error);
		res.status(500).json({ error: 'Erro ao atualizar o aluno.' });
	}
});

app.get('/api/students/all', requireLogin, async (req, res) => {
    try {
        const studentsSnapshot = await db.collection('students')
			.orderBy('full_name', 'asc')
			.get();
		
		const students = studentsSnapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data()
		}));
		
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar todos os alunos:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos' });
    }
});

app.get('/api/classes/:classId/students', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        
		// Buscar associações de alunos da turma
		const classStudentsSnapshot = await db.collection('class_students')
			.where('class_id', '==', classId)
			.get();
		
		const studentIds = classStudentsSnapshot.docs.map(doc => doc.data().student_id);
		
		if (studentIds.length === 0) {
			return res.json([]);
		}
		
		// Buscar dados dos alunos
		// Firestore 'in' query tem limite de 10 itens, então precisamos fazer em lotes
		const students = [];
		const chunkSize = 10;
		
		for (let i = 0; i < studentIds.length; i += chunkSize) {
			const chunk = studentIds.slice(i, i + chunkSize);
			const studentsSnapshot = await db.collection('students')
				.where('__name__', 'in', chunk)
				.get();
			
			studentsSnapshot.docs.forEach(doc => {
				students.push({
					id: doc.id,
					...doc.data()
				});
			});
		}
		
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar alunos da turma:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos da turma' });
    }
});

app.post('/api/classes/:classId/add-student', requireLogin, async (req, res) => {
    try {
		const { classId } = req.params;
		const { studentId } = req.body;
		
		// Verificar se já existe
		const existingAssoc = await db.collection('class_students')
			.where('class_id', '==', classId)
			.where('student_id', '==', studentId)
			.limit(1)
			.get();
		
		if (!existingAssoc.empty) {
			return res.status(400).json({ error: 'Aluno já está nesta turma' });
		}
		
		await db.collection('class_students').add({
			class_id: classId,
			student_id: studentId,
			created_at: new Date().toISOString()
		});
		
        res.json({ success: true, message: 'Aluno adicionado à turma!' });
    } catch (error) {
        console.error('Erro ao adicionar aluno à turma:', error);
        res.status(500).json({ error: 'Erro ao associar aluno.' });
    }
});

app.delete('/api/classes/:classId/remove-student/:studentId', requireLogin, async (req, res) => {
    try {
		const { classId, studentId } = req.params;
		
		const assocSnapshot = await db.collection('class_students')
			.where('class_id', '==', classId)
			.where('student_id', '==', studentId)
			.limit(1)
			.get();
		
		if (assocSnapshot.empty) {
			return res.status(404).json({ error: 'Associação não encontrada' });
		}
		
		await assocSnapshot.docs[0].ref.delete();
		
        res.json({ success: true, message: 'Aluno removido da turma!' });
    } catch (error) {
        console.error('Erro ao remover aluno da turma:', error);
        res.status(500).json({ error: 'Erro ao remover aluno.' });
    }
});

// --- APIs DE DADOS (LOGS, ETC.) ---
app.get('/api/logs/filtered', requireLogin, async (req, res) => {
    try {
        const { classId } = req.query;
		let logsQuery = db.collection('logs').orderBy('timestamp', 'desc');
		
		if (classId && classId !== 'null') {
			// Buscar alunos da turma
			const classStudentsSnapshot = await db.collection('class_students')
				.where('class_id', '==', classId)
				.get();
			
			const studentIds = classStudentsSnapshot.docs.map(doc => doc.data().student_id);
			
			if (studentIds.length === 0) {
				return res.json([]);
			}
			
			// Buscar CPFs e PC_IDs dos alunos
			const studentIdentifiers = [];
			const chunkSize = 10;
			
			for (let i = 0; i < studentIds.length; i += chunkSize) {
				const chunk = studentIds.slice(i, i + chunkSize);
				const studentsSnapshot = await db.collection('students')
					.where('__name__', 'in', chunk)
					.get();
				
				studentsSnapshot.docs.forEach(doc => {
					const data = doc.data();
					if (data.cpf) studentIdentifiers.push(data.cpf);
					if (data.pc_id) studentIdentifiers.push(data.pc_id);
				});
			}
			
			if (studentIdentifiers.length === 0) {
				return res.json([]);
			}
			
			// Buscar logs dos alunos (em lotes de 10)
			const logs = [];
			for (let i = 0; i < studentIdentifiers.length; i += chunkSize) {
				const chunk = studentIdentifiers.slice(i, i + chunkSize);
				const logsSnapshot = await db.collection('logs')
					.where('aluno_id', 'in', chunk)
					.orderBy('timestamp', 'desc')
					.get();
				
				logsSnapshot.docs.forEach(doc => {
					logs.push({
						id: doc.id,
						...doc.data()
					});
				});
			}
			
			// Buscar nomes dos alunos
			const studentMap = {};
			for (let i = 0; i < studentIds.length; i += chunkSize) {
				const chunk = studentIds.slice(i, i + chunkSize);
				const studentsSnapshot = await db.collection('students')
					.where('__name__', 'in', chunk)
					.get();
				
				studentsSnapshot.docs.forEach(doc => {
					const data = doc.data();
					if (data.cpf) studentMap[data.cpf] = data.full_name;
					if (data.pc_id) studentMap[data.pc_id] = data.full_name;
				});
			}
			
			// Adicionar nome do aluno aos logs
			logs.forEach(log => {
				log.student_name = studentMap[log.aluno_id] || null;
			});
			
			// Ordenar por timestamp
			logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
			
			return res.json(logs);
		}
		
		// Sem filtro de turma, retornar todos os logs
		const logsSnapshot = await logsQuery.limit(1000).get();
		const logs = logsSnapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data()
		}));
		
		// Buscar nomes dos alunos
		const alunoIds = [...new Set(logs.map(log => log.aluno_id))];
		const studentMap = {};
		
		const studentsSnapshot = await db.collection('students').get();
		studentsSnapshot.docs.forEach(doc => {
			const data = doc.data();
			if (data.cpf) studentMap[data.cpf] = data.full_name;
			if (data.pc_id) studentMap[data.pc_id] = data.full_name;
		});
		
		logs.forEach(log => {
			log.student_name = studentMap[log.aluno_id] || null;
		});
		
        res.json(logs);
    } catch (err) {
        console.error('ERRO na rota /api/logs/filtered:', err);
        res.status(500).json({ error: 'Erro ao consultar os logs.' });
    }
});

app.get('/api/users/summary', requireLogin, async (req, res) => {
    try {
        const { classId } = req.query;
		
		let studentIdentifiers = [];
		let studentMap = {};
		
		if (classId && classId !== 'null') {
			// Buscar alunos da turma
			const classStudentsSnapshot = await db.collection('class_students')
				.where('class_id', '==', classId)
				.get();
			
			const studentIds = classStudentsSnapshot.docs.map(doc => doc.data().student_id);
			
			if (studentIds.length === 0) {
				return res.json([]);
			}
			
			// Buscar dados dos alunos
			const chunkSize = 10;
			for (let i = 0; i < studentIds.length; i += chunkSize) {
				const chunk = studentIds.slice(i, i + chunkSize);
				const studentsSnapshot = await db.collection('students')
					.where('__name__', 'in', chunk)
					.get();
				
				studentsSnapshot.docs.forEach(doc => {
					const data = doc.data();
					if (data.cpf) {
						studentIdentifiers.push(data.cpf);
						studentMap[data.cpf] = data.full_name;
					}
					if (data.pc_id) {
						studentIdentifiers.push(data.pc_id);
						studentMap[data.pc_id] = data.full_name;
					}
				});
			}
		} else {
			// Buscar todos os alunos
			const studentsSnapshot = await db.collection('students').get();
			studentsSnapshot.docs.forEach(doc => {
				const data = doc.data();
				if (data.cpf) {
					studentIdentifiers.push(data.cpf);
					studentMap[data.cpf] = data.full_name;
				}
				if (data.pc_id) {
					studentIdentifiers.push(data.pc_id);
					studentMap[data.pc_id] = data.full_name;
				}
			});
		}
		
		if (studentIdentifiers.length === 0) {
			return res.json([]);
		}
		
		// Buscar logs e calcular resumo
		const summary = {};
		
		const chunkSize = 10;
		for (let i = 0; i < studentIdentifiers.length; i += chunkSize) {
			const chunk = studentIdentifiers.slice(i, i + chunkSize);
			const logsSnapshot = await db.collection('logs')
				.where('aluno_id', 'in', chunk)
				.get();
			
			logsSnapshot.docs.forEach(doc => {
				const log = doc.data();
				const alunoId = log.aluno_id;
				
				if (!summary[alunoId]) {
					summary[alunoId] = {
						aluno_id: alunoId,
						student_name: studentMap[alunoId] || null,
						total_duration: 0,
						log_count: 0,
						last_activity: null,
						has_alert: 0
					};
				}
				
				summary[alunoId].total_duration += log.duration || 0;
				summary[alunoId].log_count += 1;
				
				if (!summary[alunoId].last_activity || log.timestamp > summary[alunoId].last_activity) {
					summary[alunoId].last_activity = log.timestamp;
				}
				
				if (log.categoria === 'Rede Social' || log.categoria === 'Jogos') {
					summary[alunoId].has_alert = 1;
				}
			});
		}
		
		const results = Object.values(summary).sort((a, b) => {
			return new Date(b.last_activity) - new Date(a.last_activity);
		});
		
        res.json(results);
    } catch (err) {
        console.error('ERRO na rota /api/users/summary:', err);
        res.status(500).json({ error: 'Erro ao buscar resumo.' });
    }
});

// API para receber dados da extensão
app.post('/api/data', async (req, res) => {
    const dataFromExtension = req.body;
    try {
        const classificationPromises = dataFromExtension.map(log => classifier.categorizar(log.url));
        const categories = await Promise.all(classificationPromises);
        
        const enrichedData = dataFromExtension.map((log, index) => ({ 
			...log, 
			categoria: categories[index] 
		}));
        
        // Salvar logs no Firestore
		const batch = db.batch();
		enrichedData.forEach(log => {
			const logRef = db.collection('logs').doc();
			batch.set(logRef, {
				aluno_id: log.aluno_id,
				url: log.url,
				duration: log.durationSeconds,
				timestamp: log.timestamp,
				categoria: log.categoria,
				created_at: new Date().toISOString()
			});
		});
		
		await batch.commit();
        console.log(`${enrichedData.length} logs salvos no Firestore.`);

        res.status(200).send({ message: 'Dados recebidos e salvos.' });

    } catch (error) {
        console.error('Erro em /api/data:', error);
        res.status(500).send({ message: 'Erro interno no servidor.' });
    }
});

// Rota de fallback para erro 404
app.use((req, res) => res.status(404).send('Página não encontrada'));

// INICIALIZAÇÃO DO SERVIDOR
app.listen(port, () => console.log(`🚀 Servidor rodando em http://localhost:${port}`));
