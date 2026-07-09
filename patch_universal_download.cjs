const fs = require('fs');

let content = fs.readFileSync('src/components/UniversalQrForm.tsx', 'utf-8');

// The mobile issue with html-to-image is that on iOS/Safari,
// if elements aren't fully visible or we just try to capture them as is,
// the canvas gets tainted or doesn't render properly.
// The workaround in `GeneratorForm` is to clone the node, append it to the body with fixed position and 0 opacity, wait a bit, then capture.
// Let's implement that in `UniversalQrForm` as well.

const downloadStyledCardFunc = `
  async function downloadStyledCard() {
    if (!previewRef.current) return;

    try {
      const el = previewRef.current;
      const clone = el.cloneNode(true) as HTMLDivElement;
      clone.style.position = 'fixed';
      clone.style.left = '0';
      clone.style.top = '0';
      clone.style.zIndex = '-9999';
      clone.style.opacity = '0';
      clone.style.pointerEvents = 'none';

      // Calculate width and height from original
      const rect = el.getBoundingClientRect();
      clone.style.width = \`\${rect.width}px\`;
      clone.style.height = \`\${rect.height}px\`;

      document.body.appendChild(clone);

      // Let layout settle
      await new Promise(resolve => setTimeout(resolve, 200));

      const data = await toPng(clone, {
        cacheBust: true,
        pixelRatio: 3,
        style: {
          opacity: '1',
          transform: 'none'
        }
      });

      clone.remove();

      const a = document.createElement("a");
      a.href = data;
      a.download = "qr-styled.png";
      a.click();
    } catch (err) {
      console.error("Failed to download styled card:", err);
    }
  }
`;

content = content.replace(/async function downloadStyledCard\(\) \{[\s\S]*?a\.click\(\);\n  \}/, downloadStyledCardFunc.trim());

fs.writeFileSync('src/components/UniversalQrForm.tsx', content);
