// ================================================================
//                         LÓGICA DO DASHBOARD V.O.C.E
// ================================================================

let state = {
    activeClassId: null,
    activeClassName: '',
    allStudents: [],
    studentsInClass: [],
    editingStudentData: null,
    currentChartType: 'bar',
    mainChartInstance: null,
    allLogs: [],
    allSummary: [],
    logsCurrentPage: 1,
    logsPerPage: 100,
    allProfessors: [],
    currentFilters: {
        search: '',
        category: '',
        showAlertsOnly: false,
        studentSearch: '',
    }
};

const socket = io("http://172.24.128.1:8081"); // <--- 1. Inicializa a conexão com o servidor

socket.on('connect', () => {
    console.log("Conectado ao Socket:", socket.id); // Confirma a conexão
});

// Função principal de atualização do dashboard em tempo real
// Função otimizada de atualização em tempo real
async function handleRealtimeUpdate(data) {
    console.log('Evento de logs recebidos via Socket.IO:', data);
    
    // 1. Notificação
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: `Novos logs recebidos (${data.count})!`,
        showConfirmButton: false,
        timer: 2000
    });

    // 2. NOVO: Atualiza o estado diretamente com os dados recebidos
    // Em vez de fazer uma nova requisição, adiciona os novos logs ao estado
    if (data.logs && Array.isArray(data.logs)) {
        // Adiciona os novos logs no início do array
        state.allLogs = [...data.logs, ...state.allLogs];
        
        // Atualiza o summary se necessário
        // (Você pode precisar ajustar o backend para enviar o summary atualizado também)
    }

    // 3. Re-aplica os filtros e renderiza com os novos dados
    applyFiltersAndRender();
}

socket.on('logs_updated', handleRealtimeUpdate); // <--- 2. Ouve o evento emitido pelo servidor

// --- FUNÇÕES DE MODAL ---
// (As funções de modal como openEditClassModal, openShareModal, etc. continuam iguais)
function openEditClassModal(classId, currentName) {
    const modal = document.getElementById('editClassModal');
    if(!modal) return;
    document.getElementById('editClassNameInput').value = currentName;
    modal.dataset.classId = classId;
    modal.classList.remove('hidden');
}

async function openShareModal() {
    if (!state.activeClassId || state.activeClassId === 'null') return;
    const modal = document.getElementById('shareClassModal');
    document.getElementById('shareClassName').textContent = `"${state.activeClassName}"`;
    
    await populateShareModal();

    modal.classList.remove('hidden');
}

function closeShareModal() {
    const modal = document.getElementById('shareClassModal');
    if (modal) modal.classList.add('hidden');
}

async function populateShareModal() {
    const professorsList = document.getElementById('professorsToShareList');
    const currentMembersList = document.getElementById('currentClassMembers');
    professorsList.innerHTML = '<option value="">A carregar...</option>';
    currentMembersList.innerHTML = '<li>A carregar...</li>';

    try {
        const [allProfs, { members, isCurrentUserOwner }] = await Promise.all([
            apiCall('/api/professors/list'),
            apiCall(`/api/classes/${state.activeClassId}/members`)
        ]);

        state.allProfessors = allProfs;
        const currentMemberIds = members.map(m => m.id);

        professorsList.innerHTML = '<option value="">Selecione um professor...</option>';
        state.allProfessors.forEach(prof => {
            if (!currentMemberIds.includes(prof.id)) {
                const option = document.createElement('option');
                option.value = prof.id;
                option.textContent = `${prof.full_name} (${prof.username})`;
                professorsList.appendChild(option);
            }
        });

        currentMembersList.innerHTML = '';
        members.forEach(member => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center text-sm p-2 rounded-md hover:bg-gray-100';
            
            let memberHTML = `
                <div class="flex items-center">
                    <svg class="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    <span>${member.full_name}</span>
                </div>
            `;

            if (member.isOwner) {
                memberHTML += `<span class="ml-2 text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-semibold">Dono</span>`;
            } else if (isCurrentUserOwner) {
                memberHTML += `<button data-professor-id="${member.id}" class="remove-member-btn text-red-500 hover:text-red-700">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>`;
            }

            li.innerHTML = memberHTML;
            currentMembersList.appendChild(li);
        });

    } catch (error) {
        console.error("Erro ao popular o modal de partilha:", error);
        professorsList.innerHTML = '<option value="">Erro ao carregar</option>';
        currentMembersList.innerHTML = '<li>Erro ao carregar</li>';
    }
}


function closeModals() {
    document.getElementById('editClassModal')?.classList.add('hidden');
    document.getElementById('editStudentModal')?.classList.add('hidden');
    closeShareModal();
}

function openEditStudentModal(student) {
    state.editingStudentData = student;
    const modal = document.getElementById('editStudentModal');
    if(!modal) return;
    document.getElementById('editStudentNameInput').value = student.full_name;
    document.getElementById('editStudentCpfInput').value = student.cpf || '';
    document.getElementById('editStudentPcIdInput').value = student.pc_id || '';
    modal.classList.remove('hidden');
}

function closeStudentModal() {
    document.getElementById('editStudentModal')?.classList.add('hidden');
}

