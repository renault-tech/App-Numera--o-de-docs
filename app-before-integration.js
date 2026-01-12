// Estado da aplicação
let state = {
    documents: [],
    reservations: [],
    users: [],
    currentUser: null,
    currentView: 'login',
    editingDocId: null,
    editingUserId: null
};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    checkAutoLogin();
});

// Carregar dados do localStorage
function loadData() {
    const savedDocs = localStorage.getItem('documents');
    const savedReservations = localStorage.getItem('reservations');
    const savedUsers = localStorage.getItem('users');

    if (savedDocs) {
        state.documents = JSON.parse(savedDocs);
        checkYearlyReset();
    } else {
        // Dados iniciais - Todos os 18 tipos de documentos pré-cadastrados
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

    if (savedReservations) {
        state.reservations = JSON.parse(savedReservations);
    }

    if (savedUsers) {
        state.users = JSON.parse(savedUsers);
    } else {
        // Criar usuário administrador padrão
        state.users = [
            {
                id: generateId(),
                username: 'admin',
                password: 'admin123',
                name: 'Administrador',
                role: 'admin',
                createdAt: new Date().toISOString()
            }
        ];
        saveUsers();
    }
}

// Verificar se precisa resetar numeração anual
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

    if (hasChanges) {
        saveData();
    }
}

// Salvar dados no localStorage
function saveData() {
    localStorage.setItem('documents', JSON.stringify(state.documents));
    localStorage.setItem('reservations', JSON.stringify(state.reservations));
}

function saveUsers() {
    localStorage.setItem('users', JSON.stringify(state.users));
}

// Gerar ID único
function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

// Verificar login automático
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

