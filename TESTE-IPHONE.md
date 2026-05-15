# 📱 Guia de Teste - iPhone (iOS)

## 🎯 Objetivo
Verificar se o ícone PNG do SpaceFood aparece corretamente na tela inicial do iPhone após adicionar o PWA.

---

## ✅ Pré-requisitos

Antes de testar no iPhone, verifique:
- [x] Ícones PNG foram adicionados (`icon-180.png`, `icon-192.png`, `icon-512.png`)
- [x] App está rodando e acessível (localhost ou deploy)
- [x] iPhone com iOS 11.3+ (recomendado iOS 16+)
- [x] Safari atualizado

---

## 📝 Passo a Passo - Teste no iPhone

### 1️⃣ Preparação (Limpar Cache)

**Importante:** Para garantir que o iPhone use os novos ícones PNG:

1. Abra **Configurações** no iPhone
2. Role até **Safari**
3. Toque em **Limpar Histórico e Dados de Sites**
4. Confirme

### 2️⃣ Acessar o App

1. Abra o **Safari** no iPhone
2. Digite a URL do SpaceFood na barra de endereço
3. Aguarde o carregamento completo

### 3️⃣ Adicionar à Tela Inicial

1. Toque no botão **Compartilhar** (ícone de caixinha com seta para cima)
   - Fica na parte inferior do Safari (centro)
2. Role a lista de opções para baixo
3. Toque em **"Adicionar à Tela de Início"**
4. Você verá uma prévia do ícone
5. (Opcional) Edite o nome se desejar
6. Toque em **"Adicionar"** (canto superior direito)

### 4️⃣ Verificar o Ícone

Volte para a tela inicial do iPhone e procure pelo app **SpaceFood**.

**✅ Sucesso esperado:**
- Ícone **laranja (#ff4500)** 
- Com desenho de **prato, garfo e faca**
- Com um **check branco** no centro do prato
- Cantos **arredondados** (padrão iOS)

**❌ Se aparecer algo diferente:**
- Ícone genérico do Safari (azul)
- Ícone com borda preta/branca
- Ícone distorcido ou pixelado

→ Veja seção "Troubleshooting" abaixo

### 5️⃣ Testar o App

1. Toque no ícone do **SpaceFood** na tela inicial
2. O app deve abrir em **modo standalone** (sem a barra do Safari)
3. Navegue pelas páginas (Menu, Carrinho, Settings)
4. Feche e abra novamente para verificar persistência

---

## 🔔 Teste de Push Notifications

**Nota:** No iOS, push notifications do PWA têm limitações. Funcionam melhor quando:
- App está instalado na tela inicial
- App foi aberto recentemente

### Passos:

1. No app instalado, faça **login**
2. Vá em **Settings** (⚙️)
3. Na seção "Notificações Push", toque em **"Ativar"**
4. Permita notificações quando solicitado
5. Faça um **pedido** no app
6. Como **admin**, mude o status do pedido
7. Verifique se a notificação aparece

---

## 🐛 Troubleshooting

### Problema: Ícone genérico aparece (azul do Safari)

**Possíveis causas:**
- Cache antigo do iOS
- Arquivo PNG não foi carregado corretamente
- Delay no processamento do iOS

**Soluções:**

#### Solução 1: Remover e Reinstalar
```
1. Pressione e segure o ícone do SpaceFood
2. Toque em "Remover App"
3. Confirme "Apagar da Tela de Início"
4. Force o fechamento do Safari (swipe up no app switcher)
5. Reabra o Safari e tente adicionar novamente
```

#### Solução 2: Aguardar Processamento
```
O iOS às vezes leva alguns minutos para processar o ícone.
- Aguarde 2-5 minutos
- Bloqueie e desbloqueie o iPhone
- Verifique se o ícone foi atualizado
```

#### Solução 3: Reiniciar iPhone
```
1. Desligue completamente o iPhone
2. Aguarde 10 segundos
3. Ligue novamente
4. Repita o processo de instalação
```

### Problema: Ícone aparece mas com qualidade ruim

**Causa:** Arquivo PNG incorreto ou corrompido

**Solução:**
```
1. Verifique se os arquivos em /public são PNGs válidos
2. Use ferramentas online para converter novamente se necessário
3. Confirme que icon-180.png tem exatamente 180x180 pixels
```

### Problema: Push notifications não funcionam

**Causa:** Limitações do iOS

**Nota:** 
- iOS tem suporte limitado a push notifications em PWAs
- Funciona melhor em iOS 16.4+
- Requer que o app tenha sido aberto recentemente
- Requer permissão explícita do usuário

**Alternativas:**
- Use notificações in-app (dentro do app)
- Teste em Android para validar a funcionalidade completa

---

## 📊 Checklist de Validação

Após seguir todos os passos, marque:

### Instalação:
- [ ] App aparece na tela inicial com ícone correto
- [ ] Ícone é laranja com prato, garfo e faca
- [ ] Nome "SpaceFood" aparece embaixo do ícone
- [ ] Ao tocar, abre em modo standalone (sem Safari)

### Funcionalidades:
- [ ] Navegação funciona corretamente
- [ ] Login/logout funciona
- [ ] Adicionar itens ao carrinho funciona
- [ ] Criar pedido funciona
- [ ] Settings abre corretamente

### Offline (Opcional):
- [ ] Abra o app
- [ ] Ative o modo avião
- [ ] Navegue pelo app (deve carregar do cache)
- [ ] Tente fazer pedido (deve mostrar erro apropriado)

### Push Notifications (Opcional):
- [ ] Permissão foi solicitada
- [ ] Permissão foi concedida
- [ ] Notificação aparece ao mudar status do pedido

---

## 📸 Capturas de Tela

Tire screenshots de:
1. Ícone na tela inicial
2. App aberto em modo standalone
3. Notificação push (se funcionar)

Isso ajuda a documentar e debugar problemas.

---

## ✅ Resultado Esperado Final

✨ **Sucesso total:**
- Ícone laranja perfeito na tela inicial
- App abre em fullscreen (standalone)
- Todas as funcionalidades funcionam
- (Bônus) Push notifications funcionam

🎉 **PWA instalado e funcionando no iOS!**

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs do console do Safari (Safari → Develop)
2. Consulte `/PWA-CHECKLIST.md` para troubleshooting adicional
3. Confirme que todos os arquivos PNG estão corretos em `/public`

---

**Boa sorte com os testes! 🚀**
