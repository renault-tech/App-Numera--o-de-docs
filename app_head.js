// Sistema de Numeração de Documentos - Versão Simplificada e Completa
// Com: Campos expandidos, 4 níveis de permissão, seleção de documentos, logs

// Configuração do Supabase
const SUPABASE_URL = 'https://rizzhpsfwghhohozvggf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpenpocHNmd2doaG9ob3p2Z2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1Mjg5MzEsImV4cCI6MjA4NTEwNDkzMX0.bp8HpkYJxqiSW5krTk8uqOEYjdV2fg8PukOlNBXPSak';
var supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let state = {
    documents: [],
    reservations: [],
    users: [],
    logs: [],
    // secretariaPermissions agora será derivada dos atributos dos usuários ou tabela dedicada se necessário.
    // Para simplificar a migração com o schema atual, vamos assumir que 'allowed_documents' no usuário resolve,
    // ou manteremos secretariaPermissions apenas em memória se não persistirmos.
    // O schema.sql não tem tabela 'secretaria_permissions', então vamos focar no 'allowed_documents' do usuário.
    secretariaPermissions: {},
    currentUser: null,
    currentView: 'login',
    editingDocId: null,
    editingUserId: null,
    currentLogFilter: 'todos',
    loading: false
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

// Carregar dados do Supabase
async function loadData() {
    if (!supabase) {
        console.error('Supabase client not initialized');
        return;
    }

    try {
        state.loading = true;

        // 1. Carregar Documentos
        const { data: docs, error: errDocs } = await supabase
            .from('documents')
            .select('*')
            .order('name');

        if (errDocs) throw errDocs;

        // Mapeamento para formato do state (convert snake_case to camelCase)
        state.documents = docs.map(d => ({
            id: d.id,
            name: d.name,
            prefix: d.prefix,
            startNumber: d.start_number,
            currentNumber: d.current_number,
            yearlyReset: d.yearly_reset,
            lastResetYear: d.last_reset_year,
            enabled: d.enabled
        }));

        // Se não houver documentos, semear padrões
        if (state.documents.length === 0) {
            const defaultDocs = [
                { name: 'Ofício', prefix: 'Of.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Memorando', prefix: 'Mem.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Resolução', prefix: 'Res.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Contrato', prefix: 'Contr.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Decreto', prefix: 'Dec.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Portaria', prefix: 'Port.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Ata', prefix: '', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Edital', prefix: 'Ed.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Parecer', prefix: 'Par.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Circular', prefix: 'Circ.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Processo', prefix: 'Proc.', start_number: 1, current_number: 1, yearly_reset: false, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Protocolo', prefix: 'Prot.', start_number: 1000, current_number: 1000, yearly_reset: false, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Lei', prefix: 'L.', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Lei Complementar', prefix: 'LC', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Medida Provisória', prefix: 'MP', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Instrução Normativa', prefix: 'IN', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Exposição de Motivos', prefix: 'EM', start_number: 1, current_number: 1, yearly_reset: true, last_reset_year: new Date().getFullYear(), enabled: true },
                { name: 'Folha', prefix: 'fl.', start_number: 1, current_number: 1, yearly_reset: false, last_reset_year: new Date().getFullYear(), enabled: true }
            ];

            const { data: newDocs, error: seedError } = await supabase
                .from('documents')
                .insert(defaultDocs)
                .select();

            if (!seedError && newDocs) {
                state.documents = newDocs.map(d => ({
                    id: d.id,
                    name: d.name,
                    prefix: d.prefix,
                    startNumber: d.start_number,
                    currentNumber: d.current_number,
                    yearlyReset: d.yearly_reset,
                    lastResetYear: d.last_reset_year,
                    enabled: d.enabled
                }));
                addLog('sistema', 'Inicialização', 'Documentos padrão criados');
            }
        }

        // Reset anual (lógica mantida, mas precisa salvar no banco se mudar)
        await checkYearlyReset();

        // 1.1 Carregar Configurações (Secretarias)
        const { data: configs, error: errConfig } = await supabase
            .from('app_config')
            .select('*');

        if (!errConfig && configs) {
            const secConfig = configs.find(c => c.key === 'secretariaPermissions');
            if (secConfig) {
                state.secretariaPermissions = secConfig.value;
            }
        }

        // 2. Carregar Usuários
        const { data: users, error: errUsers } = await supabase
            .from('users')
            .select('*');

        if (errUsers) throw errUsers;

        state.users = users.map(u => ({
            id: u.id,
            username: u.username,
            password: u.password,
            name: u.name,
            cargo: u.cargo,
            setor: u.setor,
            secretaria: u.secretaria,
            role: u.role,
            allowedDocuments: u.allowed_documents || [],
            createdAt: u.created_at
        }));

        // Se não houver usuários, criar admin padrão (apenas na primeira vez/migração)
        if (state.users.length === 0) {
            // Criar usuário admin localmente para permitir login inicial e salvar
            // Idealmente, você inseriria isso direto no banco ou teria um seed.
            const adminUser = {
                username: 'admin',
                password: 'admin123',
                name: 'Administrador',
                cargo: 'Administrador do Sistema',
                setor: 'TI',
                secretaria: 'Administrativa',
                role: 'admin',
                allowed_documents: []
            };

            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert([adminUser])
                .select()
                .single();

            if (!createError && newUser) {
                state.users.push({
                    ...newUser,
                    allowedDocuments: newUser.allowed_documents
                });
                addLog('usuario', 'Criou usuário inicial', 'Sistema criou admin padrão');
            }
        }

        // 3. Carregar Reservas
        const { data: reservations, error: errRes } = await supabase
            .from('reservations')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(1000); // Limite inicial para performance

        if (errRes) throw errRes;

        state.reservations = reservations.map(r => ({
            id: r.id,
            docId: r.doc_id,
            docName: r.doc_name,
            number: r.number,
            formattedNumber: r.formatted_number,
            subject: r.subject,
            ementa: r.ementa,
            userId: r.user_id,
            userName: r.user_name,
            userCargo: r.user_cargo,
            userSetor: r.user_setor,
            userSecretaria: r.user_secretaria,
            timestamp: r.timestamp
        }));

        // 4. Carregar Logs
        const { data: logs, error: errLogs } = await supabase
            .from('logs')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(500);

        if (errLogs) throw errLogs;

        state.logs = logs.map(l => ({
            id: l.id,
            type: l.type,
            action: l.action,
            details: l.details,
            userId: l.user_id,
            userName: l.user_name,
            timestamp: l.timestamp
        }));

        // Renderizar se a view estiver ativa
        if (typeof syncAllViews === 'function') syncAllViews();

    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        alert('Erro ao carregar dados do sistema. Verifique o console.');
    } finally {
        state.loading = false;
    }
}

// Funções de salvamento agora são específicas ou deprecadas em favor de chamadas diretas
// Mantendo as assinaturas para não quebrar chamadas existentes, mas elas não farão nada globalmente.
// As alterações de estado devem chamar o Supabase diretamente.

function saveData() {
    console.log('saveData: Operação global desativada. Use funções específicas do Supabase.');
    if (typeof syncAllViews === 'function') syncAllViews();
}

function saveUsers() {
    console.log('saveUsers: Operação global desativada.');
    if (typeof syncAllViews === 'function') syncAllViews();
}

function saveLogs() {
    console.log('saveLogs: Operação global desativada.');
}

function saveSecretariaPermissions() {
    console.log('saveSecretariaPermissions: Implementação pendente no Supabase.');
    // localStorage.setItem('secretariaPermissions', JSON.stringify(state.secretariaPermissions)); 
}

// Adicionar log (Async)
async function addLog(type, action, details) {
    // Atualizar estado local (otimista)
    const logItem = {
        type: type,
        action: action,
        details: details,
        user_id: state.currentUser?.id,
        user_name: state.currentUser?.name || 'Sistema',
        timestamp: new Date().toISOString()
    };

    // state.logs.unshift(logItem); // Atualizar via fetch é mais seguro para garantir IDs

    try {
        const { error } = await supabase
            .from('logs')
            .insert([logItem]);

        if (error) console.error('Erro ao salvar Log:', error);

        // Recarregar logs discretamente
        // Ou adicionar ao state local manualmente se tiver ID
    } catch (e) {
        console.error('Exceção ao salvar log:', e);
    }
}

// Reset anual
async function checkYearlyReset() {
    const currentYear = new Date().getFullYear();
    let hasChanges = false;

    // Iterar e atualizar documentos necessários
    for (const doc of state.documents) {
        if (doc.yearlyReset && doc.lastResetYear !== currentYear) {
            // Atualizar no banco
            try {
                const { error } = await supabase
                    .from('documents')
                    .update({
                        current_number: doc.startNumber,
                        last_reset_year: currentYear
                    })
                    .eq('id', doc.id);

                if (!error) {
                    doc.currentNumber = doc.startNumber;
                    doc.lastResetYear = currentYear;
                    hasChanges = true;
                }
            } catch (e) {
                console.error('Erro no reset anual:', e);
            }
        }
    }

    if (hasChanges) console.log('Reset anual aplicado');
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
        showAlertModal('❌ Erro de Login', 'Usuário ou senha incorretos!');
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
                    <img src="./logo-prefeitura.png" alt="Logo Prefeitura" class="login-logo-img" style="max-width: 150px; margin-bottom: 1rem;">
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
    applyGlobalZoom(); // ========== HEADER MODERNO ==========
function renderAppHeader() {
    const header = document.querySelector('.app-header');
    if (!header) return;

    // Limpar conteúdo atual
    header.innerHTML = '';

    // Dados do usuário (ou placeholder)
    const user = state.currentUser || { name: 'Visitante', role: 'Acesso Restrito' };
    const userInitials = user.name ? user.name.substring(0, 2).toUpperCase() : 'VS';

    // Criar estrutura flexbox
    const container = document.createElement('div');
    container.className = 'header-content';

    // 1. Marca (Esquerda)
    const brand = document.createElement('a');
    brand.href = '#';
    brand.className = 'header-brand';
    brand.onclick = (e) => { e.preventDefault(); showMainApp(); };
    
    brand.innerHTML = `
        <img src="logo_prefeitura_cataguases.png" alt="Logo" class="header-logo-img">
        <div class="header-title-wrapper">
            <span class="header-title-main">Sistema de Numeração</span>
            <span class="header-title-sub">Prefeitura de Cataguases</span>
        </div>
    `;

    // 2. Toolbar (Direita) - Perfil + Ações
    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'header-actions-wrapper';

    if (state.currentUser) {
        // Widget do Usuário
        const userWidget = document.createElement('div');
        userWidget.className = 'user-profile-widget';
        userWidget.title = `Logado como: ${user.name}`;
        userWidget.innerHTML = `
            <div class="user-avatar">${userInitials}</div>
            <div class="user-info-text">
                <span class="user-name">${user.name.split(' ')[0]}</span>
                <span class="user-role">${PERMISSION_LEVELS[user.role]?.label || user.role}</span>
            </div>
        `;

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'header-toolbar';

        // Zoom Controls Integrados
        const zoomControls = document.createElement('div');
        zoomControls.className = 'header-zoom-controls';
        zoomControls.innerHTML = `
            <button class="header-zoom-btn" onclick="decreaseGlobalZoom()" title="Diminuir Zoom">A-</button>
            <span id="globalZoomIndicator" class="header-zoom-value">${globalZoomLevel}%</span>
            <button class="header-zoom-btn" onclick="increaseGlobalZoom()" title="Aumentar Zoom">A+</button>
        `;

        // Logout Button Integrado
        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'btn-logout-header';
        logoutBtn.onclick = handleLogout;
        logoutBtn.innerHTML = `<span>Sair</span>`;

        // Montar Toolbar
        toolbar.appendChild(zoomControls);
        toolbar.appendChild(logoutBtn);

        // Adicionar à wrapper
        actionsWrapper.appendChild(userWidget);
        actionsWrapper.appendChild(toolbar);
    }

    // Montar Header
    container.appendChild(brand);
    container.appendChild(actionsWrapper);
    header.appendChild(container);
}

// Aplicar zoom ao carregar e renderizar header
document.addEventListener('DOMContentLoaded', () => {
    applyGlobalZoom();
    renderAppHeader();
});

// ========== ESTATÍSTICAS POR DOCUMENTO ==========
function toggleDocStats() {
    const panel = document.getElementById('docStatsPanel');
    const btn = event.target.closest('.export-stats');

    if (panel.style.display === 'none') {
        // Mostrar painel
        panel.style.display = 'block';
        if (btn) btn.classList.add('active');

        // Renderizar estatísticas
        const container = document.getElementById('docStatsList');
        const docs = state.documents.filter(d => d.enabled);

        const stats = docs.map(doc => {
            const docReservations = state.reservations.filter(r => r.docId === doc.id);
            const lastReservation = docReservations.length > 0
                ? new Date(Math.max(...docReservations.map(r => new Date(r.timestamp))))
                : null;

            return {
                doc,
                count: docReservations.length,
                lastDate: lastReservation
            };
        }).filter(s => s.count > 0)
            .sort((a, b) => b.count - a.count);

        if (stats.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum documento possui reservas</p>';
            return;
        }

        container.innerHTML = stats.map(({ doc, count, lastDate }) => `
            <div class="doc-stat-card">
                <div class="doc-stat-header">
                    <span class="doc-stat-icon">📄</span>
                    <span class="doc-stat-name">${doc.name}</span>
                </div>
                <div class="doc-stat-body">
                    <div class="doc-stat-item">
                        <span class="doc-stat-label">Reservas</span>
                        <span class="doc-stat-value">${count}</span>
                    </div>
                    <div class="doc-stat-item">
                        <span class="doc-stat-label">Última Reserva</span>
                        <span class="doc-stat-value">${formatDate(lastDate)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        // Esconder painel
        panel.style.display = 'none';
        if (btn) btn.classList.remove('active');
    }
}

// Cache buster: 20260112200732

}
