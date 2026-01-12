// Adicionar SVG Icons e sistema de views ao app

// SVG Icons
const SVG_ICONS = {
    documents: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="12" y1="18" x2="12" y2="12"></line>
        <line x1="9" y1="15" x2="15" y2="15"></line>
    </svg>`,
    users: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>`,
    logs: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
    </svg>`,
    history: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
    </svg>`,
    stats: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="20" x2="18" y2="10"></line>
        <line x1="12" y1="20" x2="12" y2="4"></line>
        <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>`
};

// Estado da view admin
if (!window.adminViewState) {
    window.adminViewState = 'stats'; // stats, documents, users, logs, history
}

// Função para mudar view do admin
window.switchAdminView = function (view) {
    window.adminViewState = view;

    // Esconder todas as views
    document.querySelectorAll('.admin-sub-view').forEach(v => v.style.display = 'none');

    // Mostrar view selecionada
    const viewMap = {
        'stats': 'statsView',
        'documents': 'documentsView',
        'users': 'usersView',
        'logs': 'logsView',
        'history': 'historyView'
    };

    const targetView = document.getElementById(viewMap[view]);
    if (targetView) {
        targetView.style.display = 'block';
    }

    // Atualizar cards ativos
    document.querySelectorAll('.admin-nav-card').forEach(card => {
        card.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

    // Atualizar dados se necessário
    if (view === 'stats') updateStats();
    if (view === 'documents') renderAdminDocs();
    if (view === 'users') renderAdminUsers();
    if (view === 'logs') renderLogs();
};

console.log('✅ Sistema de views carregado!');
console.log('Use: switchAdminView("documents"), switchAdminView("users"), etc.');
