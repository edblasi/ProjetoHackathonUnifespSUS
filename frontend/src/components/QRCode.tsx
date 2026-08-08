interface QRCodePlaceholderProps {
  size?: number;
  value?: string;
}

function stringSeed(value: string): number {
  let seed = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    seed = Math.imul(seed ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return seed || 1;
}

export function QRCodePlaceholder({ size = 140, value = "UMDR" }: QRCodePlaceholderProps) {
  let state = stringSeed(value);
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967295;
  };
  const cells = Array.from({ length: 21 * 21 }, (_, i) => {
    const row = Math.floor(i / 21);
    const col = i % 21;
    const finderOrigin = row < 7 && col < 7 ? [0, 0] : row < 7 && col >= 14 ? [0, 14] : row >= 14 && col < 7 ? [14, 0] : null;
    if (finderOrigin) {
      const [r0, c0] = finderOrigin;
      const rr = row - r0;
      const cc = col - c0;
      return rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4);
    }
    const isTiming = (row === 6 && col > 7 && col < 14) || (col === 6 && row > 7 && row < 14);
    if (isTiming) return (row + col) % 2 === 0;
    return random() > 0.53;
  });

  return (
    <div
      className="inline-grid bg-white p-3 rounded-lg border border-border"
      style={{ gridTemplateColumns: "repeat(21, 1fr)", gap: "1px", width: size, height: size }}
      role="img"
      aria-label="QR Code da identidade digital do dispositivo"
      title={value}
    >
      {cells.map((dark, i) => (
        <div
          key={i}
          className={dark ? "bg-foreground" : "bg-white"}
          style={{ width: "100%", aspectRatio: "1" }}
        />
      ))}
    </div>
  );
}
