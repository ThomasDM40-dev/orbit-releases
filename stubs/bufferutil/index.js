// Remplacement pur-JS de `bufferutil` (le module natif fait échouer le build
// electron-builder via node-gyp). Même API que celle utilisée par le paquet
// `websocket` (mask/unmask), en JavaScript pur. Suffisant ici car gramjs utilise
// surtout TCP ; ce code n'est sollicité que si une connexion WebSocket est ouverte.
'use strict';

function mask(source, mask, output, offset, length) {
  for (let i = 0; i < length; i++) {
    output[offset + i] = source[i] ^ mask[i & 3];
  }
}

function unmask(buffer, mask) {
  const length = buffer.length;
  for (let i = 0; i < length; i++) {
    buffer[i] ^= mask[i & 3];
  }
}

module.exports = { mask, unmask };
