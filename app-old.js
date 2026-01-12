// Sistema de Numeração de Documentos - Versão Simplificada e Completa
// Com: Campos expandidos, 4 níveis de permissão, seleção de documentos, logs

let state = {
    documents: [],
    reservations: [],
    users: [],
    logs: [],
    currentUser: null,
    currentView: 'login',
    editingDocId: null,
    editingUserId: null,
    currentLogFilter: 'todos'
};

// Níveis de permissão
const PERMISSION_LEVELS = {
    admin: { label: 'Administrador', desc: 'Acesso total' },
    user_full: { label: 'Usuário Completo', desc: 'Todos documentos' },
    user_restricted: { label: 'Usuário Restrito', desc: 'Documentos específicos' },
    user_readonly: { label: 'Somente Leitura', desc: 'Visualizar apenas' }
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    checkAutoLogin();
});

// Carregar dados
function loadData() {
    const savedDocs = localStorage.getItem('documents');
    const savedReservations = localStorage.getItem('reservations');
    const savedUsers = localStorage.getItem('users');
    const savedLogs = localStorage.getItem('logs');

    if (savedDocs) {
        state.documents = JSON.parse(savedDocs);
        checkYearlyReset();
    } else {
        state.documents = [
            { id: generateId(), name: 'Ofício', prefix: 'Of.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Memorando', prefix: 'Mem.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Resolução', prefix: 'Res.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Contrato', prefix: 'Contr.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Decreto', prefix: 'Dec.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Portaria', prefix: 'Port.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Ata', prefix: '', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Edital', prefix: 'Ed.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Parecer', prefix: 'Par.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Circular', prefix: 'Circ.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Processo', prefix: 'Proc.', startNumber: 1, currentNumber: 1, yearlyReset: false, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Protocolo', prefix: 'Prot.', startNumber: 1000, currentNumber: 1000, yearlyReset: false, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Lei', prefix: 'L.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Lei Complementar', prefix: 'LC', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Medida Provisória', prefix: 'MP', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Instrução Normativa', prefix: 'IN', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Exposição de Motivos', prefix: 'EM', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Folha', prefix: 'fl.', startNumber: 1, currentNumber: 1, yearlyReset: false, lastResetYear: new Date().getFullYear(), enabled: true }
        ];
        saveData();
    }

    state.reservations = savedReservations ? JSON.parse(savedReservations) : [];
    state.logs = savedLogs ? JSON.parse(savedLogs) : [];

    if (savedUsers) {
        state.users = JSON.parse(savedUsers);
    } else {
        state.users = [{
            id: generateId(),
            username: 'admin',
            password: 'admin123',
            name: 'Administrador',
            cargo: 'Administrador do Sistema',
            setor: 'TI',
            secretaria: 'Administrativa',
            role: 'admin',
            allowedDocuments: [],
            createdAt: new Date().toISOString()
        }];
        saveUsers();
    }
}

// Salvar dados
function saveData() {
    localStorage.setItem('documents', JSON.stringify(state.documents));
    localStorage.setItem('reservations', JSON.stringify(state.reservations));
}

function saveUsers() {
    localStorage.setItem('users', JSON.stringify(state.users));
}

function saveLogs() {
    localStorage.setItem('logs', JSON.stringify(state.logs));
}

// Adicionar log
function addLog(type, action, details) {
    state.logs.unshift({
        id: generateId(),
        type: type,
        action: action,
        details: details,
        userId: state.currentUser?.id,
        userName: state.currentUser?.name || 'Sistema',
        timestamp: new Date().toISOString()
    });
    if (state.logs.length > 1000) state.logs = state.logs.slice(0, 1000);
    saveLogs();
}

// Reset anual
function checkYearlyReset() {
    const currentYear = new Date().getFullYear();
    let hasChanges = false;
    state.documents.forEach(doc => {
        if (doc.yearlyReset && doc.lastResetYear !== currentYear) {
            doc.currentNumber = doc.startNumber;
            doc.lastResetYear = currentYear;
            hasChanges = true;
        }
    });
    if (hasChanges) saveData();
}

// Auto login
function checkAutoLogin() {
    const savedUserId = localStorage.getItem('currentUserId');
    if (savedUserId) {
        const user = state.users.find(u => u.id === savedUserId);
        if (user) {
            state.currentUser = user;
            showMainApp();
            return;
        }
    }
    showLoginView();
}

// Login
function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    const user = state.users.find(u => u.username === username && u.password === password);

    if (user) {
        state.currentUser = user;
        localStorage.setItem('currentUserId', user.id);
        addLog('sistema', 'Login realizado', `${user.name} acessou o sistema`);
        showMainApp();
    } else {
        alert('Usuário ou senha incorretos!');
    }
}

