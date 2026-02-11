
import os

file_path = r'G:\Meu Drive\Projetos IA\Apps\App Numeração de docs\app.js'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Define the block start and end to identify the region
start_marker = "    // Mover controles de zoom para dentro do header (UX/UI Best Practice)"
end_marker = "    }, 500); // Pequeno delay para garantir que elementos foram renderizados"

new_code = """    // Mover controles de zoom para dentro do header (UX/UI Best Practice)
    // Usar polling para garantir que elementos dinâmicos sejam encontrados
    let attempts = 0;
    const interval = setInterval(() => {
        const zoomControls = document.querySelector('.floating-zoom-controls');
        const headerActions = document.querySelector('.header-actions');
        
        if (zoomControls && headerActions) {
            clearInterval(interval);
            
            // Remover estilos de posicionamento fixo e aplicar estilos inline para o header
            zoomControls.style.position = 'static';
            zoomControls.style.top = 'auto';
            zoomControls.style.right = 'auto';
            zoomControls.style.boxShadow = 'none';
            zoomControls.style.border = 'none';
            zoomControls.style.background = 'transparent';
            zoomControls.style.padding = '0';
            zoomControls.style.marginRight = '1.5rem'; 
            zoomControls.classList.remove('floating-zoom-controls');
            zoomControls.classList.add('header-zoom-controls');

            // Inserir antes dos outros botões
            headerActions.insertBefore(zoomControls, headerActions.firstChild);
            console.log('Zoom controls integrated into header successfully');
        }

        attempts++;
        if (attempts > 50) clearInterval(interval); // Parar após 5 segundos
    }, 100);"""

# Construct the replacement logic
# We need to find the start_marker loop until end_marker
start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    end_idx += len(end_marker)
    # Replace the chunk
    new_content = content[:start_idx] + new_code + content[end_idx:]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully patched app.js")
else:
    print("Could not find the block to replace")
    print(f"Start found: {start_idx != -1}")
    print(f"End found: {end_idx != -1}")