function openAlertLogsModal(title, logs) {
    // Essa função já cria um modal customizado, então não precisa de SweetAlert
    const modal = document.getElementById('alertLogsModal');
    const titleEl = document.getElementById('alertLogsTitle');
    const container = document.getElementById('alertLogsContainer');
    if (!modal || !titleEl || !container) return;

    titleEl.textContent = title;
    container.innerHTML = '';

    if (logs.length === 0) {
        container.innerHTML = '<p class="text-gray-500">Nenhum log encontrado para este alerta.</p>';
    } else {
        const table = document.createElement('table');
        table.className = 'min-w-full divide-y divide-gray-200';
        let tableHTML = `<thead class="bg-gray-50"><tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">URL</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duração</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Hora</th>
        </tr></thead><tbody class="bg-white divide-y divide-gray-200">`;
        
        logs.forEach(log => {
            tableHTML += `<tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm"><a href="http://${log.url}" target="_blank" class="text-blue-600 hover:underline">${log.url}</a></td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">${log.duration}s</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">${log.categoria}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">${new Date(log.timestamp).toLocaleString('pt-BR')}</td>
            </tr>`;
        });

        tableHTML += '</tbody>';
        table.innerHTML = tableHTML;
        container.appendChild(table);
    }
    
    modal.classList.remove('hidden');
}

function closeAlertLogsModal() {
    const modal = document.getElementById('alertLogsModal');
    if(modal) modal.classList.add('hidden');
}


// --- FUNÇÕES DE RENDERIZAÇÃO E UI ---
// (As funções de renderização como renderAllStudents, updateUserSummaryTable, etc. continuam iguais)
function renderAllStudents() {
    const container = document.getElementById('all-students-list');
    if(!container) return;
    
    const searchTerm = state.currentFilters.studentSearch.toLowerCase();
    const filteredStudents = state.allStudents.filter(student => 
        student.full_name.toLowerCase().includes(searchTerm)
    );

    container.innerHTML = '';
    if (filteredStudents.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-sm p-2">Nenhum aluno encontrado.</p>`;
        return;
    }
    const studentsInClassIds = state.studentsInClass.map(s => s.id);

    filteredStudents.forEach(student => {
        const studentDiv = document.createElement('div');
        const isAlreadyInClass = state.activeClassId && state.activeClassId !== 'null' && studentsInClassIds.includes(student.id);
        
        studentDiv.className = `flex justify-between items-center p-2 rounded ${isAlreadyInClass ? 'bg-green-100 text-gray-400' : 'bg-gray-50'}`;
        
        studentDiv.innerHTML = `
            <div class="flex items-center">
                <span class="${!isAlreadyInClass ? 'cursor-grab' : ''}" draggable="${!isAlreadyInClass}" data-student-id="${student.id}">${student.full_name}</span>
                <button data-student-json='${JSON.stringify(student)}' class="btn-edit-student ml-2 text-gray-400 hover:text-blue-600 text-xs">✏️</button>
            </div>
            <button 
                data-student-id="${student.id}" 
                class="btn-add-student text-green-500 hover:text-green-700 text-xl font-bold w-6 h-6 flex items-center justify-center ${state.activeClassId && state.activeClassId !== 'null' && !isAlreadyInClass ? '' : 'hidden'}"
            >+</button>
        `;
        container.appendChild(studentDiv);
    });
}

function renderStudentsInClass() {
    const container = document.getElementById('students-in-class-list');
    if(!container) return;
    container.innerHTML = '';
    if (state.studentsInClass.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-sm text-center py-4">Arraste um aluno da lista à esquerda para adicioná-lo aqui.</p>`;
        return;
    }
    state.studentsInClass.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'flex justify-between items-center bg-white p-2 rounded shadow-sm border';
        studentDiv.innerHTML = `
            <span>${student.full_name}</span>
            <button data-student-id="${student.id}" class="btn-remove-student text-red-500 hover:text-red-700 text-sm font-semibold">Remover</button>
        `;
        container.appendChild(studentDiv);
    });
}

function applyFiltersAndRender() {
    const { search, category, showAlertsOnly } = state.currentFilters;
    const searchTerm = search.toLowerCase();
    
    const classStudentsIds = state.activeClassId && state.activeClassId !== 'null'
        ? state.studentsInClass.reduce((ids, student) => {
            if (student.cpf) ids.push(student.cpf);
            if (student.pc_id) ids.push(student.pc_id);
            return ids;
        }, [])
        : null;

    const filteredSummary = state.allSummary.filter(user => {
        if (classStudentsIds && !classStudentsIds.includes(user.aluno_id)) {
            return false;
        }

        const matchesSearch = searchTerm === '' || 
            (user.student_name && typeof user.student_name === 'string' && user.student_name.toLowerCase().includes(searchTerm)) ||
            (user.aluno_id && user.aluno_id.toLowerCase().includes(searchTerm));

        const matchesAlert = !showAlertsOnly || user.has_red_alert || user.has_blue_alert;

        return matchesSearch && matchesAlert;
    });

    const filteredLogs = state.allLogs.filter(log => {
        if (classStudentsIds && !classStudentsIds.includes(log.aluno_id)) {
            return false;
        }

        const matchesSearch = searchTerm === '' || 
            (log.student_name && typeof log.student_name === 'string' && log.student_name.toLowerCase().includes(searchTerm)) ||
            (log.aluno_id && log.aluno_id.toLowerCase().includes(searchTerm)) ||
            (log.url && log.url.toLowerCase().includes(searchTerm));

        const matchesCategory = category === '' || log.categoria === category;
        
        const matchesAlert = !showAlertsOnly || ['Rede Social', 'Streaming & Jogos', 'IA'].includes(log.categoria);

        return matchesSearch && matchesCategory && matchesAlert;
    });

    updateUserSummaryTable(filteredSummary);
    updateLogsTable(filteredLogs);
    updateChart(filteredLogs);
}