// Mostrar tela de login
function showLoginView() {
    document.body.innerHTML = `
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <div class="logo-large">
                        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                            <rect width="64" height="64" rx="16" fill="url(#gradient1)"/>
                            <path d="M20 24h24M20 32h24M20 40h16" stroke="white" stroke-width="4" stroke-linecap="round"/>
                            <defs>
                                <linearGradient id="gradient1" x1="0" y1="0" x2="64" y2="64">
                                    <stop offset="0%" stop-color="#667eea"/>
                                    <stop offset="100%" stop-color="#764ba2"/>
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                    <h1>Sistema de Numeração</h1>
                    <p>Entre com suas credenciais</p>
                </div>
                <form id="loginForm" class="login-form">
                    <div class="form-group">
                        <label for="username">Usuário</label>
                        <input type="text" id="username" required autofocus>
                    </div>
                    <div class="form-group">
                        <label for="password">Senha</label>
                        <input type="password" id="password" required>
                    </div>
                    <button type="submit" class="btn-primary btn-block">Entrar</button>
                    <div class="login-hint">
                        <small>Padrão: admin / admin123</small>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

// Handle login
function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const user = state.users.find(u => u.username === username && u.password === password);

    if (user) {
        state.currentUser = user;
        localStorage.setItem('currentUserId', user.id);
        showMainApp();
    } else {
        showNotification('Usuário ou senha incorretos!', 'error');
    }
}

// Handle logout
function handleLogout() {
    state.currentUser = null;
    localStorage.removeItem('currentUserId');
    showLoginView();
}

// Mostrar aplicativo principal
function showMainApp() {
    document.body.innerHTML = `
        <div class="app-container">
            <header class="app-header">
                <div class="header-content">
                    <div class="logo">
                        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                            <rect width="32" height="32" rx="8" fill="url(#gradient1)"/>
                            <path d="M10 12h12M10 16h12M10 20h8" stroke="white" stroke-width="2" stroke-linecap="round"/>
                            <defs>
                                <linearGradient id="gradient1" x1="0" y1="0" x2="32" y2="32">
                                    <stop offset="0%" stop-color="#667eea"/>
                                    <stop offset="100%" stop-color="#764ba2"/>
                                </linearGradient>
                            </defs>
                        </svg>
                        <h1>Sistema de Numeração</h1>
                    </div>
                    <div class="header-actions">
                        <span class="user-info">👤 ${state.currentUser.name} ${state.currentUser.role === 'admin' ? '(Admin)' : ''}</span>
                        <nav class="header-nav">
                            <button class="nav-btn active" data-view="main">
                                <span>📋</span> Principal
                            </button>
                            ${state.currentUser.role === 'admin' ? `
                            <button class="nav-btn" data-view="admin">
                                <span>⚙️</span> Administração
                            </button>
                            ` : ''}
                        </nav>
                        <button class="btn-secondary" id="logoutBtn">Sair</button>
                    </div>
                </div>
            </header>

            <main id="mainView" class="view active">
                <div class="main-content">
                    <section class="documents-section">
                        <div class="section-header">
                            <h2>Tipos de Documentos</h2>
                            <p>Selecione um documento para reservar o próximo número</p>
                        </div>
                        <div id="documentsList" class="documents-grid"></div>
                    </section>

                    <section class="history-section">
                        <div class="section-header">
                            <h2>Histórico de Reservas</h2>
                            <div class="search-box">
                                <input type="text" id="searchInput" placeholder="Buscar por tipo ou número...">
                                <span class="search-icon">🔍</span>
                            </div>
                        </div>
                        <div id="historyList" class="history-list"></div>
                    </section>
                </div>
            </main>

            ${state.currentUser.role === 'admin' ? `
            <main id="adminView" class="view">
                <div class="admin-content">
                    <section class="stats-section">
                        <h2>Estatísticas do Sistema</h2>
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-icon">📄</div>
                                <div class="stat-content">
                                    <div class="stat-value" id="totalDocTypes">0</div>
                                    <div class="stat-label">Tipos de Documentos</div>
                                </div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-icon">🔢</div>
                                <div class="stat-content">
                                    <div class="stat-value" id="totalReservations">0</div>
                                    <div class="stat-label">Total de Reservas</div>
                                </div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-icon">📅</div>
                                <div class="stat-content">
                                    <div class="stat-value" id="todayReservations">0</div>
                                    <div class="stat-label">Reservas Hoje</div>
                                </div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-icon">👥</div>
                                <div class="stat-content">
                                    <div class="stat-value" id="totalUsers">0</div>
                                    <div class="stat-label">Usuários</div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="manage-section">
                        <div class="section-header">
                            <h2>Gerenciar Documentos</h2>
                            <button class="btn-primary" id="addDocBtn">
                                <span>➕</span> Adicionar Documento
                            </button>
                        </div>
                        <div id="adminDocsList" class="admin-docs-list"></div>
                    </section>

                    <section class="manage-section">
                        <div class="section-header">
                            <h2>Gerenciar Usuários</h2>
                            <button class="btn-primary" id="addUserBtn">
                                <span>➕</span> Adicionar Usuário
                            </button>
                        </div>
                        <div id="adminUsersList" class="admin-docs-list"></div>
                    </section>
                </div>
            </main>
            ` : ''}
        </div>

        <!-- Modal for Add/Edit Document -->
        <div id="docModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="modalTitle">Adicionar Documento</h3>
                    <button class="close-btn" id="closeModal">&times;</button>
                </div>
                <form id="docForm">
                    <div class="form-group">
                        <label for="docName">Nome do Documento</label>
                        <input type="text" id="docName" required placeholder="Ex: Ofício, Memorando...">
                    </div>
                    <div class="form-group">
                        <label for="docPrefix">Prefixo / Abreviação</label>
                        <input type="text" id="docPrefix" placeholder="Ex: Of., Mem., Res...">
                    </div>
                    <div class="form-group">
                        <label for="startNumber">Número Inicial</label>
                        <input type="number" id="startNumber" value="1" min="1" required>
                    </div>
                    <div class="form-group checkbox-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="yearlyReset" checked>
                            <span>Resetar numeração anualmente</span>
                        </label>
                        <p class="help-text">Se marcado, a numeração volta para o número inicial todo início de ano</p>
                    </div>
                    <div class="form-group checkbox-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="docEnabled" checked>
                            <span>Documento habilitado</span>
                        </label>
                        <p class="help-text">Apenas documentos habilitados aparecem para os usuários</p>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" id="cancelBtn">Cancelar</button>
                        <button type="submit" class="btn-primary">Salvar</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Modal for Add/Edit User -->
        <div id="userModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="userModalTitle">Adicionar Usuário</h3>
                    <button class="close-btn" id="closeUserModal">&times;</button>
                </div>
                <form id="userForm">
                    <div class="form-group">
                        <label for="userName">Nome Completo</label>
                        <input type="text" id="userName" required placeholder="Ex: João Silva">
                    </div>
                    <div class="form-group">
                        <label for="userUsername">Usuário (login)</label>
                        <input type="text" id="userUsername" required placeholder="Ex: joao.silva">
                    </div>
                    <div class="form-group">
                        <label for="userPassword">Senha</label>
                        <input type="password" id="userPassword" required placeholder="Mínimo 6 caracteres">
                    </div>
                    <div class="form-group">
                        <label for="userRole">Permissão</label>
                        <select id="userRole" required>
                            <option value="user">Usuário (apenas reservar números)</option>
                            <option value="admin">Administrador (acesso total)</option>
                        </select>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" id="cancelUserBtn">Cancelar</button>
                        <button type="submit" class="btn-primary">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    setupEventListeners();
    renderDocuments();
    renderHistory();
    if (state.currentUser.role === 'admin') {
        renderAdminDocs();
        renderAdminUsers();
        updateStats();
    }
}

