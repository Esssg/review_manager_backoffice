// @ts-nocheck

const textEncoder = new TextEncoder();

let crcTable = null;

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }

  crcTable = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    crcTable[index] = value >>> 0;
  }

  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(dateInput) {
  const date = dateInput instanceof Date && !Number.isNaN(dateInput.getTime()) ? dateInput : new Date();
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosTime, dosDate };
}

function createHeader(length) {
  return new ArrayBuffer(length);
}

function setUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function setUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function normalizeFileContent(content) {
  if (content instanceof Uint8Array) {
    return content;
  }

  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }

  return textEncoder.encode(String(content ?? ""));
}

export function sanitizeZipPathSegment(value, fallback = "file") {
  const sanitized = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);

  return sanitized || fallback;
}

export function getExtensionFromUrl(url, contentType = "") {
  const pathname = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return String(url ?? "");
    }
  })();
  const match = pathname.match(/\.([a-z0-9]{2,8})$/i);

  if (match) {
    return match[1].toLowerCase();
  }

  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("heic")) return "heic";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";

  return "jpg";
}

export function buildZipBlob(files) {
  const parts = [];
  const centralDirectoryParts = [];
  let offset = 0;

  files.forEach((file) => {
    const filenameBytes = textEncoder.encode(file.path);
    const contentBytes = normalizeFileContent(file.content);
    const checksum = crc32(contentBytes);
    const { dosTime, dosDate } = getDosDateTime(file.lastModified);
    const localHeader = createHeader(30);
    const localView = new DataView(localHeader);

    setUint32(localView, 0, 0x04034b50);
    setUint16(localView, 4, 20);
    setUint16(localView, 6, 0x0800);
    setUint16(localView, 8, 0);
    setUint16(localView, 10, dosTime);
    setUint16(localView, 12, dosDate);
    setUint32(localView, 14, checksum);
    setUint32(localView, 18, contentBytes.length);
    setUint32(localView, 22, contentBytes.length);
    setUint16(localView, 26, filenameBytes.length);
    setUint16(localView, 28, 0);

    parts.push(localHeader, filenameBytes, contentBytes);

    const centralHeader = createHeader(46);
    const centralView = new DataView(centralHeader);

    setUint32(centralView, 0, 0x02014b50);
    setUint16(centralView, 4, 20);
    setUint16(centralView, 6, 20);
    setUint16(centralView, 8, 0x0800);
    setUint16(centralView, 10, 0);
    setUint16(centralView, 12, dosTime);
    setUint16(centralView, 14, dosDate);
    setUint32(centralView, 16, checksum);
    setUint32(centralView, 20, contentBytes.length);
    setUint32(centralView, 24, contentBytes.length);
    setUint16(centralView, 28, filenameBytes.length);
    setUint16(centralView, 30, 0);
    setUint16(centralView, 32, 0);
    setUint16(centralView, 34, 0);
    setUint16(centralView, 36, 0);
    setUint32(centralView, 38, 0);
    setUint32(centralView, 42, offset);

    centralDirectoryParts.push(centralHeader, filenameBytes);
    offset += localHeader.byteLength + filenameBytes.length + contentBytes.length;
  });

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectoryParts.reduce((total, part) => total + part.byteLength, 0);
  const endHeader = createHeader(22);
  const endView = new DataView(endHeader);

  setUint32(endView, 0, 0x06054b50);
  setUint16(endView, 4, 0);
  setUint16(endView, 6, 0);
  setUint16(endView, 8, files.length);
  setUint16(endView, 10, files.length);
  setUint32(endView, 12, centralDirectorySize);
  setUint32(endView, 16, centralDirectoryOffset);
  setUint16(endView, 20, 0);

  return new Blob([...parts, ...centralDirectoryParts, endHeader], { type: "application/zip" });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