function renderPaginationControls(totalLogs) {
    const container = document.getElementById('logs-pagination-container');
    if (!container) return;

    const totalPages = Math.ceil(totalLogs / state.logsPerPage);
    container.innerHTML = '';

    if (totalPages <= 1) return;

    let paginationHTML = '<div class="flex justify-center items-center space-x-2 mt-4">';

    paginationHTML += `<button class="pagination-btn ${state.logsCurrentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''}" data-page="${state.logsCurrentPage - 1}" ${state.logsCurrentPage === 1 ? 'disabled' : ''}>Anterior</button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === state.logsCurrentPage) {
            paginationHTML += `<span class="px-3 py-1 bg-red-700 text-white rounded-md text-sm">${i}</span>`;
        } else if (i <= 2 || i >= totalPages - 1 || (i >= state.logsCurrentPage - 1 && i <= state.logsCurrentPage + 1)) {
            paginationHTML += `<button class="pagination-btn" data-page="${i}">${i}</button>`;
        } else if (i === 3 || i === totalPages - 2) {
            paginationHTML += `<span class="px-2">...</span>`;
        }
    }

    paginationHTML += `<button class="pagination-btn ${state.logsCurrentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" data-page="${state.logsCurrentPage + 1}" ${state.logsCurrentPage === totalPages ? 'disabled' : ''}>Próximo</button>`;

    paginationHTML += '</div>';
    container.innerHTML = paginationHTML;
}

function updateLogsTable(logs) {
    const tableBody = document.getElementById('logsTableBody');
    const logsCount = document.getElementById('logs-count');
    if (!tableBody || !logsCount) return;

    logsCount.textContent = logs.length;
    tableBody.innerHTML = ''; // Limpa a tabela

    const startIndex = (state.logsCurrentPage - 1) * state.logsPerPage;
    const endIndex = startIndex + state.logsPerPage;
    const paginatedLogs = logs.slice(startIndex, endIndex);

    if (paginatedLogs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Nenhum log encontrado para a seleção atual.</td></tr>';
        renderPaginationControls(logs.length);
        return;
    }

    const fragment = document.createDocumentFragment();
    // Prepara a lista de categorias disponíveis UMA VEZ fora do loop
    const availableCategories = [...new Set(['Não Categorizado', ...(state.categories || [])])].sort();

    paginatedLogs.forEach(log => {
        const row = document.createElement('tr');
        const currentCategory = log.categoria || 'Não Categorizado'; // Categoria final (com override já aplicado pelo backend)
        const isRedAlert = ['Rede Social', 'Streaming & Jogos'].includes(currentCategory);
        const isBlueAlert = currentCategory === 'IA';

        // Aplica highlighting baseado na CATEGORIA FINAL recebida
        if (isRedAlert) {
            row.className = 'bg-red-50 text-red-800 font-medium';
        } else if (isBlueAlert) {
            row.className = 'bg-blue-50 text-blue-800 font-medium';
        }

        // Gera o HTML da linha, incluindo o <select> VAZIO por enquanto
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm">${log.student_name || `<i>${log.aluno_id}</i>`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <a href="http://${log.url}" target="_blank" class="text-blue-600 hover:underline">${log.url || 'N/A'}</a>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${log.duration || 0}s</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm category-cell">
                <span class="category-edit-modal-trigger cursor-pointer hover:underline text-blue-600"
                      title="Clique para alterar a categoria de ${log.url || ''}"
                      data-url="${log.url || ''}"
                      data-current-category="${log.categoria || 'Não Categorizado'}">
                    ${log.categoria || 'Não Categorizado'}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'N/A'}</td>
        `;

        // Encontra o <select> que acabamos de criar DENTRO da linha atual
        const selectElement = row.querySelector('select.category-select');

        // *** ADICIONA AS OPÇÕES AO SELECT ***
        if (selectElement) {
            availableCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                if (category === currentCategory) {
                    option.selected = true; // Marca a opção atual como selecionada
                }
                selectElement.appendChild(option);
            });
        }
        // *** FIM DA ADIÇÃO DAS OPÇÕES ***

        fragment.appendChild(row); // Adiciona a linha completa ao fragmento
    }); // Fim do forEach(log => ...)

    tableBody.appendChild(fragment);
    renderPaginationControls(logs.length);
}

