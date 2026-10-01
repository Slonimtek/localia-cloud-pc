// Localía · proveedores de máquinas. El portal habla siempre con la misma interfaz y acá se decide
// si la PC es una instancia de EC2 (AWS) o un servidor de Hetzner Cloud. Se elige con CLOUD=aws|hetzner.
// Estados normalizados (los de EC2): pending · running · stopping · stopped · terminated.
'use strict';

// ---------- AWS (EC2) ----------
function aws(ENV) {
  const { EC2Client, RunInstancesCommand, DescribeInstancesCommand, StartInstancesCommand, StopInstancesCommand,
    RebootInstancesCommand, TerminateInstancesCommand } = require('@aws-sdk/client-ec2');
  const clients = {};
  const ec2 = (region = 'us-east-1') => clients[region] || (clients[region] = new EC2Client({ region }));
  return {
    name: 'aws', label: 'AWS', place: 'Virginia', billsWhenOff: false,
    tiers: {
      mini: { name: 'Mini', type: 't4g.medium', cpu: 2, ram: 4, disk: 32 },
      standard: { name: 'Standard', type: 't4g.xlarge', cpu: 4, ram: 16, disk: 64 },
      gold: { name: 'Gold', type: 't4g.2xlarge', cpu: 8, ram: 32, disk: 128 },
    },
    async describe(ids, region) {
      if (!ids.length) return {};
      const r = await ec2(region).send(new DescribeInstancesCommand({ InstanceIds: ids })).catch(() => null);
      const m = {}; (r && r.Reservations || []).forEach(rv => rv.Instances.forEach(i => { m[i.InstanceId] = { state: i.State.Name, privateIp: i.PrivateIpAddress, type: i.InstanceType, launched: i.LaunchTime }; }));
      return m;
    },
    async create({ id, tier, userData }) {
      const tags = [{ Key: 'app', Value: 'localia-pc' }, { Key: 'Name', Value: 'localia-pc-' + id }, { Key: 'pcid', Value: id }];
      const r = await ec2().send(new RunInstancesCommand({
        ImageId: ENV.AMI_PC, InstanceType: tier.type, MinCount: 1, MaxCount: 1, SubnetId: ENV.SUBNET_PC, SecurityGroupIds: [ENV.SG_PC], KeyName: ENV.KEY_NAME,
        UserData: Buffer.from(userData).toString('base64'), MetadataOptions: { HttpTokens: 'required' },
        BlockDeviceMappings: [{ DeviceName: '/dev/xvda', Ebs: { VolumeSize: tier.disk, VolumeType: 'gp3', DeleteOnTermination: true } }],
        TagSpecifications: [{ ResourceType: 'instance', Tags: tags }, { ResourceType: 'volume', Tags: tags }],
      }));
      const i = r.Instances[0]; return { instanceId: i.InstanceId, privateIp: i.PrivateIpAddress, state: 'pending' };
    },
    start: (id, region) => ec2(region).send(new StartInstancesCommand({ InstanceIds: [id] })),
    stop: (id, region) => ec2(region).send(new StopInstancesCommand({ InstanceIds: [id] })),
    reboot: (id, region) => ec2(region).send(new RebootInstancesCommand({ InstanceIds: [id] })),
    destroy: (id, region) => ec2(region).send(new TerminateInstancesCommand({ InstanceIds: [id] })),
  };
}

// ---------- Hetzner Cloud ----------
// Las PCs no tienen IP pública: solo la red privada (HCLOUD_NETWORK), cuya ruta por defecto apunta al gateway.
// Ojo: una máquina apagada se sigue cobrando; por eso acá no conviene el apagado automático (IDLE_STOP_MIN=0).
const HZ_STATE = { running: 'running', off: 'stopped', initializing: 'pending', starting: 'pending', stopping: 'stopping',
  deleting: 'shutting-down', migrating: 'pending', rebuilding: 'pending', unknown: 'unknown' };
