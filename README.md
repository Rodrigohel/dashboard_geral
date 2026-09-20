# Portal

Ponto único de acesso externo para os painéis já existentes (Rede,
Interfone/PBX) e para o controle remoto dos porteiros com reconhecimento
facial (Intelbras XPE 3200 IP Face / SS 3532 MF) — um login só, permissões
por usuário, e nenhum outro serviço além deste precisa ficar exposto na
internet.

Pensado para rodar **no mesmo servidor Debian que já roda o FreePBX** (o
mesmo onde estão o [Debian_dashboard](https://github.com/Rodrigohel/Debian_dashboard)
e o [FreePBX_Asterisk](https://github.com/Rodrigohel/FreePBX_Asterisk)), e
para ser acessado de fora só através de um **Cloudflare Tunnel** apontando
para a porta deste Portal — nunca abrindo porta nenhuma no roteador.

## Por que essa arquitetura

```
Internet
   │
   ▼
Cloudflare Tunnel + Access ──── só o Portal fica exposto (1 hostname)
   │  (túnel de saída, sem porta aberta no roteador)
   ▼
Servidor Debian (FreePBX)
   │
   ├── Portal (este repositório) ─┬─ login único + permissões por usuário
   │                               ├─ gateway ──► Debian_dashboard (rede local)
   │                               ├─ gateway ──► FreePBX_Asterisk (rede local)
   │                               └─ fala direto com os porteiros Intelbras
   │
   └── Porteiros XPE 3200 / SS 3532 MF — só na rede local, nunca expostos
```

- **Rede/Interfone continuam sendo os painéis já prontos**, rodando
  sozinhos na rede local — o Portal loga neles com uma conta de serviço
  (Configurações → Gateways) e repassa as chamadas, então o cliente nunca
  vê um segundo login.
- **Controle de acesso é nativo do Portal**: cadastre cada porteiro (host,
  usuário/senha da interface web dele) e gerencie quem tem face/cartão/senha
  cadastrados, tudo pela tela — sem precisar ir ao local.
- **Permissões por usuário**: cada conta criada em Usuários só enxerga os
  módulos liberados para ela e, dentro de Controle de acesso, só os
  porteiros específicos liberados (útil para dar acesso a um síndico só do
  bloco dele, por exemplo).

## Estado atual — o que já funciona vs. o que falta validar

**Funcionando de ponta a ponta** (testado nesta sessão: login, permissões,
CRUD completo, upload de foto, mensagens de erro):
- Login único (JWT) e gestão de usuários do Portal com permissão por
  módulo e, dentro de "Controle de acesso", por equipamento.
- CRUD de porteiros cadastrados (nome, local, modelo, host, credenciais
  criptografadas em repouso) e botão "Testar conexão".
- CRUD de usuários **dentro** de cada porteiro (nome, matrícula, senha,
  cartão, validade) + upload de foto facial, e telas de Configurações
  (gateways) e Usuários.

**Precisa de validação em campo** (não dá para testar sem o equipamento
real):
- `backend/src/services/accessControlClient.js` implementa a API HTTP dos
  porteiros Intelbras seguindo o padrão documentado publicamente
  (Control iD: `login.fcgi`, `create_objects.fcgi`, `load_objects.fcgi`,
  `modify_objects.fcgi`, `destroy_objects.fcgi`, `user_set_image.fcgi`).
  A Intelbras não publica o dicionário completo de campos do objeto
  `users` — antes de usar em produção, cadastre um porteiro de teste e use
  o botão "Testar conexão" e a listagem de usuários para confirmar que os
  nomes de campo batem com o firmware instalado; ajuste
  `toDeviceUser`/`fromDeviceUser` se necessário.
- Os módulos **Rede** e **Interfone** hoje abrem o painel original em uma
  nova aba (ainda com o login próprio dele, se a conta de serviço não
  tiver sido criada) — a integração numa única tela (mesmo domínio, um
  login só) é o próximo passo, e exige um pequeno ajuste no `useAuth` do
  frontend de cada um daqueles dois repositórios para aceitar um token via
  URL. Não mexi neles nesta rodada por serem sistemas já em produção.

## Instalação

```bash
git clone <url-deste-repo> /opt/portal
cd /opt/portal
sudo ./install.sh
```

Idempotente — depois de um `git pull`, rode `sudo ./install.sh` de novo
para atualizar sem perder nada.

Depois de instalado:
1. **Configurações → Gateways**: aponte para os backends do Rede/Interfone
   já rodando nesta máquina, com uma conta de serviço criada em cada um.
2. **Controle de acesso**: cadastre os porteiros Intelbras.
3. **Usuários**: crie um login por cliente e escolha o que cada um vê.
4. Configure o **Cloudflare Tunnel** apontando só para a porta do Portal.

## Desenvolvimento local

```bash
# backend
cd backend && npm install && cp .env.example .env && npm run seed:admin && npm run dev

# frontend, em outro terminal
cd frontend && npm install && npm run dev
```

Acesse `http://localhost:5175`.

## Endpoints do backend

- `GET /health` — healthcheck.
- `POST /api/auth/login`, `GET /api/auth/me`.
- `GET /api/modules` — módulos liberados para o usuário logado (link
  público do gateway, contagem de equipamentos).
- `GET/POST/PUT/DELETE /api/users` — contas do Portal e permissões (owner).
- `GET/POST/PUT/DELETE /api/access/devices` — cadastro dos porteiros.
- `POST /api/access/devices/:id/test-connection`.
- `GET/POST/PUT/DELETE /api/access/devices/:id/users` — usuários dentro do
  porteiro (via API Intelbras/Control iD).
- `POST /api/access/devices/:id/users/:userId/photo` — foto facial.
- `GET/PUT /api/settings/gateways/:moduleKey` — configuração dos gateways
  de Rede/Interfone (owner).
- `ALL /gateway/rede/*`, `ALL /gateway/interfone/*` — proxy autenticado
  para a API dos painéis existentes.

## Segurança

- Nunca exponha os porteiros, o Rede ou o Interfone diretamente na
  internet — só o Portal deve ter um hostname público (Cloudflare Tunnel).
- Considere colocar o **Cloudflare Access** na frente do hostname do
  Portal como camada extra, além do login do próprio Portal.
- Credenciais de equipamento e das contas de serviço dos gateways ficam
  criptografadas em repouso (AES-256-GCM) com a chave `CREDENTIALS_KEY` do
  `.env` — nunca comitada, gerada automaticamente pelo `install.sh`.
