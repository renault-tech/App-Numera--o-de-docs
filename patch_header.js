
const fs = require('fs');
const path = require('path');

const filePath = path.join('G:', 'Meu Drive', 'Projetos IA', 'Apps', 'App Numeração de docs', 'app.js');

const newHeaderLogic = `// ========== HEADER MODERNO ==========
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
    
    brand.innerHTML = \`
        <img src="logo_prefeitura_cataguases.png" alt="Logo" class="header-logo-img">
        <div class="header-title-wrapper">
            <span class="header-title-main">Sistema de Numeração</span>
            <span class="header-title-sub">Prefeitura de Cataguases</span>
        </div>
    \`;

    // 2. Toolbar (Direita) - Perfil + Ações
    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'header-actions-wrapper';

    if (state.currentUser) {
        // Widget do Usuário
        const userWidget = document.createElement('div');
        userWidget.className = 'user-profile-widget';
        userWidget.title = \`Logado como: \${user.name}\`;
        userWidget.innerHTML = \`
            <div class="user-avatar">\${userInitials}</div>
            <div class="user-info-text">
                <span class="user-name">\${user.name.split(' ')[0]}</span>
                <span class="user-role">\${PERMISSION_LEVELS[user.role]?.label || user.role}</span>
            </div>
        \`;

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'header-toolbar';

        // Zoom Controls Integrados
        const zoomControls = document.createElement('div');
        zoomControls.className = 'header-zoom-controls';
        zoomControls.innerHTML = \`
            <button class="header-zoom-btn" onclick="decreaseGlobalZoom()" title="Diminuir Zoom">A-</button>
            <span id="globalZoomIndicator" class="header-zoom-value">\${globalZoomLevel}%</span>
            <button class="header-zoom-btn" onclick="increaseGlobalZoom()" title="Aumentar Zoom">A+</button>
        \`;

        // Logout Button Integrado
        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'btn-logout-header';
        logoutBtn.onclick = handleLogout;
        logoutBtn.innerHTML = \`<span>Sair</span>\`;

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
});`;

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Identificar o bloco antigo para substituir
    // Vamos procurar pelo comentário inicial do bloco antigo e o final do listener
    const startMarker = "// Aplicar zoom ao carregar";
    // O final é mais difícil pois é um fechamento de função, vamos pegar um trecho único dentro dele
    const endMarkerSearch = "attempts > 50) clearInterval(interval); // Parar após 5 segundos";

    const startIdx = content.indexOf(startMarker);
    const endIdxSearch = content.indexOf(endMarkerSearch);

    if (startIdx !== -1 && endIdxSearch !== -1) {
        // Encontrar o fechamento }); após o endMarkerSearch
        const closingBraceIdx = content.indexOf("});", endIdxSearch);

        if (closingBraceIdx !== -1) {
            const endIdx = closingBraceIdx + 3; // Incluir });

            console.log(`Found block from ${startIdx} to ${endIdx}`);

            const newContent = content.substring(0, startIdx) + newHeaderLogic + content.substring(endIdx);
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log("Successfully patched app.js with renderAppHeader");
        } else {
            console.log("Could not find closing brace");
        }
    } else {
        console.log("Could not find the block to replace");
        console.log(`Start found: ${startIdx !== -1}`);
        console.log(`End found: ${endIdxSearch !== -1}`);
    }

} catch (err) {
    console.error("Error patching file:", err);
}
