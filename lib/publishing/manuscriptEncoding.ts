const ENCODING_ERROR = 'Some characters in this manuscript could not be read. Export the original document as UTF-8 text and upload it again.';

// The C1 range is interpreted differently by some Node/ICU versions. Apply the
// WHATWG mapping explicitly so browser imports and server repairs agree.
// https://encoding.spec.whatwg.org/index-windows-1252.txt
const WINDOWS_PUNCTUATION = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

export function decodeManuscriptBytes(bytes: Uint8Array): string {
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : null;
  const utf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let text: string;
  try {
    text = new TextDecoder(utf16 ?? 'utf-8', { fatal: true }).decode(bytes);
  } catch {
    // An explicit Unicode marker must never fall back to a legacy encoding.
    if (utf16 || utf8Bom) throw new Error(ENCODING_ERROR);
    text = new TextDecoder('windows-1252').decode(bytes)
      .replace(/[\u0080-\u009f]/g, character => String.fromCodePoint(WINDOWS_PUNCTUATION[character.charCodeAt(0) - 0x80]));
  }
  // Do not silently publish a file that already lost characters, or binary data.
  // U+0085 is a valid Unicode next-line separator in text exports.
  if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f-\u0084\u0086-\u009f\ufffd]/u.test(text)) {
    throw new Error(ENCODING_ERROR);
  }
  return text;
}
