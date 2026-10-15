# Casa de bombas — mapeamento LOGO → IHM (LB) → Modbus

O Portal lê a casa de bombas direto da IHM Weintek (servidor Modbus TCP/IP embutido
dela), não do Siemens LOGO — a IHM espelha os pontos do LOGO em registros `LB`
próprios via objetos "Data Transfer (Periodic)" configurados no EasyBuilder Pro.
Esse espelhamento é o que o Portal lê.

Mapeamento real confirmado na planilha de configuração do "Data Transfer" desta
instalação (Siemens LOGO → IHM "Bomba rebaixamento"):

| Sinal (LOGO)                    | Origem LOGO | Destino LB | Campo no Portal      |
|----------------------------------|-------------|------------|-----------------------|
| EMERGENCIA_ACIONADA              | I1          | LB00100    | `emergencia`           |
| PAINEL_BOMBAS_MANUAL             | I2          | LB00101    | `modoManual`           |
| ENTRADA_I3_IDENTIFICAR           | I3          | LB00102    | *(sem uso — entrada ainda não identificada pelo cliente)* |
| BOIA_NIVEL_MINIMO                | I4          | LB00103    | `nivelMinimo`          |
| BOIA_NIVEL_MEDIO                 | I5          | LB00104    | `nivelMedio`           |
| ALARME_BOIA_NIVEL_MAXIMO         | I6          | LB00105    | `nivelMaximo`          |
| ALARME_NIVEL_MAXIMO_SEGURANCA    | I7          | LB00106    | `nivelSeguranca`       |
| TERMICO_BOMBA_01                 | I8          | LB00107    | `termico1`             |
| TERMICO_BOMBA_02                 | I9          | LB00108    | `termico2`             |
| FALTA_FASE_REDE_ELETRICA         | I10         | LB00109    | `faltaFase`            |
| PAINEL_BOMBAS_DESLIGADO          | M1          | LB00110    | `painelDesligado`      |
| FALHA_BOIAS                      | M4          | LB00111    | `falhaBoias`           |
| LIGA_BOMBA_01                    | Q1          | LB00112    | `bomba1`               |
| LIGA_BOMBA_02                    | Q2          | LB00113    | `bomba2`               |
| SINALIZACAO_BOMBA_01_DO_DIA      | M5          | LB00114    | `bomba1DoDia`          |
| SINALIZACAO_BOMBA_02_DO_DIA      | M6          | LB00115    | `bomba2DoDia`          |

Todos cadastrados na tela Bombas → Configuração como **Bobina/Coil** (tipo padrão),
endereço = número do LB (ex.: LB00103 → endereço `103`).

**Não confirmado contra hardware real ainda**: o padrão assumido é que a IHM expõe
`LBn` como a bobina Modbus `n` diretamente (1:1), que é o comportamento documentado
da Weintek pro "MODBUS TCP/IP Server" — mas essa instalação específica nunca foi
testada ponta a ponta. Depois de configurar, confira na tela de status se os valores
batem com a realidade física (ex.: só a boia do nível mínimo isolada deveria mostrar
"sim" com o poço vazio). Se algum vier invertido ou sem sentido, o endereço real pode
ter um deslocamento diferente — ajustar aqui.