function updateUserSummaryTable(users) {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">Nenhum dado de atividade para a seleção atual.</td></tr>';
        return;
    }
    const fragment = document.createDocumentFragment();
    users.forEach(user => {
        const row = document.createElement('tr');
        row.dataset.alunoId = user.aluno_id; 
        row.classList.add('cursor-pointer', 'hover:bg-gray-50', 'summary-row');
        
        let statusHTML = '<span class="text-green-500 text-xl">✅</span>';
        if (user.has_red_alert || user.has_blue_alert) {
            statusHTML = '';
            if (user.has_red_alert) {
                statusHTML += `<button data-aluno-id="${user.aluno_id}" data-alert-type="red" class="alert-btn text-xl cursor-pointer" title="Mostrar logs de acesso indevido">⚠️</button>`;
            }
            if (user.has_blue_alert) {
                statusHTML += `<button data-aluno-id="${user.aluno_id}" data-alert-type="blue" class="alert-btn text-xl cursor-pointer ml-2" title="Mostrar logs de uso de IA">🔹</button>`;
            }
        }

        row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm">${statusHTML}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.student_name || `<i>${user.aluno_id}</i>`}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">${user.aluno_id}</td> 
        <td class="px-6 py-4 whitespace-nowrap text-sm">${(user.total_duration / 60).toFixed(1)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">${user.log_count}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">${user.last_activity ? new Date(user.last_activity).toLocaleString('pt-BR') : 'N/A'}</td>
    `;
    fragment.appendChild(row);
    });
    tableBody.appendChild(fragment);
}

function updateChart(logs) {
    const chartCanvas = document.getElementById('mainChart');
    if (!chartCanvas) return;
    
    // Destrói a instância anterior do gráfico, se existir
    if (state.mainChartInstance) {
        state.mainChartInstance.destroy();
    }

    // Calcula o uso por site (lógica existente)
    const siteUsage = logs.reduce((acc, log) => {
        // Garante que temos uma URL válida
        if (log.url) { 
            acc[log.url] = (acc[log.url] || 0) + log.duration;
        }
        return acc;
    }, {});

    // Pega os top 10 sites (lógica existente)
    const topSites = Object.entries(siteUsage).sort(([, a], [, b]) => b - a).slice(0, 10);
    const chartLabels = topSites.map(site => site[0]);
    const chartData = topSites.map(site => site[1]);
    const backgroundColors = ['rgba(220, 38, 38, 0.7)', 'rgba(153, 27, 27, 0.7)', 'rgba(239, 68, 68, 0.7)', 'rgba(248, 113, 113, 0.7)', 'rgba(252, 165, 165, 0.7)']; // Cores exemplo

    // Cria a nova instância do gráfico com a opção onClick
    state.mainChartInstance = new Chart(chartCanvas.getContext('2d'), {
        type: state.currentChartType,
        data: {
            labels: chartLabels.length > 0 ? chartLabels : ['Nenhum dado para exibir'],
            datasets: [{ 
                label: 'Tempo de Uso (s)', 
                data: chartData.length > 0 ? chartData : [0], // Adiciona [0] se vazio para evitar erros
                backgroundColor: backgroundColors 
            }]
        },
        options: {
            indexAxis: state.currentChartType === 'bar' ? 'y' : 'x', // Eixo Y para barras horizontais
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: state.currentChartType !== 'bar' // Esconde legenda para gráfico de barras
                },
                tooltip: {
                     callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                // Mostra em minutos no tooltip
                                label += (context.parsed / 60).toFixed(1) + ' min'; 
                            }
                            return label;
                        }
                    }
                }
            },
            // --- NOVA OPÇÃO onClick ADICIONADA AQUI ---
            onClick: (event, activeElements, chart) => {
                if (activeElements.length > 0) {
                    // Pega o índice do elemento clicado (barra, fatia, etc.)
                    const dataIndex = activeElements[0].index;
                    // Pega o label (URL) correspondente a esse índice
                    const clickedUrl = chart.data.labels[dataIndex];

                    // Verifica se realmente clicou em um dado válido
                    if (clickedUrl && clickedUrl !== 'Nenhum dado para exibir') {
                        console.log(`Gráfico clicado: ${clickedUrl}`); // Log para depuração

                        const searchInput = document.getElementById('search-input');
                        if (searchInput) {
                            // 1. Preenche o campo de busca com a URL clicada
                            searchInput.value = clickedUrl;
                            
                            // 2. Atualiza o estado do filtro
                            state.currentFilters.search = clickedUrl;
                            
                            // 3. Reseta a paginação dos logs
                            state.logsCurrentPage = 1;
                            
                            // 4. Aplica os filtros para atualizar as tabelas
                            applyFiltersAndRender();

                            // 5. Opcional: Rola a página para a tabela de logs
                            const logsSection = document.getElementById('logsTableBody')?.closest('section');
                            if (logsSection) {
                                logsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }
                    }
                }
            }
            // --- FIM DA NOVA OPÇÃO onClick ---
        }
    });
}


let currentlyEditingUrl = null; // Variável para guardar a URL sendo editada

function openCategoryModal(url, currentCategory) {
    const modal = document.getElementById('categoryEditModal');
    const urlDisplay = document.getElementById('modalUrlDisplay');
    const categoryListDiv = document.getElementById('modalCategoryList');

    if (!modal || !urlDisplay || !categoryListDiv) {
        console.error("Elementos do modal de categoria não encontrados!");
        return;
    }

    currentlyEditingUrl = url; // Guarda a URL
    urlDisplay.textContent = url; // Mostra a URL no modal
    categoryListDiv.innerHTML = ''; // Limpa a lista anterior

    // Prepara as opções de categoria
    const availableCategories = [...new Set(['Não Categorizado', ...(state.categories || [])])].sort();

    // Cria os radio buttons
    availableCategories.forEach(category => {
        const label = document.createElement('label');
        label.className = "flex items-center p-2 rounded hover:bg-gray-100 cursor-pointer";
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'modalCategoryOption';
        input.value = category;
        input.className = "form-radio h-4 w-4 text-red-600 focus:ring-red-500";
        if (category === currentCategory) {
            input.checked = true; // Marca a categoria atual
        }
        const span = document.createElement('span');
        span.className = "ml-3 text-sm text-gray-800";
        span.textContent = category;

        label.appendChild(input);
        label.appendChild(span);
        categoryListDiv.appendChild(label);
    });

    modal.classList.remove('hidden'); // Mostra o modal
}

function closeCategoryModal() {
    const modal = document.getElementById('categoryEditModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    currentlyEditingUrl = null; // Limpa a URL em edição
}

// --- FUNÇÕES DE API ---
async function apiCall(url, method = 'GET', body = null) {
    // [INÍCIO DA MUDANÇA] Adicionada a opção 'credentials: "include"'
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // ESSA LINHA É A CHAVE!
    };
    // [FIM DA MUDANÇA]

    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Erro ${response.status}` }));
        throw new Error(errorData.error || `Erro ${response.status}`);
    }
    return response.json();
}

