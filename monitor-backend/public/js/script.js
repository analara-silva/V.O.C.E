// ================================================================
//      SCRIPT GLOBAL V.O.C.E (Versão Corrigida: SweetAlert2 Total)
// ================================================================

let state = {
    activeClassId: localStorage.getItem('selectedClassId') || null,
    activeClassName: localStorage.getItem('selectedClassName') || '',
    allStudents: [],
    studentsInClass: [],
    editingStudentData: null,
    currentChartType: 'bar',
    mainChartInstance: null,
    allLogs: [],
    allSummary: [],
    logsCurrentPage: 1,
    logsPerPage: 10,
    allProfessors: [],
    categories: [],
    currentFilters: {
        search: '',
        category: '',
        showAlertsOnly: false,
        studentSearch: '',
    }
};

let currentlyEditingUrl = null;

// ================================================================
//      1. SOCKET.IO (TEMPO REAL)
// ================================================================
let socket = null;
if (typeof io !== 'undefined') {
    socket = io();
    socket.on('connect', () => console.log('Socket conectado no dashboard'));
    socket.on('connect_error', (err) => console.error('Socket connect_error', err));
    socket.on('disconnect', (reason) => console.log('Socket desconectado', reason));

    socket.on('logs_updated', (data) => {
        console.log('socket: logs_updated recebido:', data); 

        if (data.logs && Array.isArray(data.logs) && data.logs.length > 0) {
            const incoming = data.logs.map(l => {
                return {
                    aluno_id: l.aluno_id ?? l.cpf ?? l.pc_id ?? null,
                    url: l.url ?? '',
                    duration: Number(l.duration ?? l.durationSeconds ?? 0),
                    categoria: l.categoria ?? l.category ?? 'Não Categorizado',
                    timestamp: l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString(),
                    student_name: l.student_name ?? null
                };
            });

            const keySet = new Set(state.allLogs.map(x => `${x.aluno_id}||${x.url}||${new Date(x.timestamp).toISOString()}`));
            const deduped = incoming.filter(i => {
                const k = `${i.aluno_id}||${i.url}||${i.timestamp}`;
                if (keySet.has(k)) return false;
                keySet.add(k);
                return true;
            });

            state.allLogs = [...deduped, ...state.allLogs];
            const MAX_LOGS = 2000;
            if (state.allLogs.length > MAX_LOGS) state.allLogs = state.allLogs.slice(0, MAX_LOGS);

            if (data.summary && Array.isArray(data.summary)) {
                state.allSummary = data.summary;
            } else {
                const map = new Map();
                state.allSummary.forEach(s => {
                     const id = s.aluno_id || 'unknown';
                     map.set(id, { ...s });
                });

                incoming.forEach(l => {
                    const id = l.aluno_id || 'unknown';
                    if (!map.has(id)) {
                        map.set(id, { 
                            aluno_id: id, student_name: l.student_name || id, total_duration: 0, 
                            log_count: 0, last_activity: null, has_red_alert: false, has_blue_alert: false 
                        });
                    }
                    const rec = map.get(id);
                    rec.total_duration += (Number(l.duration) || 0);
                    rec.log_count += 1;
                    const t = new Date(l.timestamp);
                    if (!rec.last_activity || t > new Date(rec.last_activity)) rec.last_activity = t.toISOString();
                });
                state.allSummary = Array.from(map.values());
            }

            state.logsCurrentPage = 1;

            consolidateDuplicateStudents(); 
            enrichSummaryWithAlerts();      
        }

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true, position: 'top-end', icon: 'info',
                title: `Novos dados recebidos!`, showConfirmButton: false, timer: 2000
            });
        }
    
        applyFiltersAndRender();
    });
}

// ================================================================
//      2. FUNÇÕES DE MODAIS (Window Functions)
// ================================================================

window.openEditClassModal = function(classId, currentName) {
    const modal = document.getElementById('editClassModal');
    if (!modal) return;
    const input = document.getElementById('editClassNameInput');
    if(input) input.value = currentName;
    modal.dataset.classId = classId;
    modal.classList.remove('hidden');
}

window.closeModals = function() {
    ['editClassModal', 'editStudentModal', 'shareClassModal', 'alertLogsModal', 'categoryEditModal', 'tutorialModal']
        .forEach(id => document.getElementById(id)?.classList.add('hidden'));
    state.editingStudentData = null;
    currentlyEditingUrl = null;
}

window.openShareModal = async function() {
    if (!state.activeClassId || state.activeClassId === 'null') {
        return Swal.fire('Aviso', 'Selecione uma turma primeiro.', 'warning');
    }
    const modal = document.getElementById('shareClassModal');
    if (!modal) return;
    
    const nameDisplay = document.getElementById('shareClassName');
    if(nameDisplay) nameDisplay.textContent = `"${state.activeClassName}"`;

    await populateShareModal();
    modal.classList.remove('hidden');
}

window.closeShareModal = function() {
    document.getElementById('shareClassModal')?.classList.add('hidden');
}

