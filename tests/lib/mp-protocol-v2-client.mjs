export const MP_V2_FEATURES = Object.freeze(['session-generation', 'life-epoch', 'action-seq']);
const SEQUENCED = new Set(['in', 'shot', 'rl', 'buy', 'ammo', 'team', 'map', 'cfg', 'start', 'endmatch', 'cosmetic', 'finish', 'finishes']);
const LIFE_SCOPED = new Set(['in', 'shot', 'rl', 'buy', 'ammo']);

export function protocolHello(name) {
  return { t: 'hello', v: 2, features: [...MP_V2_FEATURES], name };
}

export function observeProtocolV2(peer, message) {
  if (message?.t === 'welcome') {
    peer.session = message.session;
    peer.id = message.id;
    peer.actionSeq = 0;
  } else if (message?.t === 'sp' && Number.isSafeInteger(message.ep)) {
    peer.ep = message.ep;
  }
}

export function protocolV2Packet(peer, message) {
  if (!SEQUENCED.has(message?.t)) return message;
  if (typeof peer?.session !== 'string' || peer.session.length < 16) {
    throw new Error(`Cannot send ${message.t} before protocol-v2 welcome`);
  }
  const packet = { ...message, session: peer.session };
  if (LIFE_SCOPED.has(packet.t) && !Number.isSafeInteger(packet.ep)) {
    if (!Number.isSafeInteger(peer.ep)) throw new Error(`Cannot send ${packet.t} before a life epoch is known`);
    packet.ep = peer.ep;
  }
  packet.seq = (peer.actionSeq || 0) + 1;
  peer.actionSeq = packet.seq;
  return packet;
}

export function sendProtocolV2(peer, message) {
  peer.ws.send(JSON.stringify(protocolV2Packet(peer, message)));
}
