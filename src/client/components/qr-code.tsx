import { createEffect, createSignal } from 'solid-js';
import { encodeQR } from '../lib/qr-encoder';

interface QRCodeProps {
  value: string;
  size?: number;
  quietZone?: number;
}

export const QRCode = (props: QRCodeProps) => {
  const size = props.size ?? 256;
  const quietZone = props.quietZone ?? 4;
  
  let canvasRef: HTMLCanvasElement | undefined;
  const [qrData, setQrData] = createSignal<any>(null);

  createEffect(() => {
    // Encode QR code whenever value changes
    const encoded = encodeQR(props.value);
    setQrData(encoded);
  });

  createEffect(() => {
    // Render to canvas whenever QR data changes
    const data = qrData();
    if (!data || !canvasRef) return;

    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    const moduleSize = Math.max(1, Math.floor(size / (data.size + 2 * quietZone)));
    const canvasSize = (data.size + 2 * quietZone) * moduleSize;

    canvasRef.width = canvasSize;
    canvasRef.height = canvasSize;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Black modules
    ctx.fillStyle = '#000000';
    for (let y = 0; y < data.size; y++) {
      for (let x = 0; x < data.size; x++) {
        if (data.modules[y][x]) {
          const px = (x + quietZone) * moduleSize;
          const py = (y + quietZone) * moduleSize;
          ctx.fillRect(px, py, moduleSize, moduleSize);
        }
      }
    }
  });

  return (
    <div style="display: flex; justify-content: center; align-items: center; margin: 1rem 0;">
      <canvas
        ref={canvasRef}
        style="border: 2px solid #ccc; border-radius: 4px; background: white;"
      />
    </div>
  );
};