async function createClass() {
    const nameInput = document.getElementById('newClassName');
    const name = nameInput.value.trim();
    if (!name) {
        return Swal.fire('Erro!', 'O nome da turma não pode estar vazio.', 'error');
    }
    try {
        const result = await apiCall('/api/classes', 'POST', { name });
        await Swal.fire('Sucesso!', result.message, 'success');
        window.location.reload();
    } catch (error) {
        Swal.fire('Erro!', error.message, 'error');
    }
}

async function deleteClass(classId) {
    const result = await Swal.fire({
        title: 'Tem a certeza?',
        text: "ATENÇÃO: Isso removerá a turma permanentemente. Esta ação não pode ser desfeita.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sim, remover!',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            const result = await apiCall(`/api/classes/${classId}`, 'DELETE');
            await Swal.fire('Removida!', result.message, 'success');
            window.location.reload();
        } catch (error) {
            Swal.fire('Erro!', error.message, 'error');
        }
    }
}

async function saveClassChanges() {
    const classId = document.getElementById('editClassModal').dataset.classId;
    const newName = document.getElementById('editClassNameInput').value.trim();
    if (!newName) {
        return Swal.fire('Erro!', 'O nome não pode ser vazio.', 'error');
    }
    try {
        const result = await apiCall(`/api/classes/${classId}`, 'PUT', { name: newName });
        await Swal.fire('Sucesso!', result.message, 'success');
        closeModals();
        window.location.reload();
    } catch (error) {
        Swal.fire('Erro!', error.message, 'error');
    }
}

async function saveStudentChanges() {
    if (!state.editingStudentData) return;
    const studentId = state.editingStudentData.id;
    const updatedData = {
        fullName: document.getElementById('editStudentNameInput').value.trim(),
        cpf: document.getElementById('editStudentCpfInput').value.trim(),
        pc_id: document.getElementById('editStudentPcIdInput').value.trim()
    };
    if (!updatedData.fullName) {
        return Swal.fire('Erro!', 'O nome do aluno é obrigatório.', 'error');
    }
    try {
        await apiCall(`/api/students/${studentId}`, 'PUT', updatedData);
        Swal.fire('Sucesso!', 'Dados do aluno atualizados!', 'success');
        closeStudentModal();
        await fetchAllStudents();
        renderAllStudents();
    } catch (error) {
        Swal.fire('Erro!', error.message, 'error');
    }
}

async function fetchAllStudents() {
    if (!document.getElementById('all-students-list')) return;
    try {
        state.allStudents = await apiCall('/api/students/all');
    } catch (error) {
        console.error("Falha ao buscar a lista de todos os alunos:", error);
    }
}

async function fetchStudentsInClass(classId) {
    if (!classId || classId === 'null') {
        state.studentsInClass = [];
        return;
    }
    try {
        state.studentsInClass = await apiCall(`/api/classes/${classId}/students`);
    } catch (error) {
        console.error(`Falha ao buscar alunos da turma ${classId}:`, error);
        state.studentsInClass = [];
    }
}

// Função que busca os dados do servidor (logs e summary)
async function fetchDataPanels() {
    if (!document.getElementById('dashboard-content')) return;
    try {
        const dateInput = document.getElementById('dashboard-date-filter');
        const targetDate = dateInput ? dateInput.value : '';
        
        // NOVO: Envia o classId selecionado
        const classId = state.activeClassId;
        
        let queryString = '';
        if (targetDate) queryString += `?date=${targetDate}`;
        if (classId && classId !== 'null') {
            queryString += (queryString ? '&' : '?') + `classId=${classId}`;
        }
        
        const { logs, summary } = await apiCall(`/api/data${queryString}`);
        state.allLogs = logs;
        state.allSummary = summary;
    } catch (error) {
        console.error("Erro ao buscar dados do painel:", error);
    }
}

// --- LÓGICA PRINCIPAL E EVENTOS ---
async function handleClassSelection(selectedId, selectedName) {
    state.activeClassId = selectedId;
    state.activeClassName = selectedName;

    // Salva a seleção no localStorage para sincronizar entre as páginas
    if (selectedId && selectedId !== 'null') {
        localStorage.setItem('selectedClassId', selectedId);
        localStorage.setItem('selectedClassName', selectedName);
    } else {
        localStorage.removeItem('selectedClassId');
        localStorage.removeItem('selectedClassName');
    }

    // [CORREÇÃO 1] Busca a lista de alunos da turma ANTES de qualquer outra lógica.
    // Isso garante que os dados estarão prontos para o filtro do dashboard.
    await fetchStudentsInClass(state.activeClassId);

    // Lógica específica para a página de Gerenciamento
    if (document.getElementById('student-management-panel')) {
        const classStudentsPanel = document.getElementById('class-students-panel');
        const editBtn = document.getElementById('editClassBtn');
        const deleteBtn = document.getElementById('deleteClassBtn');
        const shareBtn = document.getElementById('shareClassBtn');
        const classInstructions = document.getElementById('class-instructions');
        const classNameInList = document.getElementById('class-name-in-list');

        if (state.activeClassId && state.activeClassId !== 'null') {
            // [CORREÇÃO 2] Mostra o painel "Alunos na Turma"
            if (classStudentsPanel) classStudentsPanel.classList.remove('hidden');
            
            if (classNameInList) classNameInList.textContent = state.activeClassName;
            if (classInstructions) classInstructions.style.display = 'none';
            if (editBtn) editBtn.disabled = false;
            if (deleteBtn) deleteBtn.disabled = false;
            if (shareBtn) shareBtn.disabled = false;
        } else {
            // [CORREÇÃO 2] Esconde o painel se nenhuma turma for selecionada
            if (classStudentsPanel) classStudentsPanel.classList.add('hidden');

            if (classNameInList) classNameInList.textContent = 'Nenhuma selecionada';
            if (classInstructions) classInstructions.style.display = 'block';
            if (editBtn) editBtn.disabled = true;
            if (deleteBtn) deleteBtn.disabled = true;
            if (shareBtn) shareBtn.disabled = true;
        }
        renderStudentsInClass();
        renderAllStudents();
    }

    // Lógica específica para a página do Dashboard
    if (document.getElementById('dashboard-content')) {
        state.logsCurrentPage = 1;
        applyFiltersAndRender();
    }
}