// Logout
function handleLogout() {
    addLog('sistema', 'Logout realizado', `${state.currentUser.name} saiu do sistema`);
    localStorage.removeItem('currentUserId');
    state.currentUser = null;
    showLoginView();
}

// Tela de login
function showLoginView() {
    document.body.innerHTML = `
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <div class="logo-large">📄</div>
                    <h1>Sistema de Numeração</h1>
                    <p>Faça login para continuar</p>
                </div>
                <form id="loginForm" class="login-form">
                    <div class="form-group">
                        <label for="loginUsername">Usuário</label>
                        <input type="text" id="loginUsername" required autofocus>
                    </div>
                    <div class="form-group">
                        <label for="loginPassword">Senha</label>
                        <input type="password" id="loginPassword" required>
                    </div>
                    <button type="submit" class="btn-primary btn-block">Entrar</button>
                </form>
            </div>
        </div>
    `;
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

// Tela principal
function showMainApp() {
    const isAdmin = state.currentUser.role === 'admin';

    document.body.innerHTML = `
        <div class="app-container">
            <header class="app-header">
                <div class="header-content">
                    <div class="logo"><h1>📄 Sistema de Numeração</h1></div>
                    <nav class="header-nav">
                        <button class="nav-btn active" onclick="switchView('main')">📋 Principal</button>
                        ${isAdmin ? '<button class="nav-btn" onclick="switchView(\'admin\')">⚙️ Administração</button>' : ''}
                    </nav>
                    <div class="header-actions">
                        <span class="user-info">${state.currentUser.name} (${PERMISSION_LEVELS[state.currentUser.role].label})</span>
                        <button class="btn-secondary" onclick="handleLogout()">Sair</button>
                    </div>
                </div>
            </header>

            <main id="mainView" class="view active">
                <div class="main-content">
                    <section class="documents-section">
                        <div class="section-header">
                            <h2>Tipos de Documentos</h2>
                            <p>Selecione um documento para reservar número</p>
                        </div>
                        <div id="documentsList" class="documents-grid"></div>
                    </section>

                    <section class="history-section">
                        <div class="section-header">
                            <h2>Histórico de Reservas</h2>
                            <div class="search-box">
                                <span class="search-icon">🔍</span>
                                <input type="text" id="searchInput" placeholder="Buscar..." oninput="renderHistory()">
                            </div>
                        </div>
                        <div id="historyList" class="history-list"></div>
                    </section>
                </div>
            </main>

            ${isAdmin ? `
            <main id="adminView" class="view">
                <div class="admin-content">
                    <section class="stats-section">
                        <h2>Estatísticas</h2>
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-icon">📄</div>
                                <div><div class="stat-value" id="totalDocTypes">0</div><div class="stat-label">Tipos de Documentos</div></div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-icon">🔢</div>
                                <div><div class="stat-value" id="totalReservations">0</div><div class="stat-label">Total Reservas</div></div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-icon">📅</div>
                                <div><div class="stat-value" id="todayReservations">0</div><div class="stat-label">Reservas Hoje</div></div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-icon">👥</div>
                                <div><div class="stat-value" id="totalUsers">0</div><div class="stat-label">Usuários</div></div>
                            </div>
                        </div>
                    </section>

                    <section class="manage-section">
                        <div class="section-header">
                            <h2>Gerenciar Documentos</h2>
                            <button class="btn-primary" onclick="openAddDocModal()">➕ Adicionar Documento</button>
                        </div>
                        <div id="adminDocsList" class="admin-docs-list"></div>
                    </section>

                    <section class="manage-section">
                        <div class="section-header">
                            <h2>Gerenciar Usuários</h2>
                            <button class="btn-primary" onclick="openAddUserModal()">➕ Adicionar Usuário</button>
                        </div>
                        <div id="adminUsersList" class="admin-docs-list"></div>
                    </section>

                    <section class="manage-section logs-section">
                        <div class="section-header"><h2>📊 Logs do Sistema</h2></div>
                        <div class="logs-filters">
                            <button class="log-filter-btn active" onclick="filterLogs('todos')">📋 Todos</button>
                            <button class="log-filter-btn" onclick="filterLogs('cadastro')">📝 Cadastros</button>
                            <button class="log-filter-btn" onclick="filterLogs('reserva')">🔢 Reservas</button>
                            <div class="logs-search">
                                <input type="text" id="logsSearch" placeholder="Buscar logs..." oninput="renderLogs()">
                            </div>
                        </div>
                        <div id="logsList" class="logs-list"></div>
                    </section>
                </div>
            </main>
            ` : ''}

            <!-- Modal Documento -->
            <div id="docModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modalTitle">Adicionar Documento</h3>
                        <button class="close-btn" onclick="closeDocModal()">&times;</button>
                    </div>
                    <form id="docForm" onsubmit="handleDocFormSubmit(event)">
                        <div class="form-group">
                            <label for="docName">Nome do Documento *</label>
                            <input type="text" id="docName" required placeholder="Ex: Ofício">
                        </div>
                        <div class="form-group">
                            <label for="docPrefix">Prefixo</label>
                            <input type="text" id="docPrefix" placeholder="Ex: Of.">
                        </div>
                        <div class="form-group">
                            <label for="startNumber">Número Inicial *</label>
                            <input type="number" id="startNumber" value="1" min="1" required>
                        </div>
                        <div class="checkbox-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="yearlyReset">
                                <span>Resetar numeração anualmente</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="docEnabled" checked>
                                <span>Documento habilitado</span>
                            </label>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn-secondary" onclick="closeDocModal()">Cancelar</button>
                            <button type="submit" class="btn-primary">Salvar</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Modal Usuário -->
            <div id="userModal" class="modal">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3 id="userModalTitle">Adicionar Usuário</h3>
                        <button class="close-btn" onclick="closeUserModal()">&times;</button>
                    </div>
                    <form id="userForm" onsubmit="handleUserFormSubmit(event)">
                        <div class="form-section">
                            <h4>📋 Informações Pessoais</h4>
                            <div class="form-group">
                                <label for="userName">Nome Completo *</label>
                                <input type="text" id="userName" required>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="userCargo">Cargo *</label>
                                    <input type="text" id="userCargo" required>
                                </div>
                                <div class="form-group">
                                    <label for="userSetor">Setor *</label>
                                    <input type="text" id="userSetor" required>
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="userSecretaria">Secretaria *</label>
                                <input type="text" id="userSecretaria" required>
                            </div>
                        </div>
                        <div class="form-section">
                            <h4>🔐 Credenciais</h4>
                            <div class="form-row">
                                <div class="form-group">
                                    <label for="userUsername">Usuário (login) *</label>
                                    <input type="text" id="userUsername" required>
                                </div>
                                <div class="form-group">
                                    <label for="userPassword">Senha *</label>
                                    <input type="password" id="userPassword" required>
                                </div>
                            </div>
                        </div>
                        <div class="form-section">
                            <h4>🔑 Permissão</h4>
                            <div class="form-group">
                                <label for="userRole">Nível de Permissão *</label>
                                <select id="userRole" required onchange="handleRoleChange()">
                                    <option value="user_restricted">Usuário Restrito</option>
                                    <option value="user_full">Usuário Completo</option>
                                    <option value="user_readonly">Somente Leitura</option>
                                    <option value="admin">Administrador</option>
                                </select>
                                <p class="help-text" id="roleDescription">Acesso apenas a documentos específicos</p>
                            </div>
                        </div>
                        <div class="form-section" id="documentsSection">
                            <h4>📄 Documentos Permitidos</h4>
                            <div class="checkbox-actions">
                                <button type="button" class="btn-link" onclick="selectAllDocs()">☑ Todos</button>
                                <button type="button" class="btn-link" onclick="deselectAllDocs()">☐ Nenhum</button>
                            </div>
                            <div id="documentsList" class="documents-checkboxes"></div>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn-secondary" onclick="closeUserModal()">Cancelar</button>
                            <button type="submit" class="btn-primary">Salvar Usuário</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    setupEventListeners();
    renderDocuments();
    renderHistory();
    if (isAdmin) {
        renderAdminDocs();
        renderAdminUsers();
        renderLogs();
        updateStats();
    }
}

// Event listeners
function setupEventListeners() {
    if (typeof initAutocomplete === 'function') {
        const docNameInput = document.getElementById('docName');
        if (docNameInput) setTimeout(() => initAutocomplete(), 100);
    }
}

// Mudar view
function switchView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    if (view === 'main') {
        document.getElementById('mainView').classList.add('active');
        document.querySelector('[onclick="switchView(\'main\')"]').classList.add('active');
    } else {
        document.getElementById('adminView').classList.add('active');
        document.querySelector('[onclick="switchView(\'admin\')"]').classList.add('active');
        updateStats();
    }
}

// Filtrar documentos por permissão
function getVisibleDocuments() {
    let docs = state.documents.filter(d => d.enabled);
    const user = state.currentUser;

    if (user.role === 'admin' || user.role === 'user_full') return docs;

    if (user.role === 'user_restricted' || user.role === 'user_readonly') {
        if (!user.allowedDocuments || user.allowedDocuments.length === 0) return [];
        return docs.filter(d => user.allowedDocuments.includes(d.id));
    }
    return docs;
}

// Verificar se pode reservar
function canReserve(docId) {
    const user = state.currentUser;
    if (user.role === 'user_readonly') return false;
    if (user.role === 'admin' || user.role === 'user_full') return true;
    return user.allowedDocuments && user.allowedDocuments.includes(docId);
}

// Renderizar documentos
function renderDocuments() {
    const container = document.getElementById('documentsList');
    const docs = getVisibleDocuments();

    if (docs.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum documento disponível.</p>';
        return;
    }

    container.innerHTML = docs.map(doc => `
        <div class="doc-card">
            <div class="doc-card-header">
                <div class="doc-icon">📄</div>
                <div class="doc-badge">#${String(doc.currentNumber).padStart(3, '0')}</div>
            </div>
            <div class="doc-name">${doc.name}</div>
            <div class="doc-prefix">${doc.prefix || 'Sem prefixo'}</div>
            <div class="doc-number">${formatNumber(doc)}</div>
            ${canReserve(doc.id) ?
            `<button class="reserve-btn" onclick="reserveNumber('${doc.id}')">Reservar Número</button>` :
            `<button class="reserve-btn" disabled style="opacity:0.5">🔒 Sem Permissão</button>`
        }
        </div>
    `).join('');
}

// Formatar número
function formatNumber(doc) {
    const year = new Date().getFullYear();
    const number = String(doc.currentNumber).padStart(3, '0');
    return doc.prefix ? `${doc.prefix} ${number}/${year}` : `${number}/${year}`;
}

// Reservar número
function reserveNumber(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc || !canReserve(docId)) return;

    const reservation = {
        id: generateId(),
        docId: doc.id,
        docName: doc.name,
        number: doc.currentNumber,
        formattedNumber: formatNumber(doc),
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        timestamp: new Date().toISOString()
    };

    doc.currentNumber++;
    state.reservations.unshift(reservation);

    saveData();
    addLog('reserva', `Reservou ${doc.name}`, `Número: ${reservation.formattedNumber}`);

    renderDocuments();
    renderHistory();
    if (state.currentUser.role === 'admin') {
        renderAdminDocs();
        updateStats();
    }

    alert(`Número reservado: ${reservation.formattedNumber}`);
}

// Renderizar histórico
function renderHistory() {
    const container = document.getElementById('historyList');
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';

    let filtered = state.reservations.filter(r =>
        r.docName.toLowerCase().includes(search) ||
        r.formattedNumber.toLowerCase().includes(search) ||
        r.userName.toLowerCase().includes(search)
    );

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhuma reserva encontrada.</p>';
        return;
    }

    container.innerHTML = filtered.slice(0, 50).map(r => `
        <div class="history-item">
            <div class="history-info">
                <div class="history-type">${r.docName}</div>
                <div class="history-details">${formatDate(new Date(r.timestamp))} às ${formatTime(new Date(r.timestamp))} - ${r.userName}</div>
            </div>
            <div class="history-number">${r.formattedNumber}</div>
        </div>
    `).join('');
}

// Renderizar documentos admin
function renderAdminDocs() {
    const container = document.getElementById('adminDocsList');
    container.innerHTML = state.documents.map(doc => `
        <div class="admin-doc-item" style="opacity: ${doc.enabled ? '1' : '0.5'}">
            <div class="admin-doc-info">
                <div class="admin-doc-name">${doc.name} ${!doc.enabled ? '(Desabilitado)' : ''}</div>
                <div class="admin-doc-details">
                    Prefixo: ${doc.prefix || 'Nenhum'} | 
                    Número atual: ${doc.currentNumber} | 
                    Reset anual: ${doc.yearlyReset ? 'Sim' : 'Não'}
                </div>
            </div>
            <div class="admin-doc-actions">
                <button class="icon-btn" onclick="toggleDocStatus('${doc.id}')" title="${doc.enabled ? 'Desabilitar' : 'Habilitar'}">${doc.enabled ? '👁️' : '🚫'}</button>
                <button class="icon-btn" onclick="openEditDocModal('${doc.id}')" title="Editar">✏️</button>
                <button class="icon-btn delete" onclick="deleteDocument('${doc.id}')" title="Excluir">🗑️</button>
            </div>
        </div>
    `).join('');
}

// Renderizar usuários admin
function renderAdminUsers() {
    const container = document.getElementById('adminUsersList');
    container.innerHTML = state.users.map(user => {
        const permLabel = PERMISSION_LEVELS[user.role]?.label || user.role;
        const permIcon = user.role === 'admin' ? '🔑' : user.role === 'user_readonly' ? '👁️' : '👤';

        return `
            <div class="admin-doc-item">
                <div class="admin-doc-info">
                    <div class="admin-doc-name">${user.name} ${user.id === state.currentUser.id ? '(Você)' : ''}</div>
                    <div class="admin-doc-details">
                        usuário: ${user.username} | 
                        Cargo: ${user.cargo || 'N/A'} | 
                        Setor: ${user.setor || 'N/A'} | 
                        Secretaria: ${user.secretaria || 'N/A'}
                    </div>
                    <div class="admin-doc-details">
                        ${permIcon} ${permLabel}
                        ${user.allowedDocuments?.length > 0 ? ` | Acesso a ${user.allowedDocuments.length} documento(s)` : ''}
                    </div>
                </div>
                <div class="admin-doc-actions">
                    ${user.id !== state.currentUser.id ? `
                        <button class="icon-btn" onclick="openEditUserModal('${user.id}')">✏️</button>
                        <button class="icon-btn delete" onclick="deleteUser('${user.id}')">🗑️</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Renderizar logs
function renderLogs() {
    const container = document.getElementById('logsList');
    const search = document.getElementById('logsSearch')?.value.toLowerCase() || '';

    let filtered = state.logs;

    if (state.currentLogFilter !== 'todos') {
        filtered = filtered.filter(l => l.type === state.currentLogFilter);
    }

    if (search) {
        filtered = filtered.filter(l =>
            l.action.toLowerCase().includes(search) ||
            l.details.toLowerCase().includes(search) ||
            l.userName.toLowerCase().includes(search)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum log encontrado.</p>';
        return;
    }

    container.innerHTML = filtered.slice(0, 100).map(log => {
        const date = new Date(log.timestamp);
        const typeColor = log.type === 'cadastro' ? '#3b82f6' : '#10b981';
        const typeIcon = log.type === 'cadastro' ? '📝' : '🔢';

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

// Filtrar logs
function filterLogs(type) {
    state.currentLogFilter = type;
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(type === 'todos' ? 'Todos' : type === 'cadastro' ? 'Cadastros' : 'Reservas'));
    });
    renderLogs();
}

// Estatísticas
function updateStats() {
    document.getElementById('totalDocTypes').textContent = state.documents.length;
    document.getElementById('totalReservations').textContent = state.reservations.length;
    document.getElementById('totalUsers').textContent = state.users.length;

    const today = new Date().toISOString().split('T')[0];
    const todayCount = state.reservations.filter(r => r.timestamp.startsWith(today)).length;
    document.getElementById('todayReservations').textContent = todayCount;
}

// Modals - Documento
function openAddDocModal() {
    state.editingDocId = null;
    document.getElementById('modalTitle').textContent = 'Adicionar Documento';
    document.getElementById('docForm').reset();
    document.getElementById('docModal').classList.add('active');
}

function openEditDocModal(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return;

    state.editingDocId = docId;
    document.getElementById('modalTitle').textContent = 'Editar Documento';
    document.getElementById('docName').value = doc.name;
    document.getElementById('docPrefix').value = doc.prefix || '';
    document.getElementById('startNumber').value = doc.startNumber;
    document.getElementById('yearlyReset').checked = doc.yearlyReset;
    document.getElementById('docEnabled').checked = doc.enabled;
    document.getElementById('docModal').classList.add('active');
}

function closeDocModal() {
    document.getElementById('docModal').classList.remove('active');
}

function handleDocFormSubmit(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('docName').value,
        prefix: document.getElementById('docPrefix').value,
        startNumber: parseInt(document.getElementById('startNumber').value),
        yearlyReset: document.getElementById('yearlyReset').checked,
        enabled: document.getElementById('docEnabled').checked
    };

    if (state.editingDocId) {
        const doc = state.documents.find(d => d.id === state.editingDocId);
        Object.assign(doc, formData);
        addLog('cadastro', 'Editou documento', doc.name);
    } else {
        state.documents.push({
            id: generateId(),
            ...formData,
            currentNumber: formData.startNumber,
            lastResetYear: new Date().getFullYear()
        });
        addLog('cadastro', 'Criou documento', formData.name);
    }

    saveData();
    renderAdminDocs();
    renderDocuments();
    updateStats();
    closeDocModal();
}

function toggleDocStatus(docId) {
    const doc = state.documents.find(d => d.id === docId);
    doc.enabled = !doc.enabled;
    saveData();
    addLog('cadastro', `${doc.enabled ? 'Habilitou' : 'Desabilitou'} documento`, doc.name);
    renderAdminDocs();
    renderDocuments();
}

function deleteDocument(docId) {
    if (!confirm('Excluir este documento?')) return;
    const doc = state.documents.find(d => d.id === docId);
    state.documents = state.documents.filter(d => d.id !== docId);
    saveData();
    addLog('cadastro', 'Excluiu documento', doc.name);
    renderAdminDocs();
    renderDocuments();
    updateStats();
}

// Modals - Usuário
function openAddUserModal() {
    state.editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Adicionar Usuário';
    document.getElementById('userForm').reset();
    document.getElementById('userRole').value = 'user_restricted';
    handleRoleChange();
    document.getElementById('userModal').classList.add('active');
}

function openEditUserModal(userId) {
    const user = state.users.find(u => u.id === userId);
    if (!user) return;

    state.editingUserId = userId;
    document.getElementById('userModalTitle').textContent = 'Editar Usuário';
    document.getElementById('userName').value = user.name;
    document.getElementById('userCargo').value = user.cargo || '';
    document.getElementById('userSetor').value = user.setor || '';
    document.getElementById('userSecretaria').value = user.secretaria || '';
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userPassword').value = user.password;
    document.getElementById('userRole').value = user.role;

    handleRoleChange();

    if (user.allowedDocuments) {
        setTimeout(() => {
            user.allowedDocuments.forEach(docId => {
                const cb = document.querySelector(`.doc-checkbox[value="${docId}"]`);
                if (cb) cb.checked = true;
            });
        }, 100);
    }

    document.getElementById('userModal').classList.add('active');
}

function closeUserModal() {
    document.getElementById('userModal').classList.remove('active');
}

function handleRoleChange() {
    const role = document.getElementById('userRole').value;
    const section = document.getElementById('documentsSection');
    const desc = document.getElementById('roleDescription');

    desc.textContent = PERMISSION_LEVELS[role]?.desc || '';

    if (role === 'user_restricted' || role === 'user_readonly') {
        section.style.display = 'block';
        renderDocCheckboxes();
    } else {
        section.style.display = 'none';
    }
}

function renderDocCheckboxes() {
    const container = document.querySelector('#userModal #documentsList');
    container.innerHTML = state.documents
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(doc => `
            <label class="checkbox-label document-checkbox">
                <input type="checkbox" class="doc-checkbox" value="${doc.id}" ${doc.enabled ? '' : 'disabled'}>
                <span>${doc.name} ${doc.prefix ? '(' + doc.prefix + ')' : ''}</span>
                ${!doc.enabled ? '<span class="badge-disabled">Desabilitado</span>' : ''}
            </label>
        `).join('');
}

function selectAllDocs() {
    document.querySelectorAll('.doc-checkbox').forEach(cb => {
        if (!cb.disabled) cb.checked = true;
    });
}

function deselectAllDocs() {
    document.querySelectorAll('.doc-checkbox').forEach(cb => cb.checked = false);
}

function handleUserFormSubmit(e) {
    e.preventDefault();

    const role = document.getElementById('userRole').value;
    let allowedDocuments = [];

    if (role === 'user_restricted' || role === 'user_readonly') {
        allowedDocuments = Array.from(document.querySelectorAll('.doc-checkbox:checked')).map(cb => cb.value);
        if (allowedDocuments.length === 0) {
            alert('Selecione pelo menos um documento!');
            return;
        }
    }

    const formData = {
        name: document.getElementById('userName').value,
        cargo: document.getElementById('userCargo').value,
        setor: document.getElementById('userSetor').value,
        secretaria: document.getElementById('userSecretaria').value,
        username: document.getElementById('userUsername').value,
        password: document.getElementById('userPassword').value,
        role: role,
        allowedDocuments: allowedDocuments
    };

    const existing = state.users.find(u => u.username === formData.username && u.id !== state.editingUserId);
    if (existing) {
        alert('Este nome de usuário já existe!');
        return;
    }

    if (state.editingUserId) {
        const user = state.users.find(u => u.id === state.editingUserId);
        Object.assign(user, formData);
        addLog('cadastro', 'Editou usuário', `${formData.name} - ${formData.cargo}`);
    } else {
        state.users.push({
            id: generateId(),
            ...formData,
            createdAt: new Date().toISOString()
        });
        addLog('cadastro', 'Criou usuário', `${formData.name} - ${formData.cargo}`);
    }

    saveUsers();
    renderAdminUsers();
    updateStats();
    closeUserModal();
}

function deleteUser(userId) {
    if (!confirm('Excluir este usuário?')) return;
    const user = state.users.find(u => u.id === userId);
    state.users = state.users.filter(u => u.id !== userId);
    saveUsers();
    addLog('cadastro', 'Excluiu usuário', user.name);
    renderAdminUsers();
    updateStats();
}

// Utilitários
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(date) {
    return date.toLocaleDateString('pt-BR');
}

function formatTime(date) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