window.openEditStudentModal = function(student) {
    state.editingStudentData = student;
    const modal = document.getElementById('editStudentModal');
    if (!modal) return;
    if(document.getElementById('editStudentNameInput')) document.getElementById('editStudentNameInput').value = student.full_name;
    if(document.getElementById('editStudentCpfInput')) document.getElementById('editStudentCpfInput').value = student.cpf || '';
    if(document.getElementById('editStudentPcIdInput')) document.getElementById('editStudentPcIdInput').value = student.pc_id || '';
    modal.classList.remove('hidden');
}

window.closeStudentModal = function() {
    document.getElementById('editStudentModal')?.classList.add('hidden');
    state.editingStudentData = null;
}

window.openAlertLogsModal = function(title, logs) {
    const modal = document.getElementById('alertLogsModal');
    const titleEl = document.getElementById('alertLogsTitle');
    const container = document.getElementById('alertLogsContainer');

    if (!modal || !container) return;
    if(titleEl) titleEl.textContent = title;

    container.innerHTML = '';
    
    if (!logs || logs.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhum log encontrado.</p>';
    } else {
        let tableHTML = `<table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-100"><tr>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">URL</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Duração</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Categoria</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Hora</th>
        </tr></thead><tbody class="bg-white divide-y divide-gray-200">`;
        
        logs.forEach(log => {
            const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString('pt-BR') : 'N/A';
            const rowClass = log.categoria === 'IA' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700';
            
            tableHTML += `<tr class="${rowClass}">
                <td class="px-4 py-2 text-sm font-medium truncate max-w-xs" title="${log.url}">${log.url}</td>
                <td class="px-4 py-2 text-sm">${log.duration}s</td>
                <td class="px-4 py-2 text-sm font-bold">${log.categoria}</td>
                <td class="px-4 py-2 text-sm">${time}</td>
            </tr>`;
        });
        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    }
    modal.classList.remove('hidden');
}

window.closeAlertLogsModal = function() {
    document.getElementById('alertLogsModal')?.classList.add('hidden');
}

window.openCategoryModal = function(url, currentCategory) {
    const modal = document.getElementById('categoryEditModal');
    const urlDisplay = document.getElementById('modalUrlDisplay');
    const categoryListDiv = document.getElementById('modalCategoryList');

    if (!modal) return;
    currentlyEditingUrl = url;
    if(urlDisplay) urlDisplay.textContent = url;
    
    if(categoryListDiv) {
        categoryListDiv.innerHTML = '';
        const cats = state.categories.length > 0 ? state.categories : ['Produtividade & Ferramentas', 'Rede Social', 'Streaming & Jogos', 'IA', 'Outros', 'Loja Digital', 'Anime'];
        const uniqueCats = [...new Set(['Não Categorizado', ...cats])].sort();

        uniqueCats.forEach(category => {
            const label = document.createElement('label');
            label.className = "flex items-center p-2 rounded hover:bg-gray-100 cursor-pointer";
            label.innerHTML = `
                <input type="radio" name="modalCategoryOption" value="${category}" class="form-radio h-4 w-4 text-red-600 focus:ring-red-500" ${category === currentCategory ? 'checked' : ''}>
                <span class="ml-3 text-sm text-gray-800">${category}</span>
            `;
            categoryListDiv.appendChild(label);
        });
    }
    modal.classList.remove('hidden');
}

window.closeCategoryModal = function() {
    document.getElementById('categoryEditModal')?.classList.add('hidden');
    currentlyEditingUrl = null;
}

// Tour
let currentTourStep = 1;
const totalTourSteps = 3;

window.openTutorialModal = function() {
    const m = document.getElementById('tutorialModal');
    if(m) { m.classList.remove('hidden'); document.body.style.overflow='hidden'; currentTourStep=1; updateTourDisplay(); }
}
window.closeTutorialModal = function() {
    const m = document.getElementById('tutorialModal');
    if(m) { m.classList.add('hidden'); document.body.style.overflow=''; }
}
window.nextStep = function() { if(currentTourStep<totalTourSteps) { currentTourStep++; updateTourDisplay(); } }
window.prevStep = function() { if(currentTourStep>1) { currentTourStep--; updateTourDisplay(); } }

function updateTourDisplay() {
    document.querySelectorAll('.tour-step').forEach(s=>s.classList.add('hidden'));
    document.getElementById(`step-${currentTourStep}`)?.classList.remove('hidden');
    document.getElementById('currentStep').textContent = currentTourStep;
    document.getElementById('prevStepBtn')?.classList.toggle('hidden', currentTourStep===1);
    document.getElementById('nextStepBtn')?.classList.toggle('hidden', currentTourStep===totalTourSteps);
    document.getElementById('finishTourBtn')?.classList.toggle('hidden', currentTourStep!==totalTourSteps);
}

// ================================================================
//      3. API CALLS
// ================================================================

async function apiCall(url, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
}

