import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { api } from '../api/client.js';
import { useToast } from '../hooks/useToast.jsx';
import { useBranding } from '../hooks/useBranding.js';

const GATEWAYS = [
  {
    key: 'rede',
    title: 'Painel de Rede',
    hint: 'Backend do Debian_dashboard, acessível a partir deste servidor (ex.: http://127.0.0.1:3002).',
  },
  {
    key: 'interfone',
    title: 'Painel de Interfone',
    hint: 'Backend do FreePBX_Asterisk, acessível a partir deste servidor (ex.: http://127.0.0.1:3001).',
  },
];

function GatewayCard({ meta, value, onSave }) {
  const [baseUrl, setBaseUrl] = useState(value?.baseUrl || '');
  const [publicUrl, setPublicUrl] = useState(value?.publicUrl || '');
  const [serviceUsername, setServiceUsername] = useState(value?.serviceUsername || '');
  const [servicePassword, setServicePassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  async function doSave() {
    await onSave(meta.key, { baseUrl, publicUrl, serviceUsername, servicePassword: servicePassword || undefined });
    setServicePassword('');
  }

  async function handleSave() {
    setSaving(true);
    try {
      await doSave();
      toast(`Gateway "${meta.title}" salvo.`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // Sempre salva antes de testar — testar contra o que já está salvo (e não
  // o que está digitado na tela) confundia: uma senha nova digitada mas
  // ainda não salva fazia o teste "passar" usando a senha antiga.
  async function handleTest() {
    setTesting(true);
    try {
      await doSave();
      await api.settings.testGateway(meta.key);
      toast(`Conexão com "${meta.title}" funcionando — login OK.`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  }

  const canTest = baseUrl && serviceUsername;

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{meta.title}</div>
          <div className="field-hint">{meta.hint}</div>
        </div>
        {value?.configured ? (
          <span className="badge badge-success">
            <span className="badge-dot" /> configurado
          </span>
        ) : (
          <span className="badge badge-warning">
            <span className="badge-dot" /> pendente
          </span>
        )}
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="field-label">Endereço interno da API</label>
          <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:3002" />
        </div>
        <div className="field">
          <label className="field-label">URL pública (link do botão "Abrir painel")</label>
          <input className="input" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder={`https://${meta.key}.seudominio.com`} />
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="field-label">Usuário de serviço</label>
          <input className="input" value={serviceUsername} onChange={(e) => setServiceUsername(e.target.value)} placeholder="portal-service" />
        </div>
        <div className="field">
          <label className="field-label">Senha de serviço</label>
          <input
            className="input"
            type="password"
            value={servicePassword}
            onChange={(e) => setServicePassword(e.target.value)}
            placeholder={value?.configured ? 'deixe em branco para manter' : ''}
          />
        </div>
      </div>
      <span className="field-hint">
        Crie uma conta comum nesse painel (pela tela de Usuários dele) e informe aqui — usuário e senha
        de serviço, separados da sua conta pessoal nele.
      </span>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Salvar'}
        </button>
        <button className="btn btn-secondary" onClick={handleTest} disabled={testing || saving || !canTest}>
          {testing ? <span className="spinner spinner-dark" /> : 'Testar conexão'}
        </button>
      </div>
      {!canTest && <span className="field-hint">Preencha o endereço e o usuário de serviço para poder testar.</span>}
      <span className="field-hint">"Testar conexão" salva os campos preenchidos e tenta logar de verdade — não precisa clicar em "Salvar" antes.</span>
    </div>
  );
}

function BrandingCard() {
  const current = useBranding();
  const [name, setName] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [accentColor, setAccentColor] = useState('#8b5cf6');
  const [shortName, setShortName] = useState('');
  const [pwaIconFile, setPwaIconFile] = useState(null);
  const [pwaIconPreviewUrl, setPwaIconPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => setName(current.name), [current.name]);
  useEffect(() => setAccentColor(current.accentColor || '#8b5cf6'), [current.accentColor]);
  useEffect(() => setShortName(current.shortName || ''), [current.shortName]);

  function handleFile(e) {
    const file = e.target.files?.[0] || null;
    setLogoFile(file);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function handlePwaIconFile(e) {
    const file = e.target.files?.[0] || null;
    setPwaIconFile(file);
    setPwaIconPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.branding.save({ name, logoFile, accentColor, shortName, pwaIconFile });
      toast('Marca atualizada.');
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const shownLogo = previewUrl || current.logoUrl;

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Marca</div>
        <div className="field-hint">Nome e logo mostrados na tela de login e na barra lateral — troque pela marca do seu cliente.</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            background: shownLogo ? 'none' : 'linear-gradient(135deg, var(--accent-400), var(--accent-600))',
            border: '1px solid var(--border-subtle)',
            color: 'white',
            fontWeight: 800,
            fontSize: 20,
            fontFamily: 'var(--font-display)',
          }}
        >
          {shownLogo ? <img src={shownLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : name.charAt(0).toUpperCase()}
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">Logo (opcional)</label>
          <input className="input" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleFile} />
          <span className="field-hint">PNG, JPG, SVG ou WEBP, até 2MB. Sem logo, mostra a inicial do nome.</span>
        </div>
      </div>

      <div className="field">
        <label className="field-label">Nome do sistema</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Portal" />
      </div>

      <div className="field">
        <label className="field-label">Cor de destaque (botões, menu ativo)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            style={{ width: 44, height: 36, padding: 2, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'none' }}
          />
          <input className="input" style={{ maxWidth: 140 }} value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAccentColor('#8b5cf6')}>
            Padrão
          </button>
        </div>
        <span className="field-hint">Escolha uma cor que combine com sua logo.</span>
      </div>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>PWA (Adicionar à tela inicial)</div>
        <div className="field-hint" style={{ marginBottom: 12 }}>
          Como o Portal aparece quando instalado no celular/PC. O nome e a cor de destaque acima já valem
          pra isso — os dois campos abaixo são só pro ícone/rótulo da instalação.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              flexShrink: 0,
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface-hover)',
            }}
          >
            <img
              src={pwaIconPreviewUrl || current.pwaIconUrl || '/icon-mark.svg'}
              alt="Ícone do PWA"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label">Ícone do app (opcional)</label>
            <input className="input" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handlePwaIconFile} />
            <span className="field-hint">
              Precisa ser QUADRADO (ex.: 512x512) — diferente do logo acima, que pode ter qualquer proporção.
              Sem um ícone próprio, usa o logo (pode ficar cortado/espremido se não for quadrado) e, sem
              nenhum dos dois, um ícone padrão.
            </span>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Nome curto (rótulo embaixo do ícone na tela inicial)</label>
          <input
            className="input"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder={name || 'Portal'}
            maxLength={30}
          />
          <span className="field-hint">Opcional — sem preencher, usa o nome do sistema (cortado se for muito longo).</span>
        </div>
      </div>

      <div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <span className="spinner" /> : 'Salvar marca'}
        </button>
      </div>
    </div>
  );
}

