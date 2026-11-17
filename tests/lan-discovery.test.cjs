'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Discovery = require('../tools/lan-discovery.cjs');

const nonce = '0123456789abcdef0123456789abcdef';
const privateInterfaces = {
  wifi: [{ family: 'IPv4', address: '192.168.20.8', netmask: '255.255.255.0', internal: false }],
  vpn: [{ family: 'IPv4', address: '10.8.0.2', netmask: '255.255.255.0', internal: false }],
  public: [{ family: 'IPv4', address: '8.8.8.8', netmask: '255.255.255.0', internal: false }],
  loopback: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }]
};

test('discovery broadcasts only to active private IPv4 subnet broadcasts', () => {
  assert.deepEqual(Discovery.privateBroadcastTargets(privateInterfaces).sort(), ['10.8.0.255', '192.168.20.255']);
  assert.equal(Discovery.validNetmask('255.255.255.0'), true);
  assert.equal(Discovery.validNetmask('255.0.255.0'), false);
  assert.equal(Discovery.validNetmask('0.0.0.0'), false);
  assert.equal(Discovery.isPrivateIPv4('192.168.20.8'), true);
  // Range membership does not also assert that an address is a usable host address.
  assert.equal(Discovery.isPrivateIPv4('192.168.20.255'), true);
  assert.equal(Discovery.isPrivateIPv4('8.8.8.8'), false);
});

test('probe and offer validation rejects public sources, stale nonces, wrong versions, and unsafe ports', () => {
  const request = Discovery.makeProbe(nonce);
  assert.deepEqual(Discovery.parseProbe(request, '192.168.20.12'), { nonce });
  assert.equal(Discovery.parseProbe(request, '8.8.8.8'), null);
  assert.equal(Discovery.parseProbe(Buffer.from('{'), '192.168.20.12'), null);
  const offer = Discovery.makeOffer({ id: 'abcdef0123456789abcdef01', players: 2, maxPlayers: 10,
    phase: 'lobby', mode: 'versus', map: 'courtyard' }, nonce);
  assert.equal(Discovery.parseOffer(offer, '192.168.20.8', nonce, 1000).players, 2);
  assert.equal(Discovery.parseOffer(offer, '192.168.20.8', 'ffffffffffffffffffffffff', 1000), null);
  const wrongPort = Buffer.from(JSON.stringify({ ...JSON.parse(offer.toString('utf8')), port: 8081 }));
  assert.equal(Discovery.parseOffer(wrongPort, '192.168.20.8', nonce, 1000), null);
});

test('host discovery replies to a private probe and rate-limits repeat probes from one source', () => {
  class FakeSocket extends EventEmitter {
    constructor() { super(); this.sent = []; }
    bind(port, address, ready) { this.port = port; this.address = address; ready(); }
    send(packet, offset, length, port, address) { this.sent.push({ packet: Buffer.from(packet.subarray(offset, offset + length)), port, address }); }
    close() {}
  }
  const socket = new FakeSocket();
  let now = 1000;
  const host = Discovery.createLanDiscoveryHost({
    interfaces: () => privateInterfaces,
    socketFactory: () => socket,
    now: () => now,
    info: () => ({ id: 'abcdef0123456789abcdef01', port: 8080, players: 1, maxPlayers: 10,
      phase: 'lobby', mode: 'versus', map: 'courtyard' })
  });
  host.start();
  assert.equal(socket.port, Discovery.DISCOVERY_PORT);
  socket.emit('message', Discovery.makeProbe(nonce), { address: '192.168.20.12', port: 53000 });
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].address, '192.168.20.12');
  assert.equal(socket.sent[0].port, 53000);
  const reply = Discovery.parseOffer(socket.sent[0].packet, '192.168.20.8', nonce, now);
  assert.equal(reply.id, 'abcdef0123456789abcdef01');
  socket.emit('message', Discovery.makeProbe(nonce), { address: '192.168.20.12', port: 53000 });
  assert.equal(socket.sent.length, 1, 'duplicate source probes inside 300 ms are suppressed');
  now += 301;
  socket.emit('message', Discovery.makeProbe(nonce), { address: '192.168.20.12', port: 53000 });
  assert.equal(socket.sent.length, 2);
  socket.emit('message', Discovery.makeProbe(nonce), { address: '8.8.8.8', port: 53000 });
  assert.equal(socket.sent.length, 2, 'public source packets are ignored');
  host.close();
});

test('discovery client deduplicates instances, verifies host protocol, and drops stale results', async () => {
  class FakeSocket extends EventEmitter {
    bind(port, address, ready) { ready(); }
    setBroadcast() {}
    send(packet, offset, length, port, address) {
      const query = JSON.parse(packet.toString('utf8'));
      const reply = Discovery.makeOffer({ id: 'abcdef0123456789abcdef01', players: 3, maxPlayers: 10,
        phase: 'live', mode: 'outbreak', map: 'courtyard' }, query.nonce);
      queueMicrotask(() => {
        this.emit('message', reply, { address: '192.168.20.8', port: Discovery.DISCOVERY_PORT });
        this.emit('message', reply, { address: '192.168.20.8', port: Discovery.DISCOVERY_PORT });
      });
    }
    close() {}
  }
  const client = Discovery.createLanDiscoveryClient({
    interfaces: () => privateInterfaces,
    socketFactory: () => new FakeSocket(),
    now: () => 2000,
    scanMs: 250,
    verify: async host => ({ ...host, verified: true, players: 3, maxPlayers: 10 })
  });
  const result = await client.scan();
  assert.equal(result.ok, true);
  assert.equal(result.hosts.length, 1);
  assert.equal(result.hosts[0].verified, true);
  assert.equal(result.hosts[0].phase, 'live');
  assert.equal(result.hosts[0].players, 3);
});

test('host age and duplicate addresses are bounded', () => {
  const base = { id: 'host-identity-123456', address: '192.168.20.8', port: 8080, seenAt: 1000 };
  const hosts = Discovery.dedupeHosts([{ ...base, players: 1 }, { ...base, players: 2, seenAt: 1200 },
    { ...base, id: 'old-host-identity-1', seenAt: 100 }], 1300, 1000);
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].players, 2);
});