async function populateShareModal() {
    const list = document.getElementById('professorsToShareList');
    const currentList = document.getElementById('currentClassMembers');
    if (!list || !currentList) return;

    list.innerHTML = '<option>Carregando...</option>';
    currentList.innerHTML = '<li class="p-2 text-gray-500 text-sm">Carregando membros...</li>';

    try {
        const [allProfs, { members, isCurrentUserOwner }] = await Promise.all([
            apiCall('/api/professors/list'),
            apiCall(`/api/classes/${state.activeClassId}/members`)
        ]);
        
        list.innerHTML = '<option value="">Selecione um professor...</option>';
        const memberIds = members.map(m => m.id);

        allProfs.forEach(p => {
            if (!memberIds.includes(p.id)) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.full_name} (${p.username})`;
                list.appendChild(opt);
            }
        });

        currentList.innerHTML = ''; 
        
        if (members.length === 0) {
            currentList.innerHTML = '<li class="p-2 text-gray-500 text-sm">Nenhum membro nesta turma.</li>';
        } else {
            members.forEach(m => {
                const li = document.createElement('li');
                li.className = 'flex justify-between items-center text-sm p-2 rounded hover:bg-gray-100 border-b';
                
                let html = `<div class="flex items-center">
                                <span class="font-medium text-gray-700">${m.full_name}</span>
                                ${m.isOwner ? '<span class="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">Dono</span>' : ''}
                            </div>`;
                
                if (isCurrentUserOwner && !m.isOwner) {
                    html += `<button class="remove-member-btn text-red-500 hover:text-red-700 font-bold p-1 hover:bg-red-50 rounded" data-pid="${m.id}" title="Remover professor">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                             </button>`;
                }
                
                li.innerHTML = html;
                currentList.appendChild(li);
            });
        }

    } catch (e) { 
        console.error(e);
        currentList.innerHTML = '<li class="text-red-500 p-2 text-sm">Erro ao carregar membros.</li>';
    }
}

async function fetchAllStudents() {
    try { state.allStudents = await apiCall('/api/students/all'); } catch (e) {}
}

async function fetchStudentsInClass(classId) {
    if (!classId || classId === 'null') { state.studentsInClass = []; return; }
    try { state.studentsInClass = await apiCall(`/api/classes/${classId}/students`); } catch (e) { state.studentsInClass = []; }
}

function consolidateDuplicateStudents() {
    const pcToCpfMap = {};
    state.allStudents.forEach(student => {
        if (student.cpf && student.pc_id) {
            pcToCpfMap[student.pc_id.toLowerCase()] = student.cpf;
        }
    });

    const unifiedMap = new Map();

    state.allSummary.forEach(item => {
        let uniqueId = item.aluno_id;
        if (pcToCpfMap[uniqueId] || pcToCpfMap[uniqueId.toLowerCase()]) {
            uniqueId = pcToCpfMap[uniqueId] || pcToCpfMap[uniqueId.toLowerCase()];
        }

        if (!unifiedMap.has(uniqueId)) {
            unifiedMap.set(uniqueId, { ...item, aluno_id: uniqueId });
        } else {
            const existing = unifiedMap.get(uniqueId);
            existing.total_duration += (item.total_duration || 0);
            existing.log_count += (item.log_count || 0);

            if (item.has_red_alert) existing.has_red_alert = true;
            if (item.has_blue_alert) existing.has_blue_alert = true;

            const dateItem = item.last_activity ? new Date(item.last_activity).getTime() : 0;
            const dateExisting = existing.last_activity ? new Date(existing.last_activity).getTime() : 0;

            if (dateItem > dateExisting) existing.last_activity = item.last_activity;
            if (item.student_name && !item.student_name.toLowerCase().includes('pc')) existing.student_name = item.student_name;
        }
    });

    state.allSummary = Array.from(unifiedMap.values());
}

function enrichSummaryWithAlerts() {
    const summaryMap = new Map();
    state.allSummary.forEach(s => summaryMap.set(s.aluno_id, s));

    state.allLogs.forEach(log => {
        const student = summaryMap.get(log.aluno_id);
        if (student) {
            if (log.categoria === 'IA') student.has_blue_alert = true;
            if (['Rede Social', 'Streaming & Jogos', 'Jogos', 'Streaming', 'Anime', 'Loja Digital'].includes(log.categoria)) {
                student.has_red_alert = true;
            }
        }
    });
}

async function fetchDataPanels() {
    if (!document.getElementById('dashboard-content')) return;
    try {
        const dateInput = document.getElementById('reportDate');
        const targetDate = dateInput ? dateInput.value : '';
        const classId = state.activeClassId;
        
        let url = '/api/data';
        const params = new URLSearchParams();
        if (targetDate) params.append('date', targetDate);
        if (classId && classId !== 'null') params.append('classId', classId);
        if ([...params].length > 0) url += `?${params.toString()}`;

        const { logs, summary } = await apiCall(url);
        state.allLogs = logs || [];
        state.allSummary = summary || [];

        consolidateDuplicateStudents(); 
        enrichSummaryWithAlerts();      

        applyFiltersAndRender();
    } catch (e) { console.error(e); }
}

// ================================================================
//      4. RENDERIZAÇÃO E GRÁFICOS
// ================================================================

function renderAllStudents() {
    const container = document.getElementById('all-students-list');
    if (!container) return;
    
    const search = state.currentFilters.studentSearch.toLowerCase();
    const filtered = state.allStudents.filter(s => s.full_name.toLowerCase().includes(search));
    const inClassIds = state.studentsInClass.map(s => s.id);

    container.innerHTML = '';
    filtered.forEach(student => {
        const inClass = inClassIds.includes(student.id);
        const div = document.createElement('div');
        div.className = `flex justify-between items-center p-3 rounded mb-2 shadow-sm ${inClass ? 'bg-green-50' : 'bg-white border'}`;
        div.innerHTML = `
            <div>
                <span class="font-medium text-gray-700">${student.full_name}</span>
                <button class="ml-2 text-gray-400 hover:text-blue-600 text-xs btn-edit-student" data-student='${JSON.stringify(student)}' title="Editar">✏️</button>
                <button class="ml-1 text-gray-400 hover:text-red-600 text-xs btn-delete-student" data-sid="${student.id}" title="Excluir">🗑️</button>
            </div>
            ${!inClass ? `<button data-sid="${student.id}" class="btn-add-student text-green-600 hover:text-green-800 font-bold text-xl">+</button>` : '<span class="text-xs text-green-600 font-semibold">Na Turma</span>'}
        `;
        container.appendChild(div);
    });
}

function renderStudentsInClass() {
    const container = document.getElementById('students-in-class-list');
    if (!container) return;
    container.innerHTML = '';
    
    if (state.studentsInClass.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4">Nenhum aluno nesta turma.</p>';
        return;
    }
    state.studentsInClass.forEach(s => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-white p-3 rounded mb-2 border shadow-sm';
        div.innerHTML = `<span>${s.full_name}</span><button data-sid="${s.id}" class="btn-remove-student text-red-500 hover:text-red-700 text-sm">Remover</button>`;
        container.appendChild(div);
    });
}

function applyFiltersAndRender() {
    const { search, category, showAlertsOnly } = state.currentFilters;
    const term = search.toLowerCase();

    const classIds = (state.activeClassId && state.activeClassId !== 'null') 
         ? state.studentsInClass.flatMap(s => [s.cpf, s.pc_id].filter(Boolean)) 
         : null;

    const filteredSummary = state.allSummary.filter(u => {
        if (classIds && !classIds.includes(u.aluno_id)) return false;
        const matchesSearch = !term || (u.student_name && u.student_name.toLowerCase().includes(term)) || (u.aluno_id && u.aluno_id.toLowerCase().includes(term));
        const matchesAlert = !showAlertsOnly || u.has_red_alert || u.has_blue_alert;
        return matchesSearch && matchesAlert;
    });

    const filteredLogs = state.allLogs.filter(l => {
        if (classIds && !classIds.includes(l.aluno_id)) return false;
        const matchesSearch = !term || 
             (l.student_name && l.student_name.toLowerCase().includes(term)) || 
             (l.aluno_id && l.aluno_id.toLowerCase().includes(term)) || 
             (l.url && l.url.toLowerCase().includes(term));
        
        const matchesCat = !category || l.categoria === category;
        const matchesAlert = !showAlertsOnly || ['Rede Social', 'Jogos', 'Streaming', 'Anime', 'IA'].includes(l.categoria);

        return matchesSearch && matchesCat && matchesAlert;
    });

    if(typeof updateUserSummaryTable === 'function') updateUserSummaryTable(filteredSummary);
    if(typeof updateLogsTable === 'function') updateLogsTable(filteredLogs);
    if(typeof updateChart === 'function') updateChart(filteredLogs);
}

function updateLogsTable(logs) {
    const tbody = document.getElementById('logsTableBody');
    const countEl = document.getElementById('logs-count');
    if (!tbody) return;
    
    if (countEl) countEl.textContent = logs.length;
    tbody.innerHTML = '';
    const start = (state.logsCurrentPage - 1) * state.logsPerPage;
    const pLogs = logs.slice(start, start + state.logsPerPage);

    pLogs.forEach(log => {
        const row = document.createElement('tr');
        const cat = log.categoria || 'Não Categorizado';
        
        if (['Rede Social', 'Streaming & Jogos', 'Jogos', 'Streaming'].includes(cat)) {
            row.className = 'bg-red-50 text-red-800';
        } else if (cat === 'IA') {
            row.className = 'bg-blue-50 text-blue-800';
        } else {
            row.className = 'hover:bg-gray-50';
        }

        const durationSeconds = Number(log.duration);
        const durationMinutes = (durationSeconds / 60).toFixed(1);

        row.innerHTML = `
            <td class="px-6 py-4 text-sm font-medium">${log.student_name || log.aluno_id}</td>
            <td class="px-6 py-4 text-sm">
                <a href="http://${log.url}" target="_blank" class="hover:underline text-blue-600 truncate block max-w-xs" title="${log.url}">
                    ${log.url}
                </a>
            </td>
            <td class="px-6 py-4 text-sm font-bold">
                ${durationMinutes} min
            </td>
            <td class="px-6 py-4 text-sm">
                <span class="category-trigger cursor-pointer hover:underline font-semibold bg-white bg-opacity-50 px-2 py-1 rounded border border-gray-200" 
                       data-url="${log.url}" data-cat="${cat}">
                    ${cat}
                </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
                ${new Date(log.timestamp).toLocaleTimeString('pt-BR')}
            </td>
        `;
        tbody.appendChild(row);
    });

    renderPagination(logs.length);
}

function updateUserSummaryTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const now = new Date(); 

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 cursor-pointer summary-row transition-all duration-200 border-b border-gray-100';
        tr.dataset.studentName = u.student_name || u.aluno_id;

        const iconIA = `<svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`;
        const iconAlert = `<svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;
        const iconCheck = `<svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;

        let statusHtml = '';

        if (u.has_red_alert && u.has_blue_alert) {
            statusHtml = `
                <div class="flex flex-col gap-1 items-start">
                    <button class="alert-btn inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200 hover:bg-red-200 transition-colors" data-aid="${u.aluno_id}" data-type="red">
                        ${iconAlert} Acesso Indevido
                    </button>
                    <button class="alert-btn inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200 transition-colors" data-aid="${u.aluno_id}" data-type="blue">
                        ${iconIA} IA Detectada
                    </button>
                </div>`;
        } else if (u.has_red_alert) {
            statusHtml = `
                <button class="alert-btn inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors shadow-sm" data-aid="${u.aluno_id}" data-type="red">
                    ${iconAlert} Indevido
                </button>`;
        } else if (u.has_blue_alert) {
            statusHtml = `
                <button class="alert-btn inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors shadow-sm" data-aid="${u.aluno_id}" data-type="blue">
                    ${iconIA} Uso de IA
                </button>`;
        } else {
            statusHtml = `
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
                    ${iconCheck} Normal
                </span>`;
        }

        let isOnline = false;
        
        if (u.last_activity) {
            const lastTime = new Date(u.last_activity);
            if (!isNaN(lastTime.getTime())) {
                const now = new Date();
                let diffMs = now - lastTime;
                const diffMinutes = diffMs / 1000 / 60;
                // Ajustado para 10 minutos conforme regra atual
                if (diffMinutes < 10 && diffMinutes > -5) { 
                    isOnline = true; 
                }
            }
        }

        const onlineBadge = isOnline
            ? `<div class="flex items-center" title="Ativo agora">
                 <span class="relative flex h-3 w-3 mr-2">
                   <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                   <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                 </span>
                 <span class="text-xs font-bold text-green-700">ON</span>
               </div>`
            : `<div class="flex items-center opacity-60" title="Sem atividade recente">
                 <span class="flex h-3 w-3 bg-gray-300 rounded-full mr-2"></span>
                 <span class="text-xs font-semibold text-gray-500">OFF</span>
               </div>`;

        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">${statusHtml}</td>
            <td class="px-6 py-4 whitespace-nowrap">${onlineBadge}</td>
            <td class="px-6 py-4">
                <div class="flex flex-col">
                    <span class="font-bold text-gray-800 text-sm">${u.student_name || 'Desconhecido'}</span>
                    <span class="text-xs text-gray-400">${u.aluno_id}</span>
                </div>
            </td>
            <td class="px-6 py-4 text-sm font-semibold text-gray-600">${(u.total_duration / 60).toFixed(1)} min</td>
            <td class="px-6 py-4 text-sm text-gray-500">${u.log_count}</td>
            <td class="px-6 py-4 text-xs text-gray-400 font-mono">${u.last_activity ? new Date(u.last_activity).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateChart(logs) {
    const ctx = document.getElementById('mainChart');
    if (!ctx) return;
    
    if (state.mainChartInstance) {
        state.mainChartInstance.destroy();
        state.mainChartInstance = null;
    }

    const usage = {};
    logs.forEach(l => { if(l.url) usage[l.url] = (usage[l.url] || 0) + l.duration; });
    const sorted = Object.entries(usage).sort((a,b) => b[1] - a[1]).slice(0, 10);

    state.mainChartInstance = new Chart(ctx, {
        type: state.currentChartType, 
        data: {
            labels: sorted.map(s => s[0]),
            datasets: [{
                label: 'Tempo (segundos)',
                data: sorted.map(s => s[1]),
                backgroundColor: [
                    'rgba(220, 38, 38, 0.7)', 'rgba(185, 28, 28, 0.7)', 'rgba(153, 27, 27, 0.7)', 
                    'rgba(127, 29, 29, 0.7)', 'rgba(239, 68, 68, 0.7)'
                ]
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            indexAxis: state.currentChartType === 'bar' ? 'y' : 'x',
            onClick: (e, elements) => {
                if(elements.length > 0) {
                    const idx = elements[0].index;
                    const url = sorted[idx][0];
                    document.getElementById('search-input').value = url;
                    state.currentFilters.search = url;
                    applyFiltersAndRender();
                }
            }
        }
    });
}

function renderPagination(total) {
    const div = document.getElementById('logs-pagination-container');
    if(!div) return;

    const pages = Math.ceil(total / state.logsPerPage);
    if(pages <= 1) { div.innerHTML = ''; return; }
    
    let html = `<div class="flex justify-center gap-2 mt-4">`;
    html += `<button class="px-3 py-1 border rounded ${state.logsCurrentPage===1?'opacity-50':''}" onclick="changePage(-1)">Anterior</button>`;
    html += `<span class="px-3 py-1 bg-gray-100 rounded">Página ${state.logsCurrentPage} de ${pages}</span>`;
    html += `<button class="px-3 py-1 border rounded ${state.logsCurrentPage===pages?'opacity-50':''}" onclick="changePage(1)">Próximo</button>`;
    html += `</div>`;
    div.innerHTML = html;
}

window.changePage = (delta) => {
    const totalLogs = state.allLogs.length; 
    const totalPages = Math.ceil(totalLogs / state.logsPerPage);
    
    const newPage = state.logsCurrentPage + delta;
    if (newPage < 1) return;
    if (newPage > totalPages && totalPages > 0) return;

    state.logsCurrentPage = newPage;
    applyFiltersAndRender();
}

// ================================================================
//      5. INICIALIZAÇÃO E LISTENERS
// ================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log("✅ Script carregado.");
    
    const catSelect = document.getElementById('category-select');
    if(catSelect) state.categories = Array.from(catSelect.options).map(o=>o.value).filter(v=>v);

    await Promise.all([fetchAllStudents(), fetchDataPanels()]);

    const classSelect = document.getElementById('classSelect');
    if(classSelect) {
        classSelect.value = state.activeClassId || 'null';
        
        const updateUI = async () => {
            const isSel = state.activeClassId && state.activeClassId !== 'null';
            
            if(isSel) await fetchStudentsInClass(state.activeClassId);
            else state.studentsInClass = [];

            if(document.getElementById('student-management-panel')) {
                document.getElementById('class-students-panel').classList.toggle('hidden', !isSel);
                const nameEl = document.getElementById('class-name-in-list');
                if(nameEl) nameEl.textContent = isSel ? state.activeClassName : '';
                
                ['editClassBtn', 'deleteClassBtn', 'shareClassBtn'].forEach(id => {
                    const btn = document.getElementById(id);
                    if(btn) btn.disabled = !isSel;
                });
                
                renderStudentsInClass();
                renderAllStudents();
            }

            if(document.getElementById('dashboard-content')) applyFiltersAndRender();
        };

        classSelect.addEventListener('change', (e) => {
            state.activeClassId = e.target.value;
            state.activeClassName = e.target.options[e.target.selectedIndex].text;
            localStorage.setItem('selectedClassId', state.activeClassId);
            localStorage.setItem('selectedClassName', state.activeClassName);
            updateUI();
        });
        
        updateUI();
    }

    if(document.getElementById('dashboard-content')) {
        
        const downloadBtn = document.getElementById('downloadPdfBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async () => {
                const dateInput = document.getElementById('reportDate');
                const dateVal = dateInput.value;

                if (!dateVal) {
                    return Swal.fire('Atenção', 'Por favor, selecione uma data para o relatório.', 'warning');
                }

                const originalText = downloadBtn.textContent;
                downloadBtn.textContent = 'Gerando PDF...';
                downloadBtn.disabled = true;

                try {
                    const response = await fetch(`/api/download-report/${dateVal}`);
                    
                    if (response.status === 404) {
                        throw new Error('Nenhum dado encontrado para a data selecionada.');
                    }
                    if (!response.ok) {
                        throw new Error('Erro interno ao gerar o PDF.');
                    }

                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Relatorio_VOCE_${dateVal}.pdf`;
                    document.body.appendChild(a); 
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url); 

                    Swal.fire({
                        icon: 'success',
                        title: 'Download Concluído',
                        timer: 1500,
                        showConfirmButton: false
                    });

                } catch (error) {
                    console.error(error);
                    Swal.fire('Erro', error.message, 'error');
                } finally {
                    downloadBtn.textContent = originalText;
                    downloadBtn.disabled = false;
                }
            });
        }

        document.querySelectorAll('.chart-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.chart-btn').forEach(b => {
                    b.classList.remove('bg-red-700', 'text-white');
                    b.classList.add('bg-gray-200', 'text-gray-700');
                });
                btn.classList.remove('bg-gray-200', 'text-gray-700');
                btn.classList.add('bg-red-700', 'text-white');

                state.currentChartType = btn.dataset.type;
                applyFiltersAndRender(); 
            });
        });

        document.getElementById('apply-filters-btn')?.addEventListener('click', () => {
            state.currentFilters.search = document.getElementById('search-input').value;
            state.currentFilters.category = document.getElementById('category-select').value;
            state.currentFilters.showAlertsOnly = document.getElementById('show-alerts-checkbox').checked;
            applyFiltersAndRender();
        });

        document.getElementById('usersTableBody')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('.alert-btn');
            if(btn) {
                const dateInput = document.getElementById('reportDate');
                const dateVal = dateInput && dateInput.value ? dateInput.value : new Date().toISOString().split('T')[0];
                
                const logs = await apiCall(`/api/alerts/${encodeURIComponent(btn.dataset.aid)}/${btn.dataset.type}?date=${dateVal}`);
                openAlertLogsModal(`Logs de Alerta: ${btn.dataset.aid}`, logs);
                return;
            }
            
            const row = e.target.closest('tr');
            if(row && row.dataset.studentName) {
                document.getElementById('search-input').value = row.dataset.studentName;
                state.currentFilters.search = row.dataset.studentName;
                applyFiltersAndRender();
            }
        });

        document.getElementById('logsTableBody')?.addEventListener('click', (e) => {
            const span = e.target.closest('.category-trigger');
            if(span) openCategoryModal(span.dataset.url, span.dataset.cat);
        });

        document.getElementById('confirmCategoryChangeBtn')?.addEventListener('click', async () => {
            const radio = document.querySelector('input[name="modalCategoryOption"]:checked');
            if(!radio) return;
            try {
                await apiCall('/api/override-category', 'POST', { url: currentlyEditingUrl, newCategory: radio.value });
                Swal.fire('Salvo', 'Categoria atualizada', 'success');
                await fetchDataPanels();
                closeCategoryModal();
            } catch(e) { Swal.fire('Erro', e.message, 'error'); }
        });
        
        document.getElementById('closeCategoryModalX')?.addEventListener('click', closeCategoryModal);
        document.getElementById('cancelCategoryModalBtn')?.addEventListener('click', closeCategoryModal);

        document.getElementById('clear-filters-btn')?.addEventListener('click', () => {
            document.getElementById('search-input').value = '';
            state.currentFilters.search = '';
            state.currentFilters.category = '';
            document.getElementById('category-select').value = '';
            document.getElementById('show-alerts-checkbox').checked = false;
            state.currentFilters.showAlertsOnly = false;
            
            applyFiltersAndRender();
        });

        const dateInput = document.getElementById('reportDate');
        if(dateInput) {
            if(!dateInput.value) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
            
            dateInput.addEventListener('change', () => {
                fetchDataPanels(); 
            });
        }
    }

    // GERENCIAMENTO
    if(document.getElementById('student-management-panel')) {
        document.getElementById('toggle-create-class-form')?.addEventListener('click', () => {
            document.getElementById('create-class-form-container').classList.toggle('hidden');
        });
        document.getElementById('toggle-add-student-form')?.addEventListener('click', () => {
            document.getElementById('add-student-form-container').classList.toggle('hidden');
        });

        document.getElementById('createClassBtn').addEventListener('click', async () => {
            const nameInput = document.getElementById('newClassName');
            const name = nameInput.value;
            const btn = document.getElementById('createClassBtn');

            if (!name || name.trim() === '') {
                return Swal.fire('Atenção', 'O nome da turma não pode ser vazio.', 'warning');
            }

            try {
                const originalText = btn.textContent;
                btn.textContent = 'Criando...';
                btn.disabled = true;

                await apiCall('/api/classes', 'POST', { name: name.trim() });
                
                await Swal.fire({
                    title: 'Sucesso!',
                    text: 'Turma criada com sucesso!',
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                });
                
                window.location.reload(); 
            } catch (error) {
                console.error("Erro detalhado ao criar turma:", error);
                Swal.fire({
                    title: 'Erro ao criar turma',
                    text: error.message || 'Erro desconhecido no servidor.',
                    icon: 'error'
                });
            } finally {
                btn.textContent = 'Criar Turma';
                btn.disabled = false;
            }
        });
        
        document.getElementById('addStudentForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            try {
                const res = await apiCall('/api/students', 'POST', Object.fromEntries(formData.entries()));
                state.allStudents.push(res.student);
                state.allStudents.sort((a,b) => a.full_name.localeCompare(b.full_name));
                renderAllStudents();
                e.target.reset();
                Swal.fire('Sucesso', 'Aluno adicionado', 'success');
            } catch(error) { Swal.fire('Erro', error.message, 'error'); }
        });

        document.getElementById('editClassBtn').addEventListener('click', () => {
              if(state.activeClassId && state.activeClassId !== 'null') 
                   openEditClassModal(state.activeClassId, state.activeClassName);
        });

        document.getElementById('shareClassBtn').addEventListener('click', openShareModal);

        document.getElementById('saveClassChangesBtn').addEventListener('click', async () => {
            const id = document.getElementById('editClassModal').dataset.classId;
            const name = document.getElementById('editClassNameInput').value;
            await apiCall(`/api/classes/${id}/edit`, 'POST', {newName: name});
            window.location.reload();
        });

        document.getElementById('saveStudentChangesBtn').addEventListener('click', async () => {
            if(!state.editingStudentData) return;
            const data = {
                fullName: document.getElementById('editStudentNameInput').value,
                cpf: document.getElementById('editStudentCpfInput').value,
                pc_id: document.getElementById('editStudentPcIdInput').value
            };
            await apiCall(`/api/students/${state.editingStudentData.id}/edit`, 'POST', data);
            window.location.reload();
        });

        // --- EXCLUSÃO DE TURMA COM SWEETALERT2 ---
        document.getElementById('deleteClassBtn').addEventListener('click', async () => {
             const result = await Swal.fire({
                 title: 'Excluir Turma?',
                 text: "Você tem certeza? Isso não pode ser desfeito.",
                 icon: 'warning',
                 showCancelButton: true,
                 confirmButtonColor: '#d33',
                 cancelButtonColor: '#6b7280',
                 confirmButtonText: 'Sim, excluir',
                 cancelButtonText: 'Cancelar'
             });

             if(result.isConfirmed) {
                  try {
                      await apiCall(`/api/classes/${state.activeClassId}`, 'DELETE');
                      localStorage.setItem('selectedClassId', 'null');
                      window.location.reload();
                  } catch (err) {
                      Swal.fire('Erro', err.message, 'error');
                  }
             }
        });

        document.getElementById('addProfessorToClassBtn').addEventListener('click', async () => {
            const pid = document.getElementById('professorsToShareList').value;
            if(!pid) return;
            await apiCall(`/api/classes/${state.activeClassId}/share`, 'POST', {professorId: pid});
            populateShareModal();
        });

        // --- REMOVER PROFESSOR COM SWEETALERT2 ---
        document.getElementById('currentClassMembers').addEventListener('click', async (e) => {
            const btn = e.target.closest('.remove-member-btn');
            if(btn) {
                const result = await Swal.fire({
                    title: 'Remover Professor?',
                    text: "Este professor deixará de ter acesso à turma.",
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#6b7280',
                    confirmButtonText: 'Sim, remover',
                    cancelButtonText: 'Cancelar'
                });

                if (result.isConfirmed) {
                    try {
                        await apiCall(`/api/classes/${state.activeClassId}/remove-member/${btn.dataset.pid}`, 'DELETE');
                        populateShareModal();
                        Swal.fire('Removido', 'O professor foi removido.', 'success');
                    } catch (err) {
                         Swal.fire('Erro', err.message, 'error');
                    }
                }
            }
        });

        document.getElementById('all-students-list').addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-add-student');
            if(btn) {
                await apiCall(`/api/classes/${state.activeClassId}/add-student`, 'POST', {studentId: btn.dataset.sid});
                await fetchStudentsInClass(state.activeClassId);
                renderStudentsInClass(); renderAllStudents();
            }
            const editBtn = e.target.closest('.btn-edit-student');
            if(editBtn) openEditStudentModal(JSON.parse(editBtn.dataset.student));
            
            // --- EXCLUSÃO DE ALUNO COM SWEETALERT2 ---
            const deleteBtn = e.target.closest('.btn-delete-student');
            if (deleteBtn) {
                const result = await Swal.fire({
                    title: 'Excluir Aluno Permanentemente?',
                    text: "Essa ação removerá o aluno e todo o histórico do sistema. Não pode ser desfeito!",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#d33', // Vermelho forte
                    cancelButtonColor: '#6b7280',
                    confirmButtonText: 'Sim, excluir!',
                    cancelButtonText: 'Cancelar'
                });

                if (result.isConfirmed) {
                    try {
                        await apiCall(`/api/students/${deleteBtn.dataset.sid}`, 'DELETE');
                        
                        // Remove do estado local para atualização rápida
                        state.allStudents = state.allStudents.filter(s => s.id != deleteBtn.dataset.sid);
                        state.studentsInClass = state.studentsInClass.filter(s => s.id != deleteBtn.dataset.sid);
                        
                        renderAllStudents();
                        renderStudentsInClass();
                        Swal.fire('Excluído!', 'O aluno foi removido do sistema.', 'success');
                    } catch (err) {
                        Swal.fire('Erro', err.message, 'error');
                    }
                }
            }
        });

        // --- REMOVER ALUNO DA TURMA COM SWEETALERT2 ---
        document.getElementById('students-in-class-list').addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-remove-student');
            if(btn) {
                const result = await Swal.fire({
                    title: 'Remover Aluno da Turma?',
                    text: "O aluno será desvinculado desta turma, mas continuará no sistema.",
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#f59e0b', // Laranja
                    cancelButtonColor: '#6b7280',
                    confirmButtonText: 'Sim, remover',
                    cancelButtonText: 'Cancelar'
                });

                if (result.isConfirmed) {
                    try {
                        await apiCall(`/api/classes/${state.activeClassId}/remove-student/${btn.dataset.sid}`, 'DELETE');
                        await fetchStudentsInClass(state.activeClassId);
                        renderStudentsInClass(); renderAllStudents();
                        Swal.fire('Removido', 'Aluno removido da turma.', 'success');
                    } catch(err) {
                         Swal.fire('Erro', err.message, 'error');
                    }
                }
            }
        });

        document.getElementById('student-search-input')?.addEventListener('input', (e) => {
            state.currentFilters.studentSearch = e.target.value;
            renderAllStudents();
        });
    }
});