function SecurityCard() {
  const [maxLoginFailures, setMaxLoginFailures] = useState(10);
  const [loginWindowMinutes, setLoginWindowMinutes] = useState(15);
  const [sessionHours, setSessionHours] = useState(8);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.settings.getSecurity().then((s) => {
      setMaxLoginFailures(s.maxLoginFailures);
      setLoginWindowMinutes(s.loginWindowMinutes);
      setSessionHours(s.sessionHours);
      setLoaded(true);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.saveSecurity({
        maxLoginFailures: Number(maxLoginFailures),
        loginWindowMinutes: Number(loginWindowMinutes),
        sessionHours: Number(sessionHours),
      });
      toast('Segurança atualizada.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Segurança</div>
        <div className="field-hint">Regras de login válidas para todos os usuários do Portal.</div>
      </div>

      {!loaded ? (
        <div className="skeleton" style={{ height: 90, borderRadius: 12 }} />
      ) : (
        <>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Tentativas de login antes de bloquear</label>
              <input
                className="input"
                type="number"
                min={3}
                max={50}
                value={maxLoginFailures}
                onChange={(e) => setMaxLoginFailures(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">Janela de bloqueio (minutos)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={120}
                value={loginWindowMinutes}
                onChange={(e) => setLoginWindowMinutes(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Duração da sessão (horas)</label>
            <input
              className="input"
              type="number"
              min={1}
              max={720}
              value={sessionHours}
              onChange={(e) => setSessionHours(e.target.value)}
              style={{ maxWidth: 140 }}
            />
            <span className="field-hint">
              Depois de logar, a sessão expira sozinha após esse tempo. Só vale pra quem logar de novo — quem já
              está logado continua com o prazo antigo até sair e entrar outra vez.
            </span>
          </div>
          <div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Salvar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const SENSITIVITY_OPTIONS = [
  { value: 'baixa', label: 'Baixa — só acusa desvios bem grandes' },
  { value: 'media', label: 'Média (padrão)' },
  { value: 'alta', label: 'Alta — acusa desvios menores' },
];

function AnomalyCard() {
  const [redeSensitivity, setRedeSensitivity] = useState('media');
  const [interfoneSensitivity, setInterfoneSensitivity] = useState('media');
  const [acessoSensitivity, setAcessoSensitivity] = useState('media');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.settings.getAnomaly().then((s) => {
      setRedeSensitivity(s.redeSensitivity);
      setInterfoneSensitivity(s.interfoneSensitivity);
      setAcessoSensitivity(s.acessoSensitivity);
      setLoaded(true);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.saveAnomaly({ redeSensitivity, interfoneSensitivity, acessoSensitivity });
      toast('Sensibilidade de anomalia atualizada.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Sensibilidade de anomalia</div>
        <div className="field-hint">
          Controla quando os avisos de "fora do normal" aparecem em cada módulo (pico de latência na Rede, chamadas
          perdidas em excesso no Interfone, horário incomum de abertura no Acesso).
        </div>
      </div>

      {!loaded ? (
        <div className="skeleton" style={{ height: 90, borderRadius: 12 }} />
      ) : (
        <>
          <div className="field">
            <label className="field-label">Rede — pico de latência</label>
            <select className="select" value={redeSensitivity} onChange={(e) => setRedeSensitivity(e.target.value)}>
              {SENSITIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Interfone — chamadas perdidas</label>
            <select className="select" value={interfoneSensitivity} onChange={(e) => setInterfoneSensitivity(e.target.value)}>
              {SENSITIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Acesso — horário incomum de abertura</label>
            <select className="select" value={acessoSensitivity} onChange={(e) => setAcessoSensitivity(e.target.value)}>
              {SENSITIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="field-hint">
              "Alta" exige menos aberturas registradas antes de começar a avaliar horário incomum — mais rápido pra
              avisar, mas com menos histórico pra confirmar o que é "normal".
            </span>
          </div>
          <div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Salvar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RetentionCard() {
  const [auditRetentionDays, setAuditRetentionDays] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.settings.getRetention().then((s) => {
      setAuditRetentionDays(s.auditRetentionDays);
      setLoaded(true);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.saveRetention({ auditRetentionDays: Number(auditRetentionDays) });
      toast('Retenção de auditoria atualizada.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Retenção do log de auditoria</div>
        <div className="field-hint">
          Por quantos dias manter o histórico de logins e aberturas de porteiro (tela Auditoria) antes de apagar
          sozinho. Use 0 para nunca apagar automaticamente.
        </div>
      </div>

      {!loaded ? (
        <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
      ) : (
        <>
          <div className="field">
            <label className="field-label">Dias de retenção (0 = nunca apagar)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={3650}
              value={auditRetentionDays}
              onChange={(e) => setAuditRetentionDays(e.target.value)}
              style={{ maxWidth: 140 }}
            />
          </div>
          <div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Salvar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PushSettingsCard() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.settings.getPush().then((s) => {
      setEnabled(s.enabled);
      setLoaded(true);
    });
  }, []);

  async function handleToggle() {
    setSaving(true);
    try {
      const s = await api.settings.savePush({ enabled: !enabled });
      setEnabled(s.enabled);
      toast(s.enabled ? 'Notificações push ativadas.' : 'Notificações push desativadas.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Notificações push</div>
        <div className="field-hint">
          Avisa os administradores (dono) no navegador quando um porteiro fica offline ou a trava de força bruta do
          login dispara. Desligada por padrão — cada administrador ainda precisa ativar em "Minha conta" no próprio
          navegador depois de ligar aqui. No iPhone só funciona se o Portal foi instalado como app (Adicionar à Tela
          de Início); o Safari não entrega push de aba aberta.
        </div>
      </div>

      {!loaded ? (
        <div className="skeleton" style={{ height: 40, borderRadius: 12 }} />
      ) : (
        <div>
          <button className="btn btn-primary" onClick={handleToggle} disabled={saving}>
            {saving ? <span className="spinner" /> : enabled ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [gateways, setGateways] = useState(null);

  function reload() {
    api.settings.getGateways().then(setGateways);
  }
  useEffect(reload, []);

  async function handleSaveGateway(key, payload) {
    await api.settings.saveGateway(key, payload);
    reload();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Configurações</h1>
          <p>Conecte o Portal aos painéis existentes e ajuste as preferências gerais.</p>
        </div>
      </div>

      <BrandingCard />

      <SecurityCard />

      <AnomalyCard />

      <RetentionCard />

      <PushSettingsCard />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {gateways === null ? (
          <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />
        ) : (
          GATEWAYS.map((g) => <GatewayCard key={g.key} meta={g} value={gateways[g.key]} onSave={handleSaveGateway} />)
        )}
      </div>

      <div className="surface" style={{ padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <Icon name="key" size={20} style={{ color: 'var(--accent-400)', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>O que cada campo faz hoje:</strong> o <strong>Rede</strong>{' '}
          já é nativo do Portal — assim que <strong>endereço interno da API</strong> e{' '}
          <strong>conta de serviço</strong> estiverem configurados e testados, o botão "Abrir painel" mostra as telas
          de monitoramento direto aqui dentro, com o visual do Portal (sem link público nem build separado). Já o{' '}
          <strong>Interfone</strong> ainda funciona como painel embutido: com o servidor tendo o build embutido
          configurado (<code>GATEWAY_*_FRONTEND_DIST</code> no <code>.env</code>) ele abre dentro do Portal; sem isso,
          abre o painel original numa aba nova usando a <strong>URL pública</strong>. Em ambos, "Testar conexão"
          confirma que a conta de serviço realmente consegue logar no painel.
        </div>
      </div>
    </>
  );
}
