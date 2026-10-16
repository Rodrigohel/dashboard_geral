# Ideias para mais pra frente

Backlog de ideias discutidas mas não implementadas — não é compromisso de fazer, só pra não esquecer.

## Problemas conhecidos (pendências a revisitar)

Bugs relatados que ainda não foram fechados de verdade — perguntar ao Rodrigo de vez em
quando se quer atacar algum destes.

- **Exclusão de morador continua dando erro 502**, mesmo equipamento por equipamento, mesmo
  depois de corrigir a instabilidade do túnel Cloudflare (QUIC → HTTP/2, ver histórico do git)
  e a corrida de nonce Digest da Academia. Testado direto no servidor via `localhost:3000`
  (sem passar pela Cloudflare) e funcionou limpo — o relato é de uso real, pela Cloudflare. Pra
  avançar da próxima vez: pedir o print/texto exato do erro na hora que acontecer (não só "deu
  502") e em qual equipamento especificamente, pra comparar com os logs do `cloudflared` e do
  `portal-backend` daquele instante exato.
- **Porteiro da Academia (SS 3532 MF) não salva a foto**, mesmo depois da correção da corrida
  de nonce Digest (#136 — resolveu outros sintomas da Academia, mas não esse). Suspeita ainda
  não confirmada: um teste anterior (com uma imagem de 1 pixel, só pra validar o fluxo) recebeu
  `"Batch Process Error"` do equipamento — pode ser que o formato/tamanho que o Portal manda
  pra `AccessFace.cgi` (ver `biotSetUserPhoto` em `accessControlClient.js`) não seja o que esse
  modelo espera de verdade (essa implementação nunca foi validada contra hardware real antes
  desta sessão). Precisa testar com uma foto de rosto real (não a de 1 pixel) pra confirmar se
  o erro é de formato ou outra coisa.
- **Busca de morador não acha por nome parcial/apelido** — melhorado: `GET /search-users`
  agora ignora acento/maiúscula dos dois lados (nome digitado e nome salvo no equipamento) via
  normalização NFD, então "joao" acha "João", "jose" acha "José" etc. — antes só funcionava
  por acaso pra nomes 100% sem acento. O caso original relatado ("Rodri" não achando "Rodrigo
  H") já era puro ASCII e o `.includes()` já deveria ter batido antes dessa mudança também —
  não foi possível reproduzir contra hardware real; se continuar acontecendo, próximo passo é
  confirmar o termo exato digitado e o nome exato salvo no equipamento no momento do erro.
- ~~**Busca de morador consulta equipamentos sem cadastro de pessoas**~~ — corrigido:
  `GET /search-users` agora pula os equipamentos Segplace/Axiom Wifi (checando `device.model`)
  antes de consultar, em vez de tentar e cair em `errors`. Testado criando um equipamento
  Segplace de teste e um porteiro XPE inalcançável de propósito — o Segplace não aparece mais
  em `errors`, só o porteiro de verdade que falhou aparece.
- **Bomba 1 não aparece ligada no Portal quando está ligada de verdade** — acionamento manual
  real (levantou a boia do nível médio): no painel físico as duas bombas (1 e 2) acionaram, "bomba
  do dia" bateu certo com o Portal, mas o Portal mostrou só a Bomba 2 como ligada (Bomba 1
  aparecia desligada). Endereço configurado hoje pra `bomba1` é LB00112 (`LIGA_BOMBA_01`, fonte
  Q1 do LOGO — ver `docs/casa-de-bombas.md`). Pode ser endereço errado, sinal invertido (mesma
  causa já vista em emergência/falta de fase — ver `invert` por ponto, já suportado), ou só o
  instante errado do poll (bomba 1 ligou/desligou entre uma leitura e outra). As bombas já
  desligaram antes de dar pra conferir a leitura crua — da próxima vez que ligarem as duas
  juntas, pegar o JSON de `GET /api/pumpstation/status` na hora, comparando com o painel físico
  nesse exato instante, pra confirmar se é persistente ou só uma coincidência de timing.

## ~~Notificações push (PWA)~~ — feito (parcial)
Implementado: liga/desliga em Configurações (dono), cada administrador ativa depois no
próprio navegador em "Minha conta". Avisa: porteiro ficou offline (transição, não repete
enquanto continuar caído) e trava de força bruta disparada (com cooldown de 15min por
usuário+IP pra não virar spam). Só manda pra quem tem papel "owner" — mesmo público de
Auditoria/Saúde do servidor. NÃO incluído ainda: "alerta crítico de rede" (viria do painel
de Rede original via gateway, exigiria um poller novo do lado do servidor só pra isso — fica
pra depois se fizer falta). Limitação conhecida: no iPhone só funciona se o usuário instalou
de verdade ("Adicionar à Tela de Início"), Safari não manda push de aba aberta no navegador.

## ~~Modo TV / painel de portaria~~ — feito
Implementado como um flag por conta (`tv_mode`), marcado ao criar/editar um usuário em
Usuários do Portal — "Modo TV / painel de portaria". Conta marcada assim, ao logar, não vê
Sidebar/TopBar/BottomNav/menu nenhum: só os cards dos módulos liberados pra ela + um painel
"Alarmes ativos" no topo (bombas: térmico/emergência/falta de fase/painel desligado/falha nas
boias; rede/interfone/acesso: quantos equipamentos estão offline), sempre em tela cheia.
Continua usando o sistema de permissões normal (módulos/equipamentos) pra decidir o que
aparece — o flag só troca a apresentação, não dá acesso a nada que a conta já não tivesse.
Tem um botão "Sair" no canto pra deslogar, já que não tem menu nenhum pra isso.

## ~~Detecção de anomalia nos dados já coletados~~ — feito
Implementado: latência de rede fora do padrão (compara contra média + desvio-padrão das
últimas 24h), perdidas do Interfone muito acima da média dos últimos dias, e abertura de
porteiro em horário que aquele equipamento nunca tinha registrado antes (com no mínimo 15
aberturas de histórico pra não acusar anomalia à toa nos primeiros usos).

## Multi-tenant de verdade (SaaS)
Hoje cada instalação do Portal é fechada pra UM cliente (um banco SQLite, uma linha de marca).
Pra virar uma plataforma hospedando vários clientes ao mesmo tempo (um servidor só, N
condomínios/prédios) precisaria de isolamento de dados por cliente em todo canto (tenant_id
nas tabelas, roteamento por subdomínio) — reforma grande, não é "adicionar uma tela".

## ~~XPE 3200 — abrir porta às vezes volta HTML em vez de JSON~~ — feito e confirmado em hardware real
Causa raiz confirmada lendo o manual oficial (Manual_XPE_3200_IP_FACE_01-22_site.pdf, seção
"Controle de Acesso > Relé > Acionar Relé por HTTP", com URL de exemplo real): abrir a porta
nunca fez parte da API JSON (`/api/{target}/{action}`) — é uma URL GET separada, estilo CGI
antigo: `http://IP/fcgi/do?action=OpenDoor&UserName=U&Password=S&DoorNum=1`. A tentativa
anterior ("accessControl"/"openDoor" na API JSON) era só um chute nunca confirmado — por isso
vinha HTML de volta (a API JSON nunca teve esse endpoint). Trocado para a URL confirmada.

Testado com um XPE 3200 real (porteiro "Torre X") — funciona. Pegadinha real encontrada nesse
teste: o usuário/senha do "Acionar Relé por HTTP" é um campo **separado** dentro do
equipamento (Controle de Acesso > Relé), independente do login principal usado pelo resto da
API — se estiverem diferentes, o equipamento responde HTTP 200 normalmente (o Portal mostra
"aberto com sucesso") mas o relé não é acionado de verdade, sem erro nenhum visível. Precisa
que o usuário/senha cadastrados no Portal para aquele equipamento batam com o que está
configurado nesse campo específico do relé (não necessariamente o login de admin do
equipamento). Se algum porteiro tiver uma senha de relé diferente da senha principal, dá pra
adicionar um campo separado no cadastro do Portal pra isso — não implementado ainda por não
ter sido necessário até agora.

## ~~Segplace/Axiom Wifi — integração de portão~~ — feito
Implementado como novo modelo "segplace" em Controle de acesso. A API foi confirmada lendo o
código-fonte real do APK oficial do Segplace (decompilado) — não por captura de tráfego (o
certificate pinning do app bloqueou isso): login via `POST /api/entrar` (Basic auth com a
conta Segplace, devolve cookie de sessão), lista de portões via `GET /api/dispositivos/get`,
abrir via `POST /api/portas/abrir` com `{"id": <id>}`. Não existe IP local — tudo passa pela
nuvem deles (segplace.seekat.com.br), por isso o cadastro pede usuário/senha da conta em vez
de host/porta, com um botão "Buscar portões" pra escolher qual portão da conta cada linha do
Portal representa (uma conta pode ter mais de um). NÃO suporta cadastro de moradores (a API
deles não expõe isso, só abrir/ver status). Testado de ponta a ponta contra um servidor fake
replicando o contrato real — nunca contra a nuvem de verdade (a rede daqui não alcança hosts
de terceiros), então o primeiro teste real acontece no servidor do cliente.

## Feed de reconhecimento facial ao vivo
HIPÓTESE, não confirmada: se a API dos porteiros (XPE3200/SS3532MF) expuser evento de
reconhecimento facial (não só abrir porta), dava pra mostrar um feed tipo "Fulano passou pela
portaria às 14:32" ao vivo no Portal. Precisa descobrir primeiro se o equipamento realmente
expõe esse evento via API — não é garantido.

## Módulo "Gerador" (grupo gerador de energia)
Novo módulo nativo, mesmo padrão do módulo Bombas: card na Início + tela própria, endereço de
comunicação configurável (protocolo ainda não confirmado — provavelmente Modbus TCP via algum
controlador/IHM do gerador, igual Bombas lê a IHM Weintek em vez do LOGO direto, mas isso
precisa ser descoberto, não é garantido que seja a mesma coisa). Informações que o Rodrigo
quer no card: se o gerador está pronto (em condições de entrar em operação) ou não, e se tem
alguma falha. O Rodrigo mencionou já ter mandado um "modelo"/especificação do gerador numa
conversa anterior — não está disponível nesta sessão, perguntar/pedir de novo antes de
começar a implementar. Pedido explícito: **desenhar uma prévia do card primeiro** (mesma
dinâmica já usada pro card de Bombas via Artifact, aprovada antes de implementar de verdade)
antes de escrever qualquer código.

## Alertas insistentes com prioridade, via Telegram (+ ligação telefônica) — fase 1 feita (só Bombas)
**Fase 1 implementada**, escopo restrito aos 7 alarmes da casa de bombas (térmico 1/2, modo
manual, emergência, falta de fase, painel desligado, falha nas boias) — ainda NÃO cobre
rede/interfone (offline) nem porteiro offline/força bruta (esses continuam só no push PWA já
existente) nem o módulo Gerador (que ainda não existe). O que foi implementado:
- Bot do Telegram de verdade: token + chat ID configuráveis em Configurações → "Alertas via
  Telegram" (token guardado criptografado, igual outras senhas do Portal). Botão "Testar
  token" (chama `getMe`) e botão "Configurar resposta no chat" (chama `setWebhook` do
  Telegram apontando pro Portal).
- Checkbox **"Prioridade"** por sinal de alarme, em Bombas → Configuração (ao lado do
  "Inverter") — só os 7 alarmes têm essa opção (níveis não são alarme).
- Mensagem é mandada uma vez quando o alarme dispara (sempre, prioridade ou não); se for
  prioridade, **reenvia a cada X tempo** (configurável: 5min/15min/30min/1h/2h) até resolver
  ou ser reconhecido.
- Cada mensagem de alarme já vem com **dois botões** ("✅ Visto" e "🔧 Em manutenção") —
  tocar um deles reconhece SÓ aquele alarme específico (via `callback_data`), parando de
  insistir nesse sem mexer nos outros alarmes ativos. Digitar qualquer mensagem solta no chat
  (sem tocar botão) continua reconhecendo todos os alarmes ativos de uma vez, como fallback.
- Endpoint do webhook (`POST /api/telegram/webhook/<secret>`) é público (o Telegram chama,
  não um usuário logado) mas protegido por um segredo aleatório na própria URL, não por JWT.

**Ainda NÃO implementado** (ideia original completa, pra continuar depois):
- Marcar **equipamentos/sinais de outros módulos** (rede, interfone, porteiro offline) como
  prioridade — hoje só os 7 alarmes de Bombas têm essa opção.
- Sinalização visual de "equipamento crítico" na tela (não só pra fins de alerta).
- **Ligação telefônica de verdade** (Twilio ou alternativa mais barata) pros equipamentos
  habilitados — desligando automático ao atender (atender já conta como reconhecimento).
  Precisa cotar preço antes de decidir qual provedor usar.

## ~~Bombas: permitir adicionar pontos customizados~~ — fase 1 feita
Fase 1 implementada: em "Bombas → Configuração" agora dá pra adicionar um sinal novo sozinho
(nome + endereço, tipo sempre "coil" por padrão, inverter opcional), sem precisar de deploy —
tabela nova `pump_custom_points` (lista dinâmica, em vez de colunas fixas) lida pela mesma
lógica Modbus dos pontos fixos. Aparece de forma genérica (nome + sim/não) numa coluna extra
"Pontos customizados" no card de status detalhado (só quem edita config vê, igual o resto
desse card) — ainda sem desenho gráfico específico nem entrada no histórico/gráfico de
ativações, isso fica pra fase 2, quando fizer falta.

## Bombas: escrita remota (forçar bomba/modo/reset via Modbus)
Hoje o Portal só LÊ a casa de bombas — ideia é permitir também ESCREVER em pontos específicos
(ex.: forçar bomba 1/2 ligada/desligada remotamente, forçar qual é "a bomba do dia", resetar
falha de boias), não só acompanhar. Explicitamente **pausado por agora** — o Rodrigo não quer
acionar nada remotamente por enquanto — mas fica documentado porque já tem bastante desenho
pensado:
- Opt-in por ponto (desligado por padrão) — nunca ligar a saída "pra todo mundo" sozinho.
- Nunca permitir escrita nos 4 sensores de nível (não faz sentido forçar um sensor) nem nos 4
  sinais de segurança — térmico 1/2, emergência, falta de fase (são leitura de um contato de
  segurança de verdade; forçar esses poderia mascarar uma condição real de perigo). Essa
  restrição deveria ser reforçada no BACKEND (não só escondida na tela), já que esses são
  sinais de segurança de verdade.
- Elegíveis pra escrita (se um dia for ligado): bomba1, bomba2, modoManual, painelDesligado,
  falhaBoias, bomba1DoDia, bomba2DoDia, além de pontos customizados (aí a decisão de quais são
  seguros fica com quem cadastrou).
- Detalhe técnico real do protocolo: registrador tipo "discrete input" (FC2) e "input
  register" (FC4) são SÓ LEITURA no Modbus — não tem função de escrita correspondente. Só
  "coil" (FC5/15) e "holding register" (FC6/16) podem ser escritos.
- Antes de reativar essa ideia: decidir COM o Rodrigo, de propósito (não por uma resposta
  rápida tipo "sem preferência"), exatamente quais pontos ele quer poder forçar — ação que
  aciona equipamento físico de verdade merece decisão explícita, não suposição.
