# ✅ CHECKLIST DE TESTES - SpaceFood PWA

---

## 📱 TESTE 1: Instalação no iPhone

### Pré-requisitos:
- [ ] iPhone com iOS 11.3+ (recomendado 16+)
- [ ] Safari atualizado
- [ ] Conexão com internet

### Passos:
1. [ ] Limpar histórico do Safari (Configurações → Safari → Limpar Histórico)
2. [ ] Abrir URL no Safari
3. [ ] App carrega completamente
4. [ ] Tocar no botão Compartilhar (caixinha com seta)
5. [ ] Selecionar "Adicionar à Tela de Início"
6. [ ] Ver preview do ícone laranja
7. [ ] Confirmar instalação
8. [ ] Voltar para tela inicial
9. [ ] Verificar ícone laranja com prato/garfo/faca
10. [ ] Tocar no ícone instalado
11. [ ] App abre em modo standalone (sem barra Safari)

### Resultado Esperado:
- [ ] ✅ Ícone correto aparece
- [ ] ✅ App abre em fullscreen
- [ ] ✅ Nome "SpaceFood" aparece

### Se falhar:
- [ ] Remover app da tela inicial
- [ ] Force-quit Safari
- [ ] Aguardar 2 minutos
- [ ] Tentar novamente

---

## 🤖 TESTE 2: Instalação no Android

### Pré-requisitos:
- [ ] Android 5.0+ (Lollipop)
- [ ] Chrome atualizado
- [ ] Conexão com internet

### Passos:
1. [ ] Abrir URL no Chrome
2. [ ] App carrega completamente
3. [ ] Banner "Instalar app" aparece (pode demorar alguns segundos)
4. [ ] Tocar no banner
5. [ ] OU: Menu (⋮) → "Instalar app"
6. [ ] Confirmar instalação
7. [ ] Ícone aparece na tela inicial / drawer
8. [ ] Tocar no ícone instalado
9. [ ] App abre em modo standalone

### Resultado Esperado:
- [ ] ✅ Banner de instalação aparece
- [ ] ✅ Ícone correto instalado
- [ ] ✅ App abre como nativo

---

## 🔔 TESTE 3: Push Notifications (iPhone)

### Pré-requisitos:
- [ ] App instalado na tela inicial
- [ ] Conexão com internet
- [ ] iOS 16.4+ (para melhor compatibilidade)

### Passos:
1. [ ] Abrir app instalado
2. [ ] Fazer login/cadastro
3. [ ] Ir em Settings (⚙️)
4. [ ] Encontrar seção "Notificações Push"
5. [ ] Tocar em "Ativar"
6. [ ] Sistema iOS solicita permissão
7. [ ] Conceder permissão
8. [ ] Ver mensagem "Notificações ativas"
9. [ ] Voltar para Menu
10. [ ] Fazer um pedido
11. [ ] Como admin (outro dispositivo), mudar status para "Em Preparo"
12. [ ] Verificar se notificação aparece no iPhone

### Resultado Esperado:
- [ ] ✅ Permissão solicitada
- [ ] ✅ Permissão concedida
- [ ] ✅ Status muda para "Notificações ativas"
- [ ] ⚠️ Notificação pode ter limitações no iOS

### Nota:
Push no iOS tem limitações. Se não funcionar, não é necessariamente um bug.

---

## 🔔 TESTE 4: Push Notifications (Android)

### Pré-requisitos:
- [ ] App instalado
- [ ] Conexão com internet
- [ ] Chrome atualizado

### Passos:
1. [ ] Abrir app
2. [ ] Fazer login/cadastro
3. [ ] Ir em Settings
4. [ ] Encontrar seção "Notificações Push"
5. [ ] Tocar em "Ativar"
6. [ ] Chrome solicita permissão
7. [ ] Conceder permissão
8. [ ] Ver mensagem "Notificações ativas"
9. [ ] Fazer um pedido
10. [ ] Como admin, mudar status para "Em Preparo"
11. [ ] Verificar notificação na barra de notificações
12. [ ] Tocar na notificação
13. [ ] App deve abrir