// Configurar event listeners
function setupEventListeners() {
    // Navegação
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Busca
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }

    // Botões admin (apenas para admins)
    if (state.currentUser.role === 'admin') {
        const addDocBtn = document.getElementById('addDocBtn');
        if (addDocBtn) {
            addDocBtn.addEventListener('click', openAddModal);
        }

        const addUserBtn = document.getElementById('addUserBtn');
        if (addUserBtn) {
            addUserBtn.addEventListener('click', openAddUserModal);
        }

        // Modal documento
        document.getElementById('closeModal').addEventListener('click', closeDocModal);
        document.getElementById('cancelBtn').addEventListener('click', closeDocModal);
        document.getElementById('docForm').addEventListener('submit', handleFormSubmit);

        // Modal usuário
        document.getElementById('closeUserModal').addEventListener('click', closeUserModalFn);
        document.getElementById('cancelUserBtn').addEventListener('click', closeUserModalFn);
        document.getElementById('userForm').addEventListener('submit', handleUserFormSubmit);

        // Fechar modais ao clicar fora
        document.getElementById('docModal').addEventListener('click', (e) => {
            if (e.target.id === 'docModal') {
                closeDocModal();
            }
        });

        document.getElementById('userModal').addEventListener('click', (e) => {
            if (e.target.id === 'userModal') {
                closeUserModalFn();
            }
        });
    }
}

// Trocar visualização
function switchView(view) {
    state.currentView = view;

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    document.querySelectorAll('.view').forEach(v => {
        v.classList.toggle('active', v.id === view + 'View');
    });

    if (view === 'admin') {
        renderAdminDocs();
        renderAdminUsers();
        updateStats();
    }
}

// Renderizar documentos na view principal (apenas habilitados)
function renderDocuments() {
    const container = document.getElementById('documentsList');
    const enabledDocs = state.documents.filter(doc => doc.enabled);

    if (enabledDocs.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum tipo de documento disponível no momento.</p>';
        return;
    }

    container.innerHTML = enabledDocs.map(doc => `
        <div class="doc-card" onclick="reserveNumber('${doc.id}')">
            <div class="doc-card-header">
                <div class="doc-icon">📄</div>
                ${doc.yearlyReset ? '<div class="doc-badge">Reset Anual</div>' : ''}
            </div>
            <div class="doc-name">${doc.name}</div>
            ${doc.prefix ? `<div class="doc-prefix">Prefixo: ${doc.prefix}</div>` : ''}
            <div class="doc-number">Nº ${formatNumber(doc.currentNumber)}</div>
            <button class="reserve-btn" onclick="event.stopPropagation(); reserveNumber('${doc.id}')">
                Reser var Número
            </button>
        </div>
    `).join('');
}

// Reservar número
function reserveNumber(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc || !doc.enabled) return;

    const reservation = {
        id: generateId(),
        docId: doc.id,
        docName: doc.name,
        prefix: doc.prefix,
        number: doc.currentNumber,
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        date: new Date().toISOString()
    };

    state.reservations.unshift(reservation);
    doc.currentNumber++;

    saveData();
    renderDocuments();
    renderHistory();
    if (state.currentUser.role === 'admin') {
        updateStats();
    }

    showNotification(`Número ${formatReservationNumber(reservation)} reservado com sucesso!`);
}

// Formatar número de reserva
function formatReservationNumber(reservation) {
    const year = new Date(reservation.date).getFullYear();
    if (reservation.prefix) {
        return `${reservation.prefix} ${formatNumber(reservation.number)}/${year}`;
    }
    return `${formatNumber(reservation.number)}`;
}

// Formatar número
function formatNumber(num) {
    return num.toString().padStart(3, '0');
}

