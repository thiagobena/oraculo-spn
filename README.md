# 🔮 ORÁCULO SPN — Placa Corporativa de Inteligência Artificial

**ORÁCULO SPN** é uma plataforma corporativa de Inteligência Artificial para equipes de tecnologia, projetada para rodar em **Windows Server** e se comunicar via rede local com instâncias do **LM Studio** e banco de dados **Microsoft SQL Server**.

---

## ⚡ Como Rodar o Sistema (Acesso à Rede Local)

### Comando Principal (Frontend + Backend com Acesso à Rede)
```powershell
npm run dev:all
```

Ao executar este comando:
- **Interface Web (Vite SPA)** estará disponível em:
  - Local: `http://localhost:3070/`
  - Rede Local (LAN): `http://<IP_DA_MAQUINA>:3070/` (Ex: `http://10.1.5.222:3070/`)
- **Backend API (Fastify)** estará disponível em:
  - Local: `http://localhost:3333/`
  - Rede Local (LAN): `http://<IP_DA_MAQUINA>:3333/`

---

## 🌐 Configuração de Proxy para Rede Local

O Vite está configurado para expor `--host 0.0.0.0` com proxy transparente de `/api` para a porta `3333`. Qualquer usuário da sua rede local pode acessar o sistema abrindo o IP do servidor sem necessidade de configurar URLs ou CORS adicionais.

---

## 🛠️ Outros Comandos Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev:all` | **(Recomendado)** Inicia a API e a Interface Web expostas para a rede local |
| `npm run dev:api` | Inicia apenas o servidor de API (Fastify) na porta 3333 |
| `npm run dev:web` | Inicia apenas a interface Web exposta para a rede local |
| `npm run doctor` | Executa o teste de diagnóstico de ambiente e conexões |
| `npm run test:lmstudio` | Testa a conectividade e lista modelos do LM Studio |
| `npm run test:database` | Testa a conexão e tabelas do SQL Server |
| `npm run build` | Compila todos os pacotes do monorepo para produção |
