// ==== COPIE E COLE ESTE CÓDIGO NO CONSOLE (F12) DO NAVEGADOR ====
// Isso ativa TODAS as funcionalidades avançadas instantaneamente

// 1. Adicionar logs e campos ao state
if (!state.logs) state.logs = [];
if (!state.currentLogFilter) state.currentLogFilter = 'todos';

// 2. Atualizar usuário admin com novos campos
const admin = state.users.find(u => u.username === 'admin');
if (admin && !admin.cargo) {
    admin.cargo = 'Administrador do Sistema';
    admin.setor = 'TI';
    admin.secretaria = 'Administrativa';
    admin.allowedDocuments = [];
    saveUsers();
}

// 3. Função de logs
window.addLog = function (type, action, details) {
    const log = {
        id: Date.now() + Math.random(),
        type: type,
        action: action,
        details: details,
        userId: state.currentUser ? state.currentUser.id : null,
        userName: state.currentUser ? state.currentUser.name : 'Sistema',
        timestamp: new Date().toISOString()
    };
    state.logs.unshift(log);
    if (state.logs.length > 1000) state.logs = state.logs.slice(0, 1000);
    localStorage.setItem('logs', JSON.stringify(state.logs));
};

// 4. Níveis de permissão
window.PERMISSION_LEVELS = [
    { value: 'admin', label: 'Administrador', description: 'Acesso total' },
    { value: 'user_full', label: 'Usuário Completo', description: 'Todos documentos' },
    { value: 'user_restricted', label: 'Usuário Restrito', description: 'Documentos específicos' },
    { value: 'user_readonly', label: 'Somente Leitura', description: 'Visualizar apenas' }
];

// 5. Filtrar documentos por permissão
window.filterDocsByPermission = function () {
    let docs = state.documents.filter(d => d.enabled);
    const user = state.currentUser;

    if (user.role === 'admin' || user.role === 'user_full') return docs;

    if (user.role === 'user_restricted' || user.role === 'user_readonly') {
        if (!user.allowedDocuments || user.allowedDocuments.length === 0) return [];
        return docs.filter(d => user.allowedDocuments.includes(d.id));
    }
    return docs;
};

// 6. Verificar se pode reservar
window.canReserve = function (docId) {
    const user = state.currentUser;
    if (user.role === 'user_readonly') return false;
    if (user.role === 'admin' || user.role === 'user_full') return true;
    if (user.role === 'user_restricted') {
        return user.allowedDocuments && user.allowedDocuments.includes(docId);
    }
    return false;
};

console.log('✅ Funcionalidades avançadas ativadas!');
console.log('🔄 Agora execute: location.reload()');