// Renderizar histórico
function renderHistory() {
    const container = document.getElementById('historyList');

    if (state.reservations.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhuma reserva realizada ainda.</p>';
        return;
    }

    const filteredReservations = filterReservations();

    container.innerHTML = filteredReservations.map(res => {
        const date = new Date(res.date);
        return `
            <div class="history-item">
                <div class="history-info">
                    <div class="history-type">${res.docName}</div>
                    <div class="history-details">
                        ${formatDate(date)} às ${formatTime(date)} | Por: ${res.userName || 'N/A'}
                    </div>
                </div>
                <div class="history-number">${formatReservationNumber(res)}</div>
            </div>
        `;
    }).join('');
}

// Filtrar reservas (busca)
function filterReservations() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    if (!searchTerm) {
        return state.reservations;
    }

    return state.reservations.filter(res => {
        return res.docName.toLowerCase().includes(searchTerm) ||
            res.number.toString().includes(searchTerm) ||
            (res.prefix && res.prefix.toLowerCase().includes(searchTerm));
    });
}

// Handle search
function handleSearch() {
    renderHistory();
}

// Formatar data
function formatDate(date) {
    return date.toLocaleDateString('pt-BR');
}

// Formatar hora
function formatTime(date) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Renderizar documentos no admin (todos)
function renderAdminDocs() {
    const container = document.getElementById('adminDocsList');

    if (state.documents.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum tipo de documento cadastrado.</p>';
        return;
    }

    container.innerHTML = state.documents.map(doc => `
        <div class="admin-doc-item" style="opacity: ${doc.enabled ? '1' : '0.5'}">
            <div class="admin-doc-info">
                <div class="admin-doc-name">
                    ${doc.name} 
                    ${!doc.enabled ? '<span style="color: var(--text-secondary); font-size: 0.875rem;">(Desabilitado)</span>' : ''}
                </div>
                <div class="admin-doc-details">
                    Prefixo: ${doc.prefix || 'N/A'} | 
                    Número Atual: ${formatNumber(doc.currentNumber)} | 
                    Início: ${formatNumber(doc.startNumber)} |
                    ${doc.yearlyReset ? '🔄 Reset Anual' : '📈 Contínuo'}
                </div>
            </div>
            <div class="admin-doc-actions">
                <button class="icon-btn" onclick="toggleDocumentStatus('${doc.id}')" title="${doc.enabled ? 'Desabilitar' : 'Habilitar'}">
                    ${doc.enabled ? '👁️' : '🚫'}
                </button>
                <button class="icon-btn" onclick="openEditModal('${doc.id}')" title="Editar">
                    ✏️
                </button>
                <button class="icon-btn delete" onclick="deleteDocument('${doc.id}')" title="Excluir">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
}

// Toggle document enabled/disabled status
function toggleDocumentStatus(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return;

    doc.enabled = !doc.enabled;
    saveData();
    renderDocuments();
    renderAdminDocs();
    showNotification(`Documento ${doc.enabled ? 'habilitado' : 'desabilitado'} com sucesso!`);
}

// Renderizar usuários no admin
function renderAdminUsers() {
    const container = document.getElementById('adminUsersList');

    container.innerHTML = state.users.map(user => `
        <div class="admin-doc-item">
            <div class="admin-doc-info">
                <div class="admin-doc-name">${user.name}</div>
                <div class="admin-doc-details">
                    Usuário: ${user.username} | 
                    Permissão: ${user.role === 'admin' ? '🔑 Administrador' : '👤 Usuário'} |
                    Criado em: ${formatDate(new Date(user.createdAt))}
                </div>
            </div>
            <div class="admin-doc-actions">
                ${user.id !== state.currentUser.id ? `
                    <button class="icon-btn" onclick="openEditUserModal('${user.id}')" title="Editar">
                        ✏️
                    </button>
                    <button class="icon-btn delete" onclick="deleteUser('${user.id}')" title="Excluir">
                        🗑️
                    </button>
                ` : '<span style="color: var(--text-secondary); font-size: 0.875rem;">Você</span>'}
            </div>
        </div>
    `).join('');
}

// Atualizar estatísticas
function updateStats() {
    document.getElementById('totalDocTypes').textContent = state.documents.length;
    document.getElementById('totalReservations').textContent = state.reservations.length;
    document.getElementById('totalUsers').textContent = state.users.length;

    const today = new Date().toDateString();
    const todayReservations = state.reservations.filter(res =>
        new Date(res.date).toDateString() === today
    ).length;
    document.getElementById('todayReservations').textContent = todayReservations;
}

// ===== Modal Documento =====

function openAddModal() {
    state.editingDocId = null;
    document.getElementById('modalTitle').textContent = 'Adicionar Documento';
    document.getElementById('docForm').reset();
    document.getElementById('docModal').classList.add('active');
    setTimeout(() => initAutocomplete(), 100);
}

function openEditModal(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return;

    state.editingDocId = docId;
    document.getElementById('modalTitle').textContent = 'Editar Documento';
    document.getElementById('docName').value = doc.name;
    document.getElementById('docPrefix').value = doc.prefix || '';
    document.getElementById('startNumber').value = doc.startNumber;
    document.getElementById('yearlyReset').checked = doc.yearlyReset;
    document.getElementById('docEnabled').checked = doc.enabled !== false;
    document.getElementById('docModal').classList.add('active');
}

function closeDocModal() {
    document.getElementById('docModal').classList.remove('active');
    document.getElementById('docForm').reset();
    state.editingDocId = null;
}

function handleFormSubmit(e) {
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
        if (doc) {
            doc.name = formData.name;
            doc.prefix = formData.prefix;
            doc.startNumber = formData.startNumber;
            doc.yearlyReset = formData.yearlyReset;
            doc.enabled = formData.enabled;

            if (doc.currentNumber < formData.startNumber) {
                doc.currentNumber = formData.startNumber;
            }
        }
        showNotification('Documento atualizado com sucesso!');
    } else {
        const newDoc = {
            id: generateId(),
            ...formData,
            currentNumber: formData.startNumber,
            lastResetYear: new Date().getFullYear()
        };
        state.documents.push(newDoc);
        showNotification('Documento adicionado com sucesso!');
    }

    saveData();
    renderDocuments();
    renderAdminDocs();
    updateStats();
    closeDocModal();
}

function deleteDocument(docId) {
    if (!confirm('Tem certeza que deseja excluir este tipo de documento? Isso não afetará o histórico de reservas já realizadas.')) {
        return;
    }

    state.documents = state.documents.filter(d => d.id !== docId);
    saveData();
    renderDocuments();
    renderAdminDocs();
    updateStats();
    showNotification('Documento excluído com sucesso!');
}

// ===== Modal Usuário =====

function openAddUserModal() {
    state.editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Adicionar Usuário';
    document.getElementById('userForm').reset();
    document.getElementById('userModal').classList.add('active');
}

function openEditUserModal(userId) {
    const user = state.users.find(u => u.id === userId);
    if (!user) return;

    state.editingUserId = userId;
    document.getElementById('userModalTitle').textContent = 'Editar Usuário';
    document.getElementById('userName').value = user.name;
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userPassword').value = user.password;
    document.getElementById('userRole').value = user.role;
    document.getElementById('userModal').classList.add('active');
}

function closeUserModalFn() {
    document.getElementById('userModal').classList.remove('active');
    document.getElementById('userForm').reset();
    state.editingUserId = null;
}

function handleUserFormSubmit(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('userName').value,
        username: document.getElementById('userUsername').value,
        password: document.getElementById('userPassword').value,
        role: document.getElementById('userRole').value
    };

    // Verificar se o username já existe (exceto para o próprio usuário sendo editado)
    const existingUser = state.users.find(u =>
        u.username === formData.username && u.id !== state.editingUserId
    );

    if (existingUser) {
        showNotification('Este nome de usuário já está em uso!', 'error');
        return;
    }

    if (state.editingUserId) {
        const user = state.users.find(u => u.id === state.editingUserId);
        if (user) {
            user.name = formData.name;
            user.username = formData.username;
            user.password = formData.password;
            user.role = formData.role;
        }
        showNotification('Usuário atualizado com sucesso!');
    } else {
        const newUser = {
            id: generateId(),
            ...formData,
            createdAt: new Date().toISOString()
        };
        state.users.push(newUser);
        showNotification('Usuário adicionado com sucesso!');
    }

    saveUsers();
    renderAdminUsers();
    updateStats();
    closeUserModalFn();
}

function deleteUser(userId) {
    if (userId === state.currentUser.id) {
        showNotification('Você não pode excluir seu próprio usuário!', 'error');
        return;
    }

    if (!confirm('Tem certeza que deseja excluir este usuário?')) {
        return;
    }

    state.users = state.users.filter(u => u.id !== userId);
    saveUsers();
    renderAdminUsers();
    updateStats();
    showNotification('Usuário excluído com sucesso!');
}

// Notificação
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    const gradients = {
        success: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        error: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
    };

    notification.style.cssText = `
        position: fixed;
        top: 2rem;
        right: 2rem;
        background: ${gradients[type]};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        font-weight: 600;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Adicionar animações no CSS inline
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);
