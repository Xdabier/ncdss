import { networkInterfaces } from 'os';

export function getLocalIP(): string {
  const nets = networkInterfaces();

  // Pattern to identify virtual network adapters (Hyper-V, VMware, VirtualBox, Docker, WSL)
  const virtualAdapterPattern = /vEthernet|VMware|VirtualBox|Docker|WSL|Hyper-V|vnic/i;

  // First pass: look for real adapters (WiFi, Ethernet) that start with 192.168 or 10.
  const candidates: { name: string; address: string; isVirtual: boolean }[] = [];

  for (const name of Object.keys(nets)) {
    const interfaces = nets[name];
    if (!interfaces) continue;

    for (const net of interfaces) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        const isVirtual = virtualAdapterPattern.test(name);
        candidates.push({ name, address: net.address, isVirtual });
      }
    }
  }

  // Prefer non-virtual adapters
  const realAdapters = candidates.filter(c => !c.isVirtual);
  if (realAdapters.length > 0) {
    // Prefer 192.168.x.x or 10.x.x.x addresses (common LAN ranges)
    const lanAdapter = realAdapters.find(c =>
      c.address.startsWith('192.168.') || c.address.startsWith('10.')
    );
    return lanAdapter?.address || realAdapters[0].address;
  }

  // Fall back to virtual adapters if no real ones found
  if (candidates.length > 0) {
    return candidates[0].address;
  }

  return '127.0.0.1';
}
