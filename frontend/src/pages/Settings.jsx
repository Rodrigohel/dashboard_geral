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
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => setName(current.name), [current.name]);

  function handleFile(e) {
    const file = e.target.files?.[0] || null;
    setLogoFile(file);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.branding.save({ name, logoFile });
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
            background: shownLogo ? 'var(--bg-surface)' : 'linear-gradient(135deg, var(--accent-500), var(--violet-500))',
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

      <div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <span className="spinner" /> : 'Salvar marca'}
        </button>
      </div>
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