document.addEventListener('DOMContentLoaded', async () => {

    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
        state.categories = Array.from(categorySelect.options) // Pega todas as options
                              .map(option => option.value)     // Pega o valor de cada uma
                              .filter(value => value !== '');   // Remove a opção "Todas" (valor vazio)
        console.log('Categorias carregadas para o estado:', state.categories); // Log para verificar
    } else {
        state.categories = []; // Define como vazio se o select não for encontrado
        console.warn('Select de categorias #category-select não encontrado.');
    }
    // --- FIM DA NOVA SEÇÃO ---


    await fetchAllStudents();
    await fetchDataPanels();

    

    const studentManagementPanel = document.getElementById('student-management-panel');
    if (studentManagementPanel) {
        handleClassSelection(null, ''); 
        
        document.getElementById('createClassBtn').addEventListener('click', createClass);
        
        document.getElementById('editClassBtn').addEventListener('click', () => {
            if(state.activeClassId && state.activeClassId !== 'null') openEditClassModal(state.activeClassId, state.activeClassName);
        });

        document.getElementById('shareClassBtn').addEventListener('click', openShareModal);

        document.getElementById('deleteClassBtn').addEventListener('click', () => {
            if(state.activeClassId && state.activeClassId !== 'null') deleteClass(state.activeClassId);
        });
        
        document.getElementById('saveClassChangesBtn').addEventListener('click', saveClassChanges);
        document.getElementById('saveStudentChangesBtn').addEventListener('click', saveStudentChanges);
        
        document.getElementById('addProfessorToClassBtn').addEventListener('click', async () => {
            const professorId = document.getElementById('professorsToShareList').value;
            if (!professorId) {
                return Swal.fire('Atenção!', 'Por favor, selecione um professor.', 'warning');
            }
            try {
                await apiCall(`/api/classes/${state.activeClassId}/share`, 'POST', { professorId });
                Swal.fire('Sucesso!', 'Professor adicionado à turma!', 'success');
                await populateShareModal();
            } catch (error) {
                Swal.fire('Erro!', `Erro ao partilhar a turma: ${error.message}`, 'error');
            }
        });

        document.getElementById('currentClassMembers').addEventListener('click', async (e) => {
            const removeButton = e.target.closest('.remove-member-btn');
            if (removeButton) {
                const professorId = removeButton.dataset.professorId;
                const result = await Swal.fire({
                    title: 'Tem a certeza?',
                    text: "Deseja remover este professor da turma?",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6',
                    confirmButtonText: 'Sim, remover!',
                    cancelButtonText: 'Cancelar'
                });

                if (result.isConfirmed) {
                    try {
                        await apiCall(`/api/classes/${state.activeClassId}/remove-member/${professorId}`, 'DELETE');
                        Swal.fire('Sucesso!', 'Professor removido com sucesso!', 'success');
                        await populateShareModal();
                    } catch (error) {
                        Swal.fire('Erro!', `Erro ao remover professor: ${error.message}`, 'error');
                    }
                }
            }
        });

        const allStudentsList = document.getElementById('all-students-list');
        allStudentsList.addEventListener('click', async (e) => {
            const addButton = e.target.closest('.btn-add-student');
            if (addButton) {
                const studentId = addButton.dataset.studentId;
                
                // [MELHORIA 2] Feedback de carregamento
                const originalContent = addButton.innerHTML;
                addButton.innerHTML = `<svg class="animate-spin h-5 w-5 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
                addButton.disabled = true;

                try {
                    await apiCall(`/api/classes/${state.activeClassId}/add-student`, 'POST', { studentId });
                    await fetchStudentsInClass(state.activeClassId);
                    renderStudentsInClass();
                    renderAllStudents();
                } catch (error) { 
                    Swal.fire('Erro!', error.message, 'error');
                } finally {
                    // Restaura o botão mesmo se der erro
                    addButton.innerHTML = originalContent;
                    addButton.disabled = false;
                }
            }
            if (e.target.closest('.btn-edit-student')) {
                const studentData = JSON.parse(e.target.closest('.btn-edit-student').dataset.studentJson);
                openEditStudentModal(studentData);
            }
        });

        allStudentsList.addEventListener('dragstart', e => {
            const target = e.target.closest('[data-student-id]');
            if (target) e.dataTransfer.setData('text/plain', target.dataset.studentId);
        });

        const classStudentsList = document.getElementById('students-in-class-list');
        classStudentsList.addEventListener('click', async (e) => {
            const removeButton = e.target.closest('.btn-remove-student');
            if (removeButton) {
                const studentId = removeButton.dataset.studentId;
                const result = await Swal.fire({
                    title: 'Tem certeza?', text: "Deseja remover este aluno da turma?", icon: 'warning',
                    showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
                    confirmButtonText: 'Sim, remover!', cancelButtonText: 'Cancelar'
                });

                if (result.isConfirmed) {
                    const originalText = removeButton.textContent;
                    removeButton.disabled = true;
                    removeButton.textContent = 'Removendo...';

                    try {
                        await apiCall(`/api/classes/${state.activeClassId}/remove-student/${studentId}`, 'DELETE');
                        await fetchStudentsInClass(state.activeClassId);
                        renderStudentsInClass();
                        renderAllStudents();
                    } catch(error) { 
                        Swal.fire('Erro!', error.message, 'error');
                        removeButton.disabled = false;
                        removeButton.textContent = originalText;
                    }
                }
            }
        });

        const logsTableBody = document.getElementById('logsTableBody');
        if (logsTableBody) {
            // Listener para abrir o modal ao clicar na categoria
            logsTableBody.addEventListener('click', (e) => {
                const categoryTrigger = e.target.closest('.category-edit-modal-trigger');
                if (categoryTrigger) {
                    const url = categoryTrigger.dataset.url;
                    const currentCategory = categoryTrigger.dataset.currentCategory;
                    console.log(`Abrindo modal para: URL=${url}, Categoria Atual=${currentCategory}`); // Log
                    openCategoryModal(url, currentCategory);
                }
            });
        }
    
        // Listeners para os botões DENTRO do modal (adicione também no DOMContentLoaded)
        const confirmCategoryBtn = document.getElementById('confirmCategoryChangeBtn');
        const cancelCategoryBtn = document.getElementById('cancelCategoryChangeBtn');
        const closeCategoryModalBtn = document.getElementById('closeCategoryModalBtn');
    
        if (confirmCategoryBtn) {
            confirmCategoryBtn.addEventListener('click', async () => {
                const selectedRadio = document.querySelector('input[name="modalCategoryOption"]:checked');
                if (!selectedRadio) {
                    Swal.fire('Atenção!', 'Por favor, selecione uma categoria.', 'warning');
                    return;
                }
                const newCategory = selectedRadio.value;
                const url = currentlyEditingUrl; // Pega a URL que foi guardada
    
                if (!url) {
                    console.error("Erro: URL não definida ao confirmar categoria.");
                    closeCategoryModal();
                    return;
                }
    
                // Pega a categoria original diretamente do trigger na tabela (se necessário para comparação)
                const triggerSpan = logsTableBody.querySelector(`span[data-url="${url}"].category-edit-modal-trigger`);
                const originalCategory = triggerSpan ? triggerSpan.dataset.currentCategory : 'Não Categorizado';
    
                if (newCategory !== originalCategory) {
                    try {
                        Swal.showLoading();
                        const result = await apiCall('/api/override-category', 'POST', {
                            url: url,
                            newCategory: newCategory
                        });
                        await Swal.fire('Sucesso!', result.message, 'success');
    
                        // Atualiza a UI - encontra TODOS os spans para essa URL
                        document.querySelectorAll(`span[data-url="${url}"].category-edit-modal-trigger`).forEach(span => {
                             span.textContent = newCategory;
                             span.dataset.currentCategory = newCategory;
                             // Atualiza classes de alerta na linha
                             const row = span.closest('tr');
                             if (row) {
                                row.classList.remove('bg-red-50', 'text-red-800', 'bg-blue-50', 'text-blue-800', 'font-medium');
                                const isRedAlert = ['Rede Social', 'Streaming & Jogos'].includes(newCategory);
                                const isBlueAlert = newCategory === 'IA';
                                if (isRedAlert) row.classList.add('bg-red-50', 'text-red-800', 'font-medium');
                                if (isBlueAlert) row.classList.add('bg-blue-50', 'text-blue-800', 'font-medium');
                             }
                        });
                        closeCategoryModal();
    
                    } catch (error) {
                        Swal.fire('Erro!', error.message || 'Não foi possível salvar a categoria.', 'error');
                        closeCategoryModal(); // Fecha mesmo com erro
                    }
                } else {
                     Swal.fire({ title: 'Nenhuma alteração', text: 'Você selecionou a mesma categoria.', icon: 'info', timer: 1500, showConfirmButton: false });
                     closeCategoryModal();
                }
            });
        }
    
        // Adiciona listeners para fechar o modal
        if (cancelCategoryBtn) cancelCategoryBtn.addEventListener('click', closeCategoryModal);
        if (closeCategoryModalBtn) closeCategoryModalBtn.addEventListener('click', closeCategoryModal);
    
        // Fecha o modal se clicar fora da área de conteúdo (no overlay)
        const categoryModal = document.getElementById('categoryEditModal');
        if (categoryModal) {
            categoryModal.addEventListener('click', (e) => {
                 if (e.target === categoryModal) { // Verifica se o clique foi no próprio overlay
                     closeCategoryModal();
                 }
            });
        }

        classStudentsList.addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn-remove-student')) {
                const studentId = e.target.dataset.studentId;
                const result = await Swal.fire({
                    title: 'Tem certeza?',
                    text: "Deseja remover este aluno da turma?",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6',
                    confirmButtonText: 'Sim, remover!',
                    cancelButtonText: 'Cancelar'
                });
                if (result.isConfirmed) {
                    try {
                        await apiCall(`/api/classes/${state.activeClassId}/remove-student/${studentId}`, 'DELETE');
                        await fetchStudentsInClass(state.activeClassId);
                        renderStudentsInClass();
                        renderAllStudents();
                    } catch(error) { Swal.fire('Erro!', error.message, 'error'); }
                }
            }
        });

        document.getElementById('addStudentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const studentData = Object.fromEntries(formData.entries());
            try {
                const result = await apiCall('/api/students', 'POST', studentData);
                state.allStudents.push(result.student);
                renderAllStudents();
                e.target.reset();
                Swal.fire('Sucesso!', 'Aluno adicionado com sucesso!', 'success');
            } catch(error) { Swal.fire('Erro!', error.message, 'error'); }
        });
        
        document.getElementById('toggle-create-class-form').addEventListener('click', () => {
            document.getElementById('create-class-form-container').classList.toggle('hidden');
        });
        document.getElementById('toggle-add-student-form').addEventListener('click', () => {
            document.getElementById('add-student-form-container').classList.toggle('hidden');
        });
        
        document.getElementById('student-search-input').addEventListener('input', (e) => {
            state.currentFilters.studentSearch = e.target.value;
            renderAllStudents();
        });
    }

    const dashboardContent = document.getElementById('dashboard-content');
    if (dashboardContent) {
        applyFiltersAndRender();
        
        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                state.currentChartType = btn.dataset.type;
                document.querySelectorAll('.chart-btn').forEach(b => {
                    b.classList.remove('active', 'bg-red-700', 'text-white');
                    b.classList.add('bg-gray-200', 'text-gray-700');
                });
                btn.classList.add('active', 'bg-red-700', 'text-white');
                btn.classList.remove('bg-gray-200', 'text-gray-700');
                applyFiltersAndRender();
            });
        });

        document.getElementById('usersTableBody').addEventListener('click', async (e) => {
            const alertButton = e.target.closest('.alert-btn');
            if(alertButton) {
                const alunoId = alertButton.dataset.alunoId;
                const alertType = alertButton.dataset.alertType;
                try {
                    const logs = await apiCall(`/api/alerts/${encodeURIComponent(alunoId)}/${alertType}`);
                    const title = `Logs de Alerta (${alertType === 'red' ? 'Acesso Indevido' : 'Uso de IA'}) para ${alunoId}`;
                    openAlertLogsModal(title, logs);
                } catch (error) {
                    Swal.fire('Erro!', "Erro ao buscar os logs de alerta: " + error.message, 'error');
                }
            }
        });

        document.getElementById('apply-filters-btn').addEventListener('click', () => {
            state.logsCurrentPage = 1;
            state.currentFilters.search = document.getElementById('search-input').value;
            state.currentFilters.category = document.getElementById('category-select').value;
            state.currentFilters.showAlertsOnly = document.getElementById('show-alerts-checkbox').checked;
            applyFiltersAndRender();
        });

        document.getElementById('clear-filters-btn').addEventListener('click', () => {
            state.logsCurrentPage = 1;
            document.getElementById('search-input').value = '';
            document.getElementById('category-select').value = '';
            document.getElementById('show-alerts-checkbox').checked = false;
            state.currentFilters.search = '';
            state.currentFilters.category = '';
            state.currentFilters.showAlertsOnly = false;
            applyFiltersAndRender();
        });
        
        const logsPaginationContainer = document.getElementById('logs-pagination-container');
        if (logsPaginationContainer) {
            logsPaginationContainer.addEventListener('click', (e) => {
                if (e.target.matches('.pagination-btn')) {
                    const page = parseInt(e.target.dataset.page, 10);
                    if (page) {
                        state.logsCurrentPage = page;
                        applyFiltersAndRender();
                    }
                }
            });
        }
    }
    
    const classSelect = document.getElementById('classSelect');
    if(classSelect) {
        classSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            handleClassSelection(e.target.value, selectedOption.text);
        });
    }

    const usersTableBody = document.getElementById('usersTableBody');
    const searchInput = document.getElementById('search-input'); // Campo de busca principal

    if (usersTableBody && searchInput) {
        usersTableBody.addEventListener('click', (e) => {
            // Encontra a linha (TR) clicada, mesmo que o clique seja numa célula (TD)
            const clickedRow = e.target.closest('tr.summary-row'); 
            
            // Verifica se o clique foi realmente numa linha e NÃO num botão de alerta dentro dela
            if (clickedRow && !e.target.closest('.alert-btn')) { 
                const alunoId = clickedRow.dataset.alunoId;

                if (alunoId) {
                    // 1. Coloca o ID do aluno no campo de busca principal
                    searchInput.value = alunoId;

                    // 2. Atualiza o estado dos filtros (opcional, mas bom para consistência)
                    state.currentFilters.search = alunoId;
                    
                    // 3. Reseta a paginação dos logs para a primeira página
                    state.logsCurrentPage = 1; 

                    // 4. Aplica os filtros e re-renderiza tudo
                    applyFiltersAndRender(); 

                    // Opcional: Rolar a página para a tabela de logs
                    // const logsSection = document.getElementById('logsTableBody'); // Ou a seção que contém a tabela
                    // if (logsSection) {
                    //     logsSection.scrollIntoView({ behavior: 'smooth' });
                    // }
                }
            }
        });
    }
});

// Adicione este script no final do seu arquivo dashboard.ejs, antes do fechamento do </body>
document.addEventListener('DOMContentLoaded', function() {
    const downloadBtn = document.getElementById('downloadPdfBtn');
    const dateInput = document.getElementById('reportDate');
    const errorDiv = document.getElementById('reportError');
    
    // Define a data de ontem como padrão
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    dateInput.value = yesterday.toISOString().split('T')[0];
    
    downloadBtn.addEventListener('click', function() {
        const selectedDate = dateInput.value;
        errorDiv.textContent = ''; // Limpa erros antigos
    
        if (!selectedDate) {
            errorDiv.textContent = 'Por favor, selecione uma data.';
            return;
        }
        window.location.href = `/api/download-report/${selectedDate}`;
    });

});