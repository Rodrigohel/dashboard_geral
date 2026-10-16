# Ideias para mais pra frente

Backlog de ideias discutidas mas não implementadas — não é compromisso de fazer, só pra não esquecer.

## Versão do Portal
Aparece em `v1.1.0` no rodapé da barra lateral (qualquer usuário vê, não só dono) — vem de
`backend/package.json` (`GET /api/version`, público); `frontend/package.json` é mantido com o
mesmo número só pra não ter dois números pra mesma coisa. Convenção (semver, a critério de cada
PR, sem processo formal): **patch** (1.1.0 → 1.1.1) pra correção pequena/ajuste; **minor**
(1.1.x → 1.2.0) quando entra alguma coisa nova de verdade (feature, módulo); **major** (1.x →
2.0.0) só pra mudança grande o bastante pra mudar como o Portal funciona por fora. Bump manual,
um PR por vez — não existe automação pra isso.

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

## ~~Módulo "Gerador" (grupo gerador de energia)~~ — fase 1 feita (sem endereços ainda)
Novo módulo nativo, mesmo padrão do módulo Bombas: card na Início (cor âmbar, ícone de raio),
tela própria ("Gerador" no menu/busca rápida), permissão própria (`gerador` +
`gerador.editar`). Prévia aprovada pelo Rodrigo em
https://claude.ai/artifact/XDbgrhL62ACCH5isBdjLPA antes de implementar — folha de dados
confirmou o controlador (ComAp AMF-9, Perkins 1103A-33TG2, grupo CE60 47kW/60kVA), IP
192.168.1.253.

Implementado: leitura via Modbus TCP direto no controlador (sem login — Modbus não tem
usuário/senha, só a tela própria do controlador teria, que o Portal nem usa — correção de uma
suposição errada que eu tinha colocado na prévia). Três pontos monitorados: **pronto**
(standby), **falha** (ativa) e **em operação** (gerando energia), cada um com
endereço/tipo/inverter configurável em "Gerador → Configuração", igual Bombas — endereço fica
em branco até confirmar o certo, nunca inventado. Card na Início mostra badge de status
(pronto/gerando energia/falha/não pronto); Modo TV mostra "Gerador — falha ativa" no painel de
alarmes quando acontece.

**Ainda falta pra funcionar de verdade**: os ENDEREÇOS Modbus reais dos 3 pontos no ComAp
AMF-9 — ninguém sabe ainda, precisa descobrir na documentação do controlador ou testando
contra o equipamento real (mesmo processo usado pra achar os endereços certos de Bombas).
Também falta confirmar se o módulo de rede/Ethernet (IB-Lite, aparece sem marcar ✓ na folha de
dados) está de fato instalado no painel — sem ele, não tem Modbus TCP nenhum pra ler.
**Não implementado ainda** (não pedido, fica pra depois se fizer falta): histórico de
ativações/falhas, fotos automáticas, pontos customizados — isso existe em Bombas e pode ser
replicado quando fizer sentido pro Gerador também. **Usuário/senha** (campos pedidos pelo
Rodrigo) foram adicionados em "Gerador → Configuração" mesmo o Modbus TCP não exigindo login —
ficam em branco, prontos pra preencher se descobrir que o controlador precisa disso por algum
outro caminho (ex.: tela web própria do ComAp).

## ~~Alertas insistentes com prioridade, via Telegram (+ ligação telefônica)~~ — feito pra todos os módulos
Generalizado pra cobrir rede, interfone, acesso (porteiro offline + força bruta) e gerador
(falha), além de bombas (que já tinha desde a fase 1). O que foi implementado:
- Bot do Telegram de verdade, configurado em Configurações → aba **Alertas** como um
  assistente de 4 passos, cada um virando um ✅ persistente (sobrevive a recarregar a página —
  antes só tinha toast, que passa e não deixa rastro, gerando a reclamação "não aparece nada
  quando eu clico"): 1) salvar/testar o token; 2) ligar o webhook ao Portal (mostra a URL
  configurada); 3) achar o chat — **automático**: manda qualquer mensagem pro bot no Telegram e
  o Portal captura o chat ID sozinho (webhook já ativo detecta e confirma de volta no próprio
  chat), sem precisar mais copiar nada do `getUpdates` na mão; 4) ativar + intervalo de
  insistência.
