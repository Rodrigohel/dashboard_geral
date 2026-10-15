import { useEffect, useState } from 'react';
import DevicesList from './DevicesList.jsx';
import DeviceUsers from './DeviceUsers.jsx';

export default function AccessControl({ isOwner, can, initialDevice, onInitialDeviceHandled }) {
  const [openDevice, setOpenDevice] = useState(initialDevice || null);

  // Vem de fora (ex.: clicou num equipamento direto na tela Início) — abre
  // ele já na tela de usuários, sem precisar clicar de novo na lista.
  useEffect(() => {
    if (initialDevice) {
      setOpenDevice(initialDevice);
      onInitialDeviceHandled?.();
    }
  }, [initialDevice]);

  if (openDevice) {
    return <DeviceUsers device={openDevice} isOwner={isOwner} can={can} onBack={() => setOpenDevice(null)} />;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Controle de acesso</h1>
        </div>
      </div>
      <DevicesList isOwner={isOwner} can={can} onOpenDevice={setOpenDevice} />
    </>
  );
}
