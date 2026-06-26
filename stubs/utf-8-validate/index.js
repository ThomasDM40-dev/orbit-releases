// Remplacement pur-JS de `utf-8-validate` (le module natif fait échouer le build
// electron-builder). Valide qu'un Buffer est de l'UTF-8 correct. Export = fonction
// (le paquet `websocket` appelle isValidUTF8(buffer)).
'use strict';

function isValidUTF8(buf) {
  const len = buf.length;
  let i = 0;
  while (i < len) {
    if ((buf[i] & 0x80) === 0) {                    // 0xxxxxxx (ASCII)
      i++;
    } else if ((buf[i] & 0xe0) === 0xc0) {          // 110xxxxx 10xxxxxx
      if (i + 1 >= len || (buf[i + 1] & 0xc0) !== 0x80 || (buf[i] & 0xfe) === 0xc0) return false;
      i += 2;
    } else if ((buf[i] & 0xf0) === 0xe0) {          // 1110xxxx 10xxxxxx 10xxxxxx
      if (i + 2 >= len || (buf[i + 1] & 0xc0) !== 0x80 || (buf[i + 2] & 0xc0) !== 0x80 ||
          (buf[i] === 0xe0 && (buf[i + 1] & 0xe0) === 0x80) ||
          (buf[i] === 0xed && (buf[i + 1] & 0xe0) === 0xa0)) return false;
      i += 3;
    } else if ((buf[i] & 0xf8) === 0xf0) {          // 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
      if (i + 3 >= len || (buf[i + 1] & 0xc0) !== 0x80 || (buf[i + 2] & 0xc0) !== 0x80 || (buf[i + 3] & 0xc0) !== 0x80 ||
          (buf[i] === 0xf0 && (buf[i + 1] & 0xf0) === 0x80) ||
          (buf[i] === 0xf4 && buf[i + 1] > 0x8f) || buf[i] > 0xf4) return false;
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

module.exports = isValidUTF8;
module.exports.isValidUTF8 = isValidUTF8;
