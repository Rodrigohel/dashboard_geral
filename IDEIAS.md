# Ideias para mais pra frente

Backlog de ideias discutidas mas não implementadas — não é compromisso de fazer, só pra não esquecer.

## ~~Notificações push (PWA)~~ — feito (parcial)
Implementado: liga/desliga em Configurações (dono), cada administrador ativa depois no
próprio navegador em "Minha conta". Avisa: porteiro ficou offline (transição, não repete
enquanto continuar caído) e trava de força bruta disparada (com cooldown de 15min por
usuário+IP pra não virar spam). Só manda pra quem tem papel "owner" — mesmo público de
Auditoria/Saúde do servidor. NÃO incluído ainda: "alerta crítico de rede" (viria do painel
de Rede original via gateway, exigiria um poller novo do lado do servidor só pra isso — fica
pra depois se fizer falta). Limitação conhecida: no iPhone só funciona se o usuário instalou
de verdade ("Adicionar à Tela de Início"), Safari não manda push de aba aberta no navegador.

## Modo TV / painel de portaria
Tela cheia, sem menu, rotacionando sozinha entre status de rede/interfone/porteiros — pensada
pra ficar num monitor fixo na guarita/portaria. Mais rápido de fazer que o push, mas é mais
estético que funcional (não abre nenhuma informação nova).

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

## XPE 3200 — abrir porta às vezes volta HTML em vez de JSON
Diagnóstico melhorado (não resolvido): `accessControlClient.js` já documentava que o
`target/action` usado ("accessControl/openDoor") é uma tentativa embasada, herdada de um
modelo irmão mais antigo da Intelbras (API diferente) — nunca confirmada contra o hardware
real da XPE 3200. HTML de volta é sintoma mais coerente com "esse endpoint não existe pra
essa API JSON" do que com "API HTTP desligada" (que já tinha mensagem própria). O erro agora
diferencia os dois casos e cita o PDF oficial da Intelbras. Falta, pra resolver de verdade:
o PDF oficial "XPE3200_IP_FACE_Http_API_de_Integração.pdf" (confirmar o nome certo de
target/action) OU uma captura de tráfego de algum app que já abre a porta com sucesso nesse
mesmo modelo — sem isso, não dá pra trocar o nome sem chutar às cegas de novo.

## Segplace/Axiom Wifi — integração de portão
Travado até capturar o tráfego de rede do app deles abrindo o portão (ver o que a API
realmente espera — endpoint, autenticação, payload). Sem essa captura, qualquer tentativa
de integração seria um chute sem base nenhuma contra uma API totalmente desconhecida.

## Feed de reconhecimento facial ao vivo
HIPÓTESE, não confirmada: se a API dos porteiros (XPE3200/SS3532MF) expuser evento de
reconhecimento facial (não só abrir porta), dava pra mostrar um feed tipo "Fulano passou pela
portaria às 14:32" ao vivo no Portal. Precisa descobrir primeiro se o equipamento realmente
expõe esse evento via API — não é garantido.
