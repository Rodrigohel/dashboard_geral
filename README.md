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
- **Saúde do servidor** (só para o administrador/owner): como essa mesma
  máquina roda o FreePBX de verdade, o Portal mostra CPU, memória, disco,
  temperatura e o status dos serviços dela — para acompanhar que a
  instalação dos painéis não sobrecarrega a máquina a ponto de afetar a
  central telefônica.

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
- Saúde do servidor (CPU, memória, disco, temperatura quando o sistema
  expõe o sensor, e status read-only dos serviços systemd desta máquina).

**Sobre a API dos porteiros** (`backend/src/services/accessControlClient.js`)
— a Intelbras usa **duas APIs diferentes** entre as linhas de equipamento,
mesmo dentro da própria XPE/SS:

- **XPE 3200 IP Face** — `POST /api/{target}/{action}` com autenticação
  HTTP Basic, validado contra as informações de uma implementação real em
  produção de terceiros (não é documentação oficial pública — a Intelbras
  não publica o PDF de integração livremente, só mediante contato com o
  time de SDK). **Precisa habilitar antes**, na interface web do próprio
  equipamento: **Segurança → API HTTP** (vem desligada de fábrica) — sem
  isso, toda chamada cai em 404. Testado nesta sessão contra um servidor
  simulado reproduzindo o protocolo completo (criar/listar/editar/excluir
  usuário, foto facial, preservação de campos ao atualizar).
- **SS 3532 MF (Bio-T)** — protocolo bem diferente: `/cgi-bin/*.cgi` com
  autenticação HTTP Digest (RFC 2617) de verdade e respostas em texto puro
  ("OK" ou um código de erro), não JSON. **Ainda não validado contra um
  equipamento real** — a implementação segue só a documentação pública da
  Intelbras para essa linha, sem confirmação em campo. Cadastro de usuário
  e foto devem funcionar; **listar/editar/excluir pela tela ainda não é
  suportado** para este modelo (não há endpoint de listagem documentado).
  Teste com cuidado num equipamento de teste antes de usar em produção.

**Ainda pendente:**
- Os módulos **Rede** e **Interfone** hoje abrem o painel original em uma
  nova aba (ainda com o login próprio dele, se a conta de serviço não
  tiver sido criada) — a integração numa única tela (mesmo domínio, um
  login só) é o próximo passo, e exige um pequeno ajuste no `useAuth` do
  frontend de cada um daqueles dois repositórios para aceitar um token via
  URL. Não mexi neles nesta rodada por serem sistemas já em produção.

## Instalação

Este repositório instala e atualiza **só o Portal** — nada aqui toca no
Rede (`Debian_dashboard`) ou no Interfone (`FreePBX_Asterisk`). Cada um
desses dois é atualizado manualmente, no repositório dele, quando for a
vez de mudar algo lá.

```bash
git clone https://github.com/Rodrigohel/dashboard_geral /opt/portal
cd /opt/portal
sudo ./install.sh
```

**Para atualizar depois, é o mesmo comando** (`sudo ./install.sh`, de dentro
de `/opt/portal`) — ele já busca a versão mais recente do código sozinho
antes de reinstalar/reiniciar, sem perder usuários, equipamentos ou
configurações já cadastrados. Não precisa (nem deve) rodar `git pull` na
mão antes.

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
  porteiro (protocolo depende do modelo, ver seção acima).
- `POST /api/access/devices/:id/users/:userId/photo` — foto facial.
- `GET/PUT /api/settings/gateways/:moduleKey` — configuração dos gateways
  de Rede/Interfone (owner).
- `GET /api/system/health` — CPU, memória, disco, temperatura e status dos
  serviços desta máquina (owner).
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