### Resultado Esperado:
- [ ] ✅ Permissão solicitada
- [ ] ✅ Permissão concedida
- [ ] ✅ Notificação aparece
- [ ] ✅ Clicar abre o app

---

## 📴 TESTE 5: Modo Offline

### Pré-requisitos:
- [ ] App instalado
- [ ] Já foi aberto pelo menos uma vez online

### Passos:
1. [ ] Abrir app (online)
2. [ ] Navegar por algumas páginas (Menu, Settings)
3. [ ] Ativar modo avião / desativar WiFi
4. [ ] Fechar e reabrir app
5. [ ] Tentar navegar entre páginas
6. [ ] Tentar adicionar item ao carrinho
7. [ ] Tentar fazer pedido

### Resultado Esperado:
- [ ] ✅ App carrega offline
- [ ] ✅ Navegação funciona (páginas já visitadas)
- [ ] ✅ Mostrar erro apropriado ao tentar fazer pedido
- [ ] ❌ Imagens não carregadas podem não aparecer (normal)

---

## 🎨 TESTE 6: Ícones e Branding

### Verificar:
- [ ] Ícone na tela inicial é laranja (#ff4500)
- [ ] Ícone tem desenho de prato, garfo e faca
- [ ] Ícone tem check branco no centro do prato
- [ ] Ícone tem cantos arredondados (iOS)
- [ ] Nome "SpaceFood" aparece sob o ícone
- [ ] Favicon aparece no navegador (antes de instalar)
- [ ] Splash screen aparece ao abrir (iOS)

---

## 🔐 TESTE 7: Autenticação

### Cadastro:
- [ ] Ir para página de cadastro
- [ ] Preencher nome, email, senha
- [ ] Criar conta com sucesso
- [ ] Redirecionado para menu

### Login:
- [ ] Fazer logout
- [ ] Voltar para página de login
- [ ] Inserir email e senha
- [ ] Fazer login com sucesso
- [ ] Redirecionado para menu

### Persistência:
- [ ] Fechar app
- [ ] Reabrir app
- [ ] Verificar se ainda está logado (sessão persistida)

---

## 🍕 TESTE 8: Funcionalidades do Menu

### Busca:
- [ ] Abrir página de Menu
- [ ] Digitar termo de busca (ex: "pizza")
- [ ] Ver resultados filtrados em tempo real
- [ ] Limpar busca
- [ ] Ver todos os itens novamente

### Filtros:
- [ ] Abrir filtros (se disponível)
- [ ] Filtrar por categoria (ex: "Massas")
- [ ] Ver apenas itens da categoria
- [ ] Filtrar por dieta (ex: "Vegetariano")
- [ ] Ver apenas itens compatíveis
- [ ] Limpar filtros

### Detalhes:
- [ ] Tocar em um item
- [ ] Ver informações nutricionais
- [ ] Ver imagem do prato
- [ ] Ver descrição completa
- [ ] Ver preço

---

## 🛒 TESTE 9: Carrinho e Checkout

### Adicionar ao Carrinho:
- [ ] Selecionar um item do menu
- [ ] Adicionar ao carrinho
- [ ] Ver toast de confirmação
- [ ] Badge de contagem atualiza

### Ver Carrinho:
- [ ] Ir para página do Carrinho
- [ ] Ver itens adicionados
- [ ] Ver informações nutricionais totais
- [ ] Ver preço total

### Fazer Pedido:
- [ ] Confirmar pedido
- [ ] Ver mensagem de sucesso
- [ ] Carrinho é limpo
- [ ] Pedido aparece no histórico

---

## 👤 TESTE 10: Perfil e Settings

### Perfil:
- [ ] Ir para página de Perfil
- [ ] Ver histórico de pedidos
- [ ] Ver gráficos nutricionais (Recharts)
- [ ] Upload de avatar
- [ ] Avatar carrega corretamente
- [ ] Imagem é otimizada (WebP)

### Settings:
- [ ] Ir para Settings
- [ ] Editar nome
- [ ] Editar departamento
- [ ] Editar telefone
- [ ] Salvar alterações
- [ ] Ver confirmação
- [ ] Alterações persistem após recarregar

### Dark Mode:
- [ ] Alternar para modo escuro
- [ ] Interface muda para tema escuro
- [ ] Voltar para modo claro
- [ ] Tema persiste após recarregar

---

## 🚀 TESTE 11: Performance

### Tempos de Carregamento:
- [ ] App carrega em menos de 3 segundos (primeira vez)
- [ ] App carrega em menos de 1 segundo (cache)
- [ ] Transições são suaves (60fps)
- [ ] Sem travamentos ao rolar
- [ ] Imagens carregam progressivamente

### Network:
- [ ] Testar com 3G lento
- [ ] Testar com WiFi rápido
- [ ] Ver que app se adapta à velocidade

---

## 📊 TESTE 12: Responsividade

### Orientações:
- [ ] Testar em modo retrato
- [ ] Testar em modo paisagem
- [ ] Layout se adapta corretamente
- [ ] Sem elementos cortados

### Tamanhos de Tela:
- [ ] Testar em iPhone SE (pequeno)
- [ ] Testar em iPhone 14 Pro (médio)
- [ ] Testar em iPhone 14 Pro Max (grande)
- [ ] Testar em iPad (tablet)
- [ ] Testar em desktop

---

## 🐛 TESTE 13: Erros e Edge Cases

### Erros de Rede:
- [ ] Desconectar internet durante pedido
- [ ] Ver erro apropriado
- [ ] Reconectar
- [ ] Tentar novamente com sucesso

### Sessão Expirada:
- [ ] Deixar app aberto por muito tempo
- [ ] Tentar fazer ação
- [ ] Ver se requer novo login

### Dados Inválidos:
- [ ] Tentar cadastro com email inválido
- [ ] Ver validação de erro
- [ ] Corrigir e tentar novamente

---

## 📸 DOCUMENTAR RESULTADOS

### Capturas de Tela:
- [ ] Ícone na tela inicial (iPhone)
- [ ] Ícone na tela inicial (Android)
- [ ] App em modo standalone
- [ ] Notificação push
- [ ] Página de menu
- [ ] Carrinho com itens
- [ ] Perfil com gráficos
- [ ] Settings

### Bugs Encontrados:
```
1. [Descrição do bug]
   - Plataforma: iOS/Android/Desktop
   - Passos para reproduzir:
   - Resultado esperado:
   - Resultado obtido:

2. [Outro bug]
   ...
```

---

## ✅ RESUMO FINAL

### Instalação:
- [ ] iPhone: ✅ ❌ ⚠️
- [ ] Android: ✅ ❌ ⚠️

### Push Notifications:
- [ ] iPhone: ✅ ❌ ⚠️ N/A
- [ ] Android: ✅ ❌ ⚠️

### Funcionalidades:
- [ ] Menu: ✅ ❌ ⚠️
- [ ] Carrinho: ✅ ❌ ⚠️
- [ ] Perfil: ✅ ❌ ⚠️
- [ ] Settings: ✅ ❌ ⚠️

### Performance:
- [ ] Carregamento: ✅ ❌ ⚠️
- [ ] Animações: ✅ ❌ ⚠️
- [ ] Offline: ✅ ❌ ⚠️

### Branding:
- [ ] Ícones: ✅ ❌ ⚠️
- [ ] Cores: ✅ ❌ ⚠️
- [ ] Fontes: ✅ ❌ ⚠️

---

## 🎯 SCORE FINAL

```
Total de testes: _____ / _____
Testes passados: _____
Testes falhados: _____
Testes parciais: _____

Porcentagem: _____% 

Status: [ ] Aprovado  [ ] Reprovado  [ ] Precisa revisão
```

---

## 📝 NOTAS ADICIONAIS

```
[Espaço para observações, sugestões, ou comentários]
```

---

## 📅 INFORMAÇÕES DO TESTE

- **Data:** ___/___/______
- **Testador:** _________________
- **Dispositivo(s):** _________________
- **OS Version:** _________________
- **Browser:** _________________
- **Conexão:** WiFi / 4G / 5G / 3G

---

**Checklist Versão:** 1.0.0  
**Última atualização:** 24/02/2026

---

<div align="center">

**✅ Boa sorte com os testes!**

Consulte `/STATUS.md` para mais informações

</div>
