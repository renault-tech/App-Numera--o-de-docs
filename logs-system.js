// Sistema de Logs - Adicionar ao app.js principal

// Adicionar ao estado inicial (linha 2-10)
let state = {
    documents: [],
    reservations: [],
    users: [],
    logs: [], // NOVO: Sistema de logs
    currentUser: null,
    currentView: 'login',
    editingDocId: null,
    editingUserId: null,
    currentLogFilter: 'todos' // NOVO: Filtro de logs
};

// Adicionar função de salvar logs (após saveUsers)
function saveLogs() {
    localStorage.setItem('logs', JSON.stringify(state.logs));
}

// Função para adicionar log
function addLog(type, action, details) {
    const log = {
        id: generateId(),
        type: type, // 'cadastro' ou 'reserva'
        action: action,
        details: details,
        userId: state.currentUser ? state.currentUser.id : null,
        userName: state.currentUser ? state.currentUser.name : 'Sistema',
        timestamp: new Date().toISOString()
    };

    state.logs.unshift(log);

    // Limitar a 1000 logs para não sobrecarregar
    if (state.logs.length > 1000) {
        state.logs = state.logs.slice(0, 1000);
    }

    saveLogs();
}

// Carregar logs no loadData (adicionar após carregar users)
const savedLogs = localStorage.getItem('logs');
if (savedLogs) {
    state.logs = JSON.parse(savedLogs);
}

// Renderizar logs no painel admin
function renderLogs() {
    const container = document.getElementById('logsList');
    if (!container) return;

    let filteredLogs = state.logs;

    // Aplicar filtro
    if (state.currentLogFilter === 'cadastro') {
        filteredLogs = state.logs.filter(log => log.type === 'cadastro');
    } else if (state.currentLogFilter === 'reserva') {
        filteredLogs = state.logs.filter(log => log.type === 'reserva');
    }

    // Aplicar busca se houver
    const searchInput = document.getElementById('logsSearch');
    if (searchInput && searchInput.value) {
        const searchTerm = searchInput.value.toLowerCase();
        filteredLogs = filteredLogs.filter(log =>
            log.action.toLowerCase().includes(searchTerm) ||
            log.details.toLowerCase().includes(searchTerm) ||
            log.userName.toLowerCase().includes(searchTerm)
        );
    }

    if (filteredLogs.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum log encontrado.</p>';
        return;
    }

    container.innerHTML = filteredLogs.map(log => {
        const date = new Date(log.timestamp);
        const typeIcon = log.type === 'cadastro' ? '📝' : '🔢';
        const typeColor = log.type === 'cadastro' ? '#3b82f6' : '#10b981';

        return `
            <div class="log-item" style="border-left: 4px solid ${typeColor}">
                <div class="log-header">
                    <span class="log-icon">${typeIcon}</span>
                    <span class="log-user">${log.userName}</span>
                    <span class="log-time">${formatDate(date)} às ${formatTime(date)}</span>
                </div>
                <div class="log-action">${log.action}</div>
                ${log.details ? `<div class="log-details">${log.details}</div>` : ''}
            </div>
        `;
    }).join('');
}

// Filtrar logs por tipo
function filterLogs(type) {
    state.currentLogFilter = type;

    // Atualizar botões de filtro
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === type);
    });

    renderLogs();
}

// Buscar logs
function handleLogsSearch() {
    renderLogs();
}

// INTEGRAR LOGS NAS AÇÕES EXISTENTES:

// 1. Ao reservar número (modificar função reserveNumber)
// Adicionar após state.reservations.unshift(reservation):
addLog('reserva', `Reservou ${doc.name}`, `Número: ${formatReservationNumber(reservation)}`);

// 2. Ao criar documento (modificar handleFormSubmit)
// No bloco else (adicionar):
addLog('cadastro', 'Criou documento', `${formData.name} (${formData.prefix})`);

// 3. Ao editar documento (modificar handleFormSubmit)  
// No bloco if (state.editingDocId):
addLog('cadastro', 'Editou documento', `${formData.name} - alterações salvas`);

// 4. Ao excluir documento (modificar deleteDocument)
// Antes de filtrar:
const docToDelete = state.documents.find(d => d.id === docId);
addLog('cadastro', 'Excluiu documento', `${docToDelete.name}`);

// 5. Ao habilitar/desabilitar documento (modificar toggleDocumentStatus)
addLog('cadastro', `${doc.enabled ? 'Habilitou' : 'Desabilitou'} documento`, doc.name);

// 6. Ao criar usuário (modificar handleUserFormSubmit)
// No bloco else:
addLog('cadastro', 'Criou usuário', `${formData.name} - ${formData.cargo}`);

// 7. Ao editar usuário
addLog('cadastro', 'Editou usuário', `${formData.name} - alterações salvas`);

// 8. Ao excluir usuário
const userToDelete = state.users.find(u => u.id === userId);
addLog('cadastro', 'Excluiu usuário', `${userToDelete.name}`);
