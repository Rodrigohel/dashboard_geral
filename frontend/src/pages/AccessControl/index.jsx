import { useState } from 'react';
import DevicesList from './DevicesList.jsx';
import DeviceUsers from './DeviceUsers.jsx';

export default function AccessControl({ isOwner }) {
  const [openDevice, setOpenDevice] = useState(null);

  if (openDevice) {
    return <DeviceUsers device={openDevice} onBack={() => setOpenDevice(null)} />;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Controle de acesso</h1>
        </div>
      </div>
      <DevicesList isOwner={isOwner} onOpenDevice={setOpenDevice} />
    </>
  );
}