- Checkbox **"Prioridade"** de TODOS os módulos (Bombas, Gerador, cada porteiro/portão de
  Acesso, Rede/Interfone/força bruta) juntos numa lista só, em Configurações → Alertas →
  "Prioridade dos alarmes" — pedido do Rodrigo pra não precisar abrir a tela de cada módulo;
  cada checkbox salva na hora, sem botão "Salvar" geral (um erro num módulo não derruba o que
  já salvou nos outros).
- A própria tela de Configurações foi dividida em **abas** (Geral / Segurança / Alertas /
  Integrações) — era um empilhado de 9 cards numa rolagem só, confuso de achar onde estava
  cada coisa.
- Mensagem é mandada uma vez quando o alarme dispara (sempre, prioridade ou não); se for
  prioridade, **reenvia a cada X tempo** (configurável: 5min/15min/30min/1h/2h) até resolver
  ou ser reconhecido. Rede/Interfone usam a mesma contagem de offline já mostrada na Início;
  Acesso é um alarme por equipamento (sobrevive a renomear o porteiro); força bruta manda uma
  mensagem avulsa (é um evento, não um sinal contínuo — não insiste).
- Cada mensagem de alarme (exceto força bruta) já vem com **dois botões** ("✅ Visto" e "🔧 Em
  manutenção") — tocar um deles reconhece SÓ aquele alarme específico (via `callback_data`),
  parando de insistir nesse sem mexer nos outros alarmes ativos. Digitar qualquer mensagem
  solta no chat (sem tocar botão) continua reconhecendo todos os alarmes ativos de uma vez,
  como fallback. A confirmação de "reconhecido" mostra o nome bonito do alarme (ex.: "Gerador:
  falha ativa", "Acesso: porteiro 'Garagem' offline") pra QUALQUER módulo — o nome é guardado
  junto com o estado no momento em que o alarme dispara, não reconstruído só pros 7 de Bombas
  como na primeira versão.
- Endpoint do webhook (`POST /api/telegram/webhook/<secret>`) é público (o Telegram chama,
  não um usuário logado) mas protegido por um segredo aleatório na própria URL, não por JWT.
- **Ligação telefônica (Twilio)**: infraestrutura completa pronta em Configurações → "Ligação
  telefônica (Twilio)" — Account SID, Auth Token, número de origem, números de destino,
  "ligar depois de X sem reconhecer" (escalonamento, só pros alarmes de prioridade) e URL
  pública do Portal. Liga pros números cadastrados automaticamente quando um alarme de
  prioridade passa do tempo configurado sem ninguém reconhecer no Telegram — uma vez só por
  episódio do alarme. **Atender a ligação já conta como reconhecimento** (preenchendo a URL
  pública): o Twilio avisa o Portal via `POST /api/twilio/status/<secret>` quando a chamada é
  atendida, e isso reconhece o alarme igual tocar "Visto" no Telegram, sem precisar fazer mais
  nada por voz — mesmo esquema de segredo na URL do webhook do Telegram. **Mas não dá pra
  testar nem funcionar de verdade sem uma conta Twilio real**: ninguém criou a conta ainda, e eu
  não posso inventar Account SID/Auth Token/número — são credenciais de um serviço pago de
  terceiro, diferente do Modbus (que não precisa de nada). Falta: criar a conta em twilio.com
  (ou escolher outro provedor — cotar preço antes), comprar um número, e preencher os campos; o
  botão "Testar conta" confere as credenciais sem custo (sem ligar), antes de confiar que vai
  funcionar de verdade.
- Lista de equipamentos (Acesso → Equipamentos) mostra um badge "prioridade" no card de quem
  está marcado, pra não precisar abrir o formulário de editar pra saber quem tem a opção
  ligada.
- Três botões em toda mensagem de alarme de prioridade: **"✅ Resolvido"** reconhece de vez (só
  dispara de novo numa falha nova); **"🔧 Em manutenção"** e **"🚗 Já estou indo"** só ADIAM —
  cada um com sua própria duração configurável (Configurações → Alertas: manutenção até 24h,
  "já estou indo" até 1h) — se não resolver até lá, a insistência volta sozinha, sem precisar
  de ação extra pra "destravar".
- **Rede por equipamento, não o módulo inteiro**: lendo o código do painel de Rede
  (Debian_dashboard), achei que ele já tem um campo "favorito" por equipamento (usado hoje só
  como estrela na listagem de lá) — a tela de Prioridades do Portal lista só os equipamentos JÁ
  favoritados no painel de Rede, e deixa marcar quais desses também insistem via Telegram aqui.
  Resolve o medo do Rodrigo de "500 avisos" se vários equipamentos caírem junto: só os que ele
  escolheu (favoritar lá + marcar prioridade aqui) geram alarme. O alarme agregado antigo
  ("Rede — N offline") foi removido. **Interfone continua agregado** — esse painel
  (FreePBX_Asterisk) ainda não tem campo de favorito; o Rodrigo disse que vai adicionar, e aí o
  Portal pode ser estendido do mesmo jeito (`externalDeviceService.js` já está pronto pra isso).
  A tela agora também mostra quantos equipamentos o painel devolveu e quantos estão favoritados
  (diagnóstico, pra não ficar adivinhando se a lista vazia é "gateway não respondeu" ou
  "nenhum favoritado").

## ~~Logs/auditoria de tudo~~ — feito
Pedido do Rodrigo: "relatório de tudo" (bomba ligou/desligou, gerador em falha, alarme
disparado/reconhecido, força bruta), baixável por período, só pra quem o dono liberar. Nova
aba "Sistema" em Auditoria, com seletor de data (de/até, padrão últimos 30 dias) e "Exportar
CSV" igual as outras abas. Nova permissão **`auditoria.ver`** (Usuários → permissões) — igual
`usuarios.*`, dá pro dono liberar alguém específico sem virar dono. Cobre hoje: todo o ciclo de
vida de QUALQUER alarme (disparou/insistiu/foi adiado/foi resolvido — Bombas, Gerador, Acesso,
Rede, Interfone, força bruta, pelo botão, pelo chat ou por telefone), liga/desliga de cada sinal
de Bombas, entrada/saída de falha do Gerador, login e abertura de porteiro (que já tinham tabela
própria, só foram unidos na mesma tela). **Não cobre ainda** (não pedido com esse nível de
detalhe, fica pra depois se fizer falta): cadastro/edição/exclusão de usuário, equipamento ou
morador — essas ações continuam só no banco, sem linha na Auditoria.

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

## Abrir portão/porteiro por voz (OK Google / Hey Siri)
Pedido do Rodrigo: abrir qualquer porta/portão que ele escolher só falando "OK Google" ou "Hey
Siri", sem abrir o Portal. Caminho mais realista pros dois lados é um webhook próprio (token
fixo na URL, um por equipamento+usuário — mesmo esquema já usado no webhook do Telegram/Twilio,
não JWT, porque o assistente de voz não loga) que chama a abertura real (mesma rota que o botão
"Abrir" já usa) e grava em Auditoria → Sistema quem abriu por voz:
- **Siri**: direto no app Atalhos (Shortcuts) do iPhone, sem precisar de nada novo do lado do
  Portal além do webhook — cria um atalho "Buscar conteúdo da URL" apontando pro token daquele
  equipamento, dá um nome, e "Hey Siri, abrir portão" já funciona. Mais simples dos dois.
- **Google**: integração "smart home" oficial (Actions on Google) é pesada pra esse caso (OAuth,
  catálogo de dispositivo, revisão do Google). Caminho mais direto é IFTTT: applet "Google
  Assistant" (frase de disparo) → "Webhooks" (chama a URL do Portal) — sem precisar publicar
  nada, só configurar no app do IFTTT.
- Cada token só abre UM equipamento especifico pra UM usuário (reaproveita a permissão
  `device_open_permissions` que já existe) — nunca um token genérico "abre qualquer coisa".
Não começado ainda — fica pra quando o Rodrigo quiser escolher por onde começar (Siri é o mais
rápido de entregar).
