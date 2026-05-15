# 🍽️ SpaceFood - PWA de Gestão de Refeições

> Progressive Web App mobile-first para pedidos de refeições com design minimalista e cor primária laranja.

![Status](https://img.shields.io/badge/PWA-100%25%20Completo-brightgreen)
![iOS](https://img.shields.io/badge/iOS-Compatible-blue)
![Android](https://img.shields.io/badge/Android-Compatible-green)
![Push](https://img.shields.io/badge/Push%20Notifications-Enabled-orange)

---

## 🚀 Quick Start

### 📱 Instalar no seu dispositivo:

**iPhone (Safari):**
1. Abra este link no Safari
2. Toque no botão Compartilhar (caixinha com seta)
3. Selecione "Adicionar à Tela de Início"
4. Pronto! 🎉

**Android (Chrome):**
1. Abra este link no Chrome
2. Toque no banner "Instalar app"
3. Ou Menu (⋮) → "Instalar app"
4. Pronto! 🎉

---

## ✨ Features

### 🍕 Menu Inteligente
- Busca instantânea de pratos
- Filtros por categoria e dieta
- Informações nutricionais detalhadas
- Imagens de alta qualidade

### 🛒 Carrinho Completo
- Informações nutricionais totais
- Cálculos automáticos
- Preview de pedidos
- Confirmação rápida

### 👤 Perfil do Usuário
- Histórico completo de pedidos
- Dados de saúde e objetivos
- Gráficos via Recharts
- Upload de avatar otimizado

### 🔔 Notificações Push
- Atualizações de status em tempo real
- Estilo iOS nativo
- Criptografia Web Push (VAPID)
- Controle granular de permissões

### 📱 PWA Completo
- Instalável como app nativo
- Funciona offline
- Service Worker otimizado
- Splash screens customizados

---

## 🎨 Design

- **Mobile-first:** Otimizado para touch e telas pequenas
- **Cor primária:** Laranja (#ff4500)
- **Animações:** Suaves via Motion (Framer Motion)
- **Dark mode:** Suporte completo
- **Responsivo:** Adapta-se a qualquer tela

---

## 🛠️ Stack Técnica

### Frontend:
- **React 18** + TypeScript
- **React Router** (data mode)
- **Tailwind CSS v4**
- **Motion** (Framer Motion)
- **Recharts** (gráficos)
- **Sonner** (toasts)
- **Lucide React** (ícones)

### Backend:
- **Supabase** (database + auth + storage)
- **Edge Functions** (Hono web server)
- **Web Push** (notificações)
- **KV Store** (key-value storage)

### PWA:
- **Service Worker** (cache + offline)
- **Web App Manifest** (instalação)
- **Push API** (notificações)
- **VAPID Keys** (criptografia)

---

## 📁 Estrutura do Projeto

```
spacefood/
├── src/
│   └── app/
│       ├── App.tsx                    # Entrada principal
│       ├── routes.ts                  # React Router config
│       ├── components/                # Componentes reutilizáveis
│       │   ├── PWAInstallBanner.tsx   # Banner de instalação
│       │   ├── DevIconCheck.tsx       # Verificador de ícones
│       │   └── ui/                    # Componentes de UI
│       ├── pages/                     # Páginas do app
│       │   ├── Menu.tsx
│       │   ├── Cart.tsx
│       │   ├── Profile.tsx
│       │   └── Settings.tsx
│       ├── context/                   # Context providers
│       │   └── auth-context.tsx
│       └── lib/                       # Utilities
│           └── usePWA.ts              # Hook PWA principal
│
├── supabase/
│   └── functions/
│       └── server/
│           ├── index.tsx              # Hono web server
│           └── kv_store.tsx           # KV utilities
│
├── public/
│   ├── manifest.json                  # PWA manifest
│   ├── sw.js                          # Service Worker
│   ├── icon-180.png                   # iOS icon
│   ├── icon-192.png                   # Android icon
│   ├── icon-512.png                   # High-res icon
│   ├── icon-maskable.svg              # Android adaptive
│   └── splash.svg                     # iOS splash
│
└── docs/
    ├── STATUS.md                      # Status completo
    ├── PWA-CHECKLIST.md               # Checklist técnico
    ├── PWA-TECHNICAL-SUMMARY.md       # Documentação técnica
    ├── README-ACOES-PENDENTES.md      # Guia de testes
    └── TESTE-IPHONE.md                # Guia iPhone
```

---

## 📚 Documentação

| Arquivo | Descrição | Público |
|---------|-----------|---------|
| [STATUS.md](/STATUS.md) | Status geral e visão completa | Todos |
| [README-ACOES-PENDENTES.md](/README-ACOES-PENDENTES.md) | Guia de testes e validação | Testadores |
| [TESTE-IPHONE.md](/TESTE-IPHONE.md) | Passo a passo para iPhone | Testadores iOS |
| [PWA-CHECKLIST.md](/PWA-CHECKLIST.md) | Checklist técnico | Desenvolvedores |
| [PWA-TECHNICAL-SUMMARY.md](/PWA-TECHNICAL-SUMMARY.md) | Documentação técnica | Desenvolvedores |
| [ESTA-SESSAO.md](/ESTA-SESSAO.md) | Histórico da correção iOS | Desenvolvedores |

---

## 🧪 Como Testar

### Funcionalidades Principais:
```bash
1. Login/Cadastro
2. Navegar pelo menu
3. Adicionar itens ao carrinho
4. Fazer pedido
5. Ver histórico no perfil
6. Ativar notificações push
7. Instalar como app
```

### Testes Específicos:

**PWA:**
- [ ] App é instalável no iPhone
- [ ] App é instalável no Android
- [ ] Ícone correto aparece na tela inicial
- [ ] Modo standalone funciona
- [ ] Service Worker ativo

**Push Notifications:**
- [ ] Permissão é solicitada
- [ ] Subscription funciona
- [ ] Notificações chegam
- [ ] Clicar abre o app

**Offline:**
- [ ] App carrega offline
- [ ] Navegação funciona offline
- [ ] Erro apropriado ao tentar fazer pedido offline

---

## 🔧 Desenvolvimento

### Instalar dependências:
```bash
npm install
```

### Rodar em desenvolvimento:
```bash
npm run dev
```

### Build para produção:
```bash
npm run build
```

### Deploy (Supabase):
```bash
supabase functions deploy
```

---

## 🐛 Troubleshooting

### Ícone não aparece no iPhone:
```
1. Safari → Configurações → Limpar Histórico
2. Remova o app da tela inicial
3. Force-quit Safari
4. Reabra e instale novamente
5. Aguarde 2-5 minutos (iOS processa ícones devagar)
```

### Push notifications não funcionam:
```
1. Verifique se permissão foi concedida
2. Confirme que VAPID keys estão configuradas
3. Veja logs do console ([Push] prefix)
4. iOS: requer iOS 16.4+ e app instalado
```

### Service Worker não atualiza:
```
1. Chrome DevTools → Application → Service Workers
2. Clique em "Update" ou "Unregister"
3. Recarregue a página
4. Ou: limpe o cache do site
```

---

## 🎯 Roadmap

### ✅ Completo:
- [x] PWA básico (instalação, offline)
- [x] Push notifications
- [x] Auth (login/cadastro)
- [x] Menu com busca e filtros
- [x] Carrinho e checkout
- [x] Perfil com histórico
- [x] Gráficos nutricionais
- [x] Upload de avatar otimizado
- [x] Correção de ícones iOS

### 🔄 Em Andamento:
- [ ] Testes em dispositivos reais

### 📋 Futuro:
- [ ] Queue de pedidos offline
- [ ] Background Sync
- [ ] Notificações com ações
- [ ] Analytics de PWA
- [ ] Share Target API
- [ ] Shortcuts API

---

## 👥 Equipe

Desenvolvido com ❤️ para uma experiência gastronômica de outro mundo! 🚀

---

## 📄 Licença

Projeto educacional - SpaceFood PWA

---

## 🙏 Agradecimentos

- **Recharts** - Biblioteca de gráficos
- **Lucide** - Ícones lindos
- **Supabase** - Backend completo
- **Tailwind CSS** - Styling rápido
- **Motion** - Animações suaves

---

## 📞 Suporte

Encontrou um bug? Tem uma sugestão?
- 📖 Consulte a [documentação](/STATUS.md)
- 🐛 Abra uma issue
- 💬 Entre em contato

---

**Última atualização:** 24 de Fevereiro de 2026  
**Versão:** 1.0.0  
**Status:** ✅ Production Ready

---

<div align="center">

**🎉 SpaceFood - Uma experiência gastronômica de outro mundo! 🚀**

[Instalar App](#-quick-start) • [Documentação](/STATUS.md) • [Guia de Testes](/README-ACOES-PENDENTES.md)

</div>
