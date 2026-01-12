// Sistema de Numeração de Documentos - Versão Final Completa
// Encoding UTF-8 - Todos os acentos corretos

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

const PERMISSION_LEVELS = {
    admin: { label: 'Administrador', desc: 'Acesso total' },
    user_full: { label: 'Usuário Completo', desc: 'Todos documentos' },
    user_restricted: { label: 'Usuário Restrito', desc: 'Documentos específicos' },
    user_readonly: { label: 'Somente Leitura', desc: 'Visualizar apenas' }
};

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    checkAutoLogin();
});

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
            { id: generateId(), name: 'Ata', prefix: '', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Circular', prefix: 'Circ.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Contrato', prefix: 'Contr.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Decreto', prefix: 'Dec.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Edital', prefix: 'Ed.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Exposição de Motivos', prefix: 'EM', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Folha', prefix: 'fl.', startNumber: 1, currentNumber: 1, yearlyReset: false, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Instrução Normativa', prefix: 'IN', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Lei', prefix: 'L.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Lei Complementar', prefix: 'LC', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Medida Provisória', prefix: 'MP', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Memorando', prefix: 'Mem.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Ofício', prefix: 'Of.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Parecer', prefix: 'Par.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Portaria', prefix: 'Port.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Processo', prefix: 'Proc.', startNumber: 1, currentNumber: 1, yearlyReset: false, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Protocolo', prefix: 'Prot.', startNumber: 1000, currentNumber: 1000, yearlyReset: false, lastResetYear: new Date().getFullYear(), enabled: true },
            { id: generateId(), name: 'Resolução', prefix: 'Res.', startNumber: 1, currentNumber: 1, yearlyReset: true, lastResetYear: new Date().getFullYear(), enabled: true }
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

function handleLogout() {
    addLog('sistema', 'Logout realizado', `${state.currentUser.name} saiu do sistema`);
    localStorage.removeItem('currentUserId');
    state.currentUser = null;
    showLoginView();
}

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
                <div class="admin-content"></div>
            </main>
            ` : ''}

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
        renderAdminInterface();
        updateStats();
    }
}

function setupEventListeners() {
    if (typeof initAutocomplete === 'function') {
        const docNameInput = document.getElementById('docName');
        if (docNameInput) setTimeout(() => initAutocomplete(), 100);
    }
}

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

function canReserve(docId) {
    const user = state.currentUser;
    if (user.role === 'user_readonly') return false;
    if (user.role === 'admin' || user.role === 'user_full') return true;
    return user.allowedDocuments && user.allowedDocuments.includes(docId);
}

function renderDocuments() {
    const container = document.getElementById('documentsList');
    let docs = getVisibleDocuments();

    // ORDEM ALFABÉTICA
    docs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    if (docs.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum documento disponível.</p>';
        return;
    }

    container.innerHTML = docs.map(doc => `
        <div class="doc-card">
            <div class="doc-card-header">
                <div class="doc-icon">📄</div>
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

function formatNumber(doc) {
    const year = new Date().getFullYear();
    const number = String(doc.currentNumber).padStart(3, '0');
    return doc.prefix ? `${doc.prefix} ${number}/${year}` : `${number}/${year}`;
}

function reserveNumber(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc || !canReserve(docId)) return;

    const numeroFormatado = formatNumber(doc);

    // CONFIRMAÇÃO
    if (!confirm(`Confirma a reserva do número:\n\n${numeroFormatado}\n\nDocumento: ${doc.name}`)) {
        return;
    }

    const reservation = {
        id: generateId(),
        docId: doc.id,
        docName: doc.name,
        number: doc.currentNumber,
        formattedNumber: numeroFormatado,
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

    alert(`Número reservado com sucesso!\n\n${reservation.formattedNumber}`);
}

function renderHistory() {
    const container = document.getElementById('historyList');
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';

    let filtered = state.reservations;

    // Usuário não-admin vê apenas suas reservas
    if (state.currentUser.role !== 'admin') {
        filtered = filtered.filter(r => r.userId === state.currentUser.id);
    }

    filtered = filtered.filter(r =>
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

// CONTINUA NO PRÓXIMO ARQUIVO...