function hetzner(ENV) {
  const API = ENV.HCLOUD_API || 'https://api.hetzner.cloud/v1';
  async function call(method, p, body) {
    const r = await fetch(API + p, { method, headers: { Authorization: 'Bearer ' + ENV.HCLOUD_TOKEN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && r.status !== 404) throw new Error(`Hetzner ${method} ${p}: ${r.status} ${(j.error && j.error.message) || ''}`.trim());
    return { status: r.status, json: j };
  }
  const privIp = s => { const n = (s.private_net || []).find(x => String(x.network) === String(ENV.HCLOUD_NETWORK)) || (s.private_net || [])[0]; return n ? n.ip : undefined; };
  const action = (id, a) => call('POST', `/servers/${id}/actions/${a}`);
  return {
    name: 'hetzner', label: 'Hetzner', place: ENV.HCLOUD_PLACE || 'Alemania', billsWhenOff: true,
    tiers: {   // ARM (Ampere), la misma arquitectura que la imagen actual; el disco viene con el tamaño
      mini: { name: 'Mini', type: ENV.HCLOUD_TYPE_MINI || 'cax11', cpu: 2, ram: 4, disk: 40 },
      standard: { name: 'Standard', type: ENV.HCLOUD_TYPE_STANDARD || 'cax31', cpu: 8, ram: 16, disk: 160 },
      gold: { name: 'Gold', type: ENV.HCLOUD_TYPE_GOLD || 'cax41', cpu: 16, ram: 32, disk: 320 },
    },
    async describe(ids) {
      const m = {};
      await Promise.all(ids.map(async id => {
        const r = await call('GET', `/servers/${id}`).catch(() => null);
        if (!r) return; if (r.status === 404) { m[id] = { state: 'terminated' }; return; }
        const s = r.json.server; m[id] = { state: HZ_STATE[s.status] || 'unknown', privateIp: privIp(s), type: s.server_type && s.server_type.name, launched: s.created };
      }));
      return m;
    },
    async create({ id, tier, userData }) {
      const r = await call('POST', '/servers', {
        name: 'localia-pc-' + id, server_type: tier.type, image: +ENV.HCLOUD_IMAGE || ENV.HCLOUD_IMAGE, location: ENV.HCLOUD_LOCATION || 'fsn1',
        networks: [+ENV.HCLOUD_NETWORK], public_net: { enable_ipv4: false, enable_ipv6: false },
        ssh_keys: ENV.HCLOUD_SSH_KEY ? [ENV.HCLOUD_SSH_KEY] : undefined, user_data: userData, start_after_create: true,
        labels: { app: 'localia-pc', pcid: id },
      });
      if (r.status === 404) throw new Error('Hetzner: no existe la imagen, la red o el tipo de máquina configurado');
      const s = r.json.server; return { instanceId: String(s.id), privateIp: privIp(s), state: 'pending' };   // la IP privada puede llegar unos segundos después (describe)
    },
    start: id => action(id, 'poweron'),
    stop: id => action(id, 'shutdown'),   // apagado ordenado; los archivos quedan
    reboot: id => action(id, 'reboot'),
    destroy: id => call('DELETE', `/servers/${id}`),
  };
}

module.exports = ENV => {
  const name = String(ENV.CLOUD || 'aws').toLowerCase();
  if (name === 'hetzner') { if (!ENV.HCLOUD_TOKEN || !ENV.HCLOUD_IMAGE || !ENV.HCLOUD_NETWORK) throw new Error('CLOUD=hetzner necesita HCLOUD_TOKEN, HCLOUD_IMAGE y HCLOUD_NETWORK en portal.env'); return hetzner(ENV); }
  if (name !== 'aws') throw new Error('CLOUD desconocido: ' + name);
  return aws(ENV);
};

module.exports.aws = aws;   // las salidas que son máquinas de AWS se siguen manejando por acá
