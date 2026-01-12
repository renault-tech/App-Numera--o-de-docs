// Cole isso no Console (F12) para adicionar os cards de navegação no painel admin

// 1. Encontrar a seção de estatísticas
const statsSection = document.querySelector('.stats-section');
if (statsSection) {
    // 2. Criar nova seção de acesso rápido
    const quickAccessHTML = `
        <section class="manage-section">
            <h2>Acesso Rápido</h2>
            <div class="stats-grid">
                <div class="stat-card" onclick="document.querySelector('#documentsSection').scrollIntoView({behavior:'smooth'})" style="cursor: pointer;">
                    <div class="stat-icon">📄</div>
                    <div>
                        <div class="stat-label" style="font-size: 1rem; font-weight: 600;">Gerenciar Documentos</div>
                        <div class="help-text">Adicionar, editar e configurar tipos</div>
                    </div>
                </div>
                <div class="stat-card" onclick="document.querySelector('#usersSection').scrollIntoView({behavior:'smooth'})" style="cursor: pointer;">
                    <div class="stat-icon">👥</div>
                    <div>
                        <div class="stat-label" style="font-size: 1rem; font-weight: 600;">Gerenciar Usuários</div>
                        <div class="help-text">Cadastrar e configurar permissões</div>
                    </div>
                </div>
                <div class="stat-card" onclick="document.querySelector('#logsSection').scrollIntoView({behavior:'smooth'})" style="cursor: pointer;">
                    <div class="stat-icon">📊</div>
                    <div>
                        <div class="stat-label" style="font-size: 1rem; font-weight: 600;">Logs do Sistema</div>
                        <div class="help-text">Visualizar histórico de ações</div>
                    </div>
                </div>
                <div class="stat-card" onclick="switchView('main')" style="cursor: pointer;">
                    <div class="stat-icon">🔢</div>
                    <div>
                        <div class="stat-label" style="font-size: 1rem; font-weight: 600;">Ver Histórico</div>
                        <div class="help-text">Reservas de números</div>
                    </div>
                </div>
            </div>
        </section>
    `;

    // 3. Inserir após estatísticas
    statsSection.insertAdjacentHTML('afterend', quickAccessHTML);

    // 4. Adicionar IDs às seções
    const sections = document.querySelectorAll('.manage-section');
    sections[1].id = 'documentsSection';  // Gerenciar Documentos
    sections[2].id = 'usersSection';      // Gerenciar Usuários
    sections[3].id = 'logsSection';       // Logs

    console.log('✅ Cards de navegação adicionados!');
    console.log('Agora você pode clicar nos cards para navegar entre as seções');
}